// Isolated browser smoke test: no database, account or real photos.
// Start `pnpm --filter @memory/web exec vite preview --host 127.0.0.1 --port 25174 --strictPort` first.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  // The auth request is handled in memory; the real API is never contacted.
  await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"UNAUTHORIZED"}' }));
  await page.goto('http://127.0.0.1:25174/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    return Promise.all(keys.map(async key => ({ key, urls: (await (await caches.open(key)).keys()).map(r => new URL(r.url).pathname) })));
  });
  assert.deepEqual(cached, [{ key: 'love-gallery-offline-v1', urls: ['/offline.html'] }]);
  await context.setOffline(true);
  await page.goto('http://127.0.0.1:25174/albums/offline-check');
  assert.equal(await page.title(), '恋爱画廊 · 暂时离线');
  assert.equal(await page.getByRole('button', { name: '重新连接' }).count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await context.setOffline(false);
  await page.getByRole('button', { name: '重新连接' }).click();
  await page.waitForFunction(() => document.title === '恋爱画廊');
  console.log('Production SW: public-only cache, offline deep link, mobile width, reconnect passed.');
  await context.close();
} finally { await browser.close(); }
