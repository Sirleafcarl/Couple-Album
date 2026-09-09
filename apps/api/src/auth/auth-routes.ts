import { LoginInputSchema } from '@memory/contracts/auth';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import { SESSION_TTL_MS, type AuthService } from './auth-service.js';
import type { LoginAttemptLimiter } from './login-attempt-limiter.js';

export const SESSION_COOKIE = 'memory_session';

function cookieOptions(config: AppConfig) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: config.sessionCookieSecure,
  };
}

export function registerAuthRoutes(
  app: FastifyInstance,
  dependencies: {
    config: AppConfig;
    auth: AuthService;
    clock: () => Date;
    loginAttempts: LoginAttemptLimiter;
  },
): void {
  app.post('/api/auth/login', async (request, reply) => {
    const now = dependencies.clock();
    if (dependencies.loginAttempts.isBlocked(request.ip, now)) {
      return reply.code(429).send({ error: 'TOO_MANY_ATTEMPTS' });
    }

    const parsed = LoginInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_REQUEST' });
    }

    const result = await dependencies.auth.login(parsed.data);
    if (!result) {
      dependencies.loginAttempts.recordFailure(request.ip, now);
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    }

    dependencies.loginAttempts.clear(request.ip);

    return reply
      .setCookie(SESSION_COOKIE, result.token, {
        ...cookieOptions(dependencies.config),
        maxAge: SESSION_TTL_MS / 1000,
      })
      .send({ user: result.user });
  });

  app.get('/api/auth/session', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) {
      return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    }

    const user = await dependencies.auth.findSession(token);
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    }

    return { user };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      await dependencies.auth.logout(token);
    }

    return reply
      .setCookie(SESSION_COOKIE, '', {
        ...cookieOptions(dependencies.config),
        expires: new Date(0),
        maxAge: 0,
      })
      .code(204)
      .send();
  });
}
