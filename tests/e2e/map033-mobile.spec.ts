import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';

const NEUTRAL_TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
    <path d="M0 1164.5h3600M1800 0v2329" stroke="#8a887f" stroke-width="12" />
  </svg>
`;

const PORTRAIT_VIEWPORTS = [
  { width: 320, height: 740 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

async function mockOfficialMap(page: Page): Promise<void> {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: NEUTRAL_TEST_MAP,
    });
  });
}

async function openReadyMap(page: Page): Promise<void> {
  await mockOfficialMap(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
}

async function expectTouchTarget(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();
  if (!box) return;

  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

async function captureReference(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const screenshotPath = testInfo.outputPath(`map033-${label}.png`);

  await page.screenshot({ path: screenshotPath, fullPage: false });
  await testInfo.attach(`MAP-033 ${label}`, {
    path: screenshotPath,
    contentType: 'image/png',
  });
}

for (const viewport of PORTRAIT_VIEWPORTS) {
  test(`keeps the map first and controls compact at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await openReadyMap(page);

    const searchToggle = page.locator('[data-place-search-toggle]');
    const filtersToggle = page.locator('[data-place-filters-toggle]');
    const map = page.locator('[data-map-canvas]');
    const legend = page.locator('[data-pin-legend]');

    await expect(searchToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(filtersToggle).toHaveAttribute('aria-expanded', 'false');
    await expectTouchTarget(searchToggle);
    await expectTouchTarget(filtersToggle);
    await expectNoHorizontalOverflow(page);

    const searchBox = await searchToggle.boundingBox();
    const filtersBox = await filtersToggle.boundingBox();
    const mapBox = await map.boundingBox();
    const legendBox = await legend.boundingBox();

    expect(searchBox).not.toBeNull();
    expect(filtersBox).not.toBeNull();
    expect(mapBox).not.toBeNull();
    expect(legendBox).not.toBeNull();

    if (searchBox && filtersBox) {
      expect(Math.abs(searchBox.y - filtersBox.y)).toBeLessThanOrEqual(2);
    }

    if (mapBox) {
      expect(mapBox.y).toBeLessThan(viewport.height * 0.68);
      expect(mapBox.height).toBeGreaterThanOrEqual(360);
    }

    if (mapBox && legendBox) {
      expect(legendBox.y).toBeGreaterThanOrEqual(mapBox.y + mapBox.height - 1);
    }

    await captureReference(page, testInfo, `${viewport.width}x${viewport.height}`);
  });
}

test('expands one mobile control without sacrificing width or accessibility', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyMap(page);

  const experience = page.locator('.map-experience');
  const search = page.locator('[data-place-search]');
  const searchToggle = page.locator('[data-place-search-toggle]');
  const filtersToggle = page.locator('[data-place-filters-toggle]');

  await searchToggle.click();
  await expect(searchToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toBeVisible();
  await expect(filtersToggle).toHaveAttribute('aria-expanded', 'false');

  const experienceBox = await experience.boundingBox();
  const searchBox = await search.boundingBox();

  expect(experienceBox).not.toBeNull();
  expect(searchBox).not.toBeNull();

  if (experienceBox && searchBox) {
    expect(Math.abs(experienceBox.width - searchBox.width)).toBeLessThanOrEqual(2);
  }

  await expectTouchTarget(page.getByRole('button', { name: 'Limpiar búsqueda' }));
  await page.getByRole('searchbox', { name: 'Buscar lugares' }).fill('paso');
  await expect(page.getByRole('list', { name: 'Resultados de búsqueda de lugares' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await searchToggle.click();
  await expect(searchToggle).toHaveAttribute('aria-expanded', 'false');
  await filtersToggle.click();
  await expect(filtersToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('group', { name: 'Categorías' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('keeps a useful map surface in short mobile landscape', async ({ page }, testInfo) => {
  const viewport = { width: 667, height: 375 };

  await page.setViewportSize(viewport);
  await openReadyMap(page);

  const mapBox = await page.locator('[data-map-canvas]').boundingBox();

  expect(mapBox).not.toBeNull();
  if (mapBox) {
    expect(mapBox.y).toBeLessThan(viewport.height * 0.92);
    expect(mapBox.height).toBeGreaterThanOrEqual(viewport.height * 0.6);
  }

  await expect(page.locator('[data-place-search-toggle]')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.locator('[data-place-filters-toggle]')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expectNoHorizontalOverflow(page);
  await captureReference(page, testInfo, '667x375-landscape');
});

test('runs the MAP-033 suite with Android Chromium and iOS WebKit emulation', async ({
  page,
}, testInfo) => {
  test.skip(!['mobile-chromium', 'mobile-webkit'].includes(testInfo.project.name));

  await page.goto('/');
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const maxTouchPoints = await page.evaluate(() => navigator.maxTouchPoints);

  expect(maxTouchPoints).toBeGreaterThan(0);

  if (testInfo.project.name === 'mobile-chromium') {
    expect(userAgent).toContain('Android');
  } else {
    expect(userAgent).toMatch(/iPhone|Mobile/);
  }
});
