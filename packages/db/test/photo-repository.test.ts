import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/client.js';
import { createPhotoRepository } from '../src/photo-repository.js';
import { albumYearSettings, albums, jobs, photos, sessions, uploads, users } from '../src/schema.js';

const database = createDatabase(
  process.env.TEST_DATABASE_URL ?? 'postgres://memory:memory@localhost:38427/memory_test',
);
const repository = createPhotoRepository(database.db);

async function resetDatabase(): Promise<void> {
  await database.db.delete(jobs);
  await database.db.delete(uploads);
  await database.db.delete(photos);
  await database.db.delete(albumYearSettings);
  await database.db.delete(albums);
  await database.db.delete(sessions);
  await database.db.delete(users);
}

beforeEach(resetDatabase);

afterAll(async () => {
  await resetDatabase();
  await database.close();
});

async function createOwner(displayName: string): Promise<string> {
  const [owner] = await database.db.insert(users).values({
    email: `${randomUUID()}@example.com`,
    displayName,
    passwordHash: 'hash',
  }).returning({ id: users.id });
  if (!owner) throw new Error('Owner fixture was not created');
  return owner.id;
}

async function insertPhoto(
  ownerId: string,
  contentHash: string,
  deletedAt: Date | null = null,
  input: { id?: string; sortAt?: Date; status?: 'processing' | 'ready' | 'failed' } = {},
) {
  const id = input.id ?? randomUUID();
  await database.db.insert(photos).values({
    id,
    ownerId,
    originalPath: `originals/${ownerId}/${id}.jpg`,
    originalFilename: 'photo.jpg',
    contentHash,
    mimeType: 'image/jpeg',
    sizeBytes: 100,
    deletedAt,
    sortAt: input.sortAt,
    status: input.status,
  });
  return id;
}

describe('photo repository duplicate lookup', () => {
  it('finds a matching active photo only within the uploader library', async () => {
    const firstOwner = await createOwner('First');
    const secondOwner = await createOwner('Second');
    const hash = 'c'.repeat(64);
    const firstPhotoId = await insertPhoto(firstOwner, hash);
    await insertPhoto(secondOwner, hash);

    await expect(repository.findDuplicate(firstOwner, hash)).resolves.toEqual({ id: firstPhotoId });
    await expect(repository.findDuplicate(firstOwner, 'd'.repeat(64))).resolves.toBeNull();
  });

  it('ignores a duplicate that is already marked deleted', async () => {
    const ownerId = await createOwner('First');
    const hash = 'e'.repeat(64);
    await insertPhoto(ownerId, hash, new Date('2026-09-01T00:00:00.000Z'));

    await expect(repository.findDuplicate(ownerId, hash)).resolves.toBeNull();
  });
});

describe('photo repository cursor listing', () => {
  it('pages deterministically by sort time and id without returning deleted photos', async () => {
    const firstOwner = await createOwner('First');
    const secondOwner = await createOwner('Second');
    const sameTime = new Date('2026-09-02T08:00:00.000Z');
    const newestId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const secondId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const oldestId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await insertPhoto(firstOwner, '1'.repeat(64), null, { id: oldestId, sortAt: new Date('2026-09-01T08:00:00.000Z') });
    await insertPhoto(firstOwner, '2'.repeat(64), null, { id: secondId, sortAt: sameTime });
    await insertPhoto(secondOwner, '3'.repeat(64), null, { id: newestId, sortAt: sameTime });
    await insertPhoto(firstOwner, '4'.repeat(64), new Date(), { sortAt: new Date('2026-09-03T08:00:00.000Z') });

    const firstPage = await repository.list({ limit: 2 });
    expect(firstPage.items.map((item) => item.id)).toEqual([newestId, secondId]);
    expect(firstPage.nextCursor).toEqual({ sortAt: sameTime, id: secondId });
    if (!firstPage.nextCursor) throw new Error('Expected another photo page');

    const secondPage = await repository.list({ limit: 2, cursor: firstPage.nextCursor });
    expect(secondPage.items.map((item) => item.id)).toEqual([oldestId]);
    expect(secondPage.nextCursor).toBeNull();
    expect((await repository.list({ limit: 10, ownerId: firstOwner })).items.map((item) => item.id))
      .toEqual([secondId, oldestId]);
    expect((await repository.list({ limit: 10, excludeOwnerId: firstOwner })).items.map(item => item.id))
      .toEqual([newestId]);
  });

  it('returns internal media identity only for a live photo', async () => {
    const ownerId = await createOwner('First');
    const liveId = await insertPhoto(ownerId, '5'.repeat(64), null, { status: 'failed' });
    const deletedId = await insertPhoto(ownerId, '6'.repeat(64), new Date());

    await expect(repository.findMediaById(liveId)).resolves.toEqual(expect.objectContaining({
      id: liveId,
      ownerId,
      originalPath: `originals/${ownerId}/${liveId}.jpg`,
      status: 'failed',
    }));
    await expect(repository.findMediaById(deletedId)).resolves.toBeNull();
  });
});
