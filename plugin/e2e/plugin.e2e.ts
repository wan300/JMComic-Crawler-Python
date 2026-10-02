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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const blocked = (name: string) => () => {
      throw new Error(`${name} is disabled for Manifest v3 browser tests`);
    };
    Object.defineProperty(window, 'indexedDB', { configurable: true, get: blocked('indexedDB') });
    Object.defineProperty(window, 'localStorage', { configurable: true, get: blocked('localStorage') });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: blocked('sessionStorage') });
    Object.defineProperty(window, 'caches', { configurable: true, get: blocked('Cache Storage') });
    Object.defineProperty(navigator, 'storage', { configurable: true, get: blocked('navigator.storage') });
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '',
      set: blocked('Cookie'),
    });
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      value: class BlockedWorker {
        constructor() {
          throw new Error('Worker is disabled for Manifest v3 browser tests');
        }
      },
    });
  });
});

async function kvValues(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => window.__JMCR_V3_TEST__?.kvValues() || {});
}

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

test('关键响应式布局与主题状态', async ({ page }, testInfo) => {
  await prepare(page);

  const expectedColumns = testInfo.project.name === 'phone' ? 2 : 3;
  const layout = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>('.screen');
    const hero = document.querySelector<HTMLElement>('.hero-card');
    const grid = document.querySelector<HTMLElement>('.album-grid');
    if (!screen || !hero || !grid) throw new Error('缺少发现页关键布局');

    const screenBounds = screen.getBoundingClientRect();
    const heroBounds = hero.getBoundingClientRect();
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      screenLeft: screenBounds.left,
      screenRight: screenBounds.right,
      heroLeft: heroBounds.left,
      heroRight: heroBounds.right,
      heroMinHeight: getComputedStyle(hero).minHeight,
    };
  });

  expect(layout.columns).toBe(expectedColumns);
  expect(layout.horizontalOverflow).toBeLessThanOrEqual(0);
  expect(layout.screenLeft).toBeGreaterThanOrEqual(0);
  expect(layout.screenRight).toBeLessThanOrEqual((await page.viewportSize())!.width);
  expect(layout.heroLeft).toBeGreaterThanOrEqual(layout.screenLeft);
  expect(layout.heroRight).toBeLessThanOrEqual(layout.screenRight);
  expect(layout.heroMinHeight).toBe(testInfo.project.name === 'landscape' ? '135px' : '190px');

  if (testInfo.project.name === 'tablet') {
    await page.getByRole('button', { name: '设置' }).click();
    await page.getByLabel('主题').selectOption('dark');
    await page.getByRole('switch', { name: /减少动态效果/ }).check();
    await page.getByRole('switch', { name: /高对比度/ }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');
  }
});

test('关键布局与主题快照 @visual', async ({ page }, testInfo) => {
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
  await page.getByRole('tab', { name: '作者' }).click();
  await expect.poll(async () => {
    const values = await kvValues(page);
    const searches = Object.values(
      (values['v1/search/all'] || {}) as Record<string, { query?: string; kind?: number }>,
    );
    return searches.some((item) => item.query === '示例' && item.kind === 2);
  }).toBe(true);
  await page.getByRole('tab', { name: '站内' }).click();
  await page.locator('.album-card-button').first().click();
  await expect(page.locator('.detail-summary h1')).toContainText('示例');
  await page.getByRole('button', { name: /开始阅读|续读/ }).click();
  await expect(page.locator('.vertical-reader')).toBeVisible();
  await page.getByRole('button', { name: '横向单页' }).click();
  await expect(page.locator('.horizontal-reader')).toBeVisible();
  const horizontalPage = page.locator('.horizontal-track .comic-page:not(.image-placeholder)');
  await expect(horizontalPage).toBeVisible();
  const horizontalBounds = await horizontalPage.boundingBox();
  expect(horizontalBounds!.width).toBeGreaterThan(1);
  expect(horizontalBounds!.height).toBeGreaterThan(1);
  await page.locator('.horizontal-reader').press('ArrowRight');
  await expect(page.locator('.page-indicator')).toContainText('2 / 5');
  const sideProgress = page.getByRole('status', { name: '阅读进度：第 2 页，共 5 页' });
  await expect(sideProgress).toBeVisible();
  await page.locator('.horizontal-reader').click({ position: { x: 195, y: 420 } });
  await expect(sideProgress).toBeHidden();
  await page.locator('.horizontal-reader').click({ position: { x: 195, y: 420 } });
  await expect(page.getByRole('status', { name: '阅读进度：第 2 页，共 5 页' })).toBeVisible();
  await page.getByRole('button', { name: '下载当前章' }).click();
  await expect(page.getByText('当前章已加入下载队列')).toBeVisible();
  await expect.poll(async () => {
    const values = await kvValues(page);
    return Object.entries(values)
      .filter(([key]) => key.startsWith('v1/images/'))
      .flatMap(([, bucket]) => Object.values(bucket as Record<string, unknown>))
      .filter((image) => (image as { kind?: string }).kind === 'pinned')
      .length;
  }).toBeGreaterThanOrEqual(5);
  await page.evaluate(() => window.__JMCR_V3_TEST__?.emit('network', {
    online: false,
    validated: false,
    metered: false,
    transport: 'none',
  }));
  await page.route('**/media/**', (route) => route.abort());
  await page.getByRole('button', { name: '返回漫画详情' }).click();
  await expect(page.locator('.detail-summary h1')).toBeVisible();
  await page.getByRole('button', { name: /续读/ }).click();
  await expect(page.locator('.horizontal-reader')).toBeVisible();
  await expect(page.locator('.page-indicator')).toContainText('2 / 5');
  await expect(page.getByRole('status', { name: '阅读进度：第 2 页，共 5 页' })).toBeVisible();
});

