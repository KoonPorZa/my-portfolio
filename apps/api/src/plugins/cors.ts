import type { FastifyCorsOptions } from "@fastify/cors";

import type { ServerEnv } from "../config/env";

export function buildCorsOptions(env: ServerEnv): FastifyCorsOptions {
  const allowedOrigins = new Set(env.corsOrigins);

  return {
    credentials: false,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, allowedOrigins.has(origin));
    },
  };
}
