import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { E2E_API_ORIGIN, E2E_WEB_ORIGIN, requireE2eCredentials } from './environment.js';

const fixture = (name: string) => resolve('packages/media/test/fixtures', name);
const credentials = requireE2eCredentials();

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const response = await request.post('/api/auth/login', {
    data: { email, password },
    headers: { origin: E2E_WEB_ORIGIN },
  });
  expect(response.ok()).toBe(true);
}

test.describe.serial('photo library ingestion journey', () => {
  test('uploads an original, processes it, filters it, previews it, and records history', async ({ page }) => {
    await login(page, credentials.firstEmail, credentials.firstPassword);
    await page.goto('/uploads');
    await page.getByLabel('选择照片').setInputFiles(fixture('landscape.jpg'));
    await expect(page.getByText('landscape.jpg 已加入处理队列')).toBeVisible();

    await page.goto('/library');
    await expect(page.getByText('正在处理')).toBeVisible();
    const image = page.getByRole('img', { name: 'First 上传的照片' });
    await expect(image).toBeVisible({ timeout: 20_000 });
    await page.reload();
    await page.getByRole('button', { name: '我的照片' }).click();
    await expect(page.getByText('landscape.jpg')).toBeVisible();
    await page.getByRole('link', { name: '查看 First 上传的照片' }).click();
    await expect(page).toHaveURL(/\/api\/photos\/[^/]+\/media\/preview$/);
    await page.goBack();

    await page.goto('/uploads');
    await expect(page.getByText('已进入照片库')).toBeVisible();
  });

  test('requires an explicit duplicate choice and keeps a prior photo after a failed upload', async ({ page }) => {
    await login(page, credentials.firstEmail, credentials.firstPassword);
    await page.goto('/uploads');
    await page.getByLabel('选择照片').setInputFiles(fixture('landscape.jpg'));
    await expect(page.getByRole('dialog', { name: '发现重复照片' })).toBeVisible();
    await page.getByRole('button', { name: '仍然保留' }).click();
    await expect(page.getByText('landscape.jpg 已加入处理队列')).toBeVisible();

    await page.getByLabel('选择照片').setInputFiles(fixture('corrupt.jpg'));
    await expect(page.getByText('corrupt.jpg 上传失败')).toBeVisible();
    await page.reload();
    await expect(page.getByText('文件不是支持的图片格式')).toBeVisible();
    await page.goto('/library');
    await expect(page.getByText('landscape.jpg').first()).toBeVisible();
  });

  test('protects media, allows both users, and never exposes the data root', async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({ baseURL: E2E_API_ORIGIN });
    const first = await playwright.request.newContext({ baseURL: E2E_API_ORIGIN });
    const partner = await playwright.request.newContext({ baseURL: E2E_API_ORIGIN });
    try {
      await apiLogin(first, credentials.firstEmail, credentials.firstPassword);
      await apiLogin(partner, credentials.partnerEmail, credentials.partnerPassword);
      const listResponse = await first.get('/api/photos?owner=all&limit=40');
      expect(listResponse.ok()).toBe(true);
      const listBody = await listResponse.json() as {
        items: Array<{ media: { original: string } }>;
      };
      const originalUrl = listBody.items[0]?.media.original;
      expect(originalUrl).toBeTruthy();
      expect(JSON.stringify(listBody)).not.toContain('test-results/e2e-data');
      expect((await anonymous.get(originalUrl!)).status()).toBe(401);
      expect((await first.get(originalUrl!)).status()).toBe(200);
      expect((await partner.get(originalUrl!)).status()).toBe(200);

      const uploadsResponse = await first.get('/api/uploads?limit=40');
      expect(uploadsResponse.ok()).toBe(true);
      expect(JSON.stringify(await uploadsResponse.json())).not.toContain('test-results/e2e-data');
    } finally {
      await anonymous.dispose();
      await first.dispose();
      await partner.dispose();
    }
  });
});
