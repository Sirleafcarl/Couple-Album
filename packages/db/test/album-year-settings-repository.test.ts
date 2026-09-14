import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createAlbumYearSettingsRepository } from '../src/album-year-settings-repository.js';
import { createDatabase } from '../src/client.js';
import { albums, albumYearSettings, jobs, photos, sessions, uploads, users } from '../src/schema.js';

const database = createDatabase(
  process.env.TEST_DATABASE_URL ?? 'postgres://memory:memory@localhost:38427/memory_test',
);
const repository = createAlbumYearSettingsRepository(database.db);

async function resetDatabase() {
  await database.db.delete(albumYearSettings);
  await database.db.delete(albums);
  await database.db.delete(jobs);
  await database.db.delete(uploads);
  await database.db.delete(photos);
  await database.db.delete(sessions);
  await database.db.delete(users);
}

async function createUser() {
  const [user] = await database.db.insert(users).values({
    email: `${randomUUID()}@example.com`, displayName: 'First', passwordHash: 'hash',
  }).returning({ id: users.id });
  if (!user) throw new Error('User fixture missing');
  return user.id;
}

beforeEach(resetDatabase);
afterAll(async () => { await resetDatabase(); await database.close(); });

describe('album year settings repository', () => {
  it.each(['fairytale-castle', 'daylight', 'heart-frequency', 'photo-exhibition', 'heart-track', 'love-playground', 'blue-holiday', 'tropical-cutout', 'date-adventure'] as const)('falls back for legacy %s without losing its version', async (themeId) => {
    const userId = await createUser();
    await database.db.insert(albumYearSettings).values({ year: 2026, themeId, updatedBy: userId });
    const setting = { year: 2026, themeId: 'secret-garden', version: 1 };
    await expect(repository.list()).resolves.toEqual([setting]);
    await expect(repository.set({ year: 2026, themeId: 'clear-specimen', version: null, updatedBy: userId })).resolves.toEqual({ kind: 'conflict', setting });
    await expect(repository.set({ year: 2026, themeId: 'clear-specimen', version: 1, updatedBy: userId })).resolves.toEqual({ kind: 'updated', setting: { ...setting, themeId: 'clear-specimen', version: 2 } });
  });
  it('creates, updates, lists, and rejects stale theme versions', async () => {
    const userId = await createUser();
    await expect(repository.set({
      year: 2026, themeId: 'secret-garden', version: null, updatedBy: userId,
    })).resolves.toEqual({
      kind: 'updated', setting: { year: 2026, themeId: 'secret-garden', version: 1 },
    });
    await expect(repository.set({
      year: 2026, themeId: 'love-letters', version: 1, updatedBy: userId,
    })).resolves.toEqual({
      kind: 'updated', setting: { year: 2026, themeId: 'love-letters', version: 2 },
    });
    await expect(repository.set({
      year: 2026, themeId: 'clear-specimen', version: 1, updatedBy: userId,
    })).resolves.toEqual({
      kind: 'conflict', setting: { year: 2026, themeId: 'love-letters', version: 2 },
    });
    await expect(repository.list()).resolves.toEqual([
      { year: 2026, themeId: 'love-letters', version: 2 },
    ]);
  });
});
