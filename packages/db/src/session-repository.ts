import type { SessionUser } from '@memory/contracts/auth';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { Database } from './client.js';
import { sessions, users } from './schema.js';

export type CreateSessionInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

export type SessionRepository = {
  create(input: CreateSessionInput): Promise<void>;
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<SessionUser | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  deleteExpired(now: Date): Promise<number>;
};

export function createSessionRepository(db: Database): SessionRepository {
  return {
    async create(input) {
      await db.insert(sessions).values(input);
    },

    async findActiveByTokenHash(tokenHash, now) {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(
          and(
            eq(sessions.tokenHash, tokenHash),
            gt(sessions.expiresAt, now),
            eq(users.active, true),
          ),
        )
        .limit(1);

      return user ?? null;
    },

    async deleteByTokenHash(tokenHash) {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },

    async deleteExpired(now) {
      const deleted = await db
        .delete(sessions)
        .where(lt(sessions.expiresAt, now))
        .returning({ id: sessions.id });

      return deleted.length;
    },
  };
}
