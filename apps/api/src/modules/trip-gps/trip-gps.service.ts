import type { ServerEnv } from "../../config/env";
import { ApiError, errorMessage } from "../../lib/errors";
import { isExpiredIso, nowIso } from "../../lib/time";
import type { TripGpsRepo } from "./trip-gps.repo";
import {
  generateToken,
  generateTokenPair,
  hashToken,
  verifyToken,
} from "./trip-gps.tokens";
import {
  TRACKER_MODES,
  TRIP_GPS_MVP_TRIP_ID,
  UPLOAD_REASONS,
  type CreateSessionResponse,
  type LocationFreshness,
  type LocationLatest,
  type LocationPayload,
  type PublicSession,
  type SessionAudit,
  type SessionEndAction,
  type ShareSession,
  type StopSessionResponse,
  type TrackerMode,
  type UploadLocationResponse,
  type UploadReason,
  type ViewerLatestResponse,
  type ViewerState,
} from "./trip-gps.types";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const ACTIVE_INTERVAL_MS = 5 * MINUTE_MS;
export const CITY_APPROACH_INTERVAL_MS = 2 * MINUTE_MS;
export const SAVER_INTERVAL_MS = 10 * MINUTE_MS;
export const REST_INTERVAL_MS = 15 * MINUTE_MS;
export const STALE_AFTER_MS = 15 * MINUTE_MS;
export const OFFLINE_AFTER_MS = 30 * MINUTE_MS;
export const MAX_BAD_ACCURACY_M = 250;

export const FRESH_POLL_MS = 60 * SECOND_MS;
export const WAITING_POLL_MS = 30 * SECOND_MS;

const MIN_UPLOAD_INTERVAL_MS = WAITING_POLL_MS;
const MAX_SESSION_ID_LENGTH = 128;
const DEFAULT_TTL_MS = 24 * 60 * MINUTE_MS;
const SESSION_PREFIX = "trip01";

type OwnerCodeStatus = "valid" | "invalid" | "not_configured";

const trackerModes = new Set<TrackerMode>(TRACKER_MODES);
const uploadReasons = new Set<UploadReason>(UPLOAD_REASONS);

export class TripGpsService {
  constructor(
    private readonly repo: TripGpsRepo,
    private readonly env: ServerEnv,
    private readonly currentTimeMs: () => number = () => Date.now()
  ) {}

  async startSession(
    tripId: string,
    code: string | null
  ): Promise<CreateSessionResponse> {
    assertMvpTrip(tripId);

    const codeStatus = this.verifyOwnerCode(code);

    if (codeStatus === "not_configured") {
      throw new ApiError(
        503,
        "not_configured",
        "GPS owner code is not configured."
      );
    }

    if (codeStatus === "invalid") {
      throw new ApiError(
        401,
        "invalid_owner_code",
        "Invalid or missing owner code."
      );
    }

    const now = this.currentTimeMs();
    const expiresAt = new Date(now + DEFAULT_TTL_MS).toISOString();
    const sessionId = createSessionId(now);
    const { ownerToken, viewerToken } = generateTokenPair();
    const session: ShareSession = {
      id: sessionId,
      trip_id: tripId,
      active: true,
      expires_at: expiresAt,
      revoked_at: null,
      stopped_at: null,
      last_viewer_access_at: null,
      upload_count: 0,
      last_error: null,
      owner_token_hash: hashToken(ownerToken),
      viewer_token_hash: hashToken(viewerToken),
    };

    const storedSession = await this.repo.createShareSession(session);

    return {
      ok: true,
      session: toPublicSession(storedSession),
      ownerToken,
      viewerToken,
      viewerLink: buildViewerLink(tripId, viewerToken),
    };
  }

  async stopSession(input: {
    tripId: string;
    ownerToken: string | null;
    sessionId: string | null;
    action: SessionEndAction;
  }): Promise<StopSessionResponse> {
    assertMvpTrip(input.tripId);

    if (!input.ownerToken) {
      throw new ApiError(401, "invalid_token", "Invalid or missing token.");
    }

    const stoppedSession = await this.repo.stopSessionByOwnerToken(
      input.ownerToken,
      input.sessionId,
      input.action
    );

    if (!stoppedSession) {
      throw new ApiError(401, "invalid_token", "Invalid or missing token.");
    }

    return {
      ok: true,
      session: toPublicSession(stoppedSession),
    };
  }

