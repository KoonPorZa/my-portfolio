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
  active: `ปกติ · ${formatCadence(intervalForMode("active"))}`,
  city: `เข้าเมือง · ${formatCadence(intervalForMode("city"))}`,
  saver: `ประหยัดแบต · ${formatCadence(intervalForMode("saver"))}`,
  rest: `พัก · ${formatCadence(intervalForMode("rest"))}`,
};

const modeShortcutLabels: Record<TrackerMode, string> = {
  active: "ปกติ",
  city: "เข้าเมือง",
  saver: "ประหยัดแบต",
  rest: "พัก",
};

const modeShortcuts: Array<{ mode: TrackerMode; label: string }> = TRACKER_MODES.map(
  (trackerMode) => ({
    mode: trackerMode,
    label: modeShortcutLabels[trackerMode],
  })
);

const permissionLabels: Record<PermissionStatus, string> = {
  "not-requested": "ยังไม่ขอสิทธิ์",
  granted: "อนุญาต",
  denied: "ถูกปฏิเสธ",
  unsupported: "ไม่รองรับ",
};

const uploadLabels: Record<UploadStatus, string> = {
  idle: "—",
  capturing: "กำลังอ่าน GPS",
  uploading: "กำลังอัปโหลด",
  sent: "ส่งแล้ว",
  queued: "รอส่ง",
  rejected: "ถูกปฏิเสธ",
  error: "ผิดพลาด",
};

