import { expect, test } from '@playwright/test';

test('a fixed user can log in, reload, and log out', async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) {
    throw new Error('E2E_USER_EMAIL and E2E_USER_PASSWORD are required');
  }

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByRole('navigation', { name: '主要导航' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('navigation', { name: '主要导航' })).toBeVisible();
  await page.getByRole('button', { name: /· 退出$/ }).click();
  await expect(page).toHaveURL(/\/login$/);
});
