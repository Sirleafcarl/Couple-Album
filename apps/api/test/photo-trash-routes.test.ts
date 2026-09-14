import { expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createUnusedDependencies } from './test-dependencies.js';

const id = '10000000-0000-4000-8000-000000000001';
const owner = '20000000-0000-4000-8000-000000000002';
const now = new Date('2026-09-09T00:00:00Z');
const headers = { cookie: 'memory_session=token', origin: 'http://localhost:5173' };
function setup(authenticated = true) {
  const base = createUnusedDependencies();
  const trash = {
    moveToTrash: vi.fn(async () => 'ok' as const),
    restore: vi.fn(async () => 'expired' as const),
    list: vi.fn(async () => ({ items: [], nextCursor: null })),
    findMedia: vi.fn(async () => null),
  };
  const app = buildApp({ ...base, trash, clock: () => now, sessions: { ...base.sessions, async findActiveByTokenHash() { return authenticated ? { id: owner, email: 'test@example.com', displayName: 'Test' } : null; } } });
  return { app, trash };
}
it('requires authentication before trash access or mutation', async () => {
  const { app, trash } = setup(false);
  for (const [method, url] of [['GET', '/api/trash'], ['DELETE', `/api/photos/${id}`], ['POST', `/api/trash/${id}/restore`]] as const) {
    expect((await app.inject({ method, url, headers })).statusCode).toBe(401);
  }
  expect(trash.moveToTrash).not.toHaveBeenCalled();
  await app.close();
});
it('passes only authenticated owner and server time to mutations', async () => {
  const { app, trash } = setup();
  expect((await app.inject({ method: 'DELETE', url: `/api/photos/${id}`, headers })).statusCode).toBe(204);
  expect(trash.moveToTrash).toHaveBeenCalledWith(id, owner, expect.any(Function));
  expect((await app.inject({ method: 'POST', url: `/api/trash/${id}/restore`, headers })).statusCode).toBe(410);
  expect(trash.restore).toHaveBeenCalledWith(id, owner, expect.any(Function), expect.any(Function));
  await app.close();
});
it('rejects invalid cursors and foreign thumbnail IDs without exposing paths', async () => {
  const { app, trash } = setup();
  expect((await app.inject({ url: '/api/trash?cursor=bad', headers })).statusCode).toBe(400);
  expect(trash.list).not.toHaveBeenCalled();
  const result = await app.inject({ url: `/api/trash/${id}/thumbnail`, headers });
  expect(result.statusCode).toBe(404);
  expect(trash.findMedia).toHaveBeenCalledWith(id, owner, now);
  await app.close();
});
