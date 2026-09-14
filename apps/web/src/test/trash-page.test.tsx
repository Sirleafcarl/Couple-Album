import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../app.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const id = '30000000-0000-4000-8000-000000000003';
function response(body: unknown) { return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }); }
it('lists recoverable photos and restores without permanent delete controls', async () => {
  let restored = false;
  const fetchMock = vi.fn<typeof fetch>(async (url, options) => {
    if (String(url) === '/api/auth/session') return response({ user: { id, email: 'test@example.com', displayName: 'Test' } });
    if (options?.method === 'POST') { restored = true; return new Response(null, { status: 204 }); }
    return response({ items: restored ? [] : [{ id, originalFilename: '旅行.jpg', deletedAt: '2026-09-09T00:00:00Z', expiresAt: '2026-10-09T00:00:00Z', thumbnail: null }], nextCursor: null, serverNow: '2026-09-09T00:00:00Z' });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<MemoryRouter initialEntries={['/trash']}><App /></MemoryRouter>);
  expect(await screen.findByText('旅行.jpg')).toBeInTheDocument();
  expect(screen.getByText('剩余 30 天')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /彻底删除|清空/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '恢复 旅行.jpg' }));
  expect(await screen.findByText('回收站是空的')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(`/api/trash/${id}/restore`, expect.objectContaining({ method: 'POST' }));
});
