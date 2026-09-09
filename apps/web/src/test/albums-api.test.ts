import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AlbumApiError,
  createAlbum,
  getAlbums,
  updateAlbum,
  updateAlbumTheme,
} from '../api/albums.js';

const album = {
  id: '30000000-0000-4000-8000-000000000003',
  title: '春日野餐记',
  description: '风很轻。',
  occurredOn: '2026-03-28',
  year: 2026,
  month: 3,
  coverUrl: null,
  version: 1,
  createdBy: {
    id: '10000000-0000-4000-8000-000000000001',
    displayName: 'Alice',
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('album api', () => {
  it('loads and strictly parses the credentialed album list', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      years: [{ year: 2026, themeId: 'secret-garden', themeVersion: null, albums: [album] }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAlbums()).resolves.toMatchObject({ years: [{ year: 2026 }] });
    expect(fetchMock).toHaveBeenCalledWith('/api/albums', {
      credentials: 'include',
      headers: { accept: 'application/json' },
      method: 'GET',
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ years: [], extra: true })));
    await expect(getAlbums()).rejects.toThrow();
  });

  it('sends create and update bodies as JSON and parses album responses', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(album), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...album, title: '晚霞', version: 2 })));
    vi.stubGlobal('fetch', fetchMock);

    await createAlbum({ title: '春日野餐记', description: '风很轻。', occurredOn: '2026-03-28' });
    await updateAlbum(album.id, { version: 1, title: '晚霞' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/albums', expect.objectContaining({
      method: 'POST', credentials: 'include',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ title: '春日野餐记', description: '风很轻。', occurredOn: '2026-03-28' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/albums/${album.id}`, expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ version: 1, title: '晚霞' }),
    }));
  });

  it('persists annual theme changes with their current version', async () => {
    const setting = { year: 2026, themeId: 'love-letters', version: 2 };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(setting)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateAlbumTheme(2026, {
      themeId: 'love-letters', version: 1,
    })).resolves.toEqual(setting);
    expect(fetchMock).toHaveBeenCalledWith('/api/album-years/2026/theme', expect.objectContaining({
      method: 'PUT', body: JSON.stringify({ themeId: 'love-letters', version: 1 }),
    }));
  });

  it('exposes safe typed errors for HTTP and network failures', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: 'ALBUM_VERSION_CONFLICT', current: album,
      }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { unsafe: true } }), { status: 400 }))
      .mockRejectedValueOnce(new TypeError('private network detail'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateAlbum(album.id, { version: 1, title: '冲突' })).rejects.toEqual(
      expect.objectContaining<Partial<AlbumApiError>>({
        code: 'ALBUM_VERSION_CONFLICT', status: 409,
        body: expect.objectContaining({ current: album }),
      }),
    );
    await expect(createAlbum({ title: '无效', description: '', occurredOn: '2026-03-28' }))
      .rejects.toEqual(expect.objectContaining({ code: 'ALBUM_REQUEST_FAILED', status: 400 }));
    await expect(getAlbums()).rejects.toEqual(expect.objectContaining({
      code: 'ALBUM_REQUEST_FAILED', status: 0, body: null,
    }));
  });
});
