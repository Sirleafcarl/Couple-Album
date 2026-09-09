import cookie from '@fastify/cookie';
import type { SessionUser } from '@memory/contracts/auth';
import type { SessionRepository } from '@memory/db';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashSessionToken } from '../src/auth/auth-service.js';
import { createRequireUser } from '../src/auth/require-user.js';
import { createUnusedDependencies } from './test-dependencies.js';

const user: SessionUser = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'alice@example.com',
  displayName: 'Alice',
};
const now = new Date('2026-09-02T00:00:00Z');

function sessionRepository(findResult: SessionUser | null): SessionRepository {
  return {
    async create() {
      throw new Error('not used');
    },
    async findActiveByTokenHash() {
      return findResult;
    },
    async deleteByTokenHash() {
      return undefined;
    },
    async deleteExpired() {
      return 0;
    },
  };
}

describe('requireUser', () => {
  it('rejects a request without a session cookie with 401', async () => {
    const dependencies = createUnusedDependencies();
    const app = buildApp({ ...dependencies, sessions: sessionRepository(null) });

    const response = await app.inject({ method: 'GET', url: '/api/private/ping' });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'UNAUTHENTICATED' });
  });

  it('attaches SessionUser for a valid session cookie', async () => {
    const sessions: SessionRepository = {
      ...sessionRepository(user),
      async findActiveByTokenHash(tokenHash, currentTime) {
        expect(tokenHash).toBe(hashSessionToken('raw-session-token'));
        expect(currentTime).toEqual(now);
        return user;
      },
    };
    const app = Fastify();
    await app.register(cookie);
    app.decorateRequest('user', null);
    app.get('/whoami', { preHandler: createRequireUser(sessions, () => now) }, async (request) =>
      request.user,
    );

    const response = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { cookie: 'memory_session=raw-session-token' },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(user);
  });

  it('rejects a state-changing request from a different Origin with 403', async () => {
    const app = buildApp(createUnusedDependencies());

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: 'http://evil.example' },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'INVALID_ORIGIN' });
  });
});
