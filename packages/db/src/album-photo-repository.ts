import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import type { PhotoListItem } from './photo-repository.js';
import { lockPhoto } from './photo-trash-repository.js';
import { albumPhotos, albums, photos, users } from './schema.js';

type Layout = 'story' | 'garden' | 'film';
type Result = { kind: 'updated' | 'not-found' | 'photo-not-found' | 'conflict' };
export type AlbumPhotoRepository = {
  get(albumId: string, offset: number, limit: number): Promise<{
    layout: Layout; version: number; total: number; items: PhotoListItem[];
  } | null>;
  add(albumId: string, photoIds: string[]): Promise<Result>;
  remove(albumId: string, photoId: string, version: number): Promise<Result>;
  removeMany(albumId: string, photoIds: string[], version: number): Promise<Result>;
  setLayout(albumId: string, layout: Layout, version: number): Promise<Result>;
  move(albumId: string, photoId: string, beforePhotoId: string | null, version: number): Promise<Result>;
};
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const activeMembership = (id: string) => and(eq(albumPhotos.albumId, id), isNull(photos.deletedAt));
// Freeze the initial sort key at attachment. Background EXIF processing must not
// silently move rows between pages while somebody is browsing an album.
const chronological = albumPhotos.sortAt;

export function createAlbumPhotoRepository(db: Database): AlbumPhotoRepository {
  async function change(
    albumId: string, version: number | undefined,
    action: (tx: Transaction, album: typeof albums.$inferSelect) => Promise<Result>,
    photoIds: string[] = [],
  ): Promise<Result> {
    return db.transaction(async tx => {
      for (const id of [...new Set(photoIds)].sort()) await lockPhoto(tx, id);
      const [album] = await tx.select().from(albums)
        .where(and(eq(albums.id, albumId), isNull(albums.deletedAt))).for('update');
      if (!album) return { kind: 'not-found' };
      if (version !== undefined && version !== album.wallVersion) return { kind: 'conflict' };
      const result = await action(tx, album);
      if (result.kind === 'updated') {
        await tx.update(albums).set({ wallVersion: sql`${albums.wallVersion} + 1`, updatedAt: new Date() })
          .where(eq(albums.id, albumId));
      }
      return result;
    });
  }

  return {
    async get(albumId, offset, limit) {
      return db.transaction(async tx => {
        const [album] = await tx.select().from(albums)
          .where(and(eq(albums.id, albumId), isNull(albums.deletedAt)));
        if (!album) return null;
        const [total] = await tx.select({ value: count() }).from(albumPhotos)
          .innerJoin(photos, eq(albumPhotos.photoId, photos.id)).where(activeMembership(albumId));
        const items = await tx.select({
          id: photos.id, ownerId: photos.ownerId, ownerDisplayName: users.displayName,
          originalFilename: photos.originalFilename, status: photos.status,
          width: photos.width, height: photos.height, capturedAt: photos.capturedAt,
          sortAt: photos.sortAt, failureCode: photos.failureCode,
        }).from(albumPhotos).innerJoin(photos, eq(albumPhotos.photoId, photos.id))
          .innerJoin(users, eq(photos.ownerId, users.id)).where(activeMembership(albumId))
          .orderBy(asc(album.manualOrder ? albumPhotos.position : chronological), asc(photos.id))
          .limit(limit).offset(offset);
        return { layout: album.layout, version: album.wallVersion, total: total!.value, items };
      }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
    },
    add(albumId, photoIds) {
      return change(albumId, undefined, async tx => {
        const ids = [...new Set(photoIds)];
        const valid = await tx.select({ id: photos.id, capturedAt: photos.capturedAt }).from(photos)
          .where(and(inArray(photos.id, ids), isNull(photos.deletedAt))).for('share');
        if (valid.length !== ids.length) return { kind: 'photo-not-found' };
        const captured = new Map(valid.map(photo => [photo.id, photo.capturedAt]));
        const attachedAt = new Date();
        const [last] = await tx.select({ value: sql<number>`coalesce(max(${albumPhotos.position}), -1)::int` })
          .from(albumPhotos).where(eq(albumPhotos.albumId, albumId));
        await tx.insert(albumPhotos).values(ids.map((photoId, index) => ({
          albumId, photoId, position: last!.value + index + 1, attachedAt, sortAt: captured.get(photoId) ?? attachedAt,
        }))).onConflictDoNothing();
        return { kind: 'updated' };
      }, photoIds);
    },
    remove(albumId, photoId, version) {
      return change(albumId, version, async tx => {
        await tx.delete(albumPhotos).where(and(eq(albumPhotos.albumId, albumId), eq(albumPhotos.photoId, photoId)));
        return { kind: 'updated' };
      });
    },
    removeMany(albumId, photoIds, version) {
      const ids = [...new Set(photoIds)];
      return change(albumId, version, async tx => {
        const members = await tx.select({ id: albumPhotos.photoId }).from(albumPhotos)
          .innerJoin(photos, eq(photos.id, albumPhotos.photoId))
          .where(and(activeMembership(albumId), inArray(albumPhotos.photoId, ids)));
        if (!ids.length || members.length !== ids.length) return { kind: 'photo-not-found' };
        await tx.delete(albumPhotos).where(and(eq(albumPhotos.albumId, albumId), inArray(albumPhotos.photoId, ids)));
        return { kind: 'updated' };
      }, ids);
    },
    setLayout(albumId, layout, version) {
      return change(albumId, version, async tx => {
        await tx.update(albums).set({ layout }).where(eq(albums.id, albumId));
        return { kind: 'updated' };
      });
    },
    move(albumId, photoId, beforePhotoId, version) {
      return change(albumId, version, async (tx, album) => {
        const rows = await tx.select({ id: photos.id }).from(albumPhotos)
          .innerJoin(photos, eq(albumPhotos.photoId, photos.id)).where(activeMembership(albumId))
          .orderBy(asc(album.manualOrder ? albumPhotos.position : chronological), asc(photos.id));
        const ids = rows.map(row => row.id);
        if (!ids.includes(photoId) || (beforePhotoId !== null && !ids.includes(beforePhotoId))) {
          return { kind: 'photo-not-found' };
        }
        if (beforePhotoId === photoId) return { kind: 'updated' };
        ids.splice(ids.indexOf(photoId), 1);
        ids.splice(beforePhotoId === null ? ids.length : ids.indexOf(beforePhotoId), 0, photoId);
        const values = sql.join(ids.map((id, position) => sql`(${id}::uuid, ${position}::integer)`), sql`, `);
        await tx.execute(sql`update ${albumPhotos} set position = ordered.position
          from (values ${values}) as ordered(id, position)
          where ${albumPhotos.albumId} = ${albumId}::uuid and ${albumPhotos.photoId} = ordered.id`);
        await tx.update(albums).set({ manualOrder: true }).where(eq(albums.id, albumId));
        return { kind: 'updated' };
      });
    },
  };
}
