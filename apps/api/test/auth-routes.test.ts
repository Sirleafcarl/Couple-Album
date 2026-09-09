import type { SessionUser } from '@memory/contracts/auth';
import type {
  CreateSessionInput,
  SessionRepository,
  UserCredentials,
  UserRepository,
} from '@memory/db';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type AppDependencies } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import type { AppConfig } from '../src/config.js';
import type { PhotoUploadService } from '../src/photos/photo-upload-service.js';
import { createUnusedDependencies } from './test-dependencies.js';

const now = new Date('2026-09-02T00:00:00Z');
const user: SessionUser = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'alice@example.com',
  displayName: 'Alice',
};
const config: AppConfig = {
  databaseUrl: 'postgres://unused',
  apiHost: '127.0.0.1',
  apiPort: 23001,
  appOrigin: 'http://localhost:5173',
  sessionCookieSecure: false,
  dataRoot: './data-test',
  maxUploadBytes: 104_857_600,
  minFreeBytes: 1_073_741_824,
  imageWorkerConcurrency: 1,
  imageWorkerPollMs: 1_000,
  staleJobMs: 900_000,
  stagingTtlMs: 86_400_000,
};

let passwordHash = '';

beforeAll(async () => {
  passwordHash = await hashPassword('correct-password');
});

function createFakeRepositories(): Omit<AppDependencies, 'config' | 'clock'> & {
  storedSessions: Map<string, CreateSessionInput>;
} {
  const credentials: UserCredentials = { ...user, passwordHash };
  const storedSessions = new Map<string, CreateSessionInput>();

  const { config: _config, ...unused } = createUnusedDependencies();
  return {
    ...unused,
    users: {
      async create() {
        throw new Error('not used');
      },
      async findCredentialsByEmail(email) {
        return email.trim().toLowerCase() === user.email ? credentials : null;
      },
      async findById(id) {
        return id === user.id ? user : null;
      },
      async countActive() {
        return 1;
      },
    },
    sessions: {
      async create(input) {
        storedSessions.set(input.tokenHash, input);
      },
      async findActiveByTokenHash(tokenHash, currentTime) {
        const session = storedSessions.get(tokenHash);
        return session && session.expiresAt > currentTime ? user : null;
      },
      async deleteByTokenHash(tokenHash) {
        storedSessions.delete(tokenHash);
      },
      async deleteExpired(currentTime) {
        let deleted = 0;
        for (const [tokenHash, session] of storedSessions) {
          if (session.expiresAt < currentTime) {
            storedSessions.delete(tokenHash);
            deleted += 1;
          }
        }
        return deleted;
      },
    },
    photoUploads: {
      async upload() {
        throw new Error('not used');
      },
    },
    storedSessions,
  };
}

function cookieHeader(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!header) throw new Error('Expected a Set-Cookie header');
  return header.split(';')[0] ?? '';
}

describe('authentication routes', () => {
  it('sets an HttpOnly cookie for valid credentials and stores only its hash', async () => {
    const repositories = createFakeRepositories();
    const app = buildApp({ config, ...repositories, clock: () => now });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ' ALICE@example.com ', password: 'correct-password' },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user });
    expect(response.headers['set-cookie']).toContain('memory_session=');
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('SameSite=Lax');
    expect(repositories.storedSessions).toHaveLength(1);
    const rawToken = cookieHeader(response.headers['set-cookie']).split('=')[1];
    expect([...repositories.storedSessions.keys()]).not.toContain(rawToken);
  });

  it('returns the same generic 401 response for unknown email and wrong password', async () => {
    for (const payload of [
      { email: 'unknown@example.com', password: 'correct-password' },
      { email: 'alice@example.com', password: 'wrong-password' },
    ]) {
      const repositories = createFakeRepositories();
      const app = buildApp({ config, ...repositories, clock: () => now });
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload,
      });
      await app.close();

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'INVALID_CREDENTIALS' });
    }
  });

  it('returns the current user for a valid cookie', async () => {
    const repositories = createFakeRepositories();
    const app = buildApp({ config, ...repositories, clock: () => now });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: 'correct-password' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: cookieHeader(login.headers['set-cookie']) },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user });
  });

  it('expires the cookie and deletes the server session on logout', async () => {
    const repositories = createFakeRepositories();
    const app = buildApp({ config, ...repositories, clock: () => now });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: 'correct-password' },
    });
    const cookie = cookieHeader(login.headers['set-cookie']);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie },
    });
    await app.close();

    expect(logout.statusCode).toBe(204);
    expect(logout.headers['set-cookie']).toContain('memory_session=;');
    expect(repositories.storedSessions).toHaveLength(0);
    expect(session.statusCode).toBe(401);
  });

  it('blocks the sixth failed login from the same IP inside 15 minutes', async () => {
    const repositories = createFakeRepositories();
    const app = buildApp({ config, ...repositories, clock: () => now });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'unknown@example.com', password: 'wrong-password' },
      });
      expect(response.statusCode).toBe(401);
    }

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: 'correct-password' },
    });
    await app.close();

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ error: 'TOO_MANY_ATTEMPTS' });
  });

  it('clears the IP failure counter after a successful login', async () => {
    const repositories = createFakeRepositories();
    const app = buildApp({ config, ...repositories, clock: () => now });

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'unknown@example.com', password: 'wrong-password' },
      });
    }
    const successful = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: 'correct-password' },
    });
    expect(successful.statusCode).toBe(200);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'unknown@example.com', password: 'wrong-password' },
      });
      expect(response.statusCode).toBe(401);
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'unknown@example.com', password: 'wrong-password' },
    });
    await app.close();

    expect(blocked.statusCode).toBe(429);
  });

  it('expires failed-login entries after 15 minutes', async () => {
    let currentTime = now;
    const repositories = createFakeRepositories();
    const app = buildApp({ config, ...repositories, clock: () => currentTime });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'unknown@example.com', password: 'wrong-password' },
      });
    }
    currentTime = new Date(now.getTime() + 15 * 60 * 1000 + 1);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'unknown@example.com', password: 'wrong-password' },
    });
    await app.close();

    expect(response.statusCode).toBe(401);
  });
});
