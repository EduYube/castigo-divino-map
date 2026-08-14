import { expect, test, type Page, type TestInfo } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

async function openReadyMap(page: Page): Promise<void> {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
}

async function captureReference(page: Page, testInfo: TestInfo): Promise<void> {
  const path = testInfo.outputPath('map051-mobile-landscape-667x375.png');
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach('MAP-051 mobile landscape 667x375', {
    path,
    contentType: 'image/png',
  });
}

test('mobile landscape keeps search, filters and map usable without horizontal overflow', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await openReadyMap(page);

  await expect(page.locator('[data-map-expand-control]')).toBeHidden();
  await expect(page.locator('[data-place-search-toggle]')).toBeVisible();
  await expect(page.locator('[data-place-filters-toggle]')).toBeVisible();
  await expect(page.locator('[data-map-canvas]')).toBeVisible();

  const geometry = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);

  await captureReference(page, testInfo);
});
