import type { RateLimitPluginOptions } from "@fastify/rate-limit";

import type { ServerEnv } from "../config/env";

// Baseline limit for any route that doesn't opt into a per-route override.
// `global: false` keeps it opt-in; each route sets its own group in the routes
// file. A generic 429 body avoids leaking which limit was hit.
export function buildRateLimitOptions(env: ServerEnv): RateLimitPluginOptions {
  return {
    global: false,
    max: env.rateLimitViewerMax,
    timeWindow: env.rateLimitWindow,
    // Send `Retry-After` (plus the standard x-ratelimit-* headers) so clients
    // back off instead of hammering; the body stays generic.
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true,
    },
    errorResponseBuilder() {
      return {
        statusCode: 429,
        error: "rate_limited",
        message: "Too many requests.",
      };
    },
  };
}

// Back-compat default (used if buildRateLimitOptions isn't wired). Prefer the
// env-driven builder above.
export const rateLimitOptions: RateLimitPluginOptions = {
  global: false,
  max: 60,
  timeWindow: "1 minute",
  addHeaders: {
    "x-ratelimit-limit": true,
    "x-ratelimit-remaining": true,
    "x-ratelimit-reset": true,
    "retry-after": true,
  },
  errorResponseBuilder() {
    return {
      statusCode: 429,
      error: "rate_limited",
      message: "Too many requests.",
    };
  },
};
