import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it('never intercepts API, media, mutations or cross-origin requests', () => {
  const handlers: Record<string, (event: any) => void> = {};
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://gallery.test' }, addEventListener: (key: string, fn: any) => { handlers[key] = fn; } }, URL,
  });
  for (const [url, method, mode] of [
    ['/api/photos/1', 'GET', 'navigate'], ['/api', 'GET', 'navigate'],
    ['/api/uploads', 'POST', 'cors'], ['/icons/icon-192.png', 'GET', 'no-cors'],
    ['https://other.test/', 'GET', 'navigate'],
  ]) {
    const respondWith = vi.fn();
    handlers.fetch!({ request: { url: new URL(url!, 'https://gallery.test').href, method, mode }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  }
});

it('preloads only a public offline page', async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const addAll = vi.fn().mockResolvedValue(undefined);
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { addEventListener: (key: string, fn: any) => { handlers[key] = fn; } },
    caches: { open: vi.fn().mockResolvedValue({ addAll }) },
  });
  let pending: Promise<unknown> | undefined;
  handlers.install!({ waitUntil: (value: Promise<unknown>) => { pending = value; } });
  await pending;
  expect(addAll).toHaveBeenCalledWith(['/offline.html']);
});
