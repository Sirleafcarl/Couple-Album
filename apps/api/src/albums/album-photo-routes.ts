import { AddAlbumPhotosSchema, AlbumWallVersionSchema, MoveAlbumPhotoSchema, UpdateAlbumLayoutSchema } from '@memory/contracts/albums';
import type { AlbumPhotoRepository, AlbumRepository, SessionRepository } from '@memory/db';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createRequireUser } from '../auth/require-user.js';
import { presentPhoto } from '../photos/photo-presenter.js';
import { presentAlbum } from './album-presenter.js';

const paramsSchema = z.strictObject({ albumId: z.string().uuid() });
const photoParamsSchema = paramsSchema.extend({ photoId: z.string().uuid() });
const querySchema = z.strictObject({
  offset: z.coerce.number().int().min(0).max(10_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  version: z.coerce.number().int().positive().optional(),
});

export function registerAlbumPhotoRoutes(app: FastifyInstance, deps: {
  sessions: SessionRepository; albums: AlbumRepository; albumPhotos: AlbumPhotoRepository; clock: () => Date;
}) {
  const auth = { preHandler: createRequireUser(deps.sessions, deps.clock) };
  function respond(reply: FastifyReply, result: Awaited<ReturnType<AlbumPhotoRepository['add']>>) {
    if (result.kind === 'not-found') return reply.code(404).send({ error: 'ALBUM_NOT_FOUND' });
    if (result.kind === 'photo-not-found') return reply.code(404).send({ error: 'PHOTO_NOT_FOUND' });
    if (result.kind === 'conflict') return reply.code(409).send({ error: 'ALBUM_WALL_CONFLICT' });
    return { ok: true };
  }
  app.get('/api/albums/:albumId', auth, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const query = querySchema.safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: 'INVALID_ALBUM_INPUT' });
    const album = await deps.albums.findActiveById(params.data.albumId);
    const wall = await deps.albumPhotos.get(params.data.albumId, query.data.offset, query.data.limit);
    if (!album || !wall) return reply.code(404).send({ error: 'ALBUM_NOT_FOUND' });
    if (query.data.version !== undefined && query.data.version !== wall.version) {
      return reply.code(409).send({ error: 'ALBUM_WALL_CONFLICT' });
    }
    return {
      album: presentAlbum(album), layout: wall.layout, version: wall.version, total: wall.total,
      items: wall.items.map(presentPhoto),
      nextOffset: query.data.offset + wall.items.length < wall.total ? query.data.offset + wall.items.length : null,
    };
  });
  app.post('/api/albums/:albumId/photos', auth, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = AddAlbumPhotosSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'INVALID_ALBUM_INPUT' });
    return respond(reply, await deps.albumPhotos.add(params.data.albumId, body.data.photoIds));
  });
  app.delete('/api/albums/:albumId/photos/:photoId', auth, async (request, reply) => {
    const params = photoParamsSchema.safeParse(request.params);
    const body = AlbumWallVersionSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'INVALID_ALBUM_INPUT' });
    return respond(reply, await deps.albumPhotos.remove(params.data.albumId, params.data.photoId, body.data.version));
  });
  app.put('/api/albums/:albumId/layout', auth, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = UpdateAlbumLayoutSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'INVALID_ALBUM_INPUT' });
    return respond(reply, await deps.albumPhotos.setLayout(params.data.albumId, body.data.layout, body.data.version));
  });
  app.put('/api/albums/:albumId/photos/:photoId/order', auth, async (request, reply) => {
    const params = photoParamsSchema.safeParse(request.params);
    const body = MoveAlbumPhotoSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'INVALID_ALBUM_INPUT' });
    return respond(reply, await deps.albumPhotos.move(params.data.albumId, params.data.photoId, body.data.beforePhotoId, body.data.version));
  });
}
