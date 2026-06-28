"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { intervalForMode } from "@/lib/trip-gps/cadence";
import { uploadLocation } from "@/lib/trip-gps/client";
import { sanitizeCoords } from "@/lib/trip-gps/geo";
import type { LocationPayload, TrackerMode, UploadReason } from "@/lib/trip-gps/types";
import styles from "./live-tracker.module.css";

const PHASE_2_UPLOAD_TOKEN = "phase-02-non-secret-placeholder";
const SESSION_PREFIX = "trip01";
const TICK_MS = 1_000;
const SECONDS_PER_MINUTE = 60;
const COPY_RESET_MS = 1_800;
const GEO_PERMISSION_DENIED = 1;
const GEO_POSITION_UNAVAILABLE = 2;
const GEO_TIMEOUT = 3;

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

const modeLabels: Record<TrackerMode, string> = {
  active: `Active · ${formatCadence(intervalForMode("active"))}`,
  saver: `Battery saver · ${formatCadence(intervalForMode("saver"))}`,
  rest: `Rest · ${formatCadence(intervalForMode("rest"))}`,
};

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

function createSessionId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `${SESSION_PREFIX}_${stamp}_${suffix}`;
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
      return "Location permission was denied. Open browser settings for this site, allow Location, then retry.";
    }

    if (error.code === GEO_POSITION_UNAVAILABLE) {
      return "GPS position is unavailable. Check Location Services and move somewhere with clearer signal.";
    }

    if (error.code === GEO_TIMEOUT) {
      return "GPS took too long to respond. Try again with the phone unlocked.";
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
  const [permission, setPermission] = useState<PermissionStatus>("not-requested");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [wakeLockStatus, setWakeLockStatus] = useState<WakeLockStatus>("off");
  const [nextSendAt, setNextSendAt] = useState<number | null>(null);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [viewerLink, setViewerLink] = useState("/trip/001/live");
  const [copied, setCopied] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [secureContext, setSecureContext] = useState<boolean | null>(null);
  const [now, setNow] = useState(0);

  const sessionIdRef = useRef<string | null>(null);
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
      setIsHidden(document.hidden);
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
          token: PHASE_2_UPLOAD_TOKEN,
        });

        if (result.ok) {
          setUploadStatus("sent");
          setLastError(null);
          return true;
        }

        setUploadStatus(result.queued ? "queued" : "rejected");
        setLastError(
          `${result.message}${result.status ? ` Status ${result.status}.` : ""} Phase 4/7 will connect the real endpoint and owner token.`
        );

        return true;
      } catch (error) {
        setUploadStatus("error");
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

    setIsStarting(true);
    setLastError(null);
    setNextSendAt(null);
    setUploadStatus("idle");

    const sessionId = createSessionId();
    sessionIdRef.current = sessionId;
    seqRef.current = 0;

    const captured = await captureAndUpload("start", sessionId, modeRef.current);

    setIsStarting(false);

    if (!captured) {
      return;
    }

    setIsSharing(true);
    setNow(Date.now());
    setNextSendAt(Date.now() + intervalForMode(modeRef.current));
    void requestWakeLock();
  }, [captureAndUpload, isSharing, isStarting, requestWakeLock]);

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
    if (!isSharing) {
      return;
    }

    setIsSharing(false);
    setNextSendAt(null);

    if (watchIdRef.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    await releaseWakeLock();

    const lastPosition = lastPositionRef.current;
    if (lastPosition) {
      await uploadSnapshot(
        {
          ...lastPosition,
          clientTs: new Date().toISOString(),
        },
        "stop"
      );
    } else {
      setUploadStatus("error");
      setLastError("No last GPS point is available for the stop ping.");
    }
  }, [isSharing, releaseWakeLock, uploadSnapshot]);

  const handleModeToggle = useCallback((nextMode: TrackerMode) => {
    const resolvedMode = modeRef.current === nextMode ? "active" : nextMode;

    modeRef.current = resolvedMode;
    setMode(resolvedMode);

    if (sharingRef.current) {
      setNow(Date.now());
      setNextSendAt(Date.now() + intervalForMode(resolvedMode));
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

  const isBusy = isStarting || uploadStatus === "capturing" || uploadStatus === "uploading";
  const nextSendLabel = isSharing && nextSendAt ? formatCountdown(nextSendAt - now) : "Paused";
  const wakeLockTone: StatusTone =
    wakeLockStatus === "active" ? "good" : wakeLockStatus === "error" ? "danger" : "warn";
  const permissionTone: StatusTone =
    permission === "granted"
      ? "good"
      : permission === "denied" || permission === "unsupported"
        ? "danger"
        : "neutral";

  const statusItems = useMemo(
    () => [
      { label: "Permission", value: permissionLabels[permission], tone: permissionTone },
      { label: "Mode", value: modeLabels[mode], tone: mode === "active" ? "good" : "warn" },
      { label: "Next send", value: nextSendLabel, tone: isSharing ? "good" : "neutral" },
      { label: "Last sent", value: formatClock(lastSentAt), tone: lastSentAt ? "good" : "neutral" },
      {
        label: "Accuracy",
        value: lastAccuracy === null ? "None" : `±${Math.round(lastAccuracy)}m`,
        tone: lastAccuracy === null ? "neutral" : "good",
      },
      { label: "Upload", value: uploadLabels[uploadStatus], tone: statusTone(uploadStatus) },
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

      <div className={styles.controls} aria-label="Live location controls">
        <button
          className={styles.primaryAction}
          type="button"
          onClick={() => void handleStart()}
          disabled={isSharing || isBusy || permission === "unsupported"}
        >
          {isStarting ? "Starting..." : "Start sharing"}
        </button>
        <button
          className={styles.stopAction}
          type="button"
          onClick={() => void handleStop()}
          disabled={!isSharing}
        >
          Stop sharing
        </button>
        <button
          className={styles.secondaryAction}
          type="button"
          onClick={() => void handleManualPing()}
          disabled={!isSharing || isBusy}
        >
          Manual ping
        </button>
        <button
          className={cx(styles.modeAction, mode === "saver" && styles.modeActionOn)}
          type="button"
          aria-pressed={mode === "saver"}
          onClick={() => handleModeToggle("saver")}
        >
          Battery saver
        </button>
        <button
          className={cx(styles.modeAction, mode === "rest" && styles.modeActionOn)}
          type="button"
          aria-pressed={mode === "rest"}
          onClick={() => handleModeToggle("rest")}
        >
          Rest mode
        </button>
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
          <p>Tokened viewer access is connected in later phases; this keeps the copy surface ready.</p>
        </div>
        <button className={styles.copyButton} type="button" onClick={() => void handleCopyViewerLink()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {permission === "denied" ? (
        <div className={styles.warning} role="alert">
          <strong>Location permission is denied.</strong>
          <p>Open this site in browser settings, allow Location, return here, then retry.</p>
          <button className={styles.retryButton} type="button" onClick={handleRetry}>
            Retry permission
          </button>
        </div>
      ) : null}

      {permission === "unsupported" ? (
        <div className={styles.warning} role="alert">
          <strong>This browser does not expose GPS.</strong>
          <p>Use a mobile browser that supports navigator.geolocation.</p>
        </div>
      ) : null}

      {isHidden || (isSharing && wakeLockStatus !== "active") ? (
        <div className={styles.warning}>
          <strong>Keep the phone awake when possible.</strong>
          <p>Hidden tabs, locked screens, and missing wake-lock support can pause scheduled GPS sends.</p>
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
