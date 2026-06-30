import type { FastifyServerOptions } from "fastify";

import type { ServerEnv } from "../config/env";

export function createLoggerOptions(env: ServerEnv): FastifyServerOptions["logger"] {
  if (env.nodeEnv === "test") {
    return false;
  }

  return {
    level: env.nodeEnv === "production" ? "info" : "debug",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers.set-cookie",
      ],
      censor: "[redacted]",
    },
  };
}
