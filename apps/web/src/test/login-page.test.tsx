import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json' },
  });
}

describe('login page', () => {
  it('submits email and password and navigates home on success', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({
          user: {
            id: '10000000-0000-4000-8000-000000000001',
            email: 'alice@example.com',
            displayName: 'Alice',
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({
        years: [{
          year: 2026,
          themeId: 'secret-garden',
          themeVersion: null,
          albums: [{
            id: '30000000-0000-4000-8000-000000000003',
            title: '春日野餐记',
            description: '',
            occurredOn: '2026-03-28',
            year: 2026,
            month: 3,
            coverUrl: null,
            version: 1,
            createdBy: {
              id: '10000000-0000-4000-8000-000000000001',
              displayName: 'Alice',
            },
          }],
        }],
      }));
    vi.stubGlobal('fetch', fetchMock);
    const browser = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    );

    await browser.type(await screen.findByLabelText('邮箱'), 'alice@example.com');
    await browser.type(screen.getByLabelText('密码'), 'correct-password');
    await browser.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByRole('region', { name: '2026 年相册廊' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '照片库' })).toHaveAttribute('href', '/library');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'alice@example.com', password: 'correct-password' }),
      }),
    );
  });

  it('shows a generic Chinese error for invalid credentials', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({}, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const browser = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    );

    await browser.type(await screen.findByLabelText('邮箱'), 'alice@example.com');
    await browser.type(screen.getByLabelText('密码'), 'wrong-password');
    await browser.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('邮箱或密码不正确')).toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor to /login', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, { status: 401 })));
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument();
  });
});
