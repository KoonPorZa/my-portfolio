import "server-only";

import type { LocationLatest, LocationPayload, ShareSession } from "./types";

export const DEV_OWNER_TOKEN = "phase-02-non-secret-placeholder";
export const DEV_VIEWER_TOKEN = "phase-04-dev-viewer-token";

const DEV_SESSION_ID = "trip01_dev_session";
const DEV_TRIP_ID = "001";
const DEV_EXPIRES_AT = "2099-01-01T00:00:00.000Z";

export type LocationStorePoint = LocationPayload & {
  serverTs: string;
};

export interface LocationStore {
  findOwnerSessionByToken(token: string, sessionId: string): Promise<ShareSession | null>;
  findViewerSessionByToken(token: string): Promise<ShareSession | null>;
  getLatestLocation(sessionId: string): Promise<LocationLatest | null>;
  recordLocation(point: LocationStorePoint): Promise<LocationLatest>;
}

class InMemoryLocationStore implements LocationStore {
  private readonly sessions = new Map<string, ShareSession>();
  private readonly latest = new Map<string, LocationLatest>();
  private readonly history = new Map<string, LocationStorePoint[]>();
  private currentDevSessionId = DEV_SESSION_ID;

  constructor() {
    if (isDevStoreEnabled()) {
      this.sessions.set(DEV_SESSION_ID, createDevSession(DEV_SESSION_ID));
    }
  }

  async findOwnerSessionByToken(token: string, sessionId: string): Promise<ShareSession | null> {
    if (!isDevStoreEnabled() || token !== DEV_OWNER_TOKEN) {
      return null;
    }

    return this.ensureDevSession(sessionId);
  }

  async findViewerSessionByToken(token: string): Promise<ShareSession | null> {
    if (!isDevStoreEnabled() || token !== DEV_VIEWER_TOKEN) {
      return null;
    }

    return this.ensureDevSession(this.currentDevSessionId);
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

  private ensureDevSession(sessionId: string): ShareSession {
    const existing = this.sessions.get(sessionId);

    if (existing) {
      this.currentDevSessionId = sessionId;
      return existing;
    }

    const session = createDevSession(sessionId);

    this.sessions.set(sessionId, session);
    this.currentDevSessionId = sessionId;

    return session;
  }
}

function createDevSession(id: string): ShareSession {
  return {
    id,
    trip_id: DEV_TRIP_ID,
    active: true,
    expires_at: DEV_EXPIRES_AT,
    revoked_at: null,
    owner_token_hash: "mock-owner-token",
    viewer_token_hash: "mock-viewer-token",
  };
}

function isDevStoreEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

declare global {
  var __tripGpsLocationStore: LocationStore | undefined;
}

export function getLocationStore(): LocationStore {
  globalThis.__tripGpsLocationStore ??= new InMemoryLocationStore();

  return globalThis.__tripGpsLocationStore;
}
