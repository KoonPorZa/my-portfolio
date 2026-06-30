# Phase 8 — Reliability for the real trip

**Priority:** P2 · **Branch:** `feat/gps` · **Depends on:** Phase 2, Phase 11, Phase 6
**Read first:** `phase-00-overview.md` (cadence, guardrails)

## Goal
Harden the MVP for a long ride where the network drops, the screen locks, or accuracy degrades.

## Files
- **modify** `lib/trip-gps/client.ts` (real offline queue), `app/trip/001/live-tracker.tsx` (warnings, mode shortcuts), Fastify backend audit fields

## Tasks
1. **Offline queue:** buffer the last 1–3 points in memory/`localStorage` when offline; flush on reconnect (`online` event). Replace the Phase-3 skeleton.
2. **Warnings:** surface when the page is hidden, permission is denied, accuracy is poor ("ตำแหน่งคร่าว ๆ"), or uploads fail repeatedly (and reassure that the viewer still sees last-known).
3. **Mode shortcuts:** quick toggle Active / Saver / Rest / City-approach (2–3m near the city / key waypoints).
4. **Light audit:** record last viewer access, upload count, last error (no heavy tracking).

## Acceptance criteria
- [ ] Turning the network off then on flushes queued points; no duplicate `seq`.
- [ ] Hidden-page / permission-denied / poor-accuracy / repeated-upload-fail each show a clear message.
- [ ] Mode shortcuts change cadence live.
- [ ] `lint` + `build` pass; document any real-device validation gap.

## Out of scope
- Native background tracking (Phase 9).
