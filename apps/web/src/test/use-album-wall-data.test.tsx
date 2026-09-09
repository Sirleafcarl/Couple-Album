import type { AlbumSummary, AlbumYear } from '@memory/contracts/albums';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlbumApiError } from '../api/albums.js';
import * as albumApi from '../api/albums.js';
import { useAlbumWallData } from '../album-wall/use-album-wall-data.js';

vi.mock('../api/albums.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/albums.js')>();
  return {
    ...original,
    getAlbums: vi.fn(),
    createAlbum: vi.fn(),
    updateAlbum: vi.fn(),
    updateAlbumTheme: vi.fn(),
  };
});

const creator = {
  id: '10000000-0000-4000-8000-000000000001',
  displayName: 'Alice',
};

function makeAlbum(overrides: Partial<AlbumSummary> = {}): AlbumSummary {
  return {
    id: '30000000-0000-4000-8000-000000000003',
    title: '春日野餐记',
    description: '风很轻。',
    occurredOn: '2026-03-28',
    year: 2026,
    month: 3,
    coverUrl: null,
    version: 1,
    createdBy: creator,
    ...overrides,
  };
}

const year2025: AlbumYear = {
  year: 2025,
  themeId: 'love-letters',
  themeVersion: 2,
  albums: [makeAlbum({
    id: '30000000-0000-4000-8000-000000000005',
    title: '旧信',
    occurredOn: '2025-12-01',
    year: 2025,
    month: 12,
  })],
};

const year2026: AlbumYear = {
  year: 2026,
  themeId: 'secret-garden',
  themeVersion: null,
  albums: [makeAlbum()],
};

beforeEach(() => {
  vi.mocked(albumApi.getAlbums).mockReset();
  vi.mocked(albumApi.createAlbum).mockReset();
  vi.mocked(albumApi.updateAlbum).mockReset();
  vi.mocked(albumApi.updateAlbumTheme).mockReset();
});

describe('useAlbumWallData', () => {
  it('loads years, sorts them, and selects the newest year', async () => {
    let resolve!: (value: { years: AlbumYear[] }) => void;
    vi.mocked(albumApi.getAlbums).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { result } = renderHook(() => useAlbumWallData());

    expect(result.current.status).toBe('loading');
    await act(async () => resolve({ years: [year2025, year2026] }));

    expect(result.current.status).toBe('ready');
    expect(result.current.years.map(({ year }) => year)).toEqual([2026, 2025]);
    expect(result.current.selectedYear).toBe(2026);
    expect(result.current.selected).toEqual(result.current.years[0]);
  });

  it('supports empty success and reload after an initial failure', async () => {
    vi.mocked(albumApi.getAlbums)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ years: [] });
    const { result } = renderHook(() => useAlbumWallData());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBeInstanceOf(Error);
    await act(async () => result.current.reload());

    expect(result.current.status).toBe('ready');
    expect(result.current.years).toEqual([]);
    expect(result.current.selectedYear).toBeNull();
  });

  it('creates into a new year, selects it, and keeps album dates ordered', async () => {
    vi.mocked(albumApi.getAlbums).mockResolvedValue({ years: [year2026] });
    const earlier = makeAlbum({
      id: '30000000-0000-4000-8000-000000000004',
      title: '元旦', occurredOn: '2027-01-01', year: 2027, month: 1,
    });
    const later = makeAlbum({
      id: '30000000-0000-4000-8000-000000000006',
      title: '夏天', occurredOn: '2027-08-08', year: 2027, month: 8,
    });
    vi.mocked(albumApi.createAlbum).mockResolvedValueOnce(later).mockResolvedValueOnce(earlier);
    const { result } = renderHook(() => useAlbumWallData());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => { await result.current.create({ title: '夏天', description: '', occurredOn: '2027-08-08' }); });
    await act(async () => { await result.current.create({ title: '元旦', description: '', occurredOn: '2027-01-01' }); });

    expect(result.current.selectedYear).toBe(2027);
    expect(result.current.years[0]?.albums.map(({ title }) => title)).toEqual(['元旦', '夏天']);
    expect(result.current.years[0]).toMatchObject({
      year: 2027, themeId: 'secret-garden', themeVersion: null,
    });
  });

  it('moves a server-updated album across years without leaving a duplicate', async () => {
    vi.mocked(albumApi.getAlbums).mockResolvedValue({ years: [year2026, year2025] });
    const moved = makeAlbum({ occurredOn: '2025-02-14', year: 2025, month: 2, version: 2 });
    vi.mocked(albumApi.updateAlbum).mockResolvedValue(moved);
    const { result } = renderHook(() => useAlbumWallData());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => { await result.current.update(moved.id, { version: 1, occurredOn: '2025-02-14' }); });

    expect(result.current.selectedYear).toBe(2025);
    expect(result.current.years.find(({ year }) => year === 2026)?.albums).toEqual([]);
    expect(result.current.years.find(({ year }) => year === 2025)?.albums.map(({ id }) => id))
      .toEqual([moved.id, year2025.albums[0]!.id]);
  });

  it('previews a theme optimistically, commits its version, and rolls back failures', async () => {
    vi.mocked(albumApi.getAlbums).mockResolvedValue({ years: [year2026] });
    let resolve!: (value: { year: number; themeId: 'love-letters'; version: number }) => void;
    vi.mocked(albumApi.updateAlbumTheme)
      .mockReturnValueOnce(new Promise((done) => { resolve = done; }))
      .mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useAlbumWallData());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let pending!: Promise<void>;
    act(() => { pending = result.current.setTheme('love-letters'); });
    expect(result.current.selected?.themeId).toBe('love-letters');
    await act(async () => resolve({ year: 2026, themeId: 'love-letters', version: 1 }));
    await pending;
    expect(result.current.selected?.themeVersion).toBe(1);

    let failure: unknown;
    await act(async () => {
      try {
        await result.current.setTheme('date-adventure');
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toEqual(expect.objectContaining({ message: 'offline' }));
    expect(result.current.selected).toMatchObject({ themeId: 'love-letters', themeVersion: 1 });
  });

  it('replaces an optimistic theme with the current server setting on conflict', async () => {
    vi.mocked(albumApi.getAlbums).mockResolvedValue({ years: [year2026] });
    vi.mocked(albumApi.updateAlbumTheme).mockRejectedValue(new AlbumApiError(
      'ALBUM_THEME_VERSION_CONFLICT',
      409,
      { error: 'ALBUM_THEME_VERSION_CONFLICT', current: {
        year: 2026, themeId: 'date-adventure', version: 4,
      } },
    ));
    const { result } = renderHook(() => useAlbumWallData());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let failure: unknown;
    await act(async () => {
      try {
        await result.current.setTheme('love-letters');
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toBeInstanceOf(AlbumApiError);
    expect(result.current.selected).toMatchObject({ themeId: 'date-adventure', themeVersion: 4 });
  });
});
