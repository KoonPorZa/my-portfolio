import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";

const HealthResponseSchema = Type.Object({
  status: Type.Literal("ok"),
  service: Type.String(),
});

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/health",
    {
      config: {
        rateLimit: false,
      },
      schema: {
        response: {
          200: HealthResponseSchema,
        },
      },
    },
    async () => {
      return {
        status: "ok",
        service: "trip-gps-api",
      };
    }
  );
}
