import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function registerOriginGuard(app: FastifyInstance, config: AppConfig): void {
  const expectedOrigin = new URL(config.appOrigin).origin;

  app.addHook('onRequest', async (request, reply) => {
    if (!MUTATION_METHODS.has(request.method)) return;

    const origin = request.headers.origin;
    if (origin && origin !== expectedOrigin) {
      return reply.code(403).send({ error: 'INVALID_ORIGIN' });
    }
  });
}
