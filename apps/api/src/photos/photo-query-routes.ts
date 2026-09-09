import {
  decodePhotoCursor,
  encodePhotoCursor,
  PhotoListQuerySchema,
} from '@memory/contracts/photos';
import type { PhotoRepository, UploadRepository } from '@memory/db';
import type { FastifyInstance } from 'fastify';
import type { SessionRepository } from '@memory/db';
import { z } from 'zod';
import { createRequireUser } from '../auth/require-user.js';
import { presentPhoto, presentUpload } from './photo-presenter.js';

const UploadListQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

type Dependencies = {
  sessions: SessionRepository;
  photos: PhotoRepository;
  uploads: UploadRepository;
  clock: () => Date;
};

export function registerPhotoQueryRoutes(app: FastifyInstance, dependencies: Dependencies): void {
  const requireUser = createRequireUser(dependencies.sessions, dependencies.clock);

  app.get('/api/photos', { preHandler: requireUser }, async (request, reply) => {
    const parsed = PhotoListQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_QUERY' });

    let cursor;
    try {
      cursor = parsed.data.cursor ? decodePhotoCursor(parsed.data.cursor) : undefined;
    } catch {
      return reply.code(400).send({ error: 'INVALID_QUERY' });
    }

    const ownerId = parsed.data.owner === 'me'
      ? request.user!.id
      : parsed.data.owner === 'all' || parsed.data.owner === 'partner' ? undefined : parsed.data.owner;
    const input: Parameters<PhotoRepository['list']>[0] = { limit: parsed.data.limit };
    if (ownerId) input.ownerId = ownerId;
    if (parsed.data.owner === 'partner') input.excludeOwnerId = request.user!.id;
    if (cursor) input.cursor = { sortAt: new Date(cursor.sortAt), id: cursor.id };
    const page = await dependencies.photos.list(input);

    return {
      items: page.items.map(presentPhoto),
      nextCursor: page.nextCursor ? encodePhotoCursor({
        sortAt: page.nextCursor.sortAt.toISOString(),
        id: page.nextCursor.id,
      }) : null,
    };
  });

  app.get('/api/uploads', { preHandler: requireUser }, async (request, reply) => {
    const parsed = UploadListQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_QUERY' });
    const items = await dependencies.uploads.listForOwner(request.user!.id, parsed.data.limit);
    return { items: items.map(presentUpload) };
  });
}
