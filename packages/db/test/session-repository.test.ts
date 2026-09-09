import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/client.js';
import { createSessionRepository } from '../src/session-repository.js';
import { albumYearSettings, albums, sessions, users } from '../src/schema.js';
import { createUserRepository } from '../src/user-repository.js';

const database = createDatabase(
  process.env.TEST_DATABASE_URL ?? 'postgres://memory:memory@localhost:38427/memory_test',
);
const userRepository = createUserRepository(database.db);
const sessionRepository = createSessionRepository(database.db);

beforeEach(async () => {
  await database.db.delete(sessions);
  await database.db.delete(albumYearSettings);
  await database.db.delete(albums);
  await database.db.delete(users);
});

afterAll(async () => {
  await database.close();
});

async function createUser() {
  return userRepository.create({
    email: 'first@example.com',
    displayName: 'First',
    passwordHash: 'hash-1',
  });
}

describe('session repository', () => {
  it('returns the user for a valid token hash', async () => {
    const user = await createUser();
    await sessionRepository.create({
      userId: user.id,
      tokenHash: 'valid-token-hash',
      expiresAt: new Date('2026-10-01T00:00:00Z'),
    });

    await expect(
      sessionRepository.findActiveByTokenHash(
        'valid-token-hash',
        new Date('2026-09-01T00:00:00Z'),
      ),
    ).resolves.toEqual(user);
  });

  it('does not return expired sessions and can delete them', async () => {
    const user = await createUser();
    await sessionRepository.create({
      userId: user.id,
      tokenHash: 'expired-token-hash',
      expiresAt: new Date('2026-08-01T00:00:00Z'),
    });

    const now = new Date('2026-09-01T00:00:00Z');
    await expect(
      sessionRepository.findActiveByTokenHash('expired-token-hash', now),
    ).resolves.toBeNull();
    await expect(sessionRepository.deleteExpired(now)).resolves.toBe(1);
  });

  it('prevents lookup after a token is deleted', async () => {
    const user = await createUser();
    await sessionRepository.create({
      userId: user.id,
      tokenHash: 'logout-token-hash',
      expiresAt: new Date('2026-10-01T00:00:00Z'),
    });

    await sessionRepository.deleteByTokenHash('logout-token-hash');

    await expect(
      sessionRepository.findActiveByTokenHash(
        'logout-token-hash',
        new Date('2026-09-01T00:00:00Z'),
      ),
    ).resolves.toBeNull();
  });
});
