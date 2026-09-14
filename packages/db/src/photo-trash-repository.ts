import { and, desc, eq, gt, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { albumPhotos, albums, jobs, photos } from './schema.js';

export const PHOTO_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export type PhotoMutationResult = 'ok' | 'not-found' | 'expired' | 'original-missing';
export type TrashPhoto = typeof photos.$inferSelect;
export type PhotoTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type TrashCursor = { deletedAt: Date; id: string };
type PhotoClock = Date | (() => Date);
const readClock = (clock: PhotoClock) => typeof clock === 'function' ? clock() : clock;
class RestoreExpired extends Error {}

export async function lockPhoto(transaction: PhotoTransaction, id: string) {
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`photo:${id}`}, 0))`);
}

export function createPhotoTrashRepository(db: Database) {
  // The transaction owns both the advisory lock and the connection used by the
  // callback. Never acquire a second pool connection while holding this lock.
  async function withPhotoLock<T>(id: string, operation: (transaction: PhotoTransaction) => Promise<T>): Promise<T> {
    return db.transaction(async transaction => {
      await lockPhoto(transaction, id);
      return operation(transaction);
    });
  }

  async function bumpAlbums(transaction: PhotoTransaction, id: string, now: Date) {
    await transaction.select({ id: albums.id }).from(albums)
      .where(and(isNull(albums.deletedAt), sql`${albums.id} in (select ${albumPhotos.albumId} from ${albumPhotos} where ${albumPhotos.photoId} = ${id}::uuid)`))
      .orderBy(albums.id).for('update');
    await transaction.update(albums).set({
      version: sql`${albums.version} + 1`, wallVersion: sql`${albums.wallVersion} + 1`, updatedAt: now,
    }).where(and(isNull(albums.deletedAt), sql`${albums.id} in (select ${albumPhotos.albumId} from ${albumPhotos} where ${albumPhotos.photoId} = ${id}::uuid)`));
  }

  return {
    withPhotoLock,
    async runProcessing(id: string, jobId: string, operation: (transaction: PhotoTransaction) => Promise<unknown>) {
      return withPhotoLock(id, async transaction => {
        const [photo] = await transaction.select({ id: photos.id }).from(photos).where(and(eq(photos.id, id), isNull(photos.purgeStartedAt), eq(photos.status, 'processing')));
        if (photo) return operation(transaction);
        await transaction.update(jobs).set({ status: 'completed', lockedAt: null, lockedBy: null, updatedAt: new Date() }).where(and(eq(jobs.id, jobId), eq(jobs.status, 'running')));
      });
    },
    async moveToTrash(id: string, ownerId: string, clock: PhotoClock): Promise<PhotoMutationResult> {
      return withPhotoLock(id, async transaction => {
        const [photo] = await transaction.select().from(photos).where(and(eq(photos.id, id), eq(photos.ownerId, ownerId)));
        if (!photo) return 'not-found';
        if (photo.deletedAt) return 'ok';
        // Album writers lock albums before photos; use the same order.
        await bumpAlbums(transaction, id, readClock(clock));
        const now = readClock(clock);
        await transaction.update(photos).set({ deletedAt: now, updatedAt: now }).where(eq(photos.id, id));
        return 'ok';
      });
    },
    async restore(id: string, ownerId: string, clock: PhotoClock, originalExists: (path: string) => Promise<boolean>): Promise<PhotoMutationResult> {
      try { return await withPhotoLock(id, async transaction => {
        const [photo] = await transaction.select().from(photos).where(and(eq(photos.id, id), eq(photos.ownerId, ownerId)));
        if (!photo) return 'not-found';
        if (!photo.deletedAt) return 'ok';
        if (photo.purgeStartedAt || +photo.deletedAt + PHOTO_RETENTION_MS <= +readClock(clock)) return 'expired';
        if (!await originalExists(photo.originalPath)) return 'original-missing';
        const needsProcessing = photo.status === 'ready' && (!photo.previewPath || !photo.thumbnailPath
          || !await originalExists(photo.previewPath) || !await originalExists(photo.thumbnailPath));
        await bumpAlbums(transaction, id, readClock(clock));
        // File checks and album locks can cross the deadline. Recheck only
        // after all waits; throwing rolls back album version updates as well.
        const now = readClock(clock);
        if (+photo.deletedAt + PHOTO_RETENTION_MS <= +now) throw new RestoreExpired();
        // Keep the same photo ID and memberships, including their positions.
        await transaction.update(photos).set({ deletedAt: null, updatedAt: now,
          ...(needsProcessing ? { status: 'processing' as const, previewPath: null, thumbnailPath: null, failureCode: null } : {}),
        }).where(and(eq(photos.id, id), isNull(photos.purgeStartedAt)));
        if (needsProcessing) await transaction.insert(jobs).values({ type: 'process_photo', payload: { photoId: id }, nextRunAt: now });
        return 'ok';
      }); } catch (error) {
        if (error instanceof RestoreExpired) return 'expired';
        throw error;
      }
    },
    async list(input: { ownerId: string; now: Date; limit: number; cursor?: TrashCursor }) {
      const conditions = [eq(photos.ownerId, input.ownerId), isNull(photos.purgeStartedAt), gt(photos.deletedAt, new Date(+input.now - PHOTO_RETENTION_MS))];
      if (input.cursor) conditions.push(sql`(${photos.deletedAt}, ${photos.id}) < (${input.cursor.deletedAt}, ${input.cursor.id}::uuid)`);
      const rows = await db.select().from(photos).where(and(...conditions)).orderBy(desc(photos.deletedAt), desc(photos.id)).limit(input.limit + 1);
      const items = rows.slice(0, input.limit);
      const last = items.at(-1);
      return { items, nextCursor: rows.length > input.limit && last?.deletedAt ? { deletedAt: last.deletedAt, id: last.id } : null };
    },
    async findMedia(id: string, ownerId: string, now: Date) {
      const [photo] = await db.select().from(photos).where(and(eq(photos.id, id), eq(photos.ownerId, ownerId), isNull(photos.purgeStartedAt), gt(photos.deletedAt, new Date(+now - PHOTO_RETENTION_MS))));
      return photo ?? null;
    },
    async purgeExpired(now: Date, removeFiles: (photo: TrashPhoto) => Promise<void>, limit = 20): Promise<number> {
      const cutoff = new Date(+now - PHOTO_RETENTION_MS);
      const candidates = await db.select({ id: photos.id }).from(photos).where(lte(photos.deletedAt, cutoff)).orderBy(photos.updatedAt, photos.id).limit(limit);
      let count = 0;
      for (const { id } of candidates) {
        // Commit intent before filesystem IO, so a crash/failed unlink leaves a
        // retryable record with all paths. Recovery is forbidden after intent.
        await withPhotoLock(id, async transaction => {
          await transaction.update(photos).set({ purgeStartedAt: sql`coalesce(${photos.purgeStartedAt}, ${now})`, updatedAt: now }).where(and(eq(photos.id, id), lte(photos.deletedAt, cutoff)));
        });
        await withPhotoLock(id, async transaction => {
          const [photo] = await transaction.select().from(photos).where(and(eq(photos.id, id), isNotNull(photos.purgeStartedAt), lte(photos.deletedAt, cutoff)));
          if (!photo) return;
          await removeFiles(photo);
          await transaction.delete(jobs).where(sql`${jobs.payload}->>'photoId' = ${id}`);
          await transaction.delete(photos).where(eq(photos.id, id));
          count++;
        });
      }
      return count;
    },
  };
}

export type PhotoTrashRepository = ReturnType<typeof createPhotoTrashRepository>;
