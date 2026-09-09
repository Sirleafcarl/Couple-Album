import type { SessionRepository } from '@memory/db';
import type { preHandlerHookHandler } from 'fastify';
import { hashSessionToken } from './auth-service.js';
import { SESSION_COOKIE } from './auth-routes.js';

export function createRequireUser(
  sessions: SessionRepository,
  clock: () => Date,
): preHandlerHookHandler {
  return async (request, reply) => {
    request.user = null;
    const token = request.cookies[SESSION_COOKIE];
    if (!token) {
      return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    }

    const user = await sessions.findActiveByTokenHash(hashSessionToken(token), clock());
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    }

    request.user = user;
  };
}
