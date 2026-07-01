# Phase 7 — Token lifecycle & security

**Priority:** P1 · **Branch:** `feat/gps` · **Depends on:** Phase 11
**Read first:** `phase-00-overview.md` (security model, guardrails)

## Goal
Make sharing safe: only people with a link can view, the rider can stop instantly, and—since
`/trip/001` is now a public page—live location is gated **only** by server-side tokens and a
server-side owner code (the removed client-side password is never the boundary).

## Files
- **create** `apps/api/src/modules/trip-gps/trip-gps.tokens.ts` (generate/hash/verify)
- **create/extend** Fastify session routes in `apps/api/src/modules/trip-gps/trip-gps.routes.ts` (create / stop / revoke)
- **modify** the tracker panel (Phase 2) to start a session via a server-side live-share code

## Tasks
1. Tokens via Node `crypto`: random token returned to the user once; store only the **SHA-256 hash** server-side. Separate **owner token** (upload only) and **viewer token** (read only).
2. Session fields: `expires_at`, `revoked_at`, `stopped_at`, plus a default TTL (auto-close after ~24h or on arrival).
3. **Owner start auth (the page is public — this is the only owner boundary):** the owner enters a dedicated server-side live-share code to create a session and receive the owner token. Verify the code server-side (compare against a hashed env value); never derive owner identity from page access or any client-side secret. The removed client-side password must not be reused.
4. Stop sharing must `revoke`/mark the session inactive so viewers move to the `stopped` state.
5. Enforce in the API: owner token cannot use the viewer GET (if policies are split); viewer token cannot POST; expired/revoked tokens are rejected.

## Acceptance criteria
- [ ] Tokens stored as hashes, never plaintext; owner/viewer scopes enforced server-side.
- [ ] Stop sharing → viewer sees `stopped`; expired/revoked tokens rejected.
- [ ] The old client-side password is not used as the live-location security boundary anywhere.
- [ ] `lint` + `build` pass; include a token-policy pass/fail matrix in the PR notes.

## Out of scope
- Full user login / Supabase Auth (future), passkeys.