test('漫画详情返回保留搜索结果且重复搜索词只显示一次', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', '搜索返回与历史顺序只需在手机项目运行一次');
  await prepare(page);
  await page.getByRole('button', { name: '搜索' }).click();
  const input = page.getByLabel('搜索漫画');
  const submit = page.locator('.search-box').getByRole('button', { name: '搜索', exact: true });

  await input.fill('元素');
  await submit.click();
  await expect(page.locator('.search-screen .section-heading h2')).toHaveText('“元素”');

  await input.fill('魔法');
  await submit.click();
  await expect(page.locator('.search-screen .section-heading h2')).toHaveText('“魔法”');

  await input.fill('元素');
  await submit.click();
  await expect(page.locator('.search-screen .section-heading h2')).toHaveText('“元素”');

  await page.getByRole('button', { name: '清空搜索' }).click();
  const terms = page.locator('.history-list button > span:nth-child(2)');
  await expect(terms).toHaveCount(2);
  await expect(terms.nth(0)).toHaveText('元素');
  await expect(terms.nth(1)).toHaveText('魔法');

  await input.fill('示例');
  await submit.click();
  await expect(page.locator('.search-screen .section-heading h2')).toHaveText('“示例”');
  await expect(page.locator('.album-card-button').first()).toBeVisible();
  await page.locator('.album-card-button').first().click();
  await expect(page.locator('.detail-summary h1')).toBeVisible();

  await page.getByRole('button', { name: '返回' }).click();
  await expect(page).toHaveURL(/#\/search$/);
  await expect(input).toHaveValue('示例');
  await expect(page.locator('.search-screen .section-heading h2')).toHaveText('“示例”');
  await expect(page.locator('.album-card')).not.toHaveCount(0);
});

test('竖读占位图使用宿主视口高度，图片待加载时不误跳页', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', '宿主视口兼容只需运行一次');
  await prepare(page);
  let releaseImages!: () => void;
  const pendingImages = new Promise<void>((resolve) => { releaseImages = resolve; });
  await page.route('**/media/photos/**', async (route) => {
    await pendingImages;
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: mockImage });
  });
  try {
    await page.locator('.album-card-button').first().click();
    await page.getByRole('button', { name: /开始阅读|续读/ }).click();
    await expect(page.locator('.vertical-reader')).toBeVisible();
    await page.evaluate(() => window.__JMCR_V3_TEST__?.emit('resize', {
      viewportWidthPx: 390, viewportHeightPx: 600, density: 1, fontScale: 1, orientation: 'portrait',
      safeAreaTopPx: 0, safeAreaRightPx: 0, safeAreaBottomPx: 0, safeAreaLeftPx: 0, imeHeightPx: 0,
    }));
    const placeholder = page.locator('[data-reader-page="0"] .image-placeholder');
    await expect(placeholder).toHaveCSS('min-height', '330px');
    await expect(page.getByRole('status', { name: '阅读进度：第 1 页，共 5 页' })).toBeVisible();
  } finally {
    releaseImages();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('连续竖读会恢复到保存的续读页面', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', '续读定位只需在手机项目运行一次');
  await prepare(page);
  await page.getByRole('button', { name: '搜索' }).click();
  await page.getByLabel('搜索漫画').fill('示例');
  await page.locator('.search-box').getByRole('button', { name: '搜索', exact: true }).click();
  await page.locator('.album-card-button').first().click();
  await page.getByRole('button', { name: /开始阅读|续读/ }).click();

  const target = page.locator('[data-reader-page="3"]');
  await target.scrollIntoViewIfNeeded();
  await expect(target.locator('.comic-page:not(.image-placeholder)')).toBeVisible();
  await expect(target).toBeInViewport();
  await expect(page.getByRole('status', { name: '阅读进度：第 4 页，共 5 页' })).toBeVisible();
  await expect.poll(async () => {
    const values = await kvValues(page);
    return Object.entries(values)
      .filter(([key]) => key.startsWith('v1/progress/'))
      .flatMap(([, bucket]) => Object.values(bucket as Record<string, { albumId?: string; page?: number }>))
      .find((progress) => progress.albumId === '438516')?.page;
  }).toBe(3);

  await page.getByRole('button', { name: '返回漫画详情' }).click();
  await expect(page.getByRole('button', { name: /续读 · 第 4 页/ })).toBeVisible();
  await page.getByRole('button', { name: /续读 · 第 4 页/ }).click();
  await expect(page.locator('.vertical-reader')).toBeVisible();
  await page.waitForFunction(() => {
    const element = document.querySelector<HTMLElement>('[data-reader-page="3"]');
    if (!element) return false;
    const bounds = element.getBoundingClientRect();
    return bounds.top >= -2 && bounds.top < window.innerHeight * 0.2;
  });
});

