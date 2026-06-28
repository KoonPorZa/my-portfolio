"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MAX_BAD_ACCURACY_M, intervalForMode } from "@/lib/trip-gps/cadence";
import { uploadLocation } from "@/lib/trip-gps/client";
import { sanitizeCoords } from "@/lib/trip-gps/geo";
import {
  TRACKER_MODES,
  type LocationPayload,
  type TrackerMode,
  type UploadReason,
} from "@/lib/trip-gps/types";
import styles from "./live-tracker.module.css";

const SESSION_ENDPOINT = "/api/trips/001/session";
const TICK_MS = 1_000;
const SECONDS_PER_MINUTE = 60;
const COPY_RESET_MS = 1_800;
const GEO_PERMISSION_DENIED = 1;
const GEO_POSITION_UNAVAILABLE = 2;
const GEO_TIMEOUT = 3;
const REPEATED_UPLOAD_FAILURE_COUNT = 2;

type PermissionStatus = "not-requested" | "granted" | "denied" | "unsupported";
type UploadStatus =
  | "idle"
  | "capturing"
  | "uploading"
  | "sent"
  | "queued"
  | "rejected"
  | "error";
type WakeLockStatus = "off" | "requesting" | "active" | "released" | "unsupported" | "error";

type LocalWakeLockSentinel = EventTarget & {
  readonly released: boolean;
  release(): Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request(type: "screen"): Promise<LocalWakeLockSentinel>;
  };
};

type PositionSnapshot = {
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps: number | null;
  headingDeg: number | null;
  clientTs: string;
};

type StatusTone = "neutral" | "good" | "warn" | "danger";

type SessionSummary = {
  id: string;
  tripId: string;
  active: boolean;
  expiresAt: string;
  stoppedAt: string | null;
  revokedAt: string | null;
};

type CreateSessionResponse = {
  ok: true;
  session: SessionSummary;
  ownerToken: string;
  viewerToken: string;
  viewerLink: string;
};

type StopSessionResponse = {
  ok: true;
  session: SessionSummary;
};

const modeLabels: Record<TrackerMode, string> = {
  active: `Active · ${formatCadence(intervalForMode("active"))}`,
  city: `City approach · ${formatCadence(intervalForMode("city"))}`,
  saver: `Battery saver · ${formatCadence(intervalForMode("saver"))}`,
  rest: `Rest · ${formatCadence(intervalForMode("rest"))}`,
};

const modeShortcuts: Array<{ mode: TrackerMode; label: string }> = TRACKER_MODES.map(
  (trackerMode) => ({
    mode: trackerMode,
    label:
      trackerMode === "city"
        ? "City approach"
        : trackerMode.charAt(0).toUpperCase() + trackerMode.slice(1),
  })
);

const permissionLabels: Record<PermissionStatus, string> = {
  "not-requested": "Not requested",
  granted: "Granted",
  denied: "Denied",
  unsupported: "Unsupported",
};

const uploadLabels: Record<UploadStatus, string> = {
  idle: "Idle",
  capturing: "Reading GPS",
  uploading: "Uploading",
  sent: "Sent",
  queued: "Queued",
  rejected: "Rejected",
  error: "Error",
};

const wakeLockLabels: Record<WakeLockStatus, string> = {
  off: "Off",
  requesting: "Requesting",
  active: "Active",
  released: "Released",
  unsupported: "Unsupported",
  error: "Unavailable",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function readCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("navigator.geolocation is not available in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
    });
  });
}

function snapshotFromPosition(position: GeolocationPosition): PositionSnapshot | null {
  const coords = position.coords;
  const clientTs = new Date(position.timestamp || Date.now()).toISOString();
  const sanitized = sanitizeCoords({
    lat: coords.latitude,
    lng: coords.longitude,
    accuracyM: coords.accuracy,
    clientTs,
  });

  if (!sanitized || sanitized.accuracyM === null) {
    return null;
  }

  return {
    lat: sanitized.lat,
    lng: sanitized.lng,
    accuracyM: sanitized.accuracyM,
    speedMps: Number.isFinite(coords.speed) ? coords.speed : null,
    headingDeg: Number.isFinite(coords.heading) ? coords.heading : null,
    clientTs: sanitized.clientTs,
  };
}