const wakeLockLabels: Record<WakeLockStatus, string> = {
  off: "ปิด",
  requesting: "ขอแล้ว",
  active: "เปิด",
  released: "ปล่อยแล้ว",
  unsupported: "ไม่รองรับ",
  error: "ใช้ไม่ได้",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function readCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("เบราว์เซอร์นี้ไม่รองรับระบบตำแหน่ง"));
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
    return "ตอนนี้";
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
    return "—";
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
      return "ปิดสิทธิ์ตำแหน่งอยู่ เปิดสิทธิ์ตำแหน่งให้เว็บนี้ในการตั้งค่าเบราว์เซอร์ แล้วลองใหม่";
    }

    if (error.code === GEO_POSITION_UNAVAILABLE) {
      return "อ่านตำแหน่งไม่ได้ ตรวจบริการตำแหน่งและขยับไปจุดที่สัญญาณชัดขึ้น";
    }

    if (error.code === GEO_TIMEOUT) {
      return "GPS ตอบช้าเกินไป ลองใหม่ตอนปลดล็อกหน้าจออยู่";
    }
  }

  return error instanceof Error ? error.message : "จับตำแหน่ง GPS ไม่สำเร็จ";
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
    throw new Error(apiErrorMessage(body, response.status, "สร้างเซสชัน GPS ไม่สำเร็จ"));
  }

  if (!isCreateSessionResponse(body)) {
    throw new Error("ข้อมูลเซสชัน GPS จากเซิร์ฟเวอร์ไม่ถูกต้อง");
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
    throw new Error(apiErrorMessage(body, response.status, "หยุดเซสชัน GPS ไม่สำเร็จ"));
  }

  if (!isStopSessionResponse(body)) {
    throw new Error("ข้อมูลหยุดเซสชัน GPS จากเซิร์ฟเวอร์ไม่ถูกต้อง");
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
    return `${body.message} สถานะ ${status}.`;
  }

  return `${fallback} สถานะ ${status}.`;
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
        setLastError("ยังไม่มีเซสชัน GPS ที่ใช้งานอยู่");
        return false;
      }

      const ownerToken = ownerTokenRef.current;

      if (!ownerToken) {
        setUploadStatus("error");
        setLastError("ยังไม่มีโทเคนเจ้าของ GPS ที่ใช้งานอยู่");
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
          `${result.message}${result.status ? ` สถานะ ${result.status}.` : ""}`
        );

        return true;
      } catch (error) {
        setUploadStatus("error");
        setConsecutiveUploadFailures((current) => current + 1);
        setLastError(error instanceof Error ? error.message : "อัปโหลด GPS ไม่สำเร็จ");
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
        setLastError("เบราว์เซอร์นี้ไม่รองรับระบบตำแหน่ง");
        return false;
      }

      setUploadStatus("capturing");

      try {
        const position = await readCurrentPosition();
        const snapshot = snapshotFromPosition(position);

        if (!snapshot) {
          setUploadStatus("error");
          setLastError("GPS ส่งพิกัดไม่ถูกต้อง");
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
      setLastError("ใส่โค้ดแชร์สดก่อนเริ่ม");
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
      setLastError(error instanceof Error ? error.message : "เริ่มแชร์ GPS สดไม่สำเร็จ");
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
      setLastError("ไม่มีเซสชัน GPS ที่ใช้งานอยู่สำหรับส่งจุดหยุด");
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
      setLastError(error instanceof Error ? error.message : "หยุดแชร์ GPS สดไม่สำเร็จ");
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
      setLastError("คัดลอกลิงก์ผู้ชมในเบราว์เซอร์นี้ไม่สำเร็จ");
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
  const nextSendLabel = isSharing && nextSendAt ? formatCountdown(nextSendAt - now) : "หยุดชั่วคราว";
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
      { label: "สิทธิ์ตำแหน่ง", value: permissionLabels[permission], tone: permissionTone },
      {
        label: "โหมด",
        value: modeLabels[mode],
        tone: mode === "active" || mode === "city" ? "good" : "warn",
      },
      { label: "ส่งถัดไป", value: nextSendLabel, tone: isSharing ? "good" : "neutral" },
      { label: "ส่งล่าสุด", value: formatClock(lastSentAt), tone: lastSentAt ? "good" : "neutral" },
      {
        label: "ความแม่นยำ",
        value: lastAccuracy === null ? "—" : `±${Math.round(lastAccuracy)}m`,
        tone: lastAccuracy === null ? "neutral" : hasPoorAccuracy ? "warn" : "good",
      },
      { label: "อัปโหลด", value: uploadLabels[uploadStatus], tone: statusTone(uploadStatus) },
      {
        label: "หมดอายุ",
        value: sessionExpiresAt ? formatClock(sessionExpiresAt) : "ยังไม่มีเซสชัน",
        tone: sessionExpiresAt ? "warn" : "neutral",
      },
      { label: "กันจอดับ", value: wakeLockLabels[wakeLockStatus], tone: wakeLockTone },
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
          <p className={styles.eyebrow}>ตำแหน่งสด</p>
          <h2 id="live-tracker-title">แผงแชร์ GPS</h2>
        </div>
        <span className={cx(styles.liveBadge, isSharing ? styles.liveBadgeOn : styles.liveBadgeOff)}>
          {isSharing ? "สด" : "ปิด"}
        </span>
      </div>

      <p className={styles.lead}>
        เริ่มส่งจากปุ่มนี้เท่านั้น ก่อนกดเริ่มแชร์ ระบบจะไม่อ่าน GPS และไม่อัปโหลดอะไร
      </p>

      <div className={styles.preflight} aria-label="เช็กลิสต์ก่อนเริ่ม">
        <span className={styles.preflightTag}>ก่อนเริ่ม</span>
        <ul>
          <li>เปิด GPS / บริการตำแหน่งในมือถือ</li>
          <li className={secureContext === false ? styles.alertItem : undefined}>เปิดหน้านี้ผ่าน HTTPS</li>
          <li>พกพาวเวอร์แบงก์และสายชาร์จ</li>
          <li>ถ้าหน้าจอล็อกหรือซ่อนแท็บ เบราว์เซอร์อาจหยุดส่งชั่วคราว</li>
        </ul>
      </div>

      <label className={styles.codeBox} htmlFor="trip-gps-owner-code">
        <span className={styles.viewerLabel}>โค้ดแชร์สด</span>
        <input
          id="trip-gps-owner-code"
          name="trip-gps-owner-code"
          type="password"
          value={ownerCode}
          autoComplete="off"
          inputMode="text"
          placeholder="โค้ดเจ้าของจากเซิร์ฟเวอร์"
          disabled={isSharing || isBusy}
          onChange={(event) => setOwnerCode(event.target.value)}
        />
        <span>ต้องใส่ก่อนเริ่ม เพราะหน้าทริปนี้เป็นสาธารณะ</span>
      </label>

      <div className={styles.controls} aria-label="ปุ่มควบคุมตำแหน่งสด">
        <button
          className={styles.primaryAction}
          type="button"
          onClick={() => void handleStart()}
          disabled={isSharing || isBusy || permission === "unsupported" || !canStart}
        >
          {isStarting ? "กำลังเริ่ม..." : "เริ่มแชร์"}
        </button>
        <button
          className={styles.stopAction}
          type="button"
          onClick={() => void handleStop()}
          disabled={!isSharing || isStopping}
        >
          {isStopping ? "กำลังหยุด..." : "หยุดแชร์"}
        </button>
        <button
          className={styles.secondaryAction}
          type="button"
          onClick={() => void handleManualPing()}
          disabled={!isSharing || isBusy}
        >
          ส่งจุดเอง
        </button>
      </div>

      <div className={styles.modeShortcuts} aria-label="ทางลัดรอบส่ง GPS">
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
          <span className={styles.viewerLabel}>ลิงก์ผู้ชม</span>
          <code>{viewerLink}</code>
          <p>{hasTokenedViewerLink ? "ส่งลิงก์นี้ให้ผู้ชม" : "เริ่มเซสชันเพื่อออกโทเคนผู้ชม"}</p>
        </div>
        <button
          className={styles.copyButton}
          type="button"
          onClick={() => void handleCopyViewerLink()}
          disabled={!hasTokenedViewerLink}
        >
          {copied ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
      </div>

      {permission === "denied" ? (
        <div className={styles.warning} role="alert">
          <strong>ปิดสิทธิ์ตำแหน่งอยู่</strong>
          <p>เปิดสิทธิ์ตำแหน่งให้เว็บนี้ในการตั้งค่าเบราว์เซอร์ แล้วลองใหม่ ผู้ชมยังเห็นตำแหน่งล่าสุดที่ส่งสำเร็จอยู่</p>
          <button className={styles.retryButton} type="button" onClick={handleRetry}>
            ลองขอสิทธิ์อีกครั้ง
          </button>
        </div>
      ) : null}

      {permission === "unsupported" ? (
        <div className={styles.warning} role="alert">
          <strong>เบราว์เซอร์นี้ไม่รองรับ GPS</strong>
          <p>ใช้เบราว์เซอร์มือถือที่รองรับระบบตำแหน่ง ผู้ชมยังเห็นตำแหน่งล่าสุดที่ส่งสำเร็จอยู่</p>
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
