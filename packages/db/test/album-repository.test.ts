import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createAlbumRepository } from '../src/album-repository.js';
import { createDatabase } from '../src/client.js';
import { albums, albumYearSettings, jobs, photos, sessions, uploads, users } from '../src/schema.js';

const database = createDatabase(
  process.env.TEST_DATABASE_URL ?? 'postgres://memory:memory@localhost:38427/memory_test',
);
const repository = createAlbumRepository(database.db);

async function resetDatabase() {
  await database.db.delete(albumYearSettings);
  await database.db.delete(albums);
  await database.db.delete(jobs);
  await database.db.delete(uploads);
  await database.db.delete(photos);
  await database.db.delete(sessions);
  await database.db.delete(users);
}

async function createUser(displayName: string) {
  const [user] = await database.db.insert(users).values({
    email: `${randomUUID()}@example.com`, displayName, passwordHash: 'hash',
  }).returning({ id: users.id });
  if (!user) throw new Error('User fixture missing');
  return user.id;
}

beforeEach(resetDatabase);
afterAll(async () => { await resetDatabase(); await database.close(); });

describe('album repository', () => {
  it('creates albums and lists only active rows in date order with creator names', async () => {
    const creator = await createUser('First');
    const later = await repository.create({
      title: 'Later', description: '', occurredOn: '2026-09-07', createdBy: creator,
    });
    const earlier = await repository.create({
      title: 'Earlier', description: 'Morning', occurredOn: '2025-01-02', createdBy: creator,
    });
    await database.db.update(albums).set({ deletedAt: new Date() }).where(eq(albums.id, later.id));

    await expect(repository.listActive()).resolves.toEqual([expect.objectContaining({
      id: earlier.id,
      createdByDisplayName: 'First',
      occurredOn: '2025-01-02',
    })]);
  });

  it('increments versions atomically and reports stale or missing updates', async () => {
    const creator = await createUser('First');
    const created = await repository.create({
      title: 'Original', description: '', occurredOn: '2026-03-28', createdBy: creator,
    });

    await expect(repository.update({
      id: created.id, version: 1, title: 'Updated', occurredOn: '2025-12-31',
    })).resolves.toMatchObject({ kind: 'updated', album: { title: 'Updated', version: 2 } });
    await expect(repository.update({
      id: created.id, version: 1, description: 'Stale',
    })).resolves.toMatchObject({ kind: 'conflict', album: { title: 'Updated', version: 2 } });
    await expect(repository.update({
      id: randomUUID(), version: 1, title: 'Missing',
    })).resolves.toEqual({ kind: 'not-found' });
  });
});