test('连续竖读多页同时可见时按阅读锚点选择唯一页码', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', '多页可见判定只需在手机项目运行一次');
  await prepare(page);
  await page.getByRole('button', { name: '搜索' }).click();
  await page.getByLabel('搜索漫画').fill('示例');
  await page.locator('.search-box').getByRole('button', { name: '搜索', exact: true }).click();
  await page.locator('.album-card-button').first().click();
  await page.getByRole('button', { name: /开始阅读|续读/ }).click();

  const firstPage = page.locator('[data-reader-page="0"]');
  const secondPage = page.locator('[data-reader-page="1"]');
  await expect(firstPage.locator('.comic-page:not(.image-placeholder)')).toBeVisible();
  await expect(secondPage.locator('.comic-page:not(.image-placeholder)')).toBeVisible();

  const placeSecondPageAt = async (top: number) => page.evaluate(async ({ desiredTop }) => {
    const target = document.querySelector<HTMLElement>('[data-reader-page="1"]');
    if (!target) throw new Error('缺少第二页');
    window.scrollBy(0, target.getBoundingClientRect().top - desiredTop);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return [...document.querySelectorAll<HTMLElement>('[data-reader-page]')]
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.bottom > 0 && bounds.top < window.innerHeight;
      })
      .length;
  }, { desiredTop: top });

  expect(await placeSecondPageAt(500)).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('status', { name: '阅读进度：第 1 页，共 5 页' })).toBeVisible();

  expect(await placeSecondPageAt(350)).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('status', { name: '阅读进度：第 2 页，共 5 页' })).toBeVisible();
});

test('相关推荐跳转置顶且单章节漫画可以开始阅读', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', '详情导航竞态只需在手机项目运行一次');
  await prepare(page);
  await page.evaluate(() => { location.hash = '#/album/438516'; });
  await expect(page.locator('.detail-id')).toHaveText('JM438516');
  await expect(page.locator('.detail-section .album-card-button').first()).toBeVisible();

  await page.evaluate(() => { location.hash = '#/discover'; });
  await expect(page.getByRole('heading', { name: '发现', level: 1 })).toBeVisible();
  await page.evaluate(() => { location.hash = '#/album/438516'; });

  await expect(page.locator('.detail-id')).toHaveText('JM438516');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.locator('.detail-section .album-card-button').first().click();

  await expect(page.locator('.detail-id')).toHaveText('JM438517');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.waitForTimeout(1_000);
  await expect(page.locator('.detail-id')).toHaveText('JM438517');
  const startReading = page.locator('.detail-actions .button.primary');
  await expect(startReading).toBeEnabled();
  await startReading.click();
  await expect(page.locator('.vertical-reader')).toBeVisible();
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

test('宿主 lifecycle 主题与返回键遵循 v3 消费顺序', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', '宿主 lifecycle 只需在手机项目运行一次');
  await prepare(page);
  await page.evaluate(() => window.__JMCR_V3_TEST__?.emit('theme', {
    colorScheme: 'dark',
    reducedMotion: true,
    highContrast: true,
  }));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');

  await page.getByRole('button', { name: '搜索' }).click();
  await page.getByLabel('搜索漫画').fill('示例');
  await page.locator('.search-box').getByRole('button', { name: '搜索', exact: true }).click();
  await page.locator('.album-card-button').first().click();
  await expect(page.locator('.detail-summary h1')).toBeVisible();
  expect(await page.evaluate(() => window.__JMCR_V3_TEST__?.emit('back', {}))).toBe(true);
  await expect(page).toHaveURL(/#\/search$/);
  await expect(page.locator('.album-card')).not.toHaveCount(0);

  await page.locator('.album-card-button').first().click();
  await page.getByRole('button', { name: /开始阅读|续读/ }).click();
  await page.getByRole('button', { name: '下一章' }).click();
  await expect(page).toHaveURL(/#\/read\/438516\/4385162$/);
  await expect(page.locator('.reader-toolbar.top')).toHaveClass(/visible/);
  expect(await page.evaluate(() => window.__JMCR_V3_TEST__?.emit('back', {}))).toBe(true);
  await expect(page.locator('.detail-summary h1')).toBeVisible();
  expect(await page.evaluate(() => window.__JMCR_V3_TEST__?.emit('back', {}))).toBe(true);
  await expect(page).toHaveURL(/#\/search$/);
  await expect(page.locator('.album-card')).not.toHaveCount(0);

  await page.evaluate(() => { location.hash = '#/discover'; });
  await expect(page.getByRole('heading', { name: '发现', level: 1 })).toBeVisible();
  expect(await page.evaluate(() => window.__JMCR_V3_TEST__?.emit('back', {}))).toBe(false);
});
