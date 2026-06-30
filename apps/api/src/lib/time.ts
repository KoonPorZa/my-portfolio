export function nowIso(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString();
}

export function isExpiredIso(value: string, nowMs = Date.now()): boolean {
  const timestamp = Date.parse(value);

  return !Number.isFinite(timestamp) || nowMs >= timestamp;
}
