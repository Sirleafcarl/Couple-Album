import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AlbumDetailHeader } from '../components/album-detail-header.js';
afterEach(cleanup);
it('offers only story and garden, displaying legacy film as story', () => {
  render(<AlbumDetailHeader title="旧相册" date="2026-07-09" description="" layout="film" busy={false} sorting={false} onUpload={vi.fn()} onLibrary={vi.fn()} onSort={vi.fn()} onLayout={vi.fn()} />);
  expect(screen.queryByRole('button', { name: '胶片' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '故事书' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '花园' })).toBeInTheDocument();
});
it('keeps actions and layouts without a filler description', () => {
  const upload = vi.fn(), library = vi.fn(), layout = vi.fn();
  render(<AlbumDetailHeader title="周末" date="2026-07-09" description="" layout="story" busy={false} sorting={false} onUpload={upload} onLibrary={library} onSort={vi.fn()} onLayout={layout} />);
  expect(screen.getByRole('heading', { name: '周末' })).toBeInTheDocument();
  expect(screen.queryByText('普通的一天，因为是和你。')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '添加照片' })); expect(upload).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: '从照片库挑选' })); expect(library).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: '花园' })); expect(layout).toHaveBeenCalledWith('garden');
  expect(screen.getByRole('button', { name: '故事书' })).toHaveAttribute('aria-pressed', 'true');
});
