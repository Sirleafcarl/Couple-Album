import { decodePhotoCursor, encodePhotoCursor } from '@memory/contracts/photos';
import { PHOTO_RETENTION_MS, type PhotoTrashRepository, type SessionRepository } from '@memory/db';
import type { MediaStorage } from '@memory/media';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createRequireUser } from '../auth/require-user.js';
import { waitUntilReadable } from './photo-media-routes.js';

const paramsSchema = z.object({ photoId: z.string().uuid() });
const querySchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(40), cursor: z.string().max(512).optional() });
export type TrashRoutesRepository = Pick<PhotoTrashRepository, 'moveToTrash' | 'restore' | 'list' | 'findMedia'>;

export function registerPhotoTrashRoutes(app: FastifyInstance, dependencies: {
  trash: TrashRoutesRepository; sessions: SessionRepository; clock: () => Date;
  media: Pick<MediaStorage, 'createReadStream'>;
}) {
  const preHandler = createRequireUser(dependencies.sessions, dependencies.clock);
  app.get('/api/trash', { preHandler }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_QUERY' });
    let cursor;
    try {
      if (parsed.data.cursor) {
        const value = decodePhotoCursor(parsed.data.cursor);
        cursor = { deletedAt: new Date(value.sortAt), id: value.id };
      }
    } catch { return reply.code(400).send({ error: 'INVALID_QUERY' }); }
    const now = dependencies.clock();
    const page = await dependencies.trash.list({ ownerId: request.user!.id, now, limit: parsed.data.limit, ...(cursor ? { cursor } : {}) });
    reply.header('Cache-Control', 'private, no-store');
    return {
      items: page.items.map(photo => ({
        id: photo.id, originalFilename: photo.originalFilename,
        deletedAt: photo.deletedAt!.toISOString(), expiresAt: new Date(+photo.deletedAt! + PHOTO_RETENTION_MS).toISOString(),
        thumbnail: photo.thumbnailPath ? `/api/trash/${photo.id}/thumbnail` : null,
      })),
      nextCursor: page.nextCursor ? encodePhotoCursor({ id: page.nextCursor.id, sortAt: page.nextCursor.deletedAt.toISOString() }) : null,
      serverNow: now.toISOString(),
    };
  });

  app.delete('/api/photos/:photoId', { preHandler }, async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(404).send({ error: 'PHOTO_NOT_FOUND' });
    const result = await dependencies.trash.moveToTrash(parsed.data.photoId, request.user!.id, dependencies.clock);
    if (result !== 'ok') return reply.code(404).send({ error: 'PHOTO_NOT_FOUND' });
    return reply.code(204).send();
  });

  app.post('/api/trash/:photoId/restore', { preHandler }, async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(404).send({ error: 'PHOTO_NOT_FOUND' });
    try {
      const result = await dependencies.trash.restore(parsed.data.photoId, request.user!.id, dependencies.clock, async path => {
        let stream;
        try {
          stream = dependencies.media.createReadStream(path);
          await waitUntilReadable(stream);
          return true;
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
          throw error;
        } finally { stream?.destroy(); }
      });
      if (result === 'not-found') return reply.code(404).send({ error: 'PHOTO_NOT_FOUND' });
      if (result === 'expired') return reply.code(410).send({ error: 'PHOTO_EXPIRED' });
      if (result === 'original-missing') return reply.code(409).send({ error: 'ORIGINAL_MISSING' });
      return reply.code(204).send();
    } catch { return reply.code(503).send({ error: 'RESTORE_UNAVAILABLE' }); }
  });

  app.get('/api/trash/:photoId/thumbnail', { preHandler }, async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(404).send({ error: 'PHOTO_NOT_FOUND' });
    const photo = await dependencies.trash.findMedia(parsed.data.photoId, request.user!.id, dependencies.clock());
    if (!photo?.thumbnailPath) return reply.code(404).send({ error: 'PHOTO_NOT_FOUND' });
    try {
      const stream = dependencies.media.createReadStream(photo.thumbnailPath);
      await waitUntilReadable(stream);
      return reply.type('image/webp').send(stream);
    } catch { return reply.code(503).send({ error: 'MEDIA_UNAVAILABLE' }); }
  });
}
