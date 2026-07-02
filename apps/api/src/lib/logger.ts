import type { FastifyServerOptions } from "fastify";

import type { ServerEnv } from "../config/env";

// The viewer token rides in the URL as `?t=<token>` on GET
// /api/trips/:tripId/location, and pino logs req.url — so without this the token
// leaks into logs. Mask the `t` query value while keeping the rest of the URL.
export function maskUrlToken(url: string | undefined): string | undefined {
  if (!url) {
    return url;
  }

  return url.replace(/([?&]t=)[^&#]*/gi, "$1[redacted]");
}

type LoggableRequest = {
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  ip?: string;
  socket?: { remoteAddress?: string; remotePort?: number };
};

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
    serializers: {
      req(request: LoggableRequest) {
        return {
          method: request.method,
          url: maskUrlToken(request.url),
          host:
            typeof request.headers?.host === "string"
              ? request.headers.host
              : undefined,
          remoteAddress: request.ip ?? request.socket?.remoteAddress,
          remotePort: request.socket?.remotePort,
        };
      },
    },
  };
}
