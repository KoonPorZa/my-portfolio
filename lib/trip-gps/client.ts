import type { LocationPayload } from "./types";
import { tripGpsApiBase } from "./api-base";

const LOCATION_ENDPOINT_PATH = "/api/trips/001/location";
const LOCATION_UPLOAD_QUEUE_STORAGE_KEY = "trip-gps:location-upload-queue:v1";
const LOCATION_UPLOAD_QUEUE_MAX_POINTS = 3;

export type UploadLocationOptions = {
  token: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  queue?: LocationUploadQueue;
};

export type UploadLocationResult =
  | {
      ok: true;
      queued: false;
      status: number;
    }
  | {
      ok: false;
      queued: boolean;
      status: number | null;
      message: string;
    };

export type LocationUploadQueue = {
  enqueue(point: LocationPayload): Promise<void>;
  flush?(options: UploadLocationOptions): Promise<void>;
  size?(): number;
};

type ManagedLocationUploadQueue = LocationUploadQueue & {
  rememberOptions(options: UploadLocationOptions): void;
  flushBeforeUpload(options: UploadLocationOptions): Promise<void>;
  markUploaded(point: LocationPayload): Promise<void>;
};

export const noopLocationUploadQueue: LocationUploadQueue = Object.freeze({
  async enqueue() {
    return undefined;
  },
  async flush() {
    return undefined;
  },
  size() {
    return 0;
  },
});

let browserLocationUploadQueue: ManagedLocationUploadQueue | null = null;

export function createLocationUploadQueue(
  storageKey = LOCATION_UPLOAD_QUEUE_STORAGE_KEY
): LocationUploadQueue {
  return new BrowserLocationUploadQueue(storageKey);
}

export function getLocationUploadQueue(): LocationUploadQueue {
  if (!browserLocationUploadQueue) {
    browserLocationUploadQueue = new BrowserLocationUploadQueue(
      LOCATION_UPLOAD_QUEUE_STORAGE_KEY
    );
  }

  return browserLocationUploadQueue;
}

export async function uploadLocation(
  point: LocationPayload,
  options: UploadLocationOptions
): Promise<UploadLocationResult> {
  const token = options.token.trim();
  const endpoint = options.endpoint ?? locationEndpoint();
  const queue = options.queue ?? getDefaultLocationUploadQueue();
  const managedQueue = asManagedQueue(queue);

  if (!token) {
    throw new Error("GPS upload token is required.");
  }

  if (!isHttpsOrRelative(endpoint)) {
    throw new Error("GPS upload endpoint must be HTTPS or same-origin.");
  }

  managedQueue?.rememberOptions(options);
  await managedQueue?.flushBeforeUpload(options);

  try {
    const response = await sendLocationPoint(point, options, endpoint);

    if (response.ok) {
      await managedQueue?.markUploaded(point);

      return { ok: true, queued: false, status: response.status };
    }

    if (isRetryableStatus(response.status)) {
      await queue.enqueue(point);

      return {
        ok: false,
        queued: true,
        status: response.status,
        message: "GPS upload failed; the point was saved for retry.",
      };
    }

    return {
      ok: false,
      queued: false,
      status: response.status,
      message: "GPS upload was rejected.",
    };
  } catch {
    await queue.enqueue(point);

    return {
      ok: false,
      queued: true,
      status: null,
      message: "GPS upload failed; the point was saved for retry.",
    };
  }
}

class BrowserLocationUploadQueue implements ManagedLocationUploadQueue {
  private readonly sentSeqBySession = new Map<string, number>();
  private memoryPoints: LocationPayload[] = [];
  private flushOptions: UploadLocationOptions | null = null;
  private flushing = false;
  private listeningForOnline = false;

  constructor(private readonly storageKey: string) {}

  async enqueue(point: LocationPayload): Promise<void> {
    this.writePoints(this.compactPoints([...this.readPoints(), point]));
  }

  async flush(options: UploadLocationOptions): Promise<void> {
    this.rememberOptions(options);

    if (this.flushing) {
      return;
    }

    const token = options.token.trim();
    const endpoint = options.endpoint ?? locationEndpoint();

    if (!token || !isHttpsOrRelative(endpoint)) {
      return;
    }

    this.flushing = true;

    try {
      const queued = this.compactPoints(this.readPoints());
      const remaining: LocationPayload[] = [];

      for (const point of sortQueuedPoints(queued)) {
        if (this.wasUploaded(point)) {
          continue;
        }

        try {
          const response = await sendLocationPoint(
            {
              ...point,
              reason: "retry",
            },
            options,
            endpoint
          );

          if (response.ok) {
            this.markUploadedSync(point);
            continue;
          }

          if (isRetryableStatus(response.status)) {
            remaining.push(point);
            continue;
          }
        } catch {
          remaining.push(point);
        }
      }

      this.writePoints(this.compactPoints(remaining));
    } finally {
      this.flushing = false;
    }
  }

