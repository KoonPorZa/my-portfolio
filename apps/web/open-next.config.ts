import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default OpenNext config: no incremental cache / queue / tag cache backends.
// The web app holds no server state of its own — the GPS API lives in the
// standalone Fastify service (apps/api), reached via NEXT_PUBLIC_TRIP_GPS_API_BASE.
// To add ISR/use-cache backends later, wire R2/KV here. See:
// https://opennext.js.org/cloudflare/caching
export default defineCloudflareConfig();
