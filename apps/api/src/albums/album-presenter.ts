import type { AlbumSummary } from '@memory/contracts/albums';
import type { AlbumRecord } from '@memory/db';

export function presentAlbum(record: AlbumRecord): AlbumSummary {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    occurredOn: record.occurredOn,
    year: Number(record.occurredOn.slice(0, 4)),
    month: Number(record.occurredOn.slice(5, 7)),
    coverUrl: record.coverPhotoId ? `/api/photos/${record.coverPhotoId}/media/thumbnail` : null,
    version: record.version,
    createdBy: { id: record.createdById, displayName: record.createdByDisplayName },
  };
}
