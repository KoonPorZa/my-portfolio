import {
  freshnessFor,
  nextPollMs,
  WAITING_POLL_MS,
} from "@/lib/trip-gps/cadence";
import { isAcceptableAccuracy, sanitizeCoords } from "@/lib/trip-gps/geo";
import { getLocationStore } from "@/lib/trip-gps/store";
import type {
  LocationFreshness,
  LocationLatest,
  LocationPayload,
  ShareSession,
  TrackerMode,
  UploadReason,
  ViewerState,
} from "@/lib/trip-gps/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_UPLOAD_INTERVAL_MS = WAITING_POLL_MS;
const MAX_SESSION_ID_LENGTH = 128;

type ApiErrorCode = "invalid_payload" | "invalid_token" | "forbidden" | "too_frequent";

type ViewerLatestResponse = {
  status: "active" | "stopped";
  freshness: LocationFreshness | null;
  viewerState: ViewerState;
  latest: LocationLatest | null;
  nextPollMs: number;
  message: string;
};

type PayloadParseResult =
  | {
      ok: true;
      payload: LocationPayload;
    }
  | {
      ok: false;
    };

const trackerModes = new Set<TrackerMode>(["active", "saver", "rest"]);
const uploadReasons = new Set<UploadReason>(["scheduled", "manual", "start", "stop", "retry"]);

export async function POST(request: Request) {
  const ownerToken = readBearerToken(request.headers.get("authorization"));

  if (!ownerToken) {
    return errorResponse(401, "invalid_token", "Invalid or missing token.");
  }

  const parsed = await readLocationPayload(request);

  if (!parsed.ok) {
    return errorResponse(400, "invalid_payload", "Invalid location payload.");
  }

  const store = getLocationStore();
  const session = await store.findOwnerSessionByToken(ownerToken, parsed.payload.sessionId);

  if (!session) {
    return errorResponse(401, "invalid_token", "Invalid or missing token.");
  }

  if (!canWriteSession(session)) {
    return errorResponse(403, "forbidden", "Session is inactive, expired, or revoked.");
  }

  const latest = await store.getLatestLocation(session.id);
  const now = Date.now();

  if (parsed.payload.reason !== "manual" && isTooFrequent(latest, now)) {
    return errorResponse(429, "too_frequent", "Location uploads are too frequent.");
  }

  const serverTs = new Date(now).toISOString();
  const storedLatest = await store.recordLocation({
    ...parsed.payload,
    sessionId: session.id,
    serverTs,
  });

  return jsonResponse(
    {
      ok: true,
      latest: storedLatest,
    },
    200
  );
}

export async function GET(request: Request) {
  const viewerToken = new URL(request.url).searchParams.get("t")?.trim();

  if (!viewerToken) {
    return errorResponse(401, "invalid_token", "Invalid or missing token.");
  }

  const store = getLocationStore();
  const session = await store.findViewerSessionByToken(viewerToken);

  if (!session) {
    return errorResponse(401, "invalid_token", "Invalid or missing token.");
  }

  if (isExpired(session) || session.revoked_at) {
    return errorResponse(403, "forbidden", "Session is inactive, expired, or revoked.");
  }

  if (!session.active) {
    return viewerResponse("stopped", null, null, "Live sharing has stopped.");
  }

  const latest = await store.getLatestLocation(session.id);

  if (!latest) {
    return viewerResponse("active", null, null, "Waiting for the first GPS point.");
  }

  const freshness = freshnessFor(Date.now() - Date.parse(latest.serverTs));

  return viewerResponse("active", freshness, latest, messageForFreshness(freshness));
}

async function readLocationPayload(request: Request): Promise<PayloadParseResult> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { ok: false };
  }

  if (!isRecord(body)) {
    return { ok: false };
  }

  const reason = body.reason;
  const mode = body.mode;
  const sessionId = body.sessionId;
  const seq = body.seq;
  const lat = body.lat;
  const lng = body.lng;
  const accuracyM = body.accuracyM;
  const speedMps = body.speedMps ?? null;
  const headingDeg = body.headingDeg ?? null;
  const clientTs = body.clientTs;

  if (!isUploadReason(reason) || !isTrackerMode(mode)) {
    return { ok: false };
  }

  if (
    !isNonEmptyString(sessionId) ||
    sessionId.length > MAX_SESSION_ID_LENGTH ||
    !isNonNegativeInteger(seq) ||
    !isFiniteNumber(lat) ||
    !isFiniteNumber(lng) ||
    !isFiniteNumber(accuracyM) ||
    !isNullableFiniteNumber(speedMps) ||
    !isNullableHeading(headingDeg) ||
    !isNonEmptyString(clientTs)
  ) {
    return { ok: false };
  }

  const coords = sanitizeCoords({
    lat,
    lng,
    accuracyM,
    clientTs,
  });

  if (!coords || coords.accuracyM === null || !isAcceptableAccuracy(coords.accuracyM, reason)) {
    return { ok: false };
  }

  return {
    ok: true,
    payload: {
      sessionId: sessionId.trim(),
      seq,
      lat: coords.lat,
      lng: coords.lng,
      accuracyM: coords.accuracyM,
      speedMps,
      headingDeg,
      clientTs: coords.clientTs,
      mode,
      reason,
    },
  };
}

function viewerResponse(
  status: ViewerLatestResponse["status"],
  freshness: LocationFreshness | null,
  latest: LocationLatest | null,
  message: string
) {
  const viewerState = viewerStateFor(status, freshness, latest);

  return jsonResponse<ViewerLatestResponse>(
    {
      status,
      freshness,
      viewerState,
      latest,
      nextPollMs: nextPollMs(viewerState),
      message,
    },
    200
  );
}

function viewerStateFor(
  status: ViewerLatestResponse["status"],
  freshness: LocationFreshness | null,
  latest: LocationLatest | null
): ViewerState {
  if (status === "stopped") {
    return "stopped";
  }

  if (!latest) {
    return "waiting-first-gps";
  }

  return freshness ?? "offline";
}

function messageForFreshness(freshness: LocationFreshness): string {
  switch (freshness) {
    case "fresh":
      return "Latest location is fresh.";
    case "stale":
      return "Latest location is stale.";
    case "offline":
      return "Latest location is offline.";
  }
}

function readBearerToken(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const [scheme, token, extra] = value.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
    return null;
  }

  return token;
}

function isTooFrequent(latest: LocationLatest | null, now: number): boolean {
  if (!latest) {
    return false;
  }

  const lastServerTs = Date.parse(latest.serverTs);

  return Number.isFinite(lastServerTs) && now - lastServerTs < MIN_UPLOAD_INTERVAL_MS;
}

function canWriteSession(session: ShareSession): boolean {
  return session.active && !session.revoked_at && !isExpired(session);
}

function isExpired(session: ShareSession): boolean {
  const expiresAt = Date.parse(session.expires_at);

  return !Number.isFinite(expiresAt) || Date.now() >= expiresAt;
}

function errorResponse(status: number, code: ApiErrorCode, message: string) {
  return jsonResponse(
    {
      error: code,
      message,
    },
    status
  );
}

function jsonResponse<T>(body: T, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null | undefined {
  return value === null || value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isNullableHeading(value: unknown): value is number | null | undefined {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 360)
  );
}

function isTrackerMode(value: unknown): value is TrackerMode {
  return typeof value === "string" && trackerModes.has(value as TrackerMode);
}

function isUploadReason(value: unknown): value is UploadReason {
  return typeof value === "string" && uploadReasons.has(value as UploadReason);
}
