import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AlbumPhotoPickerDialog } from '../components/album-photo-picker-dialog.js';

vi.mock('../api/photos.js', () => ({ getPhotos: vi.fn().mockResolvedValue({ items: [], nextCursor: null }) }));
afterEach(cleanup);

it('opens a modal picker with close and Escape support, returning focus on unmount', async () => {
  const opener = document.createElement('button'); document.body.append(opener); opener.focus();
  const close = vi.fn();
  const { unmount } = render(<AlbumPhotoPickerDialog albumId="album" onClose={close} onAdded={vi.fn()} />);
  const dialog = screen.getByRole('dialog', { name: '从照片库挑选' });
  expect(dialog).toHaveAttribute('open');
  expect(screen.getByRole('button', { name: '关闭照片选择' })).toHaveFocus();
  await waitFor(() => expect(screen.getByText('这里还没有照片，可以先从本地上传。')).toBeInTheDocument());
  fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
  expect(close).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: '关闭照片选择' }));
  expect(close).toHaveBeenCalledTimes(2);
  unmount(); expect(opener).toHaveFocus(); opener.remove();
});
