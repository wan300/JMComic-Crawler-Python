import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const mockImage = `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#612443"/><stop offset="1" stop-color="#f36b4f"/></linearGradient></defs>
  <rect width="600" height="900" fill="url(#g)"/>
  <circle cx="455" cy="210" r="170" fill="#fff" opacity=".12"/>
  <rect x="76" y="565" width="448" height="14" rx="7" fill="#fff" opacity=".75"/>
  <rect x="76" y="603" width="320" height="10" rx="5" fill="#fff" opacity=".45"/>
</svg>`;

async function prepare(page: Page) {
  await page.route('**/media/**', (route) => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    headers: { 'access-control-allow-origin': '*' },
    body: mockImage,
  }));
  await page.goto('/?mock=1#/discover');
  const adultButton = page.getByRole('button', { name: '我已年满 18 周岁' });
  if (await adultButton.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false)) {
    await adultButton.click();
  }
  await expect(page.getByRole('heading', { name: '发现', level: 1 })).toBeVisible();
  await expect(page.locator('.album-card').first()).toBeVisible();
}

test('18+ 确认完整位于宿主可视区域', async ({ page }) => {
  await page.goto('/?mock=1#/discover');
  const dialog = page.getByRole('dialog', { name: '仅限成年人' });
  const confirmButton = page.getByRole('button', { name: '我已年满 18 周岁' });
  await expect(dialog).toBeVisible();
  await expect(confirmButton).toBeInViewport();

  const cardBox = await dialog.locator('.gate-card').boundingBox();
  const viewport = page.viewportSize();
  expect(cardBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(cardBox!.x).toBeGreaterThanOrEqual(0);
  expect(cardBox!.y).toBeGreaterThanOrEqual(0);
  expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(viewport!.height);
});

test('窄横屏门槛页保持单栏并可滚动确认', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', '窄横屏兼容只需运行一次');
  await page.setViewportSize({ width: 590, height: 390 });
  await page.goto('/?mock=1#/discover');

  const card = page.getByRole('dialog', { name: '仅限成年人' }).locator('.gate-card');
  const confirmButton = page.getByRole('button', { name: '我已年满 18 周岁' });
  await expect(card).toHaveCSS('display', 'block');
  expect((await card.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await confirmButton.scrollIntoViewIfNeeded();
  await expect(confirmButton).toBeInViewport();
});

test('关键布局与主题快照', async ({ page }, testInfo) => {
  await prepare(page);
  await expect(page).toHaveScreenshot('discover.png', { fullPage: true });

  if (testInfo.project.name === 'tablet') {
    await page.getByRole('button', { name: '设置' }).click();
    await page.getByLabel('主题').selectOption('dark');
    await page.getByRole('switch', { name: /减少动态效果/ }).check();
    await page.getByRole('switch', { name: /高对比度/ }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
    await expect(page).toHaveScreenshot('settings-dark-reduced-contrast.png', { fullPage: true });
  }
});

test('搜索、详情、双阅读模式、下载与离线快照闭环', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', '完整交互只需在手机项目运行一次');
  await prepare(page);
  await page.getByRole('button', { name: '搜索' }).click();
  await page.getByLabel('搜索漫画').fill('示例');
  await page.locator('.search-box').getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.getByText(/个结果/)).toBeVisible();
  await page.locator('.album-card-button').first().click();
  await expect(page.locator('.detail-summary h1')).toContainText('示例');
  await page.getByRole('button', { name: /开始阅读|续读/ }).click();
  await expect(page.locator('.vertical-reader')).toBeVisible();
  await page.getByRole('button', { name: '横向单页' }).click();
  await expect(page.locator('.horizontal-reader')).toBeVisible();
  await page.locator('.horizontal-reader').press('ArrowRight');
  await expect(page.locator('.page-indicator')).toContainText('2 / 5');
  await page.getByRole('button', { name: '下载当前章' }).click();
  await expect(page.getByText('当前章已加入下载队列')).toBeVisible();
  await page.waitForFunction(async () => {
    const request = indexedDB.open('jmcomic-reader');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction('images', 'readonly');
      const countRequest = tx.objectStore('images').count();
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });
    db.close();
    return count >= 5;
  });
  await page.evaluate(() => { delete window.BjtuService; });
  await page.route('**/media/**', (route) => route.abort());
  await page.getByRole('button', { name: '返回漫画详情' }).click();
  await expect(page.locator('.detail-summary h1')).toBeVisible();
  await page.getByRole('button', { name: /续读/ }).click();
  await expect(page.locator('.horizontal-reader')).toBeVisible();
});

test('键盘路径与基础可访问性', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', '可访问性扫描只需运行一次');
  await prepare(page);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus-visible')).toBeVisible();
  const results = await new AxeBuilder({ page: page as never })
    .disableRules(['color-contrast'])
    .analyze();
  const blocking = results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact || ''));
  expect(blocking, blocking.map((item) => `${item.id}: ${item.help}`).join('\n')).toEqual([]);
});

test('剪贴板 JMCR1 备份预览与导入', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', '剪贴板迁移只需在手机项目运行一次');
  await prepare(page);
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '复制元数据备份' }).click();
  await expect(page.getByText('JMCR1 备份已复制到剪贴板')).toBeVisible();
  const backup = await page.evaluate(() => navigator.clipboard.readText());
  expect(backup).toMatch(/^JMCR1\./);
  await page.getByLabel('备份文本').fill(backup);
  await page.getByRole('button', { name: '预览备份' }).click();
  await expect(page.getByText('备份预览', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '合并导入' }).click();
  await expect(page.getByText('已按更新时间合并备份')).toBeVisible();
});
