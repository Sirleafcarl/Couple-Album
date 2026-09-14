import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { requireE2eCredentials } from './environment.js';

const ids = ['sacred-joy', 'cloud-candy', 'clear-specimen', 'sky-letters'];
test('approved themes render real photo surfaces and persist valid theme settings', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1024 });
  const credentials = requireE2eCredentials();
  await page.goto('/login');
  await page.getByLabel('邮箱').fill(credentials.firstEmail);
  await page.getByLabel('密码').fill(credentials.firstPassword);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/$/);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const photos = ['picnic', 'coffee', 'hands', 'woodland'];
  await page.route('**/api/photos/theme-*', route => {
    const index = Number(route.request().url().split('theme-')[1]);
    return route.fulfill({ path: resolve(`docs/design-preview/public/assets/${photos[index % 4]}.png`), contentType: 'image/png' });
  });
  let current = ids[0]!;
  await page.route('**/api/albums', route => route.fulfill({ json: { years: [{ year: 2026, themeId: current, themeVersion: null, albums: Array.from({ length: 8 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, title: ['春日野餐', '午后的咖啡', '一束小事', '一起慢慢走'][index % 4], occurredOn: '2026-03-28', description: '普通的一天，因为是和你。', month: 3, year: 2026, version: 1, coverUrl: `/api/photos/theme-${index}`, createdBy: { id: '00000000-0000-4000-8000-000000000099', displayName: '我们' } })) }] } }));
  for (const id of ids) {
    current = id;
    await page.goto('/');
    await expect(page.locator('.album-wall')).toHaveClass(new RegExp(`album-wall--${id}`));
    await expect(page.locator('.modern-album')).toHaveCount(8);
    const bounds = await page.locator('.modern-album').evaluateAll(nodes => nodes.map(node => {
      const card = node.getBoundingClientRect();
      const image = node.querySelector('.modern-album__image')!.getBoundingClientRect();
      return { width: card.width, imageWidth: image.width, bottom: card.bottom };
    }));
    for (const box of bounds) {
      expect(box.width).toBeLessThanOrEqual(210);
      expect(box.imageWidth).toBeLessThanOrEqual(222); // Small intentional pop-card rotation.
      expect(box.bottom).toBeLessThanOrEqual(1024);
    }
    await expect(page.locator('.theme-atmosphere')).toBeHidden();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('.album-corridor__stage')).toHaveAttribute('data-motion', 'running');
    await expect(page.locator('.theme-atmosphere')).toBeVisible();
    expect(await page.locator('.theme-atmosphere i').first().evaluate(node => getComputedStyle(node).animationName)).not.toBe('none');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => page.locator('.modern-album img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    expect((await page.request.get(`/themes/${id}/scene.webp`)).ok()).toBe(true);
    for (let i = 0; i < 4; i++) await expect.poll(() => page.locator('.modern-album img').nth(i).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.locator('.modern-album img').evaluateAll(images => Promise.all(images.slice(0, 4).map(img => (img as HTMLImageElement).decode())));
    await page.screenshot({ path: info.outputPath(`${id}-desktop.png`) });
    await page.getByRole('button', { name: '打开相册：春日野餐', exact: true }).first().click();
    await expect(page.getByRole('link', { name: '进入相册' })).toBeInViewport();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => { const box = await page.locator('.album-corridor__viewport').boundingBox(); return box!.y + box!.height; }).toBeLessThanOrEqual(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await page.locator('.modern-album').first().evaluate(node => node.getBoundingClientRect().width)).toBeLessThanOrEqual(150);
    await page.screenshot({ path: info.outputPath(`${id}-mobile.png`) });
    await page.getByRole('button', { name: '主题', exact: true }).click();
    await expect(page.getByRole('group', { name: '年度主题' })).toBeVisible();
    expect(await page.locator('.theme-choice__text').first().evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThan(100);
    await page.locator('.theme-choice__art img').evaluateAll(images => Promise.all(images.map(img => (img as HTMLImageElement).decode())));
    await page.screenshot({ path: info.outputPath(`${id}-mobile-picker.png`) });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 1024 });
  }
  // Isolated database only: real API accepts and persists every newly added enum.
  let version: number | null = null;
  for (const id of ids) {
    const response = await page.request.put('/api/album-years/2099/theme', { data: { themeId: id, version } });
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.themeId).toBe(id);
    version = body.version;
  }
  expect(errors).toEqual([]);
});
