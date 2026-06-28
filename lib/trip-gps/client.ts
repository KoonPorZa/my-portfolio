import type { LocationPayload } from "./types";

const LOCATION_ENDPOINT = "/api/trips/001/location";

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

export async function uploadLocation(
  point: LocationPayload,
  options: UploadLocationOptions
): Promise<UploadLocationResult> {
  const token = options.token.trim();
  const endpoint = options.endpoint ?? LOCATION_ENDPOINT;
  const queue = options.queue ?? noopLocationUploadQueue;

  if (!token) {
    throw new Error("GPS upload token is required.");
  }

  if (!isHttpsOrRelative(endpoint)) {
    throw new Error("GPS upload endpoint must be HTTPS or same-origin.");
  }

  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(point),
    });

    if (response.ok) {
      return { ok: true, queued: false, status: response.status };
    }

    if (response.status >= 500) {
      await queue.enqueue(point);

      return {
        ok: false,
        queued: true,
        status: response.status,
        message: "GPS upload failed; offline queue skeleton accepted the point.",
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
      message: "GPS upload failed; offline queue skeleton accepted the point.",
    };
  }
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
