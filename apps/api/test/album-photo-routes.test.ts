import { expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createUnusedDependencies } from './test-dependencies.js';

const albumId = '30000000-0000-4000-8000-000000000003';
const photoId = '40000000-0000-4000-8000-000000000004';
const partner = { id: '20000000-0000-4000-8000-000000000002', email: 'partner@example.com', displayName: 'Partner' };
const headers = { cookie: 'memory_session=token' };
function fixture() {
  const deps = createUnusedDependencies();
  deps.sessions.findActiveByTokenHash = async () => partner;
  deps.albums.findActiveById = async () => ({ id: albumId, title: 'Our album', description: '', occurredOn: '2026-09-08',
    version: 1, createdById: '10000000-0000-4000-8000-000000000001', createdByDisplayName: 'Me' });
  deps.albumPhotos.get = vi.fn(async () => ({ layout: 'story' as const, version: 3, total: 0, items: [] }));
  deps.albumPhotos.add = vi.fn(async () => ({ kind: 'updated' as const }));
  deps.albumPhotos.remove = vi.fn(async () => ({ kind: 'updated' as const }));
  return { deps, app: buildApp(deps) };
}
it('authenticates detail and all mutations, allows partner-owned albums, and rejects forged fields', async () => {
  const { deps, app } = fixture();
  try {
    for (const [method, url, payload] of [
      ['GET', `/api/albums/${albumId}`, undefined],
      ['POST', `/api/albums/${albumId}/photos`, { photoIds: [photoId] }],
      ['DELETE', `/api/albums/${albumId}/photos/${photoId}`, { version: 3 }],
      ['PUT', `/api/albums/${albumId}/layout`, { version: 3, layout: 'film' }],
      ['PUT', `/api/albums/${albumId}/photos/${photoId}/order`, { version: 3, beforePhotoId: null }],
    ] as const) {
      const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
      expect(response.statusCode).toBe(401);
    }
    const add = await app.inject({ method: 'POST', url: `/api/albums/${albumId}/photos`, headers, payload: { photoIds: [photoId] } });
    expect(add.statusCode).toBe(200);
    expect(deps.albumPhotos.add).toHaveBeenCalledWith(albumId, [photoId]);
    const forged = await app.inject({ method: 'POST', url: `/api/albums/${albumId}/photos`, headers, payload: { photoIds: [photoId], ownerId: partner.id } });
    expect(forged.statusCode).toBe(400);
    const detail = await app.inject({ method: 'GET', url: `/api/albums/${albumId}`, headers });
    expect(detail.json()).toMatchObject({ layout: 'story', version: 3, total: 0, nextOffset: null });
  } finally { await app.close(); }
});
it('rejects stale paginated reads and mutations instead of mixing orders', async () => {
  const { deps, app } = fixture();
  try {
    const stale = await app.inject({ method: 'GET', url: `/api/albums/${albumId}?offset=40&version=2`, headers });
    expect(stale.statusCode).toBe(409);
    deps.albumPhotos.remove = vi.fn(async () => ({ kind: 'conflict' as const }));
    const remove = await app.inject({ method: 'DELETE', url: `/api/albums/${albumId}/photos/${photoId}`, headers, payload: { version: 2 } });
    expect(remove.statusCode).toBe(409);
    expect(remove.json()).toEqual({ error: 'ALBUM_WALL_CONFLICT' });
  } finally { await app.close(); }
});
