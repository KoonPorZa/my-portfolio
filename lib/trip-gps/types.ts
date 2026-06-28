export type TrackerMode = "active" | "saver" | "rest";

export type UploadReason = "scheduled" | "manual" | "start" | "stop" | "retry";

export type LocationFreshness = "fresh" | "stale" | "offline";

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

export type ShareSession = {
  id: string;
  trip_id: string;
  active: boolean;
  expires_at: string;
  revoked_at: string | null;
  owner_token_hash: string;
  viewer_token_hash: string;
};
