import { and, desc, eq, ne, isNull, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { photos, users } from './schema.js';

export type PhotoCursor = { sortAt: Date; id: string };

export type PhotoListItem = {
  id: string;
  ownerId: string;
  ownerDisplayName: string;
  originalFilename: string;
  status: 'processing' | 'ready' | 'failed';
  width: number | null;
  height: number | null;
  capturedAt: Date | null;
  sortAt: Date;
  failureCode: string | null;
};

export type PhotoRepository = {
  findDuplicate(ownerId: string, contentHash: string): Promise<{ id: string } | null>;
  list(input: {
    limit: number;
    ownerId?: string;
    excludeOwnerId?: string;
    cursor?: PhotoCursor;
  }): Promise<{ items: PhotoListItem[]; nextCursor: PhotoCursor | null }>;
  findMediaById(id: string): Promise<{
    id: string;
    ownerId: string;
    originalPath: string;
    previewPath: string | null;
    thumbnailPath: string | null;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    status: 'processing' | 'ready' | 'failed';
  } | null>;
};

export function createPhotoRepository(db: Database): PhotoRepository {
  return {
    async findDuplicate(ownerId, contentHash) {
      const [photo] = await db.select({ id: photos.id })
        .from(photos)
        .where(and(
          eq(photos.ownerId, ownerId),
          eq(photos.contentHash, contentHash),
          isNull(photos.deletedAt),
        ))
        .limit(1);

      return photo ?? null;
    },

    async list(input) {
      const conditions = [isNull(photos.deletedAt)];
      if (input.ownerId) conditions.push(eq(photos.ownerId, input.ownerId));
      if (input.excludeOwnerId) conditions.push(ne(photos.ownerId, input.excludeOwnerId));
      if (input.cursor) {
        conditions.push(sql`(${photos.sortAt}, ${photos.id}) < (${input.cursor.sortAt}, ${input.cursor.id}::uuid)`);
      }

      const rows = await db.select({
        id: photos.id,
        ownerId: photos.ownerId,
        ownerDisplayName: users.displayName,
        originalFilename: photos.originalFilename,
        status: photos.status,
        width: photos.width,
        height: photos.height,
        capturedAt: photos.capturedAt,
        sortAt: photos.sortAt,
        failureCode: photos.failureCode,
      }).from(photos)
        .innerJoin(users, eq(photos.ownerId, users.id))
        .where(and(...conditions))
        .orderBy(desc(photos.sortAt), desc(photos.id))
        .limit(input.limit + 1);

      const hasNextPage = rows.length > input.limit;
      const items = hasNextPage ? rows.slice(0, input.limit) : rows;
      const last = items.at(-1);
      return {
        items,
        nextCursor: hasNextPage && last ? { sortAt: last.sortAt, id: last.id } : null,
      };
    },

    async findMediaById(id) {
      const [photo] = await db.select({
        id: photos.id,
        ownerId: photos.ownerId,
        originalPath: photos.originalPath,
        previewPath: photos.previewPath,
        thumbnailPath: photos.thumbnailPath,
        originalFilename: photos.originalFilename,
        mimeType: photos.mimeType,
        sizeBytes: photos.sizeBytes,
        status: photos.status,
      }).from(photos)
        .where(and(eq(photos.id, id), isNull(photos.deletedAt)))
        .limit(1);

      return photo ?? null;
    },
  };
}
