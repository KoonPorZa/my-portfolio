import "server-only";

import type {
  LocationLatest,
  LocationPayload,
  LocationTrackPoint,
  SessionAudit,
  ShareSession,
} from "./types";
import {
  getSupabaseServerClient,
  hasRealSupabaseConfig,
  type TripGpsSupabaseClient,
  type TripGpsTable,
} from "./supabase-server";
import { hashToken, verifyToken } from "./token";

export type LocationStorePoint = LocationPayload & {
  serverTs: string;
};

export type SessionEndAction = "stop" | "revoke";

export interface LocationStore {
  createShareSession(session: ShareSession): Promise<ShareSession>;
  findOwnerSessionByToken(token: string, sessionId: string): Promise<ShareSession | null>;
  findViewerSessionByToken(token: string): Promise<ShareSession | null>;
  getLatestLocation(sessionId: string): Promise<LocationLatest | null>;
  getLocationTrack(sessionId: string, limit: number): Promise<LocationTrackPoint[]>;
  recordSessionError(sessionId: string, message: string): Promise<SessionAudit | null>;
  recordLocation(point: LocationStorePoint): Promise<LocationLatest>;
  recordUploadSuccess(sessionId: string): Promise<SessionAudit | null>;
  recordViewerAccess(sessionId: string, accessedAt: string): Promise<SessionAudit | null>;
  stopSessionById(sessionId: string, action: SessionEndAction): Promise<ShareSession | null>;
  stopSessionByOwnerToken(
    token: string,
    sessionId: string | null,
    action: SessionEndAction
  ): Promise<ShareSession | null>;
  stopActiveSessions(action: SessionEndAction): Promise<ShareSession[]>;
}

type LocationStoreMode = "memory" | "supabase";
type SessionRow = TripGpsTable<"trip_share_sessions">["Row"];
type SessionUpdate = TripGpsTable<"trip_share_sessions">["Update"];
type LatestRow = TripGpsTable<"trip_location_latest">["Row"];
type LatestInsert = TripGpsTable<"trip_location_latest">["Insert"];
type PointInsert = TripGpsTable<"trip_location_points">["Insert"];

class InMemoryLocationStore implements LocationStore {
  private readonly sessions = new Map<string, ShareSession>();
  private readonly latest = new Map<string, LocationLatest>();
  private readonly history = new Map<string, LocationStorePoint[]>();
  private currentSessionId: string | null = null;

  async createShareSession(session: ShareSession): Promise<ShareSession> {
    const stored = { ...session };

    this.sessions.set(stored.id, stored);
    this.currentSessionId = stored.id;

    return stored;
  }

