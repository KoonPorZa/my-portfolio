import { MAX_BAD_ACCURACY_M } from "./cadence";
import type { UploadReason } from "./types";

const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;
const EARTH_RADIUS_M = 6_371_000;
const DEGREES_TO_RADIANS = Math.PI / 180;

export type CoordinatePoint = {
  lat: number;
  lng: number;
};

export type RawCoords = CoordinatePoint & {
  accuracyM?: number | null;
  clientTs: string;
};

export type SanitizedCoords = CoordinatePoint & {
  accuracyM: number | null;
  clientTs: string;
};

export function sanitizeCoords(point: RawCoords): SanitizedCoords | null {
  if (!isFiniteNumber(point.lat) || point.lat < MIN_LAT || point.lat > MAX_LAT) {
    return null;
  }

  if (!isFiniteNumber(point.lng) || point.lng < MIN_LNG || point.lng > MAX_LNG) {
    return null;
  }

  const accuracyM = point.accuracyM ?? null;
  if (accuracyM !== null && (!isFiniteNumber(accuracyM) || accuracyM < 0)) {
    return null;
  }

  if (!isValidIsoDate(point.clientTs)) {
    return null;
  }

  return {
    lat: point.lat,
    lng: point.lng,
    accuracyM,
    clientTs: point.clientTs,
  };
}

export function isAcceptableAccuracy(
  accuracyM: number | null | undefined,
  reason: UploadReason
): boolean {
  if (accuracyM === null || accuracyM === undefined) {
    return reason === "stop";
  }

  return isFiniteNumber(accuracyM) && accuracyM >= 0 && accuracyM <= MAX_BAD_ACCURACY_M;
}

export function haversineMeters(a: CoordinatePoint, b: CoordinatePoint): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function isValidIsoDate(value: string): boolean {
  if (!value.trim()) {
    return false;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp);
}

function toRadians(degrees: number): number {
  return degrees * DEGREES_TO_RADIANS;
}
