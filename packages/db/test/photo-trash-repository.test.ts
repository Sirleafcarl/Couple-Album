import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { createDatabase } from '../src/client.js';
import { createPhotoRepository } from '../src/photo-repository.js';
import { createAlbumPhotoRepository } from '../src/album-photo-repository.js';
import { createPhotoTrashRepository, PHOTO_RETENTION_MS } from '../src/photo-trash-repository.js';
import { albumPhotos, albumYearSettings, albums, jobs, photos, sessions, uploads, users } from '../src/schema.js';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://memory:memory@localhost:38427/memory_test';
if (!new URL(url).pathname.endsWith('_test')) throw new Error('Trash tests require a dedicated _test database');
const database = createDatabase(url);
const trash = createPhotoTrashRepository(database.db);
const live = createPhotoRepository(database.db);
const now = new Date('2026-09-09T00:00:00Z');
async function reset() {
  for (const table of [jobs, uploads, photos, albumYearSettings, albums, sessions, users]) await database.db.delete(table);
}
beforeEach(reset);
afterAll(async () => { await reset(); await database.close(); });
async function fixture() {
  const ownerId = randomUUID(), id = randomUUID(), albumId = randomUUID();
  await database.db.insert(users).values({ id: ownerId, email: `${ownerId}@example.com`, displayName: 'Owner', passwordHash: 'test' });
  await database.db.insert(photos).values({ id, ownerId, originalPath: `originals/${ownerId}/${id}.jpg`, originalFilename: 'test.jpg', contentHash: 'a'.repeat(64), mimeType: 'image/jpeg', sizeBytes: 10, status: 'ready' });
  await database.db.insert(albums).values({ id: albumId, createdBy: ownerId, title: 'Test', occurredOn: '2026-09-09' });
  await database.db.insert(albumPhotos).values({ albumId, photoId: id, position: 4 });
  return { ownerId, id, albumId };
}
it('only the owner can trash or restore; deletion hides live media and preserves membership', async () => {
  const f = await fixture();
  expect(await trash.moveToTrash(f.id, randomUUID(), now)).toBe('not-found');
  expect(await trash.moveToTrash(f.id, f.ownerId, now)).toBe('ok');
  expect(await live.findMediaById(f.id)).toBeNull();
  expect((await live.list({ limit: 10 })).items).toHaveLength(0);
  expect(await database.db.select().from(albumPhotos)).toHaveLength(1);
  expect(await trash.restore(f.id, randomUUID(), now, async () => true)).toBe('not-found');
  expect(await trash.findMedia(f.id, randomUUID(), now)).toBeNull();
});
it('repeated delete does not restart the clock; exact expiry is not recoverable', async () => {
  const f = await fixture();
  await trash.moveToTrash(f.id, f.ownerId, now);
  await trash.moveToTrash(f.id, f.ownerId, new Date(+now + 1000));
  const page = await trash.list({ ownerId: f.ownerId, now, limit: 10 });
  expect(page.items[0]?.deletedAt).toEqual(now);
  const expiry = new Date(+now + PHOTO_RETENTION_MS);
  expect(await trash.restore(f.id, f.ownerId, expiry, async () => true)).toBe('expired');
  expect((await trash.list({ ownerId: f.ownerId, now: expiry, limit: 10 })).items).toHaveLength(0);
  expect(await trash.findMedia(f.id, f.ownerId, expiry)).toBeNull();
});
it('restores the same photo and membership, updates album versions, and is idempotent', async () => {
  const f = await fixture();
  await trash.moveToTrash(f.id, f.ownerId, now);
  expect(await trash.restore(f.id, f.ownerId, now, async () => false)).toBe('original-missing');
  expect(await trash.restore(f.id, f.ownerId, now, async () => true)).toBe('ok');
  expect(await trash.restore(f.id, f.ownerId, now, async () => true)).toBe('ok');
  expect((await database.db.select().from(albumPhotos))[0]?.position).toBe(4);
  expect((await database.db.select().from(albums))[0]?.version).toBe(3);
  expect(await live.findMediaById(f.id)).not.toBeNull();
});
it('does not revive deleted albums or recreate removed memberships', async () => {
  const f = await fixture();
  await trash.moveToTrash(f.id, f.ownerId, now);
  await database.db.update(albums).set({ deletedAt: now }).where(eq(albums.id, f.albumId));
  await database.db.delete(albumPhotos).where(eq(albumPhotos.photoId, f.id));
  await trash.restore(f.id, f.ownerId, now, async () => true);
  expect(await database.db.select().from(albumPhotos)).toHaveLength(0);
  expect((await database.db.select().from(albums))[0]?.deletedAt).toEqual(now);
});
it('requeues missing derivatives on restore without duplicating originals or jobs on repeat restore', async () => {
  const f = await fixture();
  await trash.moveToTrash(f.id, f.ownerId, now);
  expect(await trash.restore(f.id, f.ownerId, new Date(+now + PHOTO_RETENTION_MS - 1), async () => true)).toBe('ok');
  await trash.restore(f.id, f.ownerId, now, async () => true);
  expect((await database.db.select().from(photos))[0]?.status).toBe('processing');
  expect(await database.db.select().from(jobs)).toHaveLength(1);
});
it('album attachment participates in the same photo lock before deciding visibility', async () => {
  const f = await fixture();
  await database.db.delete(albumPhotos);
  let release!: () => void, entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const held = trash.withPhotoLock(f.id, async tx => {
    entered(); await new Promise<void>(resolve => { release = resolve; });
    await tx.update(photos).set({ deletedAt: now }).where(eq(photos.id, f.id));
  });
  await started;
  let finished = false;
  const adding = createAlbumPhotoRepository(database.db).add(f.albumId, [f.id]).then(result => { finished = true; return result; });
  await new Promise(resolve => setTimeout(resolve, 30));
  const finishedBeforeRelease = finished;
  release(); await held;
  const result = await adding;
  expect(finishedBeforeRelease).toBe(false);
  expect(result.kind).toBe('photo-not-found');
});
it('persists purge intent before IO, retries errors, never cleans early, and removes references last', async () => {
  const f = await fixture();
  await trash.moveToTrash(f.id, f.ownerId, now);
  expect(await trash.purgeExpired(now, async () => { throw new Error('must not run'); })).toBe(0);
  const expiry = new Date(+now + PHOTO_RETENTION_MS);
  await expect(trash.purgeExpired(expiry, async () => { throw new Error('disk unavailable'); })).rejects.toThrow('disk unavailable');
  expect((await database.db.select().from(photos))[0]?.purgeStartedAt).toEqual(expiry);
  expect(await database.db.select().from(albumPhotos)).toHaveLength(1);
  expect(await trash.restore(f.id, f.ownerId, now, async () => true)).toBe('expired');
  expect(await trash.purgeExpired(expiry, async photo => { expect(photo.id).toBe(f.id); })).toBe(1);
  expect(await database.db.select().from(photos)).toHaveLength(0);
  expect(await database.db.select().from(albumPhotos)).toHaveLength(0);
});
it('serializes processing and purge file IO across repository instances', async () => {
  const f = await fixture();
  await trash.moveToTrash(f.id, f.ownerId, now);
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const held = trash.withPhotoLock(f.id, async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); });
  await started;
  let purged = false;
  const other = createPhotoTrashRepository(database.db);
  const purge = other.purgeExpired(new Date(+now + PHOTO_RETENTION_MS), async () => { purged = true; });
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(purged).toBe(false);
  release();
  await held;
  await purge;
  expect(purged).toBe(true);
});
it('skips already purging photos instead of allowing a late processing write', async () => {
  const f = await fixture();
  await database.db.update(photos).set({ status: 'processing' }).where(eq(photos.id, f.id));
  await trash.moveToTrash(f.id, f.ownerId, now);
  await expect(trash.purgeExpired(new Date(+now + PHOTO_RETENTION_MS), async () => { throw new Error('retry'); })).rejects.toThrow();
  let written = false;
  await trash.runProcessing(f.id, randomUUID(), async () => { written = true; });
  expect(written).toBe(false);
});
it('restoring an old photo does not merge or delete a same-content reupload', async () => {
  const f = await fixture();
  await trash.moveToTrash(f.id, f.ownerId, now);
  const [original] = await database.db.select().from(photos);
  const id = randomUUID();
  await database.db.insert(photos).values({ ...original!, id, deletedAt: null, originalPath: `originals/${f.ownerId}/${id}.jpg` });
  await trash.restore(f.id, f.ownerId, now, async () => true);
  expect((await live.list({ limit: 10 })).items.map(item => item.id).sort()).toEqual([f.id, id].sort());
});
it('rechecks the server clock after waiting for processing to release the photo lock', async () => {
  const f = await fixture();
  await trash.moveToTrash(f.id, f.ownerId, now);
  let current = new Date(+now + PHOTO_RETENTION_MS - 1);
  let release!: () => void, entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const processing = trash.withPhotoLock(f.id, async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); });
  await started;
  const restoring = trash.restore(f.id, f.ownerId, () => current, async () => true);
  current = new Date(+now + PHOTO_RETENTION_MS);
  release(); await processing;
  expect(await restoring).toBe('expired');
  expect(await live.findMediaById(f.id)).toBeNull();
});
it('rechecks expiration after file checks and leaves album versions unchanged when time runs out', async () => {
  const f = await fixture();
  await trash.moveToTrash(f.id, f.ownerId, now);
  let current = new Date(+now + PHOTO_RETENTION_MS - 1);
  expect(await trash.restore(f.id, f.ownerId, () => current, async () => {
    current = new Date(+now + PHOTO_RETENTION_MS); return true;
  })).toBe('expired');
  expect((await database.db.select().from(albums))[0]?.version).toBe(2);
});
