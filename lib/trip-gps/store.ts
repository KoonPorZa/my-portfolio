import "server-only";

import type { LocationLatest, LocationPayload, ShareSession } from "./types";
import { verifyToken } from "./token";

export type LocationStorePoint = LocationPayload & {
  serverTs: string;
};

export type SessionEndAction = "stop" | "revoke";

export interface LocationStore {
  createShareSession(session: ShareSession): Promise<ShareSession>;
  findOwnerSessionByToken(token: string, sessionId: string): Promise<ShareSession | null>;
  findViewerSessionByToken(token: string): Promise<ShareSession | null>;
  getLatestLocation(sessionId: string): Promise<LocationLatest | null>;
  recordLocation(point: LocationStorePoint): Promise<LocationLatest>;
  stopSessionById(sessionId: string, action: SessionEndAction): Promise<ShareSession | null>;
  stopSessionByOwnerToken(
    token: string,
    sessionId: string | null,
    action: SessionEndAction
  ): Promise<ShareSession | null>;
  stopActiveSessions(action: SessionEndAction): Promise<ShareSession[]>;
}

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
    history.push(point);
    this.history.set(point.sessionId, history);

    return latest;
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

declare global {
  var __tripGpsLocationStore: LocationStore | undefined;
}

export function getLocationStore(): LocationStore {
  globalThis.__tripGpsLocationStore ??= new InMemoryLocationStore();

  return globalThis.__tripGpsLocationStore;
}
