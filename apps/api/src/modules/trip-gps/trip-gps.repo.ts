import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  hasRealSupabaseConfig,
  type ServerEnv,
} from "../../config/env";
import {
  hashToken,
  verifyToken,
} from "./trip-gps.tokens";
import type {
  LocationLatest,
  LocationPayload,
  LocationTrackPoint,
  SessionAudit,
  SessionEndAction,
  ShareSession,
  StopArrival,
  StopArrivalSource,
  TrackerMode,
  UploadReason,
} from "./trip-gps.types";

export type LocationStorePoint = LocationPayload & {
  serverTs: string;
};

export interface TripGpsRepo {
  // Lightweight readiness probe for /ready. Resolves when the store is
  // reachable; rejects otherwise. Must be cheap (no row scans).
  ping(): Promise<void>;
  createShareSession(session: ShareSession): Promise<ShareSession>;
  findOwnerSessionByToken(
    token: string,
    sessionId: string
  ): Promise<ShareSession | null>;
  findOwnerSessionByTokenOnly(token: string): Promise<ShareSession | null>;
  findViewerSessionByToken(token: string): Promise<ShareSession | null>;
  getLatestLocation(sessionId: string): Promise<LocationLatest | null>;
  getLocationTrack(sessionId: string, limit: number): Promise<LocationTrackPoint[]>;
  getStopArrivals(sessionId: string): Promise<StopArrival[]>;
  recordSessionError(sessionId: string, message: string): Promise<SessionAudit | null>;
  recordLocation(point: LocationStorePoint): Promise<LocationLatest>;
  recordAutoStopArrival(input: {
    sessionId: string;
    stopIndex: number;
    arrivedAt: string;
  }): Promise<void>;
  upsertManualStopArrival(input: {
    sessionId: string;
    stopIndex: number;
    arrivedAt: string;
  }): Promise<void>;
  clearStopArrival(sessionId: string, stopIndex: number): Promise<void>;
  recordUploadSuccess(sessionId: string): Promise<SessionAudit | null>;
  recordViewerAccess(sessionId: string, accessedAt: string): Promise<SessionAudit | null>;
  stopSessionByOwnerToken(
    token: string,
    sessionId: string | null,
    action: SessionEndAction
  ): Promise<ShareSession | null>;
}

