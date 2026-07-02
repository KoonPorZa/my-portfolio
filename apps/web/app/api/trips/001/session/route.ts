import { generateToken, generateTokenPair, hashToken, verifyToken } from "@/lib/trip-gps/token";
import { getLocationStore, type SessionEndAction } from "@/lib/trip-gps/store";
import type { ShareSession } from "@/lib/trip-gps/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRIP_ID = "001";
const SESSION_PREFIX = "trip01";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const OWNER_CODE_ENV = "TRIP_GPS_OWNER_CODE";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
};

type ApiErrorCode =
  | "invalid_owner_code"
  | "invalid_token"
  | "not_configured"
  | "not_found";

type PublicSession = {
  id: string;
  tripId: string;
  active: boolean;
  expiresAt: string;
  stoppedAt: string | null;
  revokedAt: string | null;
};

type CreateSessionResponse = {
  ok: true;
  session: PublicSession;
  ownerToken: string;
  viewerToken: string;
  viewerLink: string;
};

type StopSessionResponse = {
  ok: true;
  session: PublicSession;
};

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const code = readOptionalString(body.code);
  const codeStatus = verifyOwnerCode(code);

  if (codeStatus === "not_configured") {
    return errorResponse(503, "not_configured", "GPS owner code is not configured.");
  }

  if (codeStatus === "invalid") {
    return errorResponse(401, "invalid_owner_code", "Invalid or missing owner code.");
  }

  const now = Date.now();
  const expiresAt = new Date(now + DEFAULT_TTL_MS).toISOString();
  const sessionId = createSessionId(now);
  const { ownerToken, viewerToken } = generateTokenPair();
  const session: ShareSession = {
    id: sessionId,
    trip_id: TRIP_ID,
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

  const storedSession = await getLocationStore().createShareSession(session);

  return jsonResponse<CreateSessionResponse>(
    {
      ok: true,
      session: toPublicSession(storedSession),
      ownerToken,
      viewerToken,
      viewerLink: buildViewerLink(request.url, viewerToken),
    },
    200
  );
}

export async function DELETE(request: Request) {
  return stopSession(request);
}

export async function PATCH(request: Request) {
  return stopSession(request);
}

async function stopSession(request: Request) {
  const body = await readJsonObject(request);
  const ownerToken = readBearerToken(request.headers.get("authorization"));
  const sessionId = readOptionalString(body.sessionId);
  const action = readSessionEndAction(body.action);
  const store = getLocationStore();
  let stoppedSession: ShareSession | null = null;

  if (ownerToken) {
    stoppedSession = await store.stopSessionByOwnerToken(ownerToken, sessionId, action);

    if (!stoppedSession) {
      return errorResponse(401, "invalid_token", "Invalid or missing token.");
    }
  } else {
    const codeStatus = verifyOwnerCode(readOptionalString(body.code));

    if (codeStatus === "not_configured") {
      return errorResponse(503, "not_configured", "GPS owner code is not configured.");
    }

    if (codeStatus === "invalid") {
      return errorResponse(401, "invalid_owner_code", "Invalid or missing owner code.");
    }

    if (sessionId) {
      stoppedSession = await store.stopSessionById(sessionId, action);
    } else {
      const stoppedSessions = await store.stopActiveSessions(action);
      stoppedSession = stoppedSessions.at(-1) ?? null;
    }

    if (!stoppedSession) {
      return errorResponse(404, "not_found", "No active GPS session was found.");
    }
  }

  return jsonResponse<StopSessionResponse>(
    {
      ok: true,
      session: toPublicSession(stoppedSession),
    },
    200
  );
}

function createSessionId(now: number): string {
  const stamp = new Date(now).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = generateToken().slice(0, 12);

  return `${SESSION_PREFIX}_${stamp}_${suffix}`;
}

function verifyOwnerCode(code: string | null): "valid" | "invalid" | "not_configured" {
  const ownerCode = process.env[OWNER_CODE_ENV]?.trim();

  if (!ownerCode) {
    return "not_configured";
  }

  return verifyToken(code ?? "", hashToken(ownerCode)) ? "valid" : "invalid";
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();

    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readSessionEndAction(value: unknown): SessionEndAction {
  return value === "revoke" ? "revoke" : "stop";
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

function buildViewerLink(requestUrl: string, viewerToken: string): string {
  const url = new URL("/trip/001/live", requestUrl);

  url.searchParams.set("t", viewerToken);

  return url.toString();
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
    headers: NO_STORE_HEADERS,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
