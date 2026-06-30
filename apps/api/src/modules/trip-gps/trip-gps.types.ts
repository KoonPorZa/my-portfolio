export const TRIP_GPS_MVP_TRIP_ID = "001";
export const TRACKER_MODES = ["active", "saver", "rest", "city"] as const;
export const UPLOAD_REASONS = [
  "scheduled",
  "manual",
  "start",
  "stop",
  "retry",
] as const;

export type TrackerMode = (typeof TRACKER_MODES)[number];
export type UploadReason = (typeof UPLOAD_REASONS)[number];

export type LocationFreshness = "fresh" | "stale" | "offline";
export type StopArrivalSource = "auto" | "manual";

export type ViewerState =
  | "loading"
  | "invalid/expired"
  | "waiting-first-gps"
  | LocationFreshness
  | "stopped";

export type LocationPayload = {
  sessionId: string;
  seq: number;
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps?: number | null;
  headingDeg?: number | null;
  clientTs: string;
  mode: TrackerMode;
  reason: UploadReason;
};

export type LocationLatest = {
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps?: number | null;
  headingDeg?: number | null;
  mode?: TrackerMode;
  reason?: UploadReason;
  clientTs: string;
  serverTs: string;
};

export type StopArrival = {
  index: number;
  arrivedAt: string;
  source: StopArrivalSource;
};

export type ShareSession = {
  id: string;
  trip_id: string;
  active: boolean;
  expires_at: string;
  revoked_at: string | null;
  stopped_at: string | null;
  last_viewer_access_at: string | null;
  upload_count: number;
  last_error: string | null;
  owner_token_hash: string;
  viewer_token_hash: string;
};

export type SessionAudit = {
  lastViewerAccessAt: string | null;
  uploadCount: number;
  lastError: string | null;
};

export type PublicSession = {
  id: string;
  tripId: string;
  active: boolean;
  expiresAt: string;
  stoppedAt: string | null;
  revokedAt: string | null;
};

export type ViewerLatestResponse = {
  status: "active" | "stopped";
  freshness: LocationFreshness | null;
  viewerState: ViewerState;
  latest: LocationLatest | null;
  stopArrivals: StopArrival[];
  audit: SessionAudit | null;
  nextPollMs: number;
  message: string;
};

export type UploadLocationResponse = {
  ok: true;
  latest: LocationLatest;
  audit: SessionAudit | null;
};

export type CreateSessionResponse = {
  ok: true;
  session: PublicSession;
  ownerToken: string;
  viewerToken: string;
  viewerLink: string;
};

export type StopSessionResponse = {
  ok: true;
  session: PublicSession;
};

export type ProgressResponse = {
  ok: true;
  stopArrivals: StopArrival[];
};

export type SessionEndAction = "stop" | "revoke";
