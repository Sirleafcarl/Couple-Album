import { Readable } from 'node:stream';
import type { PhotoRepository } from '@memory/db';
import { describe, expect, it, vi } from 'vitest';
import { buildApp, type AppDependencies } from '../src/app.js';
import { createUnusedDependencies } from './test-dependencies.js';

const photoId = '30000000-0000-4000-8000-000000000003';
const ownerId = '20000000-0000-4000-8000-000000000002';
const user = { id: '10000000-0000-4000-8000-000000000001', email: 'a@example.com', displayName: 'Alice' };

function mediaPhoto(status: 'processing' | 'ready' | 'failed' = 'ready') {
  return {
    id: photoId,
    ownerId,
    originalPath: `originals/${ownerId}/30/00/${photoId}.jpg`,
    previewPath: status === 'ready' ? `previews/${ownerId}/30/00/${photoId}.webp` : null,
    thumbnailPath: status === 'ready' ? `thumbnails/${ownerId}/30/00/${photoId}.webp` : null,
    originalFilename: '旅行\r\nInjected.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 14,
    status,
  };
}

function createApp(input: {
  authenticated?: boolean;
  photo?: ReturnType<typeof mediaPhoto> | null;
  stream?: () => Readable;
} = {}) {
  const base = createUnusedDependencies();
  const findMediaById = vi.fn<PhotoRepository['findMediaById']>(
    async () => input.photo === undefined ? mediaPhoto() : input.photo,
  );
  const createReadStream = vi.fn(input.stream ?? (() => Readable.from([Buffer.from('original-bytes')])));
  const app = buildApp({
    ...base,
    sessions: {
      ...base.sessions,
      async findActiveByTokenHash() { return input.authenticated === false ? null : user; },
    },
    photos: { ...base.photos, findMediaById },
    media: { createReadStream },
  } as AppDependencies);
  return { app, findMediaById, createReadStream };
}

const auth = { cookie: 'memory_session=token' };

describe('GET /api/photos/:photoId/media/:variant', () => {
  it('requires authentication before looking up media', async () => {
    const { app, findMediaById } = createApp({ authenticated: false });
    const response = await app.inject({ method: 'GET', url: `/api/photos/${photoId}/media/original` });
    await app.close();
    expect(response.statusCode).toBe(401);
    expect(findMediaById).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown or deleted photo', async () => {
    const { app } = createApp({ photo: null });
    const response = await app.inject({ method: 'GET', url: `/api/photos/${photoId}/media/original`, headers: auth });
    await app.close();
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'PHOTO_NOT_FOUND' });
  });

  it.each(['processing', 'failed'] as const)('serves the immutable original while %s', async (status) => {
    const { app } = createApp({ photo: mediaPhoto(status) });
    const response = await app.inject({ method: 'GET', url: `/api/photos/${photoId}/media/original`, headers: auth });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.toString()).toBe('original-bytes');
    expect(response.headers['content-type']).toContain('image/jpeg');
    expect(response.headers['content-length']).toBe('14');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['content-disposition']).toContain("filename*=UTF-8''");
    expect(response.headers['content-disposition']).not.toMatch(/[\r\n]/);
  });

  it('returns 409 when a derivative is not ready', async () => {
    const { app, createReadStream } = createApp({ photo: mediaPhoto('processing') });
    const response = await app.inject({ method: 'GET', url: `/api/photos/${photoId}/media/preview`, headers: auth });
    await app.close();
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'PHOTO_NOT_READY' });
    expect(createReadStream).not.toHaveBeenCalled();
  });

  it('serves ready derivatives to either authenticated partner as WebP', async () => {
    const { app, createReadStream } = createApp({ photo: mediaPhoto('ready') });
    const response = await app.inject({ method: 'GET', url: `/api/photos/${photoId}/media/thumbnail`, headers: auth });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/webp');
    expect(createReadStream).toHaveBeenCalledWith(expect.stringMatching(/^thumbnails\//));
  });

  it('maps a storage open failure without exposing its path', async () => {
    const { app } = createApp({ stream: () => { throw new Error('/data/private/path missing'); } });
    const response = await app.inject({ method: 'GET', url: `/api/photos/${photoId}/media/original`, headers: auth });
    await app.close();
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'MEDIA_UNAVAILABLE' });
    expect(response.body).not.toContain('/data/');
  });

  it('maps a stream error before the first byte without exposing its path', async () => {
    const stream = new Readable({
      read() { this.destroy(new Error('/data/private/read failure')); },
    });
    const { app } = createApp({ stream: () => stream });
    const response = await app.inject({ method: 'GET', url: `/api/photos/${photoId}/media/original`, headers: auth });
    await app.close();
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'MEDIA_UNAVAILABLE' });
    expect(response.body).not.toContain('/data/');
  });
});
