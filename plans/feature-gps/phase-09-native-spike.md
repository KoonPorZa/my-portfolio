# Phase 9 — Native tracker spike (Future)

**Priority:** Future · **Branch:** `feat/gps` (or a dedicated spike branch) · **Depends on:** MVP results
**Read first:** `phase-00-overview.md`

## Goal
Only do this if the Web MVP proves insufficient — i.e. you genuinely need reliable location
updates while the phone screen is locked all day (a browser limitation, not a bug to fix).

## Gate (do not start unless true)
- Real-device testing of Phases 2–8 showed background/locked-screen updates are a blocker for the actual trip.

## Tasks
1. Evaluate a Capacitor or React Native companion app whose only job is the tracker.
2. Reuse the **existing** ingest/viewer API and tokens — the web viewer stays unchanged.
3. Add OS background-location permission + a foreground notification/indicator per platform policy.
4. Note any app-store, permission, or commercial-SDK cost/time implications before committing.

## Acceptance criteria
- [ ] A spike doc (or small PoC) showing locked-screen updates posting to the same API.
- [ ] Clear go/no-go recommendation with cost and policy notes.

## Out of scope
- Shipping a polished native app (separate project if the spike succeeds).
