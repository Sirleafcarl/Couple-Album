import { expect, test } from '@playwright/test';
import { requireE2eCredentials } from './environment.js';
import { randomUUID } from 'node:crypto';

test('spine and modal navigation fit desktop, tablet and phone', async ({ page }, info) => {
  const credentials = requireE2eCredentials();
  await page.goto('/login');
  await page.getByLabel('邮箱').fill(credentials.firstEmail);
  await page.getByLabel('密码').fill(credentials.firstPassword);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/$/);
  for (const [width, height, spineWidth] of [[1440, 1024, 180], [834, 1194, 72], [390, 844, 0], [390, 500, 0]]) {
    await page.setViewportSize({ width: width!, height: height! });
    const bounds = await page.locator('.album-wall').boundingBox();
    expect(bounds!.x).toBe(spineWidth);
    expect(bounds!.width).toBe(width! - spineWidth!);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width!);
    if (width! < 1200) {
      const opener = page.getByRole('button', { name: '打开导航' });
      await expect(opener).toBeInViewport();
      await opener.click();
      await expect(page.getByRole('dialog', { name: '主要导航' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: '主要导航' })).not.toBeVisible();
      await expect(opener).toBeFocused();
      await opener.click();
      await page.getByRole('dialog').getByRole('link', { name: '照片库' }).click();
      await expect(page).toHaveURL(/\/library$/);
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await expect(page.getByRole('button', { name: '打开导航' })).toBeInViewport();
      await page.goto('/');
      await expect(page.locator('.album-wall')).toBeVisible();
    }
    await page.screenshot({ path: info.outputPath(`spine-${width}-${height}.png`), fullPage: true });
  }
});

test('multiple albums actually drift and stop for pointer interaction', async ({ page }, info) => {
  const credentials = requireE2eCredentials();
  await page.goto('/login');
  await page.getByLabel('邮箱').fill(credentials.firstEmail);
  await page.getByLabel('密码').fill(credentials.firstPassword);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.route('**/api/albums', (route) => route.fulfill({ json: { years: [{ year: 2026, themeId: 'secret-garden', themeVersion: 1,
    albums: Array.from({ length: 6 }, (_, index) => ({ id: randomUUID(), title: `一起走过的第 ${index + 1} 天`, description: '浏览器布局验收示例，不保存到服务器。', occurredOn: '2026-03-28', year: 2026, month: 3, coverUrl: null, version: 1, createdBy: { id: randomUUID(), displayName: 'First' } })),
  }] } }));
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.mouse.move(10, 10);
  await page.goto('/');
  const track = page.locator('.album-corridor__viewport');
  await expect(track).toHaveCSS('scrollbar-width', 'none');
  await expect.poll(() => track.evaluate((node) => node.scrollLeft)).toBeGreaterThan(2);
  await page.getByRole('button', { name: '打开相册：一起走过的第 1 天' }).hover({ force: true });
  await expect(page.getByRole('button', { name: /继续漫游|暂停漫游|回到起点/ })).toHaveCount(0);
  const paused = await track.evaluate((node) => node.scrollLeft);
  await page.screenshot({ path: info.outputPath('six-albums-desktop.png'), fullPage: true });
  expect(await track.evaluate((node) => node.scrollLeft)).toBe(paused);
  await expect.poll(() => track.evaluate((node) => node.scrollLeft), { timeout: 8000 }).toBeGreaterThan(paused + 1);
  for (const [width, height] of [[1440, 900], [834, 1194], [390, 844]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await expect.poll(async () => { const box = await track.boundingBox(); return box!.y + box!.height; }).toBeLessThanOrEqual(height!);
    await page.screenshot({ path: info.outputPath(`compact-${width}.png`), fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.corridor-breeze')).toBeHidden();
});
