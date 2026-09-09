import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { albums, users } from './schema.js';

export type AlbumRecord = {
  id: string;
  title: string;
  description: string;
  occurredOn: string;
  version: number;
  createdById: string;
  createdByDisplayName: string;
  coverPhotoId?: string | null;
};

export type AlbumUpdateResult =
  | { kind: 'updated'; album: AlbumRecord }
  | { kind: 'conflict'; album: AlbumRecord }
  | { kind: 'not-found' };

export type AlbumRepository = {
  findActiveById(id: string): Promise<AlbumRecord | null>;
  listActive(): Promise<AlbumRecord[]>;
  create(input: {
    title: string;
    description: string;
    occurredOn: string;
    createdBy: string;
  }): Promise<AlbumRecord>;
  update(input: {
    id: string;
    version: number;
    title?: string;
    description?: string;
    occurredOn?: string;
  }): Promise<AlbumUpdateResult>;
};

const selection = {
  id: albums.id,
  title: albums.title,
  description: albums.description,
  occurredOn: albums.occurredOn,
  version: albums.version,
  createdById: albums.createdBy,
  createdByDisplayName: users.displayName,
  coverPhotoId: sql<string | null>`(select p.id from album_photos ap join photos p on p.id = ap.photo_id
    where ap.album_id = ${albums.id} and p.deleted_at is null and p.status = 'ready'
    order by case when ${albums.manualOrder} then ap.position end,
      case when not ${albums.manualOrder} then ap.sort_at end, p.id limit 1)`,
};

export function createAlbumRepository(db: Database): AlbumRepository {
  async function findActiveById(id: string): Promise<AlbumRecord | null> {
    const [album] = await db.select(selection).from(albums)
      .innerJoin(users, eq(albums.createdBy, users.id))
      .where(and(eq(albums.id, id), isNull(albums.deletedAt)))
      .limit(1);
    return album ?? null;
  }

  return {
    findActiveById,
    async listActive() {
      return db.select(selection).from(albums)
        .innerJoin(users, eq(albums.createdBy, users.id))
        .where(isNull(albums.deletedAt))
        .orderBy(asc(albums.occurredOn), asc(albums.id));
    },

    async create(input) {
      const [created] = await db.insert(albums).values(input).returning({ id: albums.id });
      if (!created) throw new Error('Album insert returned no row');
      const album = await findActiveById(created.id);
      if (!album) throw new Error('Created album could not be read');
      return album;
    },

    async update(input) {
      const changes: {
        title?: string;
        description?: string;
        occurredOn?: string;
        updatedAt: Date;
      } = { updatedAt: new Date() };
      if (input.title !== undefined) changes.title = input.title;
      if (input.description !== undefined) changes.description = input.description;
      if (input.occurredOn !== undefined) changes.occurredOn = input.occurredOn;

      const [updated] = await db.update(albums).set({
        ...changes,
        version: sql`${albums.version} + 1`,
      }).where(and(
        eq(albums.id, input.id),
        eq(albums.version, input.version),
        isNull(albums.deletedAt),
      )).returning({ id: albums.id });

      if (updated) {
        const album = await findActiveById(updated.id);
        if (!album) throw new Error('Updated album could not be read');
        return { kind: 'updated', album };
      }
      const current = await findActiveById(input.id);
      return current ? { kind: 'conflict', album: current } : { kind: 'not-found' };
    },
  };
}
