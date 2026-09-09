import type { SessionUser } from '@memory/contracts/auth';
import { and, count, eq, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { users } from './schema.js';

export type { SessionUser } from '@memory/contracts/auth';

export type CreateUserInput = {
  email: string;
  displayName: string;
  passwordHash: string;
};

export type UserCredentials = SessionUser & {
  passwordHash: string;
};

export type UserRepository = {
  create(input: CreateUserInput): Promise<SessionUser>;
  findCredentialsByEmail(email: string): Promise<UserCredentials | null>;
  findById(id: string): Promise<SessionUser | null>;
  countActive(): Promise<number>;
};

export class UserLimitError extends Error {
  readonly code = 'USER_LIMIT';

  constructor() {
    super('This installation already has two active users.');
    this.name = 'UserLimitError';
  }
}

const publicUserColumns = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createUserRepository(db: Database): UserRepository {
  return {
    async create(input) {
      return db.transaction(async (transaction) => {
        await transaction.execute(sql`select pg_advisory_xact_lock(20260901)`);

        const [activeUsers] = await transaction
          .select({ value: count() })
          .from(users)
          .where(eq(users.active, true));

        if (Number(activeUsers?.value ?? 0) >= 2) {
          throw new UserLimitError();
        }

        const [created] = await transaction
          .insert(users)
          .values({
            email: normalizeEmail(input.email),
            displayName: input.displayName,
            passwordHash: input.passwordHash,
          })
          .returning(publicUserColumns);

        if (!created) {
          throw new Error('Failed to create user');
        }

        return created;
      });
    },

    async findCredentialsByEmail(email) {
      const [credentials] = await db
        .select({
          ...publicUserColumns,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(and(eq(users.email, normalizeEmail(email)), eq(users.active, true)))
        .limit(1);

      return credentials ?? null;
    },

    async findById(id) {
      const [user] = await db
        .select(publicUserColumns)
        .from(users)
        .where(and(eq(users.id, id), eq(users.active, true)))
        .limit(1);

      return user ?? null;
    },

    async countActive() {
      const [activeUsers] = await db
        .select({ value: count() })
        .from(users)
        .where(eq(users.active, true));

      return Number(activeUsers?.value ?? 0);
    },
  };
}
