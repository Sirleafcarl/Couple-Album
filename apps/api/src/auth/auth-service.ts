import type { LoginInput, SessionUser } from '@memory/contracts/auth';
import type { SessionRepository, UserRepository } from '@memory/db';
import { createHash, randomBytes } from 'node:crypto';
import { verifyPassword } from './password.js';

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type AuthService = {
  login(input: LoginInput): Promise<{ user: SessionUser; token: string } | null>;
  findSession(token: string): Promise<SessionUser | null>;
  logout(token: string): Promise<void>;
};

export function createAuthService(dependencies: {
  users: UserRepository;
  sessions: SessionRepository;
  clock: () => Date;
}): AuthService {
  return {
    async login(input) {
      const credentials = await dependencies.users.findCredentialsByEmail(input.email);
      if (!credentials || !(await verifyPassword(credentials.passwordHash, input.password))) {
        return null;
      }

      const token = newSessionToken();
      await dependencies.sessions.create({
        userId: credentials.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(dependencies.clock().getTime() + SESSION_TTL_MS),
      });

      const user: SessionUser = {
        id: credentials.id,
        email: credentials.email,
        displayName: credentials.displayName,
      };
      return { user, token };
    },

    findSession(token) {
      return dependencies.sessions.findActiveByTokenHash(
        hashSessionToken(token),
        dependencies.clock(),
      );
    },

    async logout(token) {
      await dependencies.sessions.deleteByTokenHash(hashSessionToken(token));
    },
  };
}
