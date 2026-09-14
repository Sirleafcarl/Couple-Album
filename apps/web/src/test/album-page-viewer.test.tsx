import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AlbumPage } from '../pages/album-page.js';
import { AlbumApiError, getAlbum, removeAlbumPhotos } from '../api/albums.js';
import type { ReactNode } from 'react';

vi.mock('../api/albums.js', async importOriginal => ({ ...await importOriginal<typeof import('../api/albums.js')>(), getAlbum: vi.fn(), removeAlbumPhotos: vi.fn(), getAlbums: vi.fn().mockResolvedValue({ years: [] }) }));
vi.mock('../components/app-shell.js', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('../components/photo-uploader.js', () => ({ PhotoUploader: () => null }));
afterEach(() => { cleanup(); vi.mocked(getAlbum).mockReset(); });
const photo = (id: string) => ({ id, originalFilename: `${id}.jpg`, owner: { id: 'owner', displayName: '我们' }, status: 'ready' as const, width: 1200, height: 800, capturedAt: null, sortAt: '2026-09-10T00:00:00Z', failureCode: null, media: { original: `/api/photos/${id}/original`, preview: `/api/photos/${id}/preview`, thumbnail: `/api/photos/${id}/thumbnail` } });
const detail = { album: { id: 'album', year: 2026, month: 9, title: '相册', description: '', occurredOn: '2026-09-10', coverUrl: null, version: 1, createdBy: { id: 'owner', displayName: '我们' } }, layout: 'story' as const, version: 3, total: 2, items: [photo('a')], nextOffset: 40 };

it('loads the next versioned page inside the viewer and preserves focus on closing', async () => {
  vi.mocked(getAlbum).mockResolvedValueOnce(detail).mockResolvedValueOnce({ ...detail, items: [photo('b')], nextOffset: null });
  render(<MemoryRouter initialEntries={['/albums/album']}><Routes><Route path="/albums/:albumId" element={<AlbumPage />} /></Routes></MemoryRouter>);
  const opener = await screen.findByRole('button', { name: '查看照片：a.jpg' }); opener.focus(); fireEvent.click(opener);
  const viewer = await screen.findByRole('dialog', { name: '照片查看器' });
  fireEvent.click(within(viewer).getByRole('button', { name: '下一张' }));
  expect(await within(viewer).findByAltText('b.jpg')).toBeInTheDocument();
  expect(getAlbum).toHaveBeenLastCalledWith('album', 40, 3);
  fireEvent.click(within(viewer).getByRole('button', { name: '关闭看图' }));
  expect(opener).toHaveFocus();
});

it('shows version conflict in the viewer without replacing or advancing the current photo', async () => {
  vi.mocked(getAlbum).mockResolvedValueOnce(detail).mockRejectedValueOnce(new AlbumApiError('ALBUM_WALL_CONFLICT', 409, null));
  render(<MemoryRouter initialEntries={['/albums/album']}><Routes><Route path="/albums/:albumId" element={<AlbumPage />} /></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: '查看照片：a.jpg' }));
  const viewer = await screen.findByRole('dialog', { name: '照片查看器' });
  fireEvent.click(within(viewer).getByRole('button', { name: '下一张' }));
  await waitFor(() => expect(within(viewer).getByRole('alert')).toHaveTextContent('刷新'));
  expect(within(viewer).getByAltText('a.jpg')).toBeInTheDocument();
});
it('selects only loaded photos, confirms one batch, retains selection on conflict and clears after success', async () => {
  vi.mocked(getAlbum).mockResolvedValue(detail);
  vi.mocked(removeAlbumPhotos).mockRejectedValueOnce(new AlbumApiError('ALBUM_WALL_CONFLICT', 409, null)).mockResolvedValueOnce({ ok: true });
  render(<MemoryRouter initialEntries={['/albums/album']}><Routes><Route path="/albums/:albumId" element={<AlbumPage />} /></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: '整理' }));
  fireEvent.click(screen.getByRole('button', { name: '全选已加载' }));
  expect(screen.getByText('已选 1 / 100 张')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '移除所选（1）' }));
  const dialog = screen.getByRole('dialog', { name: '从相册移除照片' });
  expect(within(dialog).getByText(/照片库原图和其他相册不受影响/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: '确认移除' }));
  await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('刷新'));
  expect(screen.getByRole('checkbox', { name: '选择相册照片 a.jpg' })).toBeChecked();
  fireEvent.click(within(dialog).getByRole('button', { name: '确认移除' }));
  await waitFor(() => expect(screen.getByText('已选 0 / 100 张')).toBeInTheDocument());
  expect(removeAlbumPhotos).toHaveBeenLastCalledWith('album', ['a'], 3);
});
