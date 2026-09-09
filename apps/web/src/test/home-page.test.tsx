import type { AlbumSummary, AlbumYear } from '@memory/contracts/albums';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app.js';

const me = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'alice@example.com',
  displayName: 'Alice',
};

const album: AlbumSummary = {
  id: '30000000-0000-4000-8000-000000000003',
  title: '真实的春日', description: '风很轻。', occurredOn: '2026-03-28',
  year: 2026, month: 3, coverUrl: null, version: 1,
  createdBy: { id: me.id, displayName: me.displayName },
};

const years: AlbumYear[] = [{
  year: 2025, themeId: 'love-letters', themeVersion: 1,
  albums: [{ ...album, id: '30000000-0000-4000-8000-000000000005', title: '去年的信',
    occurredOn: '2025-02-14', year: 2025, month: 2 }],
}, {
  year: 2026, themeId: 'secret-garden', themeVersion: null, albums: [album],
}];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

function renderApp(fetchMock: typeof fetch) {
  vi.stubGlobal('fetch', fetchMock);
  return render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('album wall home page', () => {
  it('opens real shared years with timer, navigation, music, and year controls', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === '/api/auth/session') return json({ user: me });
      if (url === '/api/albums') return json({ years });
      throw new Error(`Unexpected request: ${url}`);
    });
    const browser = userEvent.setup();
    renderApp(fetchMock);

    expect(await screen.findByText('设置纪念日后，在这里记录我们的时间')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: '2026 年相册廊' })).toBeInTheDocument();
    expect(screen.getByText('真实的春日')).toBeInTheDocument();
    expect(screen.queryByText('雨天的咖啡馆')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '照片库' })).toHaveAttribute('href', '/library');
    expect(screen.getByRole('link', { name: '上传中心' })).toHaveAttribute('href', '/uploads');
    expect(screen.getByText('音乐功能尚未接入')).toBeInTheDocument();

    await browser.click(screen.getByRole('button', { name: '查看 2025 年' }));
    expect(screen.getByRole('region', { name: '2025 年相册廊' })).toBeInTheDocument();
    expect(screen.getByText('去年的信')).toBeInTheDocument();
  });

  it('renders loading, retryable error, and romantic empty states', async () => {
    let resolveAlbums!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === '/api/auth/session') return json({ user: me });
      if (url === '/api/albums') return new Promise((resolve) => { resolveAlbums = resolve; });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderApp(fetchMock);
    expect(await screen.findByText('正在打开我们的故事…')).toBeInTheDocument();
    await act(async () => resolveAlbums(json({ error: 'TEMPORARY' }, 500)));
    expect(await screen.findByRole('alert')).toHaveTextContent('相册暂时没有打开');

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/albums') return json({ years: [] });
      if (url === '/api/auth/session') return json({ user: me });
      throw new Error(`Unexpected request: ${url}`);
    });
    await userEvent.click(screen.getByRole('button', { name: '再试一次' }));
    expect(await screen.findByText('这里还没有相册')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '写下第一段回忆' })).toBeInTheDocument();
  });

  it('creates, edits across years, and persists the selected annual theme', async () => {
    const created = { ...album, title: '夜晚散步', occurredOn: '2026-09-07', month: 9 };
    const moved = { ...created, occurredOn: '2025-09-07', year: 2025, month: 9, version: 2 };
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/auth/session') return json({ user: me });
      if (url === '/api/albums' && (!init || init.method === 'GET')) return json({ years: [] });
      if (url === '/api/albums' && init?.method === 'POST') return json(created, 201);
      if (url === `/api/albums/${album.id}` && init?.method === 'PATCH') return json(moved);
      if (url === '/api/album-years/2026/theme' && init?.method === 'PUT') {
        return json({ year: 2026, themeId: 'love-letters', version: 1 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const browser = userEvent.setup();
    renderApp(fetchMock);
    await screen.findByText('这里还没有相册');

    await browser.click(screen.getByRole('button', { name: '写下第一段回忆' }));
    await browser.type(screen.getByLabelText('相册名称'), '夜晚散步');
    fireEvent.change(screen.getByLabelText('发生日期'), { target: { value: '2026-09-07' } });
    await browser.click(screen.getByRole('button', { name: '创建相册' }));
    expect(await screen.findByText('夜晚散步')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: '切换到共同情书主题' })).not.toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: '主题' }));
    await browser.click(screen.getByRole('button', { name: '切换到共同情书主题' }));
    expect(screen.queryByRole('button', { name: '切换到共同情书主题' })).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('album-wall--love-letters');
    expect(fetchMock).toHaveBeenCalledWith('/api/album-years/2026/theme', expect.objectContaining({
      method: 'PUT', body: JSON.stringify({ themeId: 'love-letters', version: null }),
    }));

    await browser.click(screen.getByRole('button', { name: '打开相册：夜晚散步' }));
    await browser.click(screen.getByRole('button', { name: '编辑相册' }));
    fireEvent.change(screen.getByLabelText('发生日期'), { target: { value: '2025-09-07' } });
    await browser.click(screen.getByRole('button', { name: '保存修改' }));
    expect(await screen.findByRole('region', { name: '2025 年相册廊' })).toBeInTheDocument();
  });
});