  async findOwnerSessionByToken(token: string, sessionId: string): Promise<ShareSession | null> {
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

  async getLocationTrack(sessionId: string, limit: number): Promise<LocationTrackPoint[]> {
    return (this.history.get(sessionId) ?? [])
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .slice(-Math.max(0, limit))
      .map(toTrackPoint);
  }

  async recordSessionError(sessionId: string, message: string): Promise<SessionAudit | null> {
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
    const existingIndex = history.findIndex((storedPoint) => storedPoint.seq === point.seq);

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

  async recordViewerAccess(sessionId: string, accessedAt: string): Promise<SessionAudit | null> {
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

  async stopSessionById(sessionId: string, action: SessionEndAction): Promise<ShareSession | null> {
    const session = this.sessions.get(sessionId);

    return session ? this.endSession(session, action) : null;
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

  async stopActiveSessions(action: SessionEndAction): Promise<ShareSession[]> {
    const stopped: ShareSession[] = [];

    for (const session of this.sessions.values()) {
      if (session.active) {
        stopped.push(this.endSession(session, action));
      }
    }

    return stopped;
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

  private endSession(session: ShareSession, action: SessionEndAction): ShareSession {
    const now = new Date().toISOString();
    const stoppedAt = action === "stop" ? (session.stopped_at ?? now) : session.stopped_at;
    const revokedAt = action === "revoke" ? (session.revoked_at ?? now) : session.revoked_at;
    const updated: ShareSession = {
      ...session,
      active: false,
      stopped_at: stoppedAt,
      revoked_at: revokedAt,
    };

    this.sessions.set(updated.id, updated);

    if (this.currentSessionId === updated.id) {
      this.currentSessionId = null;
    }

    return updated;
  }
}

export class SupabaseLocationStore implements LocationStore {
  private readonly supabase: TripGpsSupabaseClient;

  constructor(supabase = getSupabaseServerClient()) {
    this.supabase = supabase;
  }

  async createShareSession(session: ShareSession): Promise<ShareSession> {
    const { data, error } = await this.supabase
      .from("trip_share_sessions")
      .insert(session)
      .select()
      .single();

    if (error) {
      throwSupabaseError("create share session", error);
    }

    return toShareSession(data);
  }

  async findOwnerSessionByToken(token: string, sessionId: string): Promise<ShareSession | null> {
    const tokenHash = hashToken(token);
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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

    const { data, error } = await this.supabase
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

  async recordSessionError(sessionId: string, message: string): Promise<SessionAudit | null> {
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

    const { error: pointError } = await this.supabase
      .from("trip_location_points")
      .upsert(pointRow, { onConflict: "session_id,seq" });

    if (pointError) {
      throwSupabaseError("record location point", pointError);
    }

    const { data, error } = await this.supabase
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

  async recordViewerAccess(sessionId: string, accessedAt: string): Promise<SessionAudit | null> {
    return this.updateSessionAudit(sessionId, {
      last_viewer_access_at: accessedAt,
    });
  }

  async stopSessionById(sessionId: string, action: SessionEndAction): Promise<ShareSession | null> {
    const session = await this.findSessionById(sessionId);

    return session ? this.endSession(session, action) : null;
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

  async stopActiveSessions(action: SessionEndAction): Promise<ShareSession[]> {
    const { data: activeSessions, error: selectError } = await this.supabase
      .from("trip_share_sessions")
      .select()
      .eq("active", true);

    if (selectError) {
      throwSupabaseError("find active sessions", selectError);
    }

    const sessions = activeSessions ?? [];

    if (sessions.length === 0) {
      return [];
    }

    const sessionIds = sessions.map((session) => session.id);
    const update = endSessionUpdate(action);
    const { data, error } = await this.supabase
      .from("trip_share_sessions")
      .update(update)
      .in("id", sessionIds)
      .select();

    if (error) {
      throwSupabaseError("stop active sessions", error);
    }

    await this.clearLatestLocations(sessionIds);

    return (data ?? []).map(toShareSession);
  }

  private async findSessionById(sessionId: string): Promise<ShareSession | null> {
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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

  private async endSession(session: ShareSession, action: SessionEndAction): Promise<ShareSession> {
    const update = endSessionUpdate(action, session);
    const { data, error } = await this.supabase
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

    const { error } = await this.supabase
      .from("trip_location_latest")
      .delete()
      .in("session_id", sessionIds);

    if (error) {
      throwSupabaseError("clear latest location", error);
    }
  }
}

declare global {
  var __tripGpsLocationStore: LocationStore | undefined;
  var __tripGpsLocationStoreMode: LocationStoreMode | undefined;
}

export function getLocationStore(): LocationStore {
  const mode = selectLocationStoreMode();

  if (
    !globalThis.__tripGpsLocationStore ||
    globalThis.__tripGpsLocationStoreMode !== mode
  ) {
    globalThis.__tripGpsLocationStore =
      mode === "supabase" ? new SupabaseLocationStore() : new InMemoryLocationStore();
    globalThis.__tripGpsLocationStoreMode = mode;
  }

  return globalThis.__tripGpsLocationStore;
}

function selectLocationStoreMode(): LocationStoreMode {
  const requestedStore = process.env.TRIP_GPS_STORE?.trim().toLowerCase();

  if (requestedStore === "supabase") {
    return "supabase";
  }

  if (requestedStore === "mock" || requestedStore === "memory") {
    return "memory";
  }

  // Auto mode: production with real Supabase env uses the DB; all local,
  // missing-env, or placeholder-env builds stay on the in-memory mock.
  return process.env.NODE_ENV === "production" && hasRealSupabaseConfig()
    ? "supabase"
    : "memory";
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

function toLocationTrackPoint(row: TripGpsTable<"trip_location_points">["Row"]): LocationTrackPoint {
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

function endSessionUpdate(action: SessionEndAction, session?: ShareSession): SessionUpdate {
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
