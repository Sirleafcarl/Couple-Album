import { randomUUID } from 'node:crypto';
import { mkdtemp, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { createDatabase, createPhotoTrashRepository, PHOTO_RETENTION_MS, photos, users } from '@memory/db';
import { createLocalMediaStorage, createPhotoPaths } from '@memory/media';
import { removeTrashedPhotoFiles } from '../src/photo-trash-cleanup.js';

it.runIf(process.env.RUN_RESTART_TESTS === 'true')('restarts interrupted purge with original already removed and safely clears the remaining derivatives', async () => {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://memory:memory@localhost:38427/memory_test';
  if (!new URL(url).pathname.endsWith('_test')) throw new Error('Dedicated test DB required');
  const root = await mkdtemp(join(tmpdir(), 'memory-trash-restart-'));
  const database = createDatabase(url);
  const ownerId = randomUUID(), id = randomUUID();
  const now = new Date('2026-09-09T00:00:00Z');
  const paths = createPhotoPaths({ ownerId, photoId: id, extension: 'jpg' });
  const storage = createLocalMediaStorage({ dataRoot: root, maxUploadBytes: 1000, minFreeBytes: 1 });
  try {
    await storage.ensureLayout();
    for (const path of Object.values(paths)) await storage.writeDerivativeAtomically(path, Buffer.from('isolated fixture'));
    await database.db.insert(users).values({ id: ownerId, email: `${ownerId}@test.example`, passwordHash: 'unused', displayName: 'Fixture' });
    await database.db.insert(photos).values({ id, ownerId, originalPath: paths.original, previewPath: paths.preview, thumbnailPath: paths.thumbnail, mimeType: 'image/jpeg', originalFilename: 'fixture.jpg', contentHash: id, sizeBytes: 16, status: 'ready' });
    const trash = createPhotoTrashRepository(database.db);
    await trash.moveToTrash(id, ownerId, now);
    const expires = new Date(+now + PHOTO_RETENTION_MS);
    await expect(trash.purgeExpired(expires, photo => removeTrashedPhotoFiles(photo, {
      async removeIfPresent(path) { if (path === paths.preview) throw new Error('simulated interruption'); await storage.removeIfPresent(path); },
    }))).rejects.toThrow('simulated interruption');
    await expect(access(join(root, paths.original))).rejects.toThrow();
    await expect(access(join(root, paths.preview))).resolves.toBeUndefined();
    expect((await database.db.select().from(photos).where(eq(photos.id, id)))[0]?.purgeStartedAt).toEqual(expires);
    // New connection/repository observes persisted intent, not in-memory state.
    const restarted = createDatabase(url);
    try {
      const recovery = createPhotoTrashRepository(restarted.db);
      expect(await recovery.restore(id, ownerId, now, async () => true)).toBe('expired');
      expect(await recovery.purgeExpired(expires, photo => removeTrashedPhotoFiles(photo, storage))).toBe(1);
    } finally { await restarted.close(); }
    for (const path of Object.values(paths)) await expect(access(join(root, path))).rejects.toThrow();
    expect(await database.db.select().from(photos).where(eq(photos.id, id))).toHaveLength(0);
  } finally {
    await database.db.delete(photos).where(eq(photos.id, id));
    await database.db.delete(users).where(eq(users.id, ownerId));
    await database.close();
    await rm(root, { recursive: true, force: true });
  }
});