  async uploadLocation(input: {
    tripId: string;
    ownerToken: string | null;
    body: unknown;
  }): Promise<UploadLocationResponse> {
    assertMvpTrip(input.tripId);

    if (!input.ownerToken) {
      throw new ApiError(401, "invalid_token", "Invalid or missing token.");
    }

    const payload = parseLocationPayload(input.body);

    if (!payload) {
      throw new ApiError(400, "invalid_payload", "Invalid location payload.");
    }

    const session = await this.repo.findOwnerSessionByToken(
      input.ownerToken,
      payload.sessionId
    );

    if (!session) {
      throw new ApiError(401, "invalid_token", "Invalid or missing token.");
    }

    if (!canWriteSession(session, this.currentTimeMs())) {
      await this.repo.recordSessionError(
        session.id,
        "Session is inactive, expired, or revoked."
      );
      throw new ApiError(
        403,
        "forbidden",
        "Session is inactive, expired, or revoked."
      );
    }

    const latest = await this.repo.getLatestLocation(session.id);
    const now = this.currentTimeMs();

    if (shouldThrottleUpload(payload.reason) && isTooFrequent(latest, now)) {
      await this.repo.recordSessionError(
        session.id,
        "Location uploads are too frequent."
      );
      throw new ApiError(
        429,
        "too_frequent",
        "Location uploads are too frequent."
      );
    }

    let storedLatest: LocationLatest;

    try {
      storedLatest = await this.repo.recordLocation({
        ...payload,
        sessionId: session.id,
        serverTs: nowIso(now),
      });
    } catch (error) {
      await this.repo.recordSessionError(session.id, errorMessage(error));
      throw error;
    }

    const audit = await this.repo.recordUploadSuccess(session.id);

    return {
      ok: true,
      latest: storedLatest,
      audit,
    };
  }

  async getViewerLatest(input: {
    tripId: string;
    viewerToken: string | null;
  }): Promise<ViewerLatestResponse> {
    assertMvpTrip(input.tripId);

    if (!input.viewerToken) {
      throw new ApiError(401, "invalid_token", "Invalid or missing token.");
    }

    const session = await this.repo.findViewerSessionByToken(input.viewerToken);

    if (!session) {
      throw new ApiError(401, "invalid_token", "Invalid or missing token.");
    }

    const now = this.currentTimeMs();

    if (isExpiredIso(session.expires_at, now) || session.revoked_at) {
      throw new ApiError(
        403,
        "forbidden",
        "Session is inactive, expired, or revoked."
      );
    }

    const audit = await this.repo.recordViewerAccess(session.id, nowIso(now));

    if (!session.active || session.stopped_at) {
      return viewerResponse(
        "stopped",
        null,
        null,
        "Live sharing has stopped.",
        audit
      );
    }

    const latest = await this.repo.getLatestLocation(session.id);

    if (!latest) {
      return viewerResponse(
        "active",
        null,
        null,
        "Waiting for the first GPS point.",
        audit
      );
    }

    const freshness = freshnessFor(now - Date.parse(latest.serverTs));

    return viewerResponse(
      "active",
      freshness,
      latest,
      messageForFreshness(freshness),
      audit
    );
  }

  private verifyOwnerCode(code: string | null): OwnerCodeStatus {
    const ownerCodeHash =
      this.env.tripGpsOwnerCodeHash || this.env.tripGpsOwnerCodeSha256;

    if (ownerCodeHash) {
      return verifyToken(code ?? "", ownerCodeHash) ? "valid" : "invalid";
    }

    if (!this.env.tripGpsOwnerCode) {
      return "not_configured";
    }

    return verifyToken(code ?? "", hashToken(this.env.tripGpsOwnerCode))
      ? "valid"
      : "invalid";
  }
}

export function parseLocationPayload(body: unknown): LocationPayload | null {
  if (!isRecord(body)) {
    return null;
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
    return null;
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
    return null;
  }

  const coords = sanitizeCoords({
    lat,
    lng,
    accuracyM,
    clientTs,
  });

  if (!coords || coords.accuracyM === null) {
    return null;
  }

  if (!isAcceptableAccuracy(coords.accuracyM, reason)) {
    return null;
  }

  return {
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
  };
}