type TripShareSessionRow = {
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

type TripLocationLatestRow = {
  session_id: string;
  lat: number;
  lng: number;
  accuracy_m: number;
  speed_mps: number | null;
  heading_deg: number | null;
  mode: TrackerMode;
  reason: UploadReason;
  client_ts: string;
  server_ts: string;
};

type TripLocationPointRow = TripLocationLatestRow & {
  seq: number;
};

type TripStopArrivalRow = {
  session_id: string;
  stop_index: number;
  arrived_at: string;
  source: StopArrivalSource;
};

export type TripGpsDatabase = {
  public: {
    Tables: {
      trip_share_sessions: {
        Row: TripShareSessionRow;
        Insert: TripShareSessionRow;
        Update: Partial<TripShareSessionRow>;
        Relationships: [];
      };
      trip_location_latest: {
        Row: TripLocationLatestRow;
        Insert: TripLocationLatestRow;
        Update: Partial<TripLocationLatestRow>;
        Relationships: [];
      };
      trip_location_points: {
        Row: TripLocationPointRow;
        Insert: TripLocationPointRow;
        Update: Partial<TripLocationPointRow>;
        Relationships: [];
      };
      trip_stop_arrivals: {
        Row: TripStopArrivalRow;
        Insert: TripStopArrivalRow;
        Update: Partial<TripStopArrivalRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type TripGpsSupabaseClient = SupabaseClient<TripGpsDatabase>;
type SessionRow = TripGpsDatabase["public"]["Tables"]["trip_share_sessions"]["Row"];
type SessionUpdate =
  TripGpsDatabase["public"]["Tables"]["trip_share_sessions"]["Update"];
type LatestRow = TripGpsDatabase["public"]["Tables"]["trip_location_latest"]["Row"];
type LatestInsert =
  TripGpsDatabase["public"]["Tables"]["trip_location_latest"]["Insert"];
type PointInsert =
  TripGpsDatabase["public"]["Tables"]["trip_location_points"]["Insert"];
type StopArrivalInsert =
  TripGpsDatabase["public"]["Tables"]["trip_stop_arrivals"]["Insert"];
type StopArrivalRow =
  TripGpsDatabase["public"]["Tables"]["trip_stop_arrivals"]["Row"];

export class InMemoryTripGpsRepo implements TripGpsRepo {
  private readonly sessions = new Map<string, ShareSession>();
  private readonly latest = new Map<string, LocationLatest>();
  private readonly history = new Map<string, LocationStorePoint[]>();
  private readonly stopArrivals = new Map<string, Map<number, StopArrival>>();

  async ping(): Promise<void> {
    // In-memory store is always ready.
  }

  async createShareSession(session: ShareSession): Promise<ShareSession> {
    const stored = { ...session };

    this.sessions.set(stored.id, stored);

    return stored;
  }

  async findOwnerSessionByToken(
    token: string,
    sessionId: string
  ): Promise<ShareSession | null> {
    const session = this.sessions.get(sessionId);

    if (!session || !verifyToken(token, session.owner_token_hash)) {
      return null;
    }

    return session;
  }

  async findOwnerSessionByTokenOnly(token: string): Promise<ShareSession | null> {
    return this.findSessionByTokenHash(token, "owner_token_hash");
  }

  async findViewerSessionByToken(token: string): Promise<ShareSession | null> {
    return this.findSessionByTokenHash(token, "viewer_token_hash");
  }

  async getLatestLocation(sessionId: string): Promise<LocationLatest | null> {
    return this.latest.get(sessionId) ?? null;
  }

  async getLocationTrack(sessionId: string, limit: number): Promise<LocationTrackPoint[]> {
    return (this.history.get(sessionId) ?? [])
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .slice(-Math.max(0, limit))
      .map(toTrackPoint);
  }

  async getStopArrivals(sessionId: string): Promise<StopArrival[]> {
    return sortedStopArrivals(this.stopArrivals.get(sessionId));
  }

  async recordSessionError(
    sessionId: string,
    message: string
  ): Promise<SessionAudit | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    const updated: ShareSession = {
      ...session,
      last_error: message,
    };

    this.sessions.set(sessionId, updated);

    return toSessionAudit(updated);
  }

  async recordLocation(point: LocationStorePoint): Promise<LocationLatest> {
    const latest: LocationLatest = {
      lat: point.lat,
      lng: point.lng,
      accuracyM: point.accuracyM,
      speedMps: point.speedMps ?? null,
      headingDeg: point.headingDeg ?? null,
      mode: point.mode,
      reason: point.reason,
      clientTs: point.clientTs,
      serverTs: point.serverTs,
    };

    this.latest.set(point.sessionId, latest);

    const history = this.history.get(point.sessionId) ?? [];
    const existingIndex = history.findIndex(
      (storedPoint) => storedPoint.seq === point.seq
    );

    if (existingIndex >= 0) {
      history[existingIndex] = point;
    } else {
      history.push(point);
    }

    this.history.set(point.sessionId, history);

    return latest;
  }

  async recordAutoStopArrival(input: {
    sessionId: string;
    stopIndex: number;
    arrivedAt: string;
  }): Promise<void> {
    const arrivals = this.stopArrivalsForSession(input.sessionId);

    if (arrivals.has(input.stopIndex)) {
      return;
    }

    arrivals.set(input.stopIndex, {
      index: input.stopIndex,
      arrivedAt: input.arrivedAt,
      source: "auto",
    });
  }

  async upsertManualStopArrival(input: {
    sessionId: string;
    stopIndex: number;
    arrivedAt: string;
  }): Promise<void> {
    this.stopArrivalsForSession(input.sessionId).set(input.stopIndex, {
      index: input.stopIndex,
      arrivedAt: input.arrivedAt,
      source: "manual",
    });
  }

  async clearStopArrival(sessionId: string, stopIndex: number): Promise<void> {
    this.stopArrivals.get(sessionId)?.delete(stopIndex);
  }

  async recordUploadSuccess(sessionId: string): Promise<SessionAudit | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    const updated: ShareSession = {
      ...session,
      upload_count: session.upload_count + 1,
      last_error: null,
    };

    this.sessions.set(sessionId, updated);

    return toSessionAudit(updated);
  }

  async recordViewerAccess(
    sessionId: string,
    accessedAt: string
  ): Promise<SessionAudit | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    const updated: ShareSession = {
      ...session,
      last_viewer_access_at: accessedAt,
    };

    this.sessions.set(sessionId, updated);

    return toSessionAudit(updated);
  }

  async stopSessionByOwnerToken(
    token: string,
    sessionId: string | null,
    action: SessionEndAction
  ): Promise<ShareSession | null> {
    const session = sessionId
      ? await this.findOwnerSessionByToken(token, sessionId)
      : this.findSessionByTokenHash(token, "owner_token_hash");

    return session ? this.endSession(session, action) : null;
  }

  private findSessionByTokenHash(
    token: string,
    hashField: "owner_token_hash" | "viewer_token_hash"
  ): ShareSession | null {
    const sessions = Array.from(this.sessions.values()).reverse();

    for (const session of sessions) {
      if (verifyToken(token, session[hashField])) {
        return session;
      }
    }

    return null;
  }

  private endSession(
    session: ShareSession,
    action: SessionEndAction
  ): ShareSession {
    const now = new Date().toISOString();
    const stoppedAt =
      action === "stop" ? (session.stopped_at ?? now) : session.stopped_at;
    const revokedAt =
      action === "revoke" ? (session.revoked_at ?? now) : session.revoked_at;
    const updated: ShareSession = {
      ...session,
      active: false,
      stopped_at: stoppedAt,
      revoked_at: revokedAt,
    };

    this.sessions.set(updated.id, updated);
    this.latest.delete(updated.id);

    return updated;
  }

  private stopArrivalsForSession(sessionId: string): Map<number, StopArrival> {
    const existing = this.stopArrivals.get(sessionId);

    if (existing) {
      return existing;
    }

    const created = new Map<number, StopArrival>();

    this.stopArrivals.set(sessionId, created);

    return created;
  }
}

export class SupabaseTripGpsRepo implements TripGpsRepo {
  constructor(private readonly getClient: () => TripGpsSupabaseClient) {}

  async ping(): Promise<void> {
    // HEAD-only count: reaches PostgREST + the table without scanning rows.
    const { error } = await this.getClient()
      .from("trip_share_sessions")
      .select("id", { count: "exact", head: true })
      .limit(1);

    if (error) {
      throwSupabaseError("ping", error);
    }
  }

  async createShareSession(session: ShareSession): Promise<ShareSession> {
    const { data, error } = await this.getClient()
      .from("trip_share_sessions")
      .insert(session)
      .select()
      .single();

    if (error) {
      throwSupabaseError("create share session", error);
    }

    return toShareSession(data);
  }

  async findOwnerSessionByToken(
    token: string,
    sessionId: string
  ): Promise<ShareSession | null> {
    const tokenHash = hashToken(token);
    const { data, error } = await this.getClient()
      .from("trip_share_sessions")
      .select()
      .eq("id", sessionId)
      .eq("owner_token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      throwSupabaseError("find owner session", error);
    }

    return data ? toShareSession(data) : null;
  }

  async findOwnerSessionByTokenOnly(token: string): Promise<ShareSession | null> {
    return this.findSessionByTokenHash(token, "owner_token_hash");
  }

  async findViewerSessionByToken(token: string): Promise<ShareSession | null> {
    return this.findSessionByTokenHash(token, "viewer_token_hash");
  }

  async getLatestLocation(sessionId: string): Promise<LocationLatest | null> {
    const { data, error } = await this.getClient()
      .from("trip_location_latest")
      .select()
      .eq("session_id", sessionId)
      .maybeSingle();

    if (error) {
      throwSupabaseError("get latest location", error);
    }

    return data ? toLocationLatest(data) : null;
  }

  async getLocationTrack(sessionId: string, limit: number): Promise<LocationTrackPoint[]> {
    const normalizedLimit = Math.min(Math.max(Math.trunc(limit), 0), 5000);

    if (normalizedLimit === 0) {
      return [];
    }

    const { data, error } = await this.getClient()
      .from("trip_location_points")
      .select()
      .eq("session_id", sessionId)
      .order("seq", { ascending: false })
      .limit(normalizedLimit);

    if (error) {
      throwSupabaseError("get location track", error);
    }

    return data
      .map(toLocationTrackPoint)
      .sort((a, b) => a.seq - b.seq);
  }

  async getStopArrivals(sessionId: string): Promise<StopArrival[]> {
    const { data, error } = await this.getClient()
      .from("trip_stop_arrivals")
      .select()
      .eq("session_id", sessionId)
      .order("stop_index", { ascending: true });

    if (error) {
      throwSupabaseError("get stop arrivals", error);
    }

    return data.map(toStopArrival);
  }

  async recordSessionError(
    sessionId: string,
    message: string
  ): Promise<SessionAudit | null> {
    return this.updateSessionAudit(sessionId, {
      last_error: message,
    });
  }

  async recordLocation(point: LocationStorePoint): Promise<LocationLatest> {
    const latestRow = toLatestRow(point);
    const pointRow: PointInsert = {
      ...latestRow,
      seq: point.seq,
    };

    const { error: pointError } = await this.getClient()
      .from("trip_location_points")
      .upsert(pointRow, { onConflict: "session_id,seq" });

    if (pointError) {
      throwSupabaseError("record location point", pointError);
    }

    const { data, error } = await this.getClient()
      .from("trip_location_latest")
      .upsert(latestRow, { onConflict: "session_id" })
      .select()
      .single();

    if (error) {
      throwSupabaseError("record latest location", error);
    }

    return toLocationLatest(data);
  }

  async recordAutoStopArrival(input: {
    sessionId: string;
    stopIndex: number;
    arrivedAt: string;
  }): Promise<void> {
    const { error } = await this.getClient()
      .from("trip_stop_arrivals")
      .upsert(toStopArrivalRow(input, "auto"), {
        onConflict: "session_id,stop_index",
        ignoreDuplicates: true,
      });

    if (error) {
      throwSupabaseError("record auto stop arrival", error);
    }
  }

  async upsertManualStopArrival(input: {
    sessionId: string;
    stopIndex: number;
    arrivedAt: string;
  }): Promise<void> {
    const { error } = await this.getClient()
      .from("trip_stop_arrivals")
      .upsert(toStopArrivalRow(input, "manual"), {
        onConflict: "session_id,stop_index",
      });

    if (error) {
      throwSupabaseError("upsert manual stop arrival", error);
    }
  }

  async clearStopArrival(sessionId: string, stopIndex: number): Promise<void> {
    const { error } = await this.getClient()
      .from("trip_stop_arrivals")
      .delete()
      .eq("session_id", sessionId)
      .eq("stop_index", stopIndex);

    if (error) {
      throwSupabaseError("clear stop arrival", error);
    }
  }

  async recordUploadSuccess(sessionId: string): Promise<SessionAudit | null> {
    const session = await this.findSessionById(sessionId);

    if (!session) {
      return null;
    }

    return this.updateSessionAudit(sessionId, {
      upload_count: session.upload_count + 1,
      last_error: null,
    });
  }

  async recordViewerAccess(
    sessionId: string,
    accessedAt: string
  ): Promise<SessionAudit | null> {
    return this.updateSessionAudit(sessionId, {
      last_viewer_access_at: accessedAt,
    });
  }

  async stopSessionByOwnerToken(
    token: string,
    sessionId: string | null,
    action: SessionEndAction
  ): Promise<ShareSession | null> {
    const session = sessionId
      ? await this.findOwnerSessionByToken(token, sessionId)
      : await this.findSessionByTokenHash(token, "owner_token_hash");

    return session ? this.endSession(session, action) : null;
  }

  private async findSessionById(sessionId: string): Promise<ShareSession | null> {
    const { data, error } = await this.getClient()
      .from("trip_share_sessions")
      .select()
      .eq("id", sessionId)
      .maybeSingle();

    if (error) {
      throwSupabaseError("find session", error);
    }

    return data ? toShareSession(data) : null;
  }

  private async updateSessionAudit(
    sessionId: string,
    update: SessionUpdate
  ): Promise<SessionAudit | null> {
    const { data, error } = await this.getClient()
      .from("trip_share_sessions")
      .update(update)
      .eq("id", sessionId)
      .select()
      .maybeSingle();

    if (error) {
      throwSupabaseError("update session audit", error);
    }

    return data ? toSessionAudit(toShareSession(data)) : null;
  }

  private async findSessionByTokenHash(
    token: string,
    hashField: "owner_token_hash" | "viewer_token_hash"
  ): Promise<ShareSession | null> {
    const tokenHash = hashToken(token);
    const { data, error } = await this.getClient()
      .from("trip_share_sessions")
      .select()
      .eq(hashField, tokenHash)
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throwSupabaseError("find session by token hash", error);
    }

    return data ? toShareSession(data) : null;
  }

  private async endSession(
    session: ShareSession,
    action: SessionEndAction
  ): Promise<ShareSession> {
    const update = endSessionUpdate(action, session);
    const { data, error } = await this.getClient()
      .from("trip_share_sessions")
      .update(update)
      .eq("id", session.id)
      .select()
      .single();

    if (error) {
      throwSupabaseError("end session", error);
    }

    await this.clearLatestLocations([session.id]);

    return toShareSession(data);
  }

  private async clearLatestLocations(sessionIds: string[]): Promise<void> {
    if (sessionIds.length === 0) {
      return;
    }

    const { error } = await this.getClient()
      .from("trip_location_latest")
      .delete()
      .in("session_id", sessionIds);

    if (error) {
      throwSupabaseError("clear latest location", error);
    }
  }
}

let supabaseClient: TripGpsSupabaseClient | null = null;

export function getSupabaseTripGpsClient(env: ServerEnv): TripGpsSupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (
    !hasRealSupabaseConfig(
      env.tripGpsSupabaseUrl,
      env.tripGpsSupabaseServiceRoleKey
    )
  ) {
    throw new Error(
      "Trip GPS Supabase is not configured with real server-only env."
    );
  }

  supabaseClient = createClient<TripGpsDatabase>(
    env.tripGpsSupabaseUrl,
    env.tripGpsSupabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      db: {
        schema: "public",
      },
    }
  );

  return supabaseClient;
}

