import { Readable } from 'node:stream';
import type { Multipart, MultipartFile } from '@fastify/multipart';
import type { SessionRepository } from '@memory/db';
import type { FastifyInstance } from 'fastify';
import { createRequireUser } from '../auth/require-user.js';
import { PhotoUploadError, toPhotoUploadError } from './photo-errors.js';
import type { PhotoUploadService } from './photo-upload-service.js';

function parseAllowDuplicate(query: unknown): boolean | null {
  if (!query || typeof query !== 'object' || !('allowDuplicate' in query)) return false;
  const value = (query as { allowDuplicate?: unknown }).allowDuplicate;
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  return null;
}

function isFilePart(part: Multipart): part is MultipartFile {
  return part.type === 'file';
}

function exactlyOneFile(
  file: MultipartFile,
  parts: AsyncIterableIterator<Multipart>,
): Readable {
  return Readable.from((async function* () {
    for await (const chunk of file.file) yield chunk;
    const extra = await parts.next();
    if (!extra.done) {
      if (isFilePart(extra.value)) extra.value.file.resume();
      throw new PhotoUploadError('MULTIPART_LIMIT', 400, 'Exactly one file is allowed');
    }
  })());
}

export function registerPhotoUploadRoutes(
  app: FastifyInstance,
  dependencies: {
    sessions: SessionRepository;
    service: PhotoUploadService;
    clock: () => Date;
  },
): void {
  app.post('/api/photos/uploads', {
    preHandler: createRequireUser(dependencies.sessions, dependencies.clock),
  }, async (request, reply) => {
    const allowDuplicate = parseAllowDuplicate(request.query);
    if (allowDuplicate === null) {
      return reply.code(400).send({ error: 'INVALID_UPLOAD_QUERY' });
    }

    try {
      const parts = request.parts();
      const first = await parts.next();
      if (first.done || !isFilePart(first.value)) {
        return reply.code(400).send({ error: 'PHOTO_FILE_REQUIRED' });
      }
      const result = await dependencies.service.upload({
        ownerId: request.user!.id,
        originalFilename: first.value.filename,
        source: exactlyOneFile(first.value, parts),
        allowDuplicate,
      });
      return reply.code(202).send(result);
    } catch (error) {
      const uploadError = toPhotoUploadError(error);
      const body: { error: string; existingPhotoId?: string } = { error: uploadError.code };
      if (uploadError.existingPhotoId) body.existingPhotoId = uploadError.existingPhotoId;
      return reply.code(uploadError.statusCode).send(body);
    }
  });
}
