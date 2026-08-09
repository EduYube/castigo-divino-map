import { expect, test, type Page, type TestInfo } from '@playwright/test';

const MAP_URL = 'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const NOTICE_NAME = 'Uso responsable del mapa';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

const VIEWPORTS = [
  { width: 320, height: 740 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 667, height: 375 },
  { width: 1440, height: 1000 },
] as const;

async function openMap(page: Page): Promise<void> {
  await page.route(MAP_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: TEST_MAP,
    });
  });
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  width: number,
  height: number,
): Promise<void> {
  const notice = page.getByRole('complementary', { name: NOTICE_NAME });
  await notice.scrollIntoViewIfNeeded();
  const path = testInfo.outputPath(`map034-${width}x${height}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(`MAP-034 ${width}x${height}`, {
    path,
    contentType: 'image/png',
  });
}

for (const viewport of VIEWPORTS) {
  test(`${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await openMap(page);

    const notice = page.getByRole('complementary', { name: NOTICE_NAME });
    const mapExperience = page.locator('.map-experience');
    const footer = page.locator('.site-footer');

    await expect(notice).toBeVisible();
    await expect(notice).toContainText('se carga de forma remota');
    await expect(notice).toContainText('no almacenan, transforman ni publican copias o derivados');
    await expect(notice.locator('h1, h2, h3, .eyebrow')).toHaveCount(0);
    await expect(page.locator('.map-notice')).toHaveCount(0);
    await expect(footer).toContainText('contenido de fans no oficial');
    await expect(footer).toContainText('©Wizards of the Coast LLC');

    const box = await notice.boundingBox();
    const mapBox = await mapExperience.boundingBox();
    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    const noticeLayout = await notice.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        clientHeight: element.clientHeight,
        fontSize: Number.parseFloat(style.fontSize),
        scrollHeight: element.scrollHeight,
      };
    });

    expect(box).not.toBeNull();
    expect(mapBox).not.toBeNull();
    expect(noticeLayout.fontSize).toBeGreaterThanOrEqual(14);
    expect(noticeLayout.scrollHeight).toBeLessThanOrEqual(noticeLayout.clientHeight + 1);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);

    if (box && mapBox) {
      const maxHeight = viewport.width <= 430 ? 140 : 80;
      expect(box.height).toBeLessThanOrEqual(maxHeight);
      expect(box.y).toBeGreaterThanOrEqual(mapBox.y + mapBox.height);
    }

    await capture(page, testInfo, viewport.width, viewport.height);
  });
}