export function createTripGpsRepo(env: ServerEnv): TripGpsRepo {
  if (env.selectedTripGpsStore === "supabase") {
    return new SupabaseTripGpsRepo(() => getSupabaseTripGpsClient(env));
  }

  return new InMemoryTripGpsRepo();
}

function toLatestRow(point: LocationStorePoint): LatestInsert {
  return {
    session_id: point.sessionId,
    lat: point.lat,
    lng: point.lng,
    accuracy_m: point.accuracyM,
    speed_mps: point.speedMps ?? null,
    heading_deg: point.headingDeg ?? null,
    mode: point.mode,
    reason: point.reason,
    client_ts: point.clientTs,
    server_ts: point.serverTs,
  };
}

function toLocationLatest(row: LatestRow): LocationLatest {
  return {
    lat: row.lat,
    lng: row.lng,
    accuracyM: row.accuracy_m,
    speedMps: row.speed_mps,
    headingDeg: row.heading_deg,
    mode: row.mode,
    reason: row.reason,
    clientTs: row.client_ts,
    serverTs: row.server_ts,
  };
}

function toLocationTrackPoint(row: TripLocationPointRow): LocationTrackPoint {
  return {
    ...toLocationLatest(row),
    seq: row.seq,
  };
}

function toTrackPoint(point: LocationStorePoint): LocationTrackPoint {
  return {
    lat: point.lat,
    lng: point.lng,
    accuracyM: point.accuracyM,
    speedMps: point.speedMps ?? null,
    headingDeg: point.headingDeg ?? null,
    mode: point.mode,
    reason: point.reason,
    clientTs: point.clientTs,
    serverTs: point.serverTs,
    seq: point.seq,
  };
}

