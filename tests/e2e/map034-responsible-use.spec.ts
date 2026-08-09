import { expect, test, type Page, type TestInfo } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';

const NEUTRAL_TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

const VIEWPORTS = [
  { label: '320x740', width: 320, height: 740 },
  { label: '360x800', width: 360, height: 800 },
  { label: '390x844', width: 390, height: 844 },
  { label: '430x932', width: 430, height: 932 },
  { label: '667x375-landscape', width: 667, height: 375 },
  { label: '1440x1000-desktop', width: 1440, height: 1000 },
] as const;

async function openReadyMap(page: Page): Promise<void> {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: NEUTRAL_TEST_MAP,
    });
  });

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

async function captureNoticeContext(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const notice = page.getByRole('complementary', { name: 'Uso responsable del mapa' });
  await notice.scrollIntoViewIfNeeded();
  const screenshotPath = testInfo.outputPath(`map034-${label}.png`);

  await page.screenshot({ path: screenshotPath, fullPage: false });
  await testInfo.attach(`MAP-034 ${label}`, {
    path: screenshotPath,
    contentType: 'image/png',
  });
}

for (const viewport of VIEWPORTS) {
  test(`keeps the responsible-use notice compact and secondary at ${viewport.label}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openReadyMap(page);

    const notice = page.getByRole('complementary', { name: 'Uso responsable del mapa' });
    const footer = page.locator('.site-footer');
    const mapExperience = page.locator('.map-experience');

    await expect(notice).toBeVisible();
    await expect(notice).toContainText(
      'se carga de forma remota directamente desde Wizards of the Coast',
    );
    await expect(notice).toContainText(
      'no almacenan, transforman ni publican copias o derivados',
    );
    await expect(notice.locator('h1, h2, h3, .eyebrow')).toHaveCount(0);
    await expect(page.locator('.map-notice')).toHaveCount(0);
    await expect(footer).toContainText('contenido de fans no oficial');
    await expect(footer).toContainText('©Wizards of the Coast LLC');
    await expectNoHorizontalOverflow(page);

    const geometry = await notice.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        height: rect.height,
        width: rect.width,
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        color: style.color,
      };
    });
    const noticeBox = await notice.boundingBox();
    const footerBox = await footer.boundingBox();
    const mapExperienceBox = await mapExperience.boundingBox();

    expect(geometry.fontSize).toBeGreaterThanOrEqual(14);
    expect(geometry.lineHeight).toBeGreaterThanOrEqual(20);
    expect(geometry.color).not.toBe('rgba(0, 0, 0, 0)');
    expect(geometry.width).toBeLessThanOrEqual(viewport.width);
    expect(geometry.height).toBeLessThanOrEqual(viewport.width <= 430 ? 120 : 80);
    expect(noticeBox).not.toBeNull();
    expect(footerBox).not.toBeNull();
    expect(mapExperienceBox).not.toBeNull();

    if (noticeBox && footerBox) {
      expect(footerBox.y).toBeGreaterThanOrEqual(noticeBox.y + noticeBox.height - 1);
    }

    if (noticeBox && mapExperienceBox) {
      expect(noticeBox.y).toBeGreaterThan(mapExperienceBox.y);
    }

    await captureNoticeContext(page, testInfo, viewport.label);
  });
}
