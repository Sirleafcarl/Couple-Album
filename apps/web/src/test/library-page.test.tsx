import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app.js';

const me = { id: '10000000-0000-4000-8000-000000000001', email: 'alice@example.com', displayName: 'Alice' };
const partnerId = '20000000-0000-4000-8000-000000000002';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function photo(
  id: string,
  status: 'ready' | 'processing' | 'failed',
  owner: { id: string; displayName: string } = { id: me.id, displayName: me.displayName },
) {
  return {
    id, owner, originalFilename: `${id}.jpg`, status,
    width: status === 'ready' ? 1200 : null,
    height: status === 'ready' ? 800 : null,
    capturedAt: null,
    sortAt: '2026-09-02T08:00:00.000Z',
    failureCode: status === 'failed' ? 'INVALID_IMAGE' : null,
    media: {
      original: `/api/photos/${id}/media/original`,
      preview: status === 'ready' ? `/api/photos/${id}/media/preview` : null,
      thumbnail: status === 'ready' ? `/api/photos/${id}/media/thumbnail` : null,
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderLibrary(fetchMock: typeof fetch) {
  vi.stubGlobal('fetch', fetchMock);
  render(<MemoryRouter initialEntries={['/library']}><App /></MemoryRouter>);
}

describe('library page', () => {
  it('shows a loading state while the first photo page is pending', async () => {
    const pending = new Promise<Response>(() => undefined);
    renderLibrary(vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ user: me }))
      .mockReturnValueOnce(pending));
    expect(await screen.findByText('正在整理照片…')).toBeInTheDocument();
  });

  it('shows empty and retryable error states', async () => {
    const browser = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ user: me }))
      .mockResolvedValueOnce(json({ error: 'unavailable' }, 503))
      .mockResolvedValueOnce(json({ items: [], nextCursor: null }));
    renderLibrary(fetchMock);
    expect(await screen.findByText('照片暂时没有加载出来')).toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByText('照片库还是空的')).toBeInTheDocument();
  });

  it('renders ready, processing, and failed cards with accessible ownership labels', async () => {
    renderLibrary(vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ user: me }))
      .mockResolvedValueOnce(json({
        items: [
          photo('30000000-0000-4000-8000-000000000003', 'ready'),
          photo('40000000-0000-4000-8000-000000000004', 'processing', { id: partnerId, displayName: 'Bob' }),
          photo('50000000-0000-4000-8000-000000000005', 'failed'),
        ],
        nextCursor: null,
      })));

    expect(await screen.findByRole('img', { name: 'Alice 上传的照片' })).toHaveAttribute('loading', 'lazy');
    expect(screen.getByText('正在处理')).toBeInTheDocument();
    expect(screen.getByText('处理失败')).toBeInTheDocument();
    expect(screen.getByText('Bob 的照片')).toBeInTheDocument();
  });

  it('filters all, mine, and partner photos through bounded API requests', async () => {
    const browser = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ user: me }))
      .mockResolvedValueOnce(json({ items: [photo('30000000-0000-4000-8000-000000000003', 'ready')], nextCursor: null }))
      .mockResolvedValueOnce(json({ items: [], nextCursor: null }))
      .mockResolvedValueOnce(json({ items: [], nextCursor: null }));
    renderLibrary(fetchMock);
    await screen.findByText('Alice 的照片');
    await browser.click(screen.getByRole('button', { name: '我的照片' }));
    await browser.click(await screen.findByRole('button', { name: 'TA 的照片' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/photos?owner=me&limit=40', expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/photos?owner=partner&limit=40', expect.objectContaining({ credentials: 'include' }));
  });

  it('navigates next and previous cursor pages without exceeding 40 items', async () => {
    const browser = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ user: me }))
      .mockResolvedValueOnce(json({ items: [photo('30000000-0000-4000-8000-000000000003', 'ready')], nextCursor: 'next-token' }))
      .mockResolvedValueOnce(json({ items: [photo('40000000-0000-4000-8000-000000000004', 'ready')], nextCursor: null }));
    renderLibrary(fetchMock);
    await browser.click(await screen.findByRole('button', { name: '下一页' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/photos?owner=all&limit=40&cursor=next-token', expect.anything());
    await browser.click(await screen.findByRole('button', { name: '上一页' }));
    expect(await screen.findByText('30000000-0000-4000-8000-000000000003.jpg')).toBeInTheDocument();
  });

  it('shows a recoverable error when a later cursor page fails', async () => {
    const browser = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ user: me }))
      .mockResolvedValueOnce(json({ items: [photo('30000000-0000-4000-8000-000000000003', 'ready')], nextCursor: 'next-token' }))
      .mockResolvedValueOnce(json({ error: 'unavailable' }, 503));
    renderLibrary(fetchMock);
    await browser.click(await screen.findByRole('button', { name: '下一页' }));

    expect(await screen.findByText('照片暂时没有加载出来')).toBeInTheDocument();
  });

  it('refreshes the displayed cursor page without returning to page one', async () => {
    vi.useFakeTimers();
    const secondId = '40000000-0000-4000-8000-000000000004';
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ user: me }))
      .mockResolvedValueOnce(json({ items: [photo('30000000-0000-4000-8000-000000000003', 'ready')], nextCursor: 'next-token' }))
      .mockResolvedValueOnce(json({ items: [photo(secondId, 'processing')], nextCursor: null }))
      .mockResolvedValueOnce(json({ items: [photo(secondId, 'ready')], nextCursor: null }));
    renderLibrary(fetchMock);
    await vi.waitFor(() => expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await vi.waitFor(() => expect(screen.getByText('正在处理')).toBeInTheDocument());

    await act(() => vi.advanceTimersByTimeAsync(3000));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/photos?owner=all&limit=40&cursor=next-token',
      expect.anything(),
    ));
    await vi.waitFor(() => expect(screen.getByRole('img', { name: 'Alice 上传的照片' })).toBeInTheDocument());
    expect(screen.getByText('第 2 页')).toBeInTheDocument();
  });
});
