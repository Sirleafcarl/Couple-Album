import { decodePhotoCursor, encodePhotoCursor } from '@memory/contracts/photos';
import type { PhotoRepository } from '@memory/db';
import { describe, expect, it, vi } from 'vitest';
import { buildApp, type AppDependencies } from '../src/app.js';
import { createUnusedDependencies } from './test-dependencies.js';

const me = { id: '10000000-0000-4000-8000-000000000001', email: 'a@example.com', displayName: 'Alice' };
const partnerId = '20000000-0000-4000-8000-000000000002';
const photoId = '30000000-0000-4000-8000-000000000003';

function createApp() {
  const base = createUnusedDependencies();
  const list = vi.fn<PhotoRepository['list']>(async () => ({
    items: [{
      id: photoId, ownerId: partnerId, ownerDisplayName: 'Bob', originalFilename: '旅行.jpg',
      status: 'ready' as const, width: 1200, height: 800,
      capturedAt: new Date('2026-08-01T08:00:00Z'), sortAt: new Date('2026-08-01T08:00:00Z'),
      failureCode: null,
    }],
    nextCursor: null,
  }));
  const listForOwner = vi.fn(async () => [{
    id: '40000000-0000-4000-8000-000000000004',
    originalFilename: '最新.jpg', status: 'committed' as const, bytesReceived: 123,
    errorCode: null, photoId, createdAt: new Date('2026-09-02T08:00:00Z'),
  }]);
  const app = buildApp({
    ...base,
    sessions: { ...base.sessions, async findActiveByTokenHash() { return me; } },
    photos: { findDuplicate: vi.fn(), findMediaById: vi.fn(), list },
    uploads: { listForOwner },
    media: { createReadStream: vi.fn() },
  } as unknown as AppDependencies);
  return { app, list, listForOwner };
}

describe('GET /api/photos', () => {
  it('resolves partner scope on the server without needing their ID from an earlier page', async () => {
    const { app, list } = createApp();
    const response = await app.inject({ method: 'GET', url: '/api/photos?owner=partner', headers: { cookie: 'memory_session=token' } });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith({ limit: 40, excludeOwnerId: me.id });
  });
  it('returns public media URLs without internal storage paths', async () => {
    const { app } = createApp();
    const response = await app.inject({
      method: 'GET', url: '/api/photos', headers: { cookie: 'memory_session=token' },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('originals/');
    expect(response.json().items[0]).toMatchObject({
      id: photoId,
      owner: { id: partnerId, displayName: 'Bob' },
      media: {
        original: `/api/photos/${photoId}/media/original`,
        preview: `/api/photos/${photoId}/media/preview`,
        thumbnail: `/api/photos/${photoId}/media/thumbnail`,
      },
    });
  });

  it('maps owner=me and rejects malformed query values', async () => {
    const { app, list } = createApp();
    const mine = await app.inject({ method: 'GET', url: '/api/photos?owner=me&limit=20', headers: { cookie: 'memory_session=token' } });
    const invalid = await app.inject({ method: 'GET', url: '/api/photos?limit=101', headers: { cookie: 'memory_session=token' } });
    const invalidOwner = await app.inject({ method: 'GET', url: '/api/photos?owner=not-a-user', headers: { cookie: 'memory_session=token' } });
    await app.close();

    expect(mine.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith({ limit: 20, ownerId: me.id });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: 'INVALID_QUERY' });
    expect(invalidOwner.statusCode).toBe(400);
  });

  it('decodes repository cursors and returns an opaque deterministic next cursor', async () => {
    const { app, list } = createApp();
    const cursor = encodePhotoCursor({ sortAt: '2026-08-02T08:00:00.000Z', id: photoId });
    list.mockResolvedValueOnce({
      items: [],
      nextCursor: { sortAt: new Date('2026-08-01T08:00:00.000Z'), id: photoId },
    });

    const response = await app.inject({
      method: 'GET', url: `/api/photos?owner=${partnerId}&cursor=${cursor}`,
      headers: { cookie: 'memory_session=token' },
    });
    await app.close();

    expect(list).toHaveBeenCalledWith({
      limit: 40,
      ownerId: partnerId,
      cursor: { sortAt: new Date('2026-08-02T08:00:00.000Z'), id: photoId },
    });
    expect(decodePhotoCursor(response.json().nextCursor)).toEqual({
      sortAt: '2026-08-01T08:00:00.000Z', id: photoId,
    });
  });

  it('rejects malformed cursors', async () => {
    const { app } = createApp();
    const response = await app.inject({ method: 'GET', url: '/api/photos?cursor=broken', headers: { cookie: 'memory_session=token' } });
    await app.close();
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'INVALID_QUERY' });
  });

  it('presents processing state without unavailable derivative URLs', async () => {
    const { app, list } = createApp();
    list.mockResolvedValueOnce({
      items: [{
        id: photoId, ownerId: me.id, ownerDisplayName: 'Alice', originalFilename: '等待.jpg',
        status: 'processing', width: null, height: null, capturedAt: null,
        sortAt: new Date('2026-09-02T08:00:00Z'), failureCode: null,
      }],
      nextCursor: null,
    });
    const response = await app.inject({
      method: 'GET', url: '/api/photos', headers: { cookie: 'memory_session=token' },
    });
    await app.close();

    expect(response.json().items[0]).toMatchObject({
      status: 'processing', width: null, height: null,
      media: { preview: null, thumbnail: null },
    });
  });

  it('presents a stable failure code without derivative URLs', async () => {
    const { app, list } = createApp();
    list.mockResolvedValueOnce({
      items: [{
        id: photoId, ownerId: me.id, ownerDisplayName: 'Alice', originalFilename: '损坏.jpg',
        status: 'failed', width: null, height: null, capturedAt: null,
        sortAt: new Date('2026-09-02T08:00:00Z'), failureCode: 'INVALID_IMAGE',
      }],
      nextCursor: null,
    });
    const response = await app.inject({
      method: 'GET', url: '/api/photos', headers: { cookie: 'memory_session=token' },
    });
    await app.close();

    expect(response.json().items[0]).toMatchObject({
      status: 'failed', failureCode: 'INVALID_IMAGE',
      media: { preview: null, thumbnail: null },
    });
  });
});

describe('GET /api/uploads', () => {
  it('returns only the authenticated owner history in repository order', async () => {
    const { app, listForOwner } = createApp();
    const response = await app.inject({ method: 'GET', url: '/api/uploads?limit=40', headers: { cookie: 'memory_session=token' } });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(listForOwner).toHaveBeenCalledWith(me.id, 40);
    expect(response.json().items[0]).toMatchObject({ originalFilename: '最新.jpg', bytesReceived: 123 });
  });

  it('rejects an excessive history limit', async () => {
    const { app } = createApp();
    const response = await app.inject({ method: 'GET', url: '/api/uploads?limit=101', headers: { cookie: 'memory_session=token' } });
    await app.close();
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'INVALID_QUERY' });
  });
});
