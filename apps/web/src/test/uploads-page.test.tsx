import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UploadsPage } from '../pages/uploads-page.js';

const getUploads = vi.fn();
vi.mock('../api/albums.js', () => ({ getAlbums: async () => ({ years: [] }) }));
vi.mock('../api/photos.js', () => ({
  getUploads: (...args: unknown[]) => getUploads(...args),
  uploadPhoto: vi.fn(),
}));

function upload(id: string, status: 'receiving' | 'committed' | 'duplicate' | 'failed') {
  return {
    id,
    originalFilename: `${status}.jpg`,
    status,
    bytesReceived: 2048,
    errorCode: status === 'failed' ? 'UNSUPPORTED_IMAGE' : null,
    photoId: status === 'committed' ? '90000000-0000-4000-8000-000000000009' : null,
    createdAt: '2026-09-02T08:00:00.000Z',
  };
}

afterEach(() => {
  cleanup();
  getUploads.mockReset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('uploads page', () => {
  it('shows recent uploads with understandable statuses', async () => {
    getUploads.mockResolvedValue({ items: [
      upload('10000000-0000-4000-8000-000000000001', 'receiving'),
      upload('20000000-0000-4000-8000-000000000002', 'committed'),
      upload('30000000-0000-4000-8000-000000000003', 'duplicate'),
      upload('40000000-0000-4000-8000-000000000004', 'failed'),
    ] });
    render(<MemoryRouter><UploadsPage /></MemoryRouter>);

    expect(await screen.findByText('正在接收')).toBeInTheDocument();
    expect(screen.getByText('已进入照片库')).toBeInTheDocument();
    expect(screen.getByText('重复照片')).toBeInTheDocument();
    expect(screen.getByText('上传失败')).toBeInTheDocument();
    expect(screen.getByText('文件不是支持的图片格式')).toBeInTheDocument();
    expect(screen.queryByText('UNSUPPORTED_IMAGE')).not.toBeInTheDocument();
    expect(screen.getAllByText('2 KB')).toHaveLength(4);
  });

  it('shows an empty state and can retry a failed history request', async () => {
    getUploads.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ items: [] });
    const browser = userEvent.setup();
    render(<MemoryRouter><UploadsPage /></MemoryRouter>);

    expect(await screen.findByText('上传记录暂时没有加载出来')).toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: '重新加载记录' }));
    expect(await screen.findByText('还没有上传记录')).toBeInTheDocument();
  });

  it('polls while a visible upload is receiving and stops once settled', async () => {
    vi.useFakeTimers();
    getUploads
      .mockResolvedValueOnce({ items: [upload('10000000-0000-4000-8000-000000000001', 'receiving')] })
      .mockResolvedValueOnce({ items: [upload('10000000-0000-4000-8000-000000000001', 'committed')] });
    render(<MemoryRouter><UploadsPage /></MemoryRouter>);
    await vi.waitFor(() => expect(screen.getByText('正在接收')).toBeInTheDocument());

    await act(() => vi.advanceTimersByTimeAsync(3000));
    await vi.waitFor(() => expect(getUploads).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(screen.getByText('已进入照片库')).toBeInTheDocument());
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(getUploads).toHaveBeenCalledTimes(2);
  });

  it('does not poll while the page is hidden', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    getUploads.mockResolvedValue({
      items: [upload('10000000-0000-4000-8000-000000000001', 'receiving')],
    });
    render(<MemoryRouter><UploadsPage /></MemoryRouter>);
    await vi.waitFor(() => expect(screen.getByText('正在接收')).toBeInTheDocument());

    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(getUploads).toHaveBeenCalledTimes(1);
  });
});