function formatCountdown(ms: number) {
  if (ms <= 0) {
    return "Now";
  }

  const totalSeconds = Math.ceil(ms / TICK_MS);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (!minutes) {
    return `${seconds}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function formatCadence(ms: number) {
  return `${Math.round(ms / (SECONDS_PER_MINUTE * TICK_MS))}m`;
}

function formatClock(value: string | null) {
  if (!value) {
    return "None";
  }

  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function isGeolocationPositionError(error: unknown): error is GeolocationPositionError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as GeolocationPositionError).code === "number"
  );
}

function geolocationErrorMessage(error: unknown) {
  if (isGeolocationPositionError(error)) {
    if (error.code === GEO_PERMISSION_DENIED) {
      return "ปิดสิทธิ์ตำแหน่งอยู่ เปิด Location ให้เว็บนี้ใน browser settings แล้วลองใหม่";
    }

    if (error.code === GEO_POSITION_UNAVAILABLE) {
      return "อ่านตำแหน่งไม่ได้ ตรวจ Location Services และขยับไปจุดที่สัญญาณชัดขึ้น";
    }

    if (error.code === GEO_TIMEOUT) {
      return "GPS ตอบช้าเกินไป ลองใหม่ตอนปลดล็อกหน้าจออยู่";
    }
  }

  return error instanceof Error ? error.message : "GPS capture failed.";
}

function isPermissionDenied(error: unknown) {
  return isGeolocationPositionError(error) && error.code === GEO_PERMISSION_DENIED;
}

function buildViewerLink(origin: string) {
  return `${origin}/trip/001/live`;
}

async function createLiveSession(code: string): Promise<CreateSessionResponse> {
  const response = await fetch(SESSION_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ code }),
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(apiErrorMessage(body, response.status, "Could not create a GPS session."));
  }

  if (!isCreateSessionResponse(body)) {
    throw new Error("GPS session response was invalid.");
  }

  return body;
}

async function stopLiveSession(
  ownerToken: string,
  sessionId: string,
  action: "stop" | "revoke"
): Promise<StopSessionResponse> {
  const response = await fetch(SESSION_ENDPOINT, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${ownerToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ sessionId, action }),
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(apiErrorMessage(body, response.status, "Could not stop the GPS session."));
  }

  if (!isStopSessionResponse(body)) {
    throw new Error("GPS stop response was invalid.");
  }

  return body;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiErrorMessage(body: unknown, status: number, fallback: string): string {
  if (isRecord(body) && typeof body.message === "string" && body.message.trim()) {
    return `${body.message} Status ${status}.`;
  }

  return `${fallback} Status ${status}.`;
}

function isCreateSessionResponse(value: unknown): value is CreateSessionResponse {
  return (
    isRecord(value) &&
    value.ok === true &&
    isSessionSummary(value.session) &&
    typeof value.ownerToken === "string" &&
    value.ownerToken.length > 0 &&
    typeof value.viewerToken === "string" &&
    value.viewerToken.length > 0 &&
    typeof value.viewerLink === "string" &&
    value.viewerLink.length > 0
  );
}

function isStopSessionResponse(value: unknown): value is StopSessionResponse {
  return isRecord(value) && value.ok === true && isSessionSummary(value.session);
}

function isSessionSummary(value: unknown): value is SessionSummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.tripId === "string" &&
    typeof value.active === "boolean" &&
    typeof value.expiresAt === "string" &&
    (typeof value.stoppedAt === "string" || value.stoppedAt === null) &&
    (typeof value.revokedAt === "string" || value.revokedAt === null)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function statusTone(status: UploadStatus): StatusTone {
  switch (status) {
    case "sent":
      return "good";
    case "queued":
    case "rejected":
      return "warn";
    case "error":
      return "danger";
    case "idle":
    case "capturing":
    case "uploading":
      return "neutral";
  }
}

export function LiveTracker({ gpsEnabled }: { gpsEnabled: boolean }) {
  const [mode, setMode] = useState<TrackerMode>("active");
  const [isSharing, setIsSharing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [ownerCode, setOwnerCode] = useState("");
  const [permission, setPermission] = useState<PermissionStatus>("not-requested");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [wakeLockStatus, setWakeLockStatus] = useState<WakeLockStatus>("off");
  const [nextSendAt, setNextSendAt] = useState<number | null>(null);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [viewerLink, setViewerLink] = useState("/trip/001/live");
  const [copied, setCopied] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [wasHiddenWhileSharing, setWasHiddenWhileSharing] = useState(false);
  const [secureContext, setSecureContext] = useState<boolean | null>(null);
  const [consecutiveUploadFailures, setConsecutiveUploadFailures] = useState(0);
  const [now, setNow] = useState(0);

  const sessionIdRef = useRef<string | null>(null);
  const ownerTokenRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const modeRef = useRef<TrackerMode>(mode);
  const sharingRef = useRef(isSharing);
  const lastPositionRef = useRef<PositionSnapshot | null>(null);
  const wakeLockRef = useRef<LocalWakeLockSentinel | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    sharingRef.current = isSharing;
  }, [isSharing]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const supported = "geolocation" in navigator;

      if (!supported) {
        setPermission("unsupported");
      }

      setSecureContext(window.isSecureContext);
      setViewerLink(buildViewerLink(window.location.origin));
      setIsHidden(document.hidden);
    });

    const handleVisibility = () => {
      const hidden = document.hidden;

      setIsHidden(hidden);

      if (hidden && sharingRef.current) {
        setWasHiddenWhileSharing(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    const tickId = window.setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);

    return () => {
      window.clearInterval(tickId);
    };
  }, []);

  const releaseWakeLock = useCallback(async () => {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;

    if (!sentinel || sentinel.released) {
      setWakeLockStatus((current) => (current === "unsupported" ? current : "off"));
      return;
    }

    try {
      await sentinel.release();
      setWakeLockStatus("off");
    } catch {
      setWakeLockStatus("error");
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;

    if (!wakeLock) {
      setWakeLockStatus("unsupported");
      return;
    }

    try {
      setWakeLockStatus("requesting");
      const sentinel = await wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      sentinel.addEventListener("release", () => {
        if (wakeLockRef.current === sentinel) {
          wakeLockRef.current = null;
          setWakeLockStatus("released");
        }
      });
      setWakeLockStatus("active");
    } catch {
      setWakeLockStatus("error");
    }
  }, []);

  useEffect(() => {
    const canRequestWakeLock = wakeLockStatus === "off" || wakeLockStatus === "released";

    if (!isSharing || isHidden || wakeLockRef.current || !canRequestWakeLock) {
      return;
    }

    void requestWakeLock();
  }, [isHidden, isSharing, requestWakeLock, wakeLockStatus]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      void releaseWakeLock();
    };
  }, [releaseWakeLock]);

  const uploadSnapshot = useCallback(
    async (
      snapshot: PositionSnapshot,
      reason: UploadReason,
      sessionId = sessionIdRef.current,
      trackerMode = modeRef.current
    ) => {
      if (!sessionId) {
        setUploadStatus("error");
        setLastError("No GPS session is active yet.");
        return false;
      }

      const ownerToken = ownerTokenRef.current;

      if (!ownerToken) {
        setUploadStatus("error");
        setLastError("No GPS owner token is active yet.");
        return false;
      }

      const payload: LocationPayload = {
        sessionId,
        seq: ++seqRef.current,
        lat: snapshot.lat,
        lng: snapshot.lng,
        accuracyM: snapshot.accuracyM,
        speedMps: snapshot.speedMps,
        headingDeg: snapshot.headingDeg,
        clientTs: snapshot.clientTs,
        mode: trackerMode,
        reason,
      };

      setUploadStatus("uploading");
      setLastSentAt(payload.clientTs);
      setLastAccuracy(snapshot.accuracyM);

      try {
        const result = await uploadLocation(payload, {
          token: ownerToken,
        });

        if (result.ok) {
          setUploadStatus("sent");
          setLastError(null);
          setConsecutiveUploadFailures(0);
          return true;
        }

        setUploadStatus(result.queued ? "queued" : "rejected");
        setConsecutiveUploadFailures((current) => current + 1);
        setLastError(
          `${result.message}${result.status ? ` Status ${result.status}.` : ""}`
        );

        return true;
      } catch (error) {
        setUploadStatus("error");
        setConsecutiveUploadFailures((current) => current + 1);
        setLastError(error instanceof Error ? error.message : "GPS upload failed.");
        return true;
      }
    },
    []
  );

  const captureAndUpload = useCallback(
    async (reason: UploadReason, sessionId = sessionIdRef.current, trackerMode = modeRef.current) => {
      if (permission === "unsupported" || typeof navigator === "undefined" || !("geolocation" in navigator)) {
        setPermission("unsupported");
        setUploadStatus("error");
        setLastError("This browser does not support navigator.geolocation.");
        return false;
      }

      setUploadStatus("capturing");

      try {
        const position = await readCurrentPosition();
        const snapshot = snapshotFromPosition(position);

        if (!snapshot) {
          setUploadStatus("error");
          setLastError("GPS returned invalid coordinates.");
          return false;
        }

        setPermission("granted");
        setLastError(null);
        lastPositionRef.current = snapshot;

        return uploadSnapshot(snapshot, reason, sessionId, trackerMode);
      } catch (error) {
        setPermission(isPermissionDenied(error) ? "denied" : permission);
        setUploadStatus("error");
        setLastError(geolocationErrorMessage(error));
        return false;
      }
    },
    [permission, uploadSnapshot]
  );

  useEffect(() => {
    if (!isSharing || nextSendAt === null) {
      return;
    }

    const delay = Math.max(0, nextSendAt - Date.now());
    const timeoutId = window.setTimeout(() => {
      void captureAndUpload("scheduled").finally(() => {
        if (sharingRef.current) {
          setNextSendAt(Date.now() + intervalForMode(modeRef.current));
        }
      });
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [captureAndUpload, isSharing, nextSendAt]);

  const handleStart = useCallback(async () => {
    if (isSharing || isStarting) {
      return;
    }

    const code = ownerCode.trim();

    if (!code) {
      setLastError("Enter the live-share code before starting.");
      return;
    }

    setIsStarting(true);
    setLastError(null);
    setNextSendAt(null);
    setConsecutiveUploadFailures(0);
    setWasHiddenWhileSharing(false);
    setUploadStatus("idle");

    try {
      const session = await createLiveSession(code);

      ownerTokenRef.current = session.ownerToken;
      sessionIdRef.current = session.session.id;
      seqRef.current = 0;
      setViewerLink(session.viewerLink);
      setSessionExpiresAt(session.session.expiresAt);
      setOwnerCode("");

      const captured = await captureAndUpload("start", session.session.id, modeRef.current);

      if (!captured) {
        await stopLiveSession(session.ownerToken, session.session.id, "revoke").catch(() => undefined);
        ownerTokenRef.current = null;
        sessionIdRef.current = null;
        setSessionExpiresAt(null);
        setViewerLink(
          typeof window === "undefined" ? "/trip/001/live" : buildViewerLink(window.location.origin)
        );
        return;
      }

      setIsSharing(true);
      setNow(Date.now());
      setNextSendAt(Date.now() + intervalForMode(modeRef.current));
      void requestWakeLock();
    } catch (error) {
      ownerTokenRef.current = null;
      sessionIdRef.current = null;
      setSessionExpiresAt(null);
      setLastError(error instanceof Error ? error.message : "Could not start live GPS sharing.");
    } finally {
      setIsStarting(false);
    }
  }, [captureAndUpload, isSharing, isStarting, ownerCode, requestWakeLock]);

  const handleManualPing = useCallback(
    async (reason: UploadReason = "manual") => {
      if (!isSharing) {
        return;
      }

      const captured = await captureAndUpload(reason);

      if (captured && sharingRef.current) {
        setNow(Date.now());
        setNextSendAt(Date.now() + intervalForMode(modeRef.current));
      }
    },
    [captureAndUpload, isSharing]
  );

  const handleStop = useCallback(async () => {
    if (!isSharing || isStopping) {
      return;
    }

    const ownerToken = ownerTokenRef.current;
    const sessionId = sessionIdRef.current;

    setIsSharing(false);
    setIsStopping(true);
    setNextSendAt(null);

    if (watchIdRef.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    await releaseWakeLock();

    const lastPosition = lastPositionRef.current;

    if (lastPosition && ownerToken && sessionId) {
      await uploadSnapshot(
        {
          ...lastPosition,
          clientTs: new Date().toISOString(),
        },
        "stop"
      );
    } else {
      setUploadStatus("error");
      setLastError("No active GPS session is available for the stop ping.");
    }

    if (!ownerToken || !sessionId) {
      setIsStopping(false);
      return;
    }

    try {
      await stopLiveSession(ownerToken, sessionId, "stop");
      ownerTokenRef.current = null;
      sessionIdRef.current = null;
      setSessionExpiresAt(null);
    } catch (error) {
      setUploadStatus("error");
      setLastError(error instanceof Error ? error.message : "Could not stop live GPS sharing.");
    } finally {
      setIsStopping(false);
    }
  }, [isSharing, isStopping, releaseWakeLock, uploadSnapshot]);

  const handleModeSelect = useCallback((nextMode: TrackerMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);

    if (sharingRef.current) {
      setNow(Date.now());
      setNextSendAt(Date.now() + intervalForMode(nextMode));
    }
  }, []);

  const handleCopyViewerLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(viewerLink);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, COPY_RESET_MS);
    } catch {
      setLastError("Could not copy the viewer link in this browser.");
    }
  }, [viewerLink]);

  const handleRetry = useCallback(() => {
    if (isSharing) {
      void handleManualPing("retry");
      return;
    }

    void handleStart();
  }, [handleManualPing, handleStart, isSharing]);

  const isBusy =
    isStarting || isStopping || uploadStatus === "capturing" || uploadStatus === "uploading";
  const nextSendLabel = isSharing && nextSendAt ? formatCountdown(nextSendAt - now) : "Paused";
  const hasTokenedViewerLink = viewerLink.includes("?t=");
  const canStart = ownerCode.trim().length > 0;
  const wakeLockTone: StatusTone =
    wakeLockStatus === "active" ? "good" : wakeLockStatus === "error" ? "danger" : "warn";
  const permissionTone: StatusTone =
    permission === "granted"
      ? "good"
      : permission === "denied" || permission === "unsupported"
        ? "danger"
        : "neutral";
  const hasPoorAccuracy = lastAccuracy !== null && lastAccuracy > MAX_BAD_ACCURACY_M;
  const hasVisibilityRisk =
    isSharing && (isHidden || wasHiddenWhileSharing || wakeLockStatus !== "active");
  const hasRepeatedUploadFailures =
    consecutiveUploadFailures >= REPEATED_UPLOAD_FAILURE_COUNT;

  const statusItems = useMemo(
    () => [
      { label: "Permission", value: permissionLabels[permission], tone: permissionTone },
      {
        label: "Mode",
        value: modeLabels[mode],
        tone: mode === "active" || mode === "city" ? "good" : "warn",
      },
      { label: "Next send", value: nextSendLabel, tone: isSharing ? "good" : "neutral" },
      { label: "Last sent", value: formatClock(lastSentAt), tone: lastSentAt ? "good" : "neutral" },
      {
        label: "Accuracy",
        value: lastAccuracy === null ? "None" : `±${Math.round(lastAccuracy)}m`,
        tone: lastAccuracy === null ? "neutral" : hasPoorAccuracy ? "warn" : "good",
      },
      { label: "Upload", value: uploadLabels[uploadStatus], tone: statusTone(uploadStatus) },
      {
        label: "Expires",
        value: sessionExpiresAt ? formatClock(sessionExpiresAt) : "No session",
        tone: sessionExpiresAt ? "warn" : "neutral",
      },
      { label: "Wake lock", value: wakeLockLabels[wakeLockStatus], tone: wakeLockTone },
    ],
    [
      isSharing,
      lastAccuracy,
      lastSentAt,
      mode,
      nextSendLabel,
      permission,
      permissionTone,
      hasPoorAccuracy,
      sessionExpiresAt,
      uploadStatus,
      wakeLockStatus,
      wakeLockTone,
    ]
  );

  if (!gpsEnabled) {
    return null;
  }

  return (
    <section className={styles.tracker} aria-labelledby="live-tracker-title">
      <div className={styles.trackerTop}>
        <div>
          <p className={styles.eyebrow}>Live Location</p>
          <h2 id="live-tracker-title">GPS share panel</h2>
        </div>
        <span className={cx(styles.liveBadge, isSharing ? styles.liveBadgeOn : styles.liveBadgeOff)}>
          {isSharing ? "Live" : "Off"}
        </span>
      </div>

      <p className={styles.lead}>
        Starts only from this button tap. Before Start sharing, no GPS position is read and nothing is uploaded.
      </p>

      <div className={styles.preflight} aria-label="Pre-start checklist">
        <span className={styles.preflightTag}>Pre-start</span>
        <ul>
          <li>Turn on phone GPS / Location Services.</li>
          <li className={secureContext === false ? styles.alertItem : undefined}>Open this page over HTTPS.</li>
          <li>Bring a power bank and charging cable.</li>
          <li>Browser updates may pause when the screen locks or this tab is hidden.</li>
        </ul>
      </div>

      <label className={styles.codeBox} htmlFor="trip-gps-owner-code">
        <span className={styles.viewerLabel}>Live-share code</span>
        <input
          id="trip-gps-owner-code"
          name="trip-gps-owner-code"
          type="password"
          value={ownerCode}
          autoComplete="off"
          inputMode="text"
          placeholder="Server owner code"
          disabled={isSharing || isBusy}
          onChange={(event) => setOwnerCode(event.target.value)}
        />
        <span>Required before Start because this trip page is public.</span>
      </label>

      <div className={styles.controls} aria-label="Live location controls">
        <button
          className={styles.primaryAction}
          type="button"
          onClick={() => void handleStart()}
          disabled={isSharing || isBusy || permission === "unsupported" || !canStart}
        >
          {isStarting ? "Starting..." : "Start sharing"}
        </button>
        <button
          className={styles.stopAction}
          type="button"
          onClick={() => void handleStop()}
          disabled={!isSharing || isStopping}
        >
          {isStopping ? "Stopping..." : "Stop sharing"}
        </button>
        <button
          className={styles.secondaryAction}
          type="button"
          onClick={() => void handleManualPing()}
          disabled={!isSharing || isBusy}
        >
          Manual ping
        </button>
      </div>

      <div className={styles.modeShortcuts} aria-label="GPS cadence shortcuts">
        {modeShortcuts.map((shortcut) => (
          <button
            key={shortcut.mode}
            className={cx(styles.modeAction, mode === shortcut.mode && styles.modeActionOn)}
            type="button"
            aria-pressed={mode === shortcut.mode}
            onClick={() => handleModeSelect(shortcut.mode)}
          >
            {shortcut.label}
          </button>
        ))}
      </div>

      <dl className={styles.statusGrid}>
        {statusItems.map((item) => (
          <div key={item.label} className={styles.statusCell}>
            <dt>{item.label}</dt>
            <dd className={styles[item.tone]}>{item.value}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.viewerBox}>
        <div>
          <span className={styles.viewerLabel}>Viewer link</span>
          <code>{viewerLink}</code>
          <p>{hasTokenedViewerLink ? "Share this tokened link with viewers." : "Start a session to mint a viewer token."}</p>
        </div>
        <button
          className={styles.copyButton}
          type="button"
          onClick={() => void handleCopyViewerLink()}
          disabled={!hasTokenedViewerLink}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {permission === "denied" ? (
        <div className={styles.warning} role="alert">
          <strong>ปิดสิทธิ์ตำแหน่งอยู่</strong>
          <p>เปิด Location ให้เว็บนี้ใน browser settings แล้วกด Retry ผู้ชมยังเห็นตำแหน่งล่าสุดที่ส่งสำเร็จอยู่</p>
          <button className={styles.retryButton} type="button" onClick={handleRetry}>
            Retry permission
          </button>
        </div>
      ) : null}

      {permission === "unsupported" ? (
        <div className={styles.warning} role="alert">
          <strong>เบราว์เซอร์นี้ไม่รองรับ GPS</strong>
          <p>ใช้ mobile browser ที่รองรับ navigator.geolocation ผู้ชมยังเห็นตำแหน่งล่าสุดที่ส่งสำเร็จอยู่</p>
        </div>
      ) : null}

      {hasVisibilityRisk ? (
        <div className={styles.warning} role="status">
          <strong>ระวังหน้าจอล็อกหรือแท็บถูกซ่อน</strong>
          <p>ถ้าหน้าจอดับหรือสลับแอป รอบส่ง GPS อาจหยุดชั่วคราว ผู้ชมยังเห็นตำแหน่งล่าสุดที่ส่งสำเร็จอยู่</p>
        </div>
      ) : null}

      {hasPoorAccuracy ? (
        <div className={styles.warning} role="status">
          <strong>ตำแหน่งคร่าว ๆ</strong>
          <p>ความแม่นยำล่าสุดกว้างกว่า ±{MAX_BAD_ACCURACY_M} ม. ใช้เป็นจุดประมาณเท่านั้น ผู้ชมยังเห็นตำแหน่งล่าสุดที่ส่งสำเร็จอยู่</p>
        </div>
      ) : null}

      {hasRepeatedUploadFailures ? (
        <div className={styles.warning} role="alert">
          <strong>ส่งตำแหน่งไม่สำเร็จหลายครั้ง</strong>
          <p>ระบบเก็บจุดล่าสุดไว้รอส่งซ้ำเมื่อออนไลน์ ผู้ชมยังเห็นตำแหน่งล่าสุดที่ส่งสำเร็จอยู่</p>
        </div>
      ) : null}

      {lastError ? (
        <p className={styles.errorLine} role="status">
          {lastError}
        </p>
      ) : null}
    </section>
  );
}