export function readBearerToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const [scheme, token, extra] = value.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
    return null;
  }

  return token;
}

export function freshnessFor(ageMs: number): LocationFreshness {
  if (!Number.isFinite(ageMs)) {
    return "offline";
  }

  if (ageMs <= STALE_AFTER_MS) {
    return "fresh";
  }

  if (ageMs <= OFFLINE_AFTER_MS) {
    return "stale";
  }

  return "offline";
}

export function nextPollMs(state: ViewerState): number {
  switch (state) {
    case "loading":
    case "waiting-first-gps":
    case "stale":
      return WAITING_POLL_MS;
    case "fresh":
    case "offline":
    case "stopped":
    case "invalid/expired":
      return FRESH_POLL_MS;
  }
}

function viewerResponse(
  status: ViewerLatestResponse["status"],
  freshness: LocationFreshness | null,
  latest: LocationLatest | null,
  message: string,
  audit: SessionAudit | null
): ViewerLatestResponse {
  const viewerState = viewerStateFor(status, freshness, latest);

  return {
    status,
    freshness,
    viewerState,
    latest,
    audit,
    nextPollMs: nextPollMs(viewerState),
    message,
  };
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

function createSessionId(now: number): string {
  const stamp = new Date(now).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = generateToken().slice(0, 12);

  return `${SESSION_PREFIX}_${stamp}_${suffix}`;
}

function buildViewerLink(tripId: string, viewerToken: string): string {
  return `/trip/${tripId}/live?t=${encodeURIComponent(viewerToken)}`;
}

function toPublicSession(session: ShareSession): PublicSession {
  return {
    id: session.id,
    tripId: session.trip_id,
    active: session.active,
    expiresAt: session.expires_at,
    stoppedAt: session.stopped_at,
    revokedAt: session.revoked_at,
  };
}

function assertMvpTrip(tripId: string): void {
  if (tripId !== TRIP_GPS_MVP_TRIP_ID) {
    throw new ApiError(404, "not_found", "Trip was not found.");
  }
}

function isTooFrequent(latest: LocationLatest | null, now: number): boolean {
  if (!latest) {
    return false;
  }

  const lastServerTs = Date.parse(latest.serverTs);

  return Number.isFinite(lastServerTs) && now - lastServerTs < MIN_UPLOAD_INTERVAL_MS;
}

function shouldThrottleUpload(reason: UploadReason): boolean {
  return reason === "scheduled";
}

function canWriteSession(session: ShareSession, now: number): boolean {
  return (
    session.active &&
    !session.revoked_at &&
    !session.stopped_at &&
    !isExpiredIso(session.expires_at, now)
  );
}

function sanitizeCoords(point: {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  clientTs: string;
}): { lat: number; lng: number; accuracyM: number | null; clientTs: string } | null {
  if (point.lat < -90 || point.lat > 90) {
    return null;
  }

  if (point.lng < -180 || point.lng > 180) {
    return null;
  }

  const accuracyM = point.accuracyM ?? null;
  if (accuracyM !== null && (!Number.isFinite(accuracyM) || accuracyM < 0)) {
    return null;
  }

  if (!isValidIsoDate(point.clientTs)) {
    return null;
  }

  return {
    lat: point.lat,
    lng: point.lng,
    accuracyM,
    clientTs: point.clientTs,
  };
}

function isAcceptableAccuracy(
  accuracyM: number | null | undefined,
  reason: UploadReason
): boolean {
  if (accuracyM === null || accuracyM === undefined) {
    return reason === "stop";
  }

  return Number.isFinite(accuracyM) && accuracyM >= 0 && accuracyM <= MAX_BAD_ACCURACY_M;
}

function isUploadReason(value: unknown): value is UploadReason {
  return typeof value === "string" && uploadReasons.has(value as UploadReason);
}

function isTrackerMode(value: unknown): value is TrackerMode {
  return typeof value === "string" && trackerModes.has(value as TrackerMode);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isNullableHeading(value: unknown): value is number | null {
  return (
    value === null ||
    (isFiniteNumber(value) && value >= 0 && value <= 360)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function isValidIsoDate(value: string): boolean {
  if (!value.trim()) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}