function toStopArrival(row: StopArrivalRow): StopArrival {
  return {
    index: row.stop_index,
    arrivedAt: row.arrived_at,
    source: row.source,
  };
}

function toStopArrivalRow(
  input: {
    sessionId: string;
    stopIndex: number;
    arrivedAt: string;
  },
  source: StopArrivalSource
): StopArrivalInsert {
  return {
    session_id: input.sessionId,
    stop_index: input.stopIndex,
    arrived_at: input.arrivedAt,
    source,
  };
}

function toShareSession(row: SessionRow): ShareSession {
  return {
    id: row.id,
    trip_id: row.trip_id,
    active: row.active,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    stopped_at: row.stopped_at,
    last_viewer_access_at: row.last_viewer_access_at,
    upload_count: row.upload_count,
    last_error: row.last_error,
    owner_token_hash: row.owner_token_hash,
    viewer_token_hash: row.viewer_token_hash,
  };
}

function toSessionAudit(session: ShareSession): SessionAudit {
  return {
    lastViewerAccessAt: session.last_viewer_access_at,
    uploadCount: session.upload_count,
    lastError: session.last_error,
  };
}

function sortedStopArrivals(
  arrivals: Map<number, StopArrival> | undefined
): StopArrival[] {
  return Array.from(arrivals?.values() ?? []).sort(
    (a, b) => a.index - b.index
  );
}

function endSessionUpdate(
  action: SessionEndAction,
  session?: ShareSession
): SessionUpdate {
  const now = new Date().toISOString();
  const update: SessionUpdate = {
    active: false,
  };

  if (action === "stop") {
    update.stopped_at = session?.stopped_at ?? now;
  }

  if (action === "revoke") {
    update.revoked_at = session?.revoked_at ?? now;
  }

  return update;
}

function throwSupabaseError(action: string, error: { message: string }): never {
  throw new Error(`Trip GPS Supabase ${action} failed: ${error.message}`);
}
