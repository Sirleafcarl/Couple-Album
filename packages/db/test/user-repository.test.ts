import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase } from '../src/client.js';
import { albumYearSettings, albums, sessions, users } from '../src/schema.js';
import { createUserRepository } from '../src/user-repository.js';

const database = createDatabase(
  process.env.TEST_DATABASE_URL ?? 'postgres://memory:memory@localhost:38427/memory_test',
);
const repository = createUserRepository(database.db);

beforeEach(async () => {
  await database.db.delete(sessions);
  await database.db.delete(albumYearSettings);
  await database.db.delete(albums);
  await database.db.delete(users);
});

afterAll(async () => {
  await database.close();
});

describe('user repository', () => {
  it('normalizes email and enforces exactly two active users', async () => {
    await repository.create({
      email: ' FIRST@Example.com ',
      displayName: 'First',
      passwordHash: 'hash-1',
    });
    await repository.create({
      email: 'second@example.com',
      displayName: 'Second',
      passwordHash: 'hash-2',
    });

    expect((await repository.findCredentialsByEmail('FIRST@example.com'))?.email).toBe(
      'first@example.com',
    );
    expect(await repository.countActive()).toBe(2);
    await expect(
      repository.create({
        email: 'third@example.com',
        displayName: 'Third',
        passwordHash: 'hash-3',
      }),
    ).rejects.toMatchObject({ code: 'USER_LIMIT' });
  });

  it('finds active users by id', async () => {
    const created = await repository.create({
      email: 'first@example.com',
      displayName: 'First',
      passwordHash: 'hash-1',
    });

    await expect(repository.findById(created.id)).resolves.toEqual(created);
  });

  it('does not return inactive users for authentication or sessions', async () => {
    const created = await repository.create({
      email: 'first@example.com',
      displayName: 'First',
      passwordHash: 'hash-1',
    });
    await database.db.update(users).set({ active: false }).where(eq(users.id, created.id));

    await expect(repository.findCredentialsByEmail(created.email)).resolves.toBeNull();
    await expect(repository.findById(created.id)).resolves.toBeNull();
  });
});
