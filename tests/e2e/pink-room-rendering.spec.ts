import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { requireE2eCredentials } from './environment.js';

// Browser integration, not physical-device GPU/FPS certification.
for (const width of [1440, 390]) {
  test(`real WebGL gallery loads nearby covers, sleeps and remounts at ${width}px`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const metrics = { draws: 0 };
      Object.defineProperty(window, '__galleryTestMetrics', { value: metrics });
      for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        for (const method of ['drawArrays', 'drawElements'] as const) {
          const original = prototype[method];
          Object.defineProperty(prototype, method, { value: function (...args: unknown[]) {
            metrics.draws++;
            return Reflect.apply(original, this, args);
          } });
        }
      }
    });
    const credentials = requireE2eCredentials();
    await page.goto('/login');
    await page.getByLabel('邮箱').fill(credentials.firstEmail);
    await page.getByLabel('密码').fill(credentials.firstPassword);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    const requested = new Set<number>();
    await page.route('**/api/photos/room-perf-*', route => {
      requested.add(Number(route.request().url().split('room-perf-')[1]));
      return route.fulfill({ path: resolve('packages/media/test/fixtures/landscape.jpg'), contentType: 'image/jpeg' });
    });
    await page.route('**/api/albums', route => route.fulfill({ json: { years: [{ year: 2026, themeId: 'kitty-dream', themeVersion: null, albums: Array.from({ length: 90 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, title: `验收相册 ${index + 1}`, occurredOn: '2026-03-28', description: '', month: 3, year: 2026, version: 1,
      coverUrl: `/api/photos/room-perf-${index}`, createdBy: { id: '00000000-0000-4000-8000-000000000099', displayName: '测试' },
    })) }] } }));
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    const canvas = page.locator('.pink-room canvas');
    await expect(canvas).toBeVisible();
    await expect.poll(() => requested.size).toBeGreaterThan(0);
    const draws = () => page.evaluate(() => (window as unknown as { __galleryTestMetrics: { draws: number } }).__galleryTestMetrics.draws);
    await expect.poll(draws).toBeGreaterThan(0);
    // Wait for stable draw counts, rather than treating module loading as a painted scene.
    let previous = -1;
    await expect.poll(async () => { const current = await draws(); const stable = current === previous; previous = current; return stable; }, { intervals: [500, 500, 500], timeout: 15000 }).toBe(true);
    const stableDraws = await draws();
    await page.waitForTimeout(1000);
    expect(await draws()).toBe(stableDraws);
    expect(requested.size).toBeLessThan(30);
    await page.screenshot({ path: info.outputPath(`room-${width}.png`) });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(draws, { timeout: 10000 }).toBeGreaterThan(stableDraws);
    const rect = (await canvas.boundingBox())!;
    const beforeDrag = await draws();
    await page.mouse.move(rect.x + rect.width * .6, rect.y + rect.height * .5);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width * .3, rect.y + rect.height * .5, { steps: 8 });
    await page.mouse.up();
    await expect.poll(draws).toBeGreaterThan(beforeDrag);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const last = page.locator('.pink-room__albums button').last();
    await last.focus();
    await expect.poll(() => requested.has(89)).toBe(true);
    await last.press('Enter');
    await expect(page.getByRole('link', { name: '进入相册' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('link', { name: '进入相册' })).not.toBeVisible();
    await page.goto('/library');
    await expect(canvas).toHaveCount(0);
    await page.goto('/');
    await expect(canvas).toHaveCount(1);
    await expect(canvas).toBeVisible();
    expect(errors).toEqual([]);
    await info.attach('render-check', { body: JSON.stringify({ width, idleDrawCallsAdded: 0, requestedCoverCount: requested.size, physicalDevice: false }), contentType: 'application/json' });
  });
}
