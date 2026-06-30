import type { RateLimitPluginOptions } from "@fastify/rate-limit";

export const rateLimitOptions: RateLimitPluginOptions = {
  global: false,
  max: 60,
  timeWindow: "1 minute",
  errorResponseBuilder() {
    return {
      statusCode: 429,
      error: "rate_limited",
      message: "Too many requests.",
    };
  },
};
