import {
  AlbumThemeVersionConflictResponseSchema,
  type AlbumSummary,
  type AlbumThemeId,
  type AlbumYear,
  type CreateAlbumInput,
  type UpdateAlbumInput,
} from '@memory/contracts/albums';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createAlbum,
  getAlbums,
  updateAlbum,
  updateAlbumTheme,
} from '../api/albums.js';

type LoadStatus = 'loading' | 'ready' | 'error';

function sortAlbums(albums: AlbumSummary[]): AlbumSummary[] {
  return [...albums].sort((left, right) => (
    left.occurredOn.localeCompare(right.occurredOn) || left.id.localeCompare(right.id)
  ));
}

export function sortYears(years: AlbumYear[]): AlbumYear[] {
  return [...years]
    .map((year) => ({ ...year, albums: sortAlbums(year.albums) }))
    .sort((left, right) => right.year - left.year);
}

export function removeAlbum(years: AlbumYear[], albumId: string): AlbumYear[] {
  return years.map((year) => ({
    ...year,
    albums: year.albums.filter(({ id }) => id !== albumId),
  }));
}

export function upsertAlbum(years: AlbumYear[], album: AlbumSummary): AlbumYear[] {
  const withoutAlbum = removeAlbum(years, album.id);
  const existing = withoutAlbum.find(({ year }) => year === album.year);
  if (existing) {
    return sortYears(withoutAlbum.map((year) => year.year === album.year
      ? { ...year, albums: [...year.albums, album] }
      : year));
  }
  return sortYears([...withoutAlbum, {
    year: album.year,
    themeId: 'secret-garden',
    themeVersion: null,
    albums: [album],
  }]);
}

export function useAlbumWallData(): {
  status: LoadStatus;
  error: unknown;
  years: AlbumYear[];
  selectedYear: number | null;
  selected: AlbumYear | null;
  selectYear(year: number): void;
  reload(): Promise<void>;
  create(input: CreateAlbumInput): Promise<AlbumSummary>;
  update(id: string, input: UpdateAlbumInput): Promise<AlbumSummary>;
  setTheme(themeId: AlbumThemeId): Promise<void>;
} {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<unknown>(null);
  const [years, setYears] = useState<AlbumYear[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const response = await getAlbums();
      const nextYears = sortYears(response.years);
      setYears(nextYears);
      setSelectedYear((current) => (
        current !== null && nextYears.some(({ year }) => year === current)
          ? current
          : nextYears[0]?.year ?? null
      ));
      setStatus('ready');
    } catch (nextError) {
      setError(nextError);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = useMemo(
    () => years.find(({ year }) => year === selectedYear) ?? null,
    [selectedYear, years],
  );

  const create = useCallback(async (input: CreateAlbumInput) => {
    const album = await createAlbum(input);
    setYears((current) => upsertAlbum(current, album));
    setSelectedYear(album.year);
    return album;
  }, []);

  const update = useCallback(async (id: string, input: UpdateAlbumInput) => {
    const album = await updateAlbum(id, input);
    setYears((current) => upsertAlbum(current, album));
    setSelectedYear(album.year);
    return album;
  }, []);

  const setTheme = useCallback(async (themeId: AlbumThemeId) => {
    if (!selected) return;
    const previous = selected;
    setYears((current) => current.map((year) => year.year === previous.year
      ? { ...year, themeId }
      : year));
    try {
      const setting = await updateAlbumTheme(previous.year, {
        themeId,
        version: previous.themeVersion,
      });
      setYears((current) => current.map((year) => year.year === setting.year
        ? { ...year, themeId: setting.themeId, themeVersion: setting.version }
        : year));
    } catch (nextError) {
      const errorBody = typeof nextError === 'object' && nextError !== null && 'body' in nextError
        ? nextError.body
        : null;
      const conflict = AlbumThemeVersionConflictResponseSchema.safeParse(errorBody);
      if (conflict?.success) {
        const current = conflict.data.current;
        setYears((allYears) => allYears.map((year) => year.year === current.year
          ? { ...year, themeId: current.themeId, themeVersion: current.version }
          : year));
      } else {
        setYears((current) => current.map((year) => year.year === previous.year
          ? { ...year, themeId: previous.themeId, themeVersion: previous.themeVersion }
          : year));
      }
      throw nextError;
    }
  }, [selected]);

  return {
    status,
    error,
    years,
    selectedYear,
    selected,
    selectYear: setSelectedYear,
    reload,
    create,
    update,
    setTheme,
  };
}
