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
  SessionAudit,
  SessionEndAction,
  ShareSession,
  TrackerMode,
  UploadReason,
} from "./trip-gps.types";

export type LocationStorePoint = LocationPayload & {
  serverTs: string;
};

export interface TripGpsRepo {
  createShareSession(session: ShareSession): Promise<ShareSession>;
  findOwnerSessionByToken(
    token: string,
    sessionId: string
  ): Promise<ShareSession | null>;
  findViewerSessionByToken(token: string): Promise<ShareSession | null>;
  getLatestLocation(sessionId: string): Promise<LocationLatest | null>;
  recordSessionError(sessionId: string, message: string): Promise<SessionAudit | null>;
  recordLocation(point: LocationStorePoint): Promise<LocationLatest>;
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

export class InMemoryTripGpsRepo implements TripGpsRepo {
  private readonly sessions = new Map<string, ShareSession>();
  private readonly latest = new Map<string, LocationLatest>();
  private readonly history = new Map<string, LocationStorePoint[]>();

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

  async findViewerSessionByToken(token: string): Promise<ShareSession | null> {
    return this.findSessionByTokenHash(token, "viewer_token_hash");
  }

  async getLatestLocation(sessionId: string): Promise<LocationLatest | null> {
    return this.latest.get(sessionId) ?? null;
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
}

export class SupabaseTripGpsRepo implements TripGpsRepo {
  constructor(private readonly getClient: () => TripGpsSupabaseClient) {}

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
