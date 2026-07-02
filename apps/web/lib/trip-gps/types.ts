export const TRACKER_MODES = ["active", "saver", "rest", "city"] as const;

export type TrackerMode = (typeof TRACKER_MODES)[number];

export type UploadReason = "scheduled" | "manual" | "start" | "stop" | "retry";

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

export type LocationTrackPoint = LocationLatest & {
  seq: number;
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
