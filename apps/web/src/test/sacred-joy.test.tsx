import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ModernCorridorScene } from '../album-wall/modern-corridor-scene.js';
import { AlbumPreviewDialog } from '../album-wall/album-preview-dialog.js';
import { albumWallThemes } from '../album-wall/album-wall-themes.js';

const album = { id: 'memory', title: '一起看日落', occurredOn: '2026-09-09', description: '我们的日常', month: 9, year: 2026, version: 1, coverUrl: '/real-cover.webp', createdBy: { id: 'owner', displayName: '我们' } };
afterEach(cleanup);

it('gives sacred albums decorative cloud supports without replacing photos or interactions', () => {
  const onOpen = vi.fn();
  const { container, rerender } = render(<ModernCorridorScene albums={[album]} theme={albumWallThemes['sacred-joy']} height={500} viewportWidth={1000} onOpen={onOpen} />);
  expect(container.querySelector('.sacred-album__halo')).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelector('.sacred-album__cloud')).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelector('img')).toHaveAttribute('src', '/real-cover.webp');
  const button = screen.getByRole('button', { name: '打开相册：一起看日落' });
  fireEvent.click(button); expect(onOpen).toHaveBeenCalledWith(album, button);
  rerender(<ModernCorridorScene albums={[album]} theme={albumWallThemes['clear-specimen']} height={500} viewportWidth={1000} onOpen={onOpen} />);
  expect(container.querySelector('.sacred-album__halo')).toBeNull();
});

it('uses sacred exhibition copy while preserving the preview controls', () => {
  const onClose = vi.fn();
  render(<AlbumPreviewDialog album={album} themeId="sacred-joy" onClose={onClose} onEdit={vi.fn()} />);
  expect(screen.getByRole('dialog')).toHaveAttribute('data-preview-theme', 'sacred-joy');
  expect(screen.getByText('平凡的一天，也值得被加冕')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '进入相册' })).toHaveAttribute('href', '/albums/memory');
  fireEvent.click(screen.getByRole('button', { name: '关闭相册预览' })); expect(onClose).toHaveBeenCalledOnce();
});
