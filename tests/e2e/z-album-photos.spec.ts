import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDatabase, photos } from '../../packages/db/src/index.js';
import { E2E_DATABASE_URL, E2E_WEB_ORIGIN, requireE2eCredentials } from './environment.js';

const credentials = requireE2eCredentials();
test('real shared album upload, duplicate reuse, layout, ordering and reference removal survive reload', async ({ page, browser }) => {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill(credentials.firstEmail);
  await page.getByLabel('密码').fill(credentials.firstPassword);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const created = await page.request.post('/api/albums', { data: { title: '真实的约会相册', occurredOn: '2026-09-08' }, headers: { origin: E2E_WEB_ORIGIN } });
  expect(created.ok()).toBe(true);
  const album = await created.json() as { id: string };
  await page.goto(`/albums/${album.id}`);
  await page.getByRole('button', { name: '添加第一张照片' }).click();
  await page.getByLabel('选择照片', { exact: true }).setInputFiles(resolve('packages/media/test/fixtures/portrait.png'));
  await expect(page.getByText('已加入相册', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '收起添加区' }).click();
  await expect(page.locator('.wall-photo img')).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator('.wall-photo')).toHaveCount(1);
  await page.getByRole('button', { name: '花园', exact: true }).click();
  await expect(page.getByRole('button', { name: '花园', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: '花园', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '添加照片', exact: true }).click();
  await page.getByLabel('选择照片', { exact: true }).setInputFiles(resolve('packages/media/test/fixtures/portrait.png'));
  await page.getByRole('button', { name: '使用已有照片' }).click();
  await expect(page.getByText('已加入相册', { exact: true })).toBeVisible();
  await expect(page.locator('.wall-photo')).toHaveCount(1);

  const partnerContext = await browser.newContext();
  const partner = await partnerContext.newPage();
  try {
    await partner.goto('/login');
    await partner.getByLabel('邮箱').fill(credentials.partnerEmail);
    await partner.getByLabel('密码').fill(credentials.partnerPassword);
    await partner.getByRole('button', { name: '登录', exact: true }).click();
    await expect(partner).toHaveURL(/\/$/);
    await partner.goto(`/albums/${album.id}`);
    await expect(partner.locator('.wall-photo')).toHaveCount(1);
    await partner.getByRole('button', { name: '添加照片', exact: true }).click();
    await partner.getByLabel('选择照片', { exact: true }).setInputFiles(resolve('packages/media/test/fixtures/landscape.jpg'));
    await expect(partner.getByText('已加入相册', { exact: true })).toBeVisible();
    await partner.getByRole('button', { name: '收起添加区' }).click();
    await expect(partner.locator('.wall-photo img')).toHaveCount(2, { timeout: 20_000 });
    await partner.getByRole('button', { name: '整理', exact: true }).click();
    await partner.getByRole('button', { name: '向前移动 landscape.jpg' }).click();
    await expect(partner.locator('.wall-photo').first()).toContainText('landscape.jpg');
    await page.reload();
    await expect(page.locator('.wall-photo').first()).toContainText('landscape.jpg');
    await partner.getByRole('button', { name: '从相册移除 portrait.png' }).click();
    await partner.getByRole('button', { name: '确认移除' }).click();
    await expect(partner.locator('.wall-photo')).toHaveCount(1);
    const library = await page.request.get('/api/photos?owner=me&limit=100');
    const items = (await library.json()).items as Array<{ originalFilename: string; owner: { id: string }; media: { original: string } }>;
    expect(items.some(photo => photo.originalFilename === 'portrait.png')).toBe(true);
    expect((await page.request.get(items.find(photo => photo.originalFilename === 'portrait.png')!.media.original)).ok()).toBe(true);
    await partner.getByRole('button', { name: '添加照片', exact: true }).click();
    await partner.getByRole('button', { name: '对方的照片', exact: true }).click();
    await partner.getByRole('checkbox', { name: '选择 portrait.png', exact: true }).check();
    await partner.getByRole('button', { name: '加入相册（1）', exact: true }).click();
    await expect(partner.locator('.wall-photo')).toHaveCount(2);
    await partner.reload();
    await expect(partner.locator('.wall-photo')).toHaveCount(2);
  } finally { await partnerContext.close(); }
});

test('200 stored photo records browse in batches across all layouts and viewport sizes', async ({ page }, testInfo) => {
  if (!new URL(E2E_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Test database required');
  await page.goto('/login');
  await page.getByLabel('邮箱').fill(credentials.firstEmail);
  await page.getByLabel('密码').fill(credentials.firstPassword);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const response = await page.request.post('/api/albums', { headers: { origin: E2E_WEB_ORIGIN }, data: { title: '两百张回忆', occurredOn: '2026-09-08' } });
  const album = await response.json() as { id: string };
  const database = createDatabase(E2E_DATABASE_URL);
  let ids: string[];
  try {
    const source = await database.db.query.photos.findFirst({ where: (photo, { eq }) => eq(photo.status, 'ready') });
    if (!source) throw new Error('Processed fixture photo required');
    // Reuse fixture media bytes, exercise 200 real database records and DOM entries.
    ids = (await database.db.insert(photos).values(Array.from({ length: 200 }, (_, index) => ({
      ownerId: source.ownerId, originalPath: source.originalPath, previewPath: source.previewPath,
      thumbnailPath: source.thumbnailPath, originalFilename: `回忆-${index + 1}.jpg`, contentHash: randomUUID(),
      mimeType: source.mimeType, sizeBytes: source.sizeBytes, width: source.width, height: source.height, status: 'ready' as const,
    }))).returning({ id: photos.id })).map(photo => photo.id);
  } finally { await database.close(); }
  for (let offset = 0; offset < 200; offset += 100) {
    expect((await page.request.post(`/api/albums/${album.id}/photos`, { headers: { origin: E2E_WEB_ORIGIN }, data: { photoIds: ids.slice(offset, offset + 100) } })).ok()).toBe(true);
  }
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const viewport of [{ width: 1440, height: 1024 }, { width: 834, height: 1194 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const layout of ['故事书', '花园', '胶片']) {
      await page.goto(`/albums/${album.id}`);
      await page.getByRole('button', { name: layout, exact: true }).click();
      await expect(page.getByRole('button', { name: layout, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.wall-photo')).toHaveCount(40);
      for (let count = 80; count <= 200; count += 40) {
        await page.getByRole('button', { name: '继续看照片' }).click();
        await expect(page.locator('.wall-photo')).toHaveCount(count);
      }
      expect(await page.locator('body').evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: testInfo.outputPath(`${viewport.width}-${layout}-bottom.png`) });
      await page.locator('.wall-heading').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`${viewport.width}-${layout}-top.png`) });
    }
  }
  expect(errors).toEqual([]);
});