  async flushBeforeUpload(options: UploadLocationOptions): Promise<void> {
    if (this.size() === 0) {
      return;
    }

    await this.flush(options);
  }

  async markUploaded(point: LocationPayload): Promise<void> {
    this.markUploadedSync(point);
    this.writePoints(this.compactPoints(this.readPoints()));
  }

  rememberOptions(options: UploadLocationOptions): void {
    this.flushOptions = options;
    this.ensureOnlineListener();
  }

  size(): number {
    return this.readPoints().length;
  }

  private compactPoints(points: LocationPayload[]): LocationPayload[] {
    const byKey = new Map<string, LocationPayload>();

    for (const point of points) {
      if (this.wasUploaded(point)) {
        continue;
      }

      const key = queueKey(point);
      byKey.delete(key);
      byKey.set(key, point);
    }

    return Array.from(byKey.values()).slice(-LOCATION_UPLOAD_QUEUE_MAX_POINTS);
  }

  private ensureOnlineListener(): void {
    if (this.listeningForOnline || typeof window === "undefined") {
      return;
    }

    window.addEventListener("online", () => {
      if (this.flushOptions) {
        void this.flush(this.flushOptions);
      }
    });
    this.listeningForOnline = true;
  }

  private markUploadedSync(point: LocationPayload): void {
    const current = this.sentSeqBySession.get(point.sessionId) ?? -1;

    if (point.seq > current) {
      this.sentSeqBySession.set(point.sessionId, point.seq);
    }
  }

  private readPoints(): LocationPayload[] {
    const storage = getLocalStorage();

    if (!storage) {
      return this.memoryPoints;
    }

    try {
      const raw = storage.getItem(this.storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const storedPoints = Array.isArray(parsed)
        ? parsed.filter(isLocationPayload)
        : [];

      return this.compactPoints([...this.memoryPoints, ...storedPoints]);
    } catch {
      return this.memoryPoints;
    }
  }

  private wasUploaded(point: LocationPayload): boolean {
    const sentSeq = this.sentSeqBySession.get(point.sessionId);

    return typeof sentSeq === "number" && point.seq <= sentSeq;
  }

  private writePoints(points: LocationPayload[]): void {
    this.memoryPoints = points;

    const storage = getLocalStorage();

    if (!storage) {
      return;
    }

    try {
      if (points.length === 0) {
        storage.removeItem(this.storageKey);
        return;
      }

      storage.setItem(this.storageKey, JSON.stringify(points));
    } catch {
      return;
    }
  }
}

async function sendLocationPoint(
  point: LocationPayload,
  options: UploadLocationOptions,
  endpoint: string
): Promise<Response> {
  return (options.fetchImpl ?? fetch)(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.token.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(point),
  });
}

function getDefaultLocationUploadQueue(): LocationUploadQueue {
  return typeof window === "undefined" ? noopLocationUploadQueue : getLocationUploadQueue();
}

function asManagedQueue(queue: LocationUploadQueue): ManagedLocationUploadQueue | null {
  if (
    "rememberOptions" in queue &&
    "flushBeforeUpload" in queue &&
    "markUploaded" in queue &&
    typeof queue.rememberOptions === "function" &&
    typeof queue.flushBeforeUpload === "function" &&
    typeof queue.markUploaded === "function"
  ) {
    return queue as ManagedLocationUploadQueue;
  }

  return null;
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function queueKey(point: LocationPayload): string {
  return `${point.sessionId}:${point.seq}`;
}

function sortQueuedPoints(points: LocationPayload[]): LocationPayload[] {
  return [...points].sort((a, b) => {
    if (a.sessionId === b.sessionId) {
      return a.seq - b.seq;
    }

    return Date.parse(a.clientTs) - Date.parse(b.clientTs);
  });
}

function locationEndpoint(): string {
  const base = tripGpsApiBase();

  return base ? `${base}${LOCATION_ENDPOINT_PATH}` : LOCATION_ENDPOINT_PATH;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isLocationPayload(value: unknown): value is LocationPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.sessionId === "string" &&
    typeof value.seq === "number" &&
    Number.isInteger(value.seq) &&
    typeof value.lat === "number" &&
    typeof value.lng === "number" &&
    typeof value.accuracyM === "number" &&
    typeof value.clientTs === "string" &&
    typeof value.mode === "string" &&
    typeof value.reason === "string" &&
    Number.isFinite(value.seq) &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    Number.isFinite(value.accuracyM)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpsOrRelative(endpoint: string): boolean {
  if (endpoint.startsWith("/")) {
    return true;
  }

  try {
    return new URL(endpoint).protocol === "https:";
  } catch {
    return false;
  }
}
