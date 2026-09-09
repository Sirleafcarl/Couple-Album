import type { AlbumRepository, AlbumYearSettingsRepository } from '@memory/db';
import { describe, expect, it, vi } from 'vitest';
import { buildApp, type AppDependencies } from '../src/app.js';
import { createUnusedDependencies } from './test-dependencies.js';

const me = { id: '10000000-0000-4000-8000-000000000001', email: 'a@example.com', displayName: 'Alice' };
const albumId = '30000000-0000-4000-8000-000000000003';
const record = {
  id: albumId, title: '春日野餐记', description: '风很轻。', occurredOn: '2026-03-28',
  version: 1, createdById: me.id, createdByDisplayName: me.displayName,
};

function createApp() {
  const base = createUnusedDependencies();
  const albums: AlbumRepository = {
    findActiveById: vi.fn(async () => record),
    listActive: vi.fn(async () => [record]),
    create: vi.fn(async (input) => ({ ...record, ...input, createdById: input.createdBy })),
    update: vi.fn(async () => ({ kind: 'updated' as const, album: { ...record, version: 2 } })),
  };
  const albumYearSettings: AlbumYearSettingsRepository = {
    list: vi.fn(async () => []),
    set: vi.fn(async (input) => ({
      kind: 'updated' as const, setting: { year: input.year, themeId: input.themeId, version: 1 },
    })),
  };
  const app = buildApp({
    ...base,
    sessions: { ...base.sessions, async findActiveByTokenHash() { return me; } },
    albums,
    albumYearSettings,
  } as unknown as AppDependencies);
  return { app, albums, albumYearSettings };
}

describe('album routes', () => {
  it('requires authentication and groups albums with a default annual theme', async () => {
    const { app } = createApp();
    const anonymous = await app.inject({ method: 'GET', url: '/api/albums' });
    const response = await app.inject({
      method: 'GET', url: '/api/albums', headers: { cookie: 'memory_session=token' },
    });
    await app.close();

    expect(anonymous.statusCode).toBe(401);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ years: [{
      year: 2026, themeId: 'secret-garden', themeVersion: null,
      albums: [{
        id: albumId, title: '春日野餐记', description: '风很轻。',
        occurredOn: '2026-03-28', year: 2026, month: 3, coverUrl: null,
        version: 1, createdBy: { id: me.id, displayName: 'Alice' },
      }],
    }] });
  });

  it('creates an album as the authenticated user and rejects forged fields', async () => {
    const { app, albums } = createApp();
    const response = await app.inject({
      method: 'POST', url: '/api/albums', headers: { cookie: 'memory_session=token' },
      payload: { title: ' 新相册 ', occurredOn: '2026-09-07' },
    });
    const forged = await app.inject({
      method: 'POST', url: '/api/albums', headers: { cookie: 'memory_session=token' },
      payload: { title: '伪造', occurredOn: '2026-09-07', createdBy: 'someone' },
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(albums.create).toHaveBeenCalledWith({
      title: '新相册', description: '', occurredOn: '2026-09-07', createdBy: me.id,
    });
    expect(forged.statusCode).toBe(400);
  });

  it('returns the current album when an edit version conflicts', async () => {
    const { app, albums } = createApp();
    vi.mocked(albums.update).mockResolvedValueOnce({ kind: 'conflict', album: record });
    const response = await app.inject({
      method: 'PATCH', url: `/api/albums/${albumId}`,
      headers: { cookie: 'memory_session=token' }, payload: { version: 1, title: '冲突' },
    });
    await app.close();
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'ALBUM_VERSION_CONFLICT', current: { id: albumId } });
  });

  it('persists a theme with compare-and-swap semantics', async () => {
    const { app, albumYearSettings } = createApp();
    const response = await app.inject({
      method: 'PUT', url: '/api/album-years/2026/theme',
      headers: { cookie: 'memory_session=token' },
      payload: { themeId: 'love-letters', version: null },
    });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(albumYearSettings.set).toHaveBeenCalledWith({
      year: 2026, themeId: 'love-letters', version: null, updatedBy: me.id,
    });
  });
});
