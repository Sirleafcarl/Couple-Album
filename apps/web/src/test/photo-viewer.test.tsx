import type { PhotoSummary } from '@memory/contracts/photos';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PhotoViewer } from '../components/photo-viewer.js';

const photo = (id: string): PhotoSummary => ({ id, originalFilename: `${id}.jpg`, owner: { id: 'owner', displayName: '我们' }, status: 'ready', width: 1200, height: 800, capturedAt: null, sortAt: '2026-09-10T00:00:00Z', failureCode: null, media: { original: `/api/photos/${id}/original`, preview: `/api/photos/${id}/preview`, thumbnail: null } });
afterEach(cleanup);
const defaults = () => ({ photos: [photo('a'), photo('b')], initialId: 'a', total: 2, hasMore: false, loadMore: vi.fn(), onClose: vi.fn() });

it('navigates with keyboard, disables boundaries, resets zoom and uses previews only', async () => {
  render(<PhotoViewer {...defaults()} />);
  expect(screen.getByRole('button', { name: '上一张' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '放大' }));
  expect(screen.getByRole('button', { name: '复位缩放' })).toHaveTextContent('150%');
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
  expect(await screen.findByAltText('b.jpg')).toHaveAttribute('src', '/api/photos/b/preview');
  expect(screen.getByRole('button', { name: '下一张' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '复位缩放' })).toHaveTextContent('100%');
  expect(screen.getByText('2 / 2')).toBeInTheDocument();
});

it('retains current photo on pagination failure and advances after retry', async () => {
  const props = { ...defaults(), photos: [photo('a')], hasMore: true, loadMore: vi.fn().mockRejectedValueOnce(new Error('更多照片没有加载出来，请重试。')).mockResolvedValueOnce([photo('b')]) };
  const { rerender } = render(<PhotoViewer {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '下一张' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('更多照片没有加载出来');
  expect(screen.getByAltText('a.jpg')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '下一张' }));
  await waitFor(() => expect(props.loadMore).toHaveBeenCalledTimes(2));
  rerender(<PhotoViewer {...props} photos={[photo('a'), photo('b')]} hasMore={false} />);
  expect(await screen.findByAltText('b.jpg')).toBeInTheDocument();
});

it('shows retry for broken preview and keeps original as an explicit download', () => {
  render(<PhotoViewer {...defaults()} />);
  fireEvent.error(screen.getByAltText('a.jpg'));
  expect(screen.getByRole('button', { name: '重试预览' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '下载原图' })).toHaveAttribute('href', '/api/photos/a/original');
  fireEvent.click(screen.getByRole('button', { name: '重试预览' }));
  expect(screen.getByText('正在加载照片…')).toBeInTheDocument();
});

it('locks scrolling and returns focus on close; supports Escape', () => {
  const opener = document.createElement('button'); document.body.append(opener); opener.focus();
  const props = defaults();
  const { unmount } = render(<PhotoViewer {...props} />);
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  expect(props.onClose).toHaveBeenCalledOnce();
  unmount(); expect(opener).toHaveFocus(); expect(document.body.style.overflow).not.toBe('hidden'); opener.remove();
});

it('swipes at fit scale, but pans instead of navigating when zoomed', async () => {
  render(<PhotoViewer {...defaults()} />);
  const stage = screen.getByTestId('photo-viewer-stage');
  fireEvent.touchStart(stage, { touches: [{ clientX: 200, clientY: 100 }] });
  fireEvent.touchMove(stage, { touches: [{ clientX: 70, clientY: 100 }] });
  fireEvent.touchEnd(stage, { touches: [], changedTouches: [{ clientX: 70, clientY: 100 }] });
  expect(await screen.findByAltText('b.jpg')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '放大' }));
  fireEvent.touchStart(stage, { touches: [{ clientX: 70, clientY: 100 }] });
  fireEvent.touchMove(stage, { touches: [{ clientX: 200, clientY: 100 }] });
  fireEvent.touchEnd(stage, { touches: [], changedTouches: [{ clientX: 200, clientY: 100 }] });
  expect(screen.getByAltText('b.jpg')).toBeInTheDocument();
});

it('clamps pinch zoom to four times and resets it', () => {
  render(<PhotoViewer {...defaults()} />);
  const stage = screen.getByTestId('photo-viewer-stage');
  fireEvent.touchStart(stage, { touches: [{ clientX: 0, clientY: 0 }, { clientX: 10, clientY: 0 }] });
  fireEvent.touchMove(stage, { touches: [{ clientX: 0, clientY: 0 }, { clientX: 100, clientY: 0 }] });
  expect(screen.getByRole('button', { name: '复位缩放' })).toHaveTextContent('400%');
  fireEvent.click(screen.getByRole('button', { name: '复位缩放' }));
  expect(screen.getByRole('button', { name: '复位缩放' })).toHaveTextContent('100%');
});
