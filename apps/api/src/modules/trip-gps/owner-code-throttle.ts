// Phase 14 — owner-code brute-force guard.
//
// The owner code is short (a few digits), so `session/start` is the one route an
// attacker can realistically brute-force. Per-route rate limits slow that down
// but don't stop a patient attacker within the code space. This adds a per-IP
// failed-attempt counter with a temporary lock: after `maxAttempts` wrong codes
// from one client IP, that IP is locked for `lockMs` and every `session/start`
// answers with a generic 401 (no oracle — the caller can't tell "wrong code"
// from "locked"). A correct code clears the counter.
//
// State is in-memory and per-instance. That's sufficient for a single Railway
// replica; it is defense-in-depth on top of the network/edge layer (Phase 10),
// not a substitute for it. If the API is ever scaled to multiple replicas, move
// this to a shared store.

export type OwnerCodeThrottleOptions = {
  maxAttempts: number;
  lockMs: number;
  now?: () => number;
  // How often (in recorded events) to sweep expired entries so the map can't
  // grow unbounded under a spray of unique IPs.
  sweepEvery?: number;
};

type Attempt = {
  fails: number;
  lockedUntil: number;
};

export class OwnerCodeThrottle {
  private readonly attempts = new Map<string, Attempt>();
  private readonly maxAttempts: number;
  private readonly lockMs: number;
  private readonly now: () => number;
  private readonly sweepEvery: number;
  private sinceSweep = 0;

  constructor(options: OwnerCodeThrottleOptions) {
    this.maxAttempts = Math.max(1, options.maxAttempts);
    this.lockMs = Math.max(0, options.lockMs);
    this.now = options.now ?? (() => Date.now());
    this.sweepEvery = Math.max(1, options.sweepEvery ?? 512);
  }

  /** True while the IP is locked out. */
  isLocked(ip: string): boolean {
    const entry = this.attempts.get(ip);

    if (!entry) {
      return false;
    }

    if (entry.lockedUntil > this.now()) {
      return true;
    }

    // Only reset once a real lock has ELAPSED (lockedUntil was set and is now in
    // the past). An entry that is merely accumulating failures (lockedUntil === 0)
    // must be kept, or its counter would be wiped on every check and never lock.
    if (entry.lockedUntil > 0) {
      this.attempts.delete(ip);
    }

    return false;
  }

  /** Record a wrong owner code; locks the IP once the attempt cap is reached. */
  recordFailure(ip: string): void {
    this.maybeSweep();

    const now = this.now();
    const entry = this.attempts.get(ip) ?? { fails: 0, lockedUntil: 0 };
    entry.fails += 1;

    if (entry.fails >= this.maxAttempts) {
      entry.lockedUntil = now + this.lockMs;
      entry.fails = 0;
    }

    this.attempts.set(ip, entry);
  }

  /** Clear all failed attempts for an IP after a correct code. */
  recordSuccess(ip: string): void {
    this.attempts.delete(ip);
  }

  private maybeSweep(): void {
    this.sinceSweep += 1;

    if (this.sinceSweep < this.sweepEvery) {
      return;
    }

    this.sinceSweep = 0;
    const now = this.now();

    for (const [ip, entry] of this.attempts) {
      if (entry.lockedUntil <= now && entry.fails === 0) {
        this.attempts.delete(ip);
      }
    }
  }
}
