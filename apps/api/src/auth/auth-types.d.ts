import type { SessionUser } from '@memory/contracts/auth';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}
