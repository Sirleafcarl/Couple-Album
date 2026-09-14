import type { PhotoRepository, SessionRepository } from '@memory/db';
import type { MediaStorage } from '@memory/media';
import type { FastifyInstance } from 'fastify';
import type { Readable } from 'node:stream';
import { z } from 'zod';
import { createRequireUser } from '../auth/require-user.js';

const ParamsSchema = z.object({
  photoId: z.string().uuid(),
  variant: z.enum(['original', 'preview', 'thumbnail']),
});

type Dependencies = {
  sessions: SessionRepository;
  photos: PhotoRepository;
  media: Pick<MediaStorage, 'createReadStream'>;
  clock: () => Date;
};

function encode5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function contentDisposition(filename: string): string {
  const clean = filename.replace(/[\u0000-\u001F\u007F]/g, '').trim() || 'photo';
  const fallback = clean.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 150) || 'photo';
  return `inline; filename="${fallback}"; filename*=UTF-8''${encode5987(clean)}`;
}

export async function waitUntilReadable(stream: Readable): Promise<void> {
  if (stream.readableEnded) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      stream.removeListener('readable', ready);
      stream.removeListener('end', ready);
      stream.removeListener('error', failed);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = (error: Error) => { cleanup(); reject(error); };
    stream.once('readable', ready);
    stream.once('end', ready);
    stream.once('error', failed);
  });
}

export function registerPhotoMediaRoutes(app: FastifyInstance, dependencies: Dependencies): void {
  app.get('/api/photos/:photoId/media/:variant', {
    preHandler: createRequireUser(dependencies.sessions, dependencies.clock),
  }, async (request, reply) => {
    const parsed = ParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(404).send({ error: 'PHOTO_NOT_FOUND' });
    const photo = await dependencies.photos.findMediaById(parsed.data.photoId);
    if (!photo) return reply.code(404).send({ error: 'PHOTO_NOT_FOUND' });

    let path: string | null;
    if (parsed.data.variant === 'original') path = photo.originalPath;
    else if (parsed.data.variant === 'preview') path = photo.previewPath;
    else path = photo.thumbnailPath;
    if (parsed.data.variant !== 'original' && (photo.status !== 'ready' || !path)) {
      return reply.code(409).send({ error: 'PHOTO_NOT_READY' });
    }

    let stream;
    try {
      stream = dependencies.media.createReadStream(path!);
      await waitUntilReadable(stream);
    } catch {
      return reply.code(503).send({ error: 'MEDIA_UNAVAILABLE' });
    }

    reply.type(parsed.data.variant === 'original' ? photo.mimeType : 'image/webp');
    reply.header('Cache-Control', 'private, no-store');
    if (parsed.data.variant === 'original') {
      reply.header('Content-Length', photo.sizeBytes);
      reply.header('Content-Disposition', contentDisposition(photo.originalFilename));
    }
    return reply.send(stream);
  });
}
