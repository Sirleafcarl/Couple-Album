import { expect, test, type Page } from '@playwright/test';
import { requireE2eCredentials } from './environment.js';

const credentials = requireE2eCredentials();
const albumTitle = '四月的春日散步';
const editedTitle = '我们共同写下的春日';

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function login(page: Page, account: 'first' | 'partner' = 'first') {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill(
    account === 'first' ? credentials.firstEmail : credentials.partnerEmail,
  );
  await page.getByLabel('密码').fill(
    account === 'first' ? credentials.firstPassword : credentials.partnerPassword,
  );
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe('persisted shared album wall', () => {
  test('shares create, theme, and cross-year edit changes between both users', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page);
    const runtimeErrors = collectRuntimeErrors(page);

    await expect(page.getByText('这里还没有相册')).toBeVisible();
    await page.getByRole('button', { name: '写下第一段回忆' }).click();
    await page.getByLabel('相册名称').fill(albumTitle);
    await page.getByLabel('发生日期').fill('2026-04-18');
    await page.getByLabel('这一页的故事').fill('风吹过来的时候，我们刚好都在笑。');
    await page.getByRole('button', { name: '创建相册' }).click();

    await expect(page.getByRole('region', { name: '2026 年相册廊' })).toBeVisible();
    await expect(page.getByRole('button', { name: `打开相册：${albumTitle}` })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: `打开相册：${albumTitle}` })).toBeVisible();

    await page.getByRole('button', { name: '主题', exact: true }).click();
    await page.getByRole('button', { name: '切换到共同情书主题' }).click();
    await expect(page.locator('.album-wall')).toHaveClass(/album-wall--love-letters/);
    await page.reload();
    await expect(page.locator('.album-wall')).toHaveClass(/album-wall--love-letters/);
    expect(runtimeErrors).toEqual([]);

    await page.getByRole('button', { name: /· 退出$/ }).click();
    await login(page, 'partner');
    runtimeErrors.length = 0;
    await page.getByRole('button', { name: `打开相册：${albumTitle}` }).click();
    await page.getByRole('button', { name: '编辑相册' }).click();
    await page.getByLabel('相册名称').fill(editedTitle);
    await page.getByLabel('发生日期').fill('2025-02-14');
    await page.getByRole('button', { name: '保存修改' }).click();

    await expect(page.getByRole('region', { name: '2025 年相册廊' })).toBeVisible();
    await expect(page.getByRole('button', { name: `打开相册：${editedTitle}` })).toBeVisible();
    await page.getByRole('button', { name: '查看 2026 年' }).click();
    await expect(page.getByRole('region', { name: '2026 年相册廊' })).toBeVisible();
    await page.getByRole('button', { name: '查看 2025 年' }).click();
    await expect(page.getByRole('button', { name: `打开相册：${editedTitle}` })).toBeVisible();
    expect(runtimeErrors).toEqual([]);
  });

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1024 },
    { name: 'tablet', width: 834, height: 1194 },
    { name: 'mobile', width: 390, height: 844 },
    { name: 'short-screen', width: 740, height: 500 },
  ]) {
    test(`keeps the real album editor usable on ${viewport.name}`, async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await login(page, 'partner');
      const runtimeErrors = collectRuntimeErrors(page);

      await expect(page.getByText('设置纪念日后，在这里记录我们的时间')).toBeInViewport();
      await expect(page.getByRole('region', { name: '2025 年相册廊' })).toBeVisible();
      await page.getByRole('button', { name: `打开相册：${editedTitle}` }).click();
      await expect(page.getByRole('button', { name: '关闭相册预览' })).toBeFocused();
      await expect(page.getByRole('link', { name: '进入相册' })).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath('frontispiece.png') });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await page.getByRole('button', { name: `打开相册：${editedTitle}` }).click();
      await page.getByRole('button', { name: '编辑相册' }).click();
      await expect(page.getByRole('dialog', { name: '编辑相册' })).toBeVisible();
      await expect(page.getByLabel('相册名称')).toBeInViewport();
      await expect(page.getByRole('dialog', { name: '编辑相册' })).toHaveCSS('opacity', '1');
      const beforeCalendar = await page.getByRole('dialog', { name: '编辑相册' }).boundingBox();
      await page.getByRole('button', { name: '打开日历' }).click();
      await expect(page.getByRole('region', { name: '选择发生日期' })).toBeVisible();
      const afterCalendar = await page.getByRole('dialog', { name: '编辑相册' }).boundingBox();
      expect(afterCalendar!.height).toBeCloseTo(beforeCalendar!.height, 0);
      expect(afterCalendar!.width).toBeCloseTo(beforeCalendar!.width, 0);
      const calendar = await page.getByRole('region', { name: '选择发生日期' }).boundingBox();
      expect(calendar!.y).toBeGreaterThanOrEqual(0);
      expect(calendar!.y + calendar!.height).toBeLessThanOrEqual(viewport.height);
      expect(calendar!.x + calendar!.width).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: testInfo.outputPath('calendar.png') });
      await page.getByRole('button', { name: '2025年2月14日' }).click();
      await expect(page.getByRole('region', { name: '选择发生日期' })).not.toBeVisible();
      await page.getByRole('button', { name: '打开日历' }).click();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('region', { name: '选择发生日期' })).not.toBeVisible();
      await expect(page.getByRole('dialog', { name: '编辑相册' })).toBeVisible();
      await expect(page.getByRole('button', { name: '打开日历' })).toBeFocused();
      await expect(page.getByRole('dialog', { name: '编辑相册' })).toHaveCSS('opacity', '1');
      await page.screenshot({ path: testInfo.outputPath('editor.png') });

      const bodyWidth = await page.locator('body').evaluate((body) => body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width);
      await page.getByLabel('相册名称').fill('尚未保存的修改');
      await page.keyboard.press('Escape');
      await expect(page.getByText('这页还没有保存')).toBeVisible();
      await page.getByRole('button', { name: '继续填写' }).click();
      await expect(page.getByLabel('相册名称')).toHaveValue('尚未保存的修改');
      await page.getByRole('button', { name: '取消' }).click();
      await page.getByRole('button', { name: '放弃修改' }).click();
      await expect(page.getByRole('dialog', { name: '编辑相册' })).not.toBeVisible();
      if (viewport.name === 'mobile') {
        await expect(page.getByRole('button', { name: /· 退出$/ })).toBeVisible();
      }
      expect(runtimeErrors).toEqual([]);
    });
  }
});
