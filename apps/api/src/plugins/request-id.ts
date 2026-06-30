import type { FastifyInstance } from "fastify";

export function registerRequestId(fastify: FastifyInstance): void {
  fastify.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", String(request.id));
  });
}
