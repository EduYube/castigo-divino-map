import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';

const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
    <path d="M0 1164.5h3600M1800 0v2329" stroke="#8a887f" stroke-width="12" />
  </svg>
`;

const VIEWPORTS = [
  { width: 1440, height: 1000, label: 'desktop' },
  { width: 1024, height: 768, label: 'tablet-landscape' },
  { width: 768, height: 1024, label: 'tablet-portrait' },
  { width: 430, height: 932, label: 'mobile-430' },
  { width: 390, height: 844, label: 'mobile-390' },
  { width: 360, height: 800, label: 'mobile-360' },
  { width: 320, height: 740, label: 'mobile-320' },
  { width: 667, height: 375, label: 'mobile-landscape' },
] as const;

async function openReadyMap(page: Page): Promise<void> {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: TEST_MAP,
    });
  });
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
}

async function expectTouchTarget(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  expect(box.width).toBeGreaterThanOrEqual(43.9);
  expect(box.height).toBeGreaterThanOrEqual(43.9);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  viewportLabel: string,
  state: 'closed' | 'open',
): Promise<void> {
  const path = testInfo.outputPath(`map036-${viewportLabel}-${state}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(`MAP-036 ${viewportLabel} ${state}`, {
    path,
    contentType: 'image/png',
  });
}

for (const viewport of VIEWPORTS) {
  test(`keeps complete help compact and usable at ${viewport.label}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await openReadyMap(page);

    const help = page.locator('[data-map-help]');
    const summary = page.locator('[data-map-help-summary]');
    const panel = page.locator('[data-map-help-panel]');
    const legend = page.locator('[data-pin-legend]');
    const map = page.locator('[data-map-canvas]');
    const hiddenInstructions = page.locator('#map-instructions');

    await expect(summary).toBeVisible();
    await expect(summary).toHaveText('Ayuda y leyenda del mapa');
    await expect(help).not.toHaveAttribute('open', '');
    await expect(panel).toBeHidden();
    await expect(legend).toBeHidden();
    await expectTouchTarget(summary);
    await expectNoHorizontalOverflow(page);

    await expect(hiddenInstructions).toContainText('Usa Búsqueda');
    await expect(hiddenInstructions).toContainText('Filtrar lugares');
    await expect(hiddenInstructions).toContainText('Activar un pin abre su ficha compacta');
    await expect(hiddenInstructions).toContainText('círculo indica personaje');
    await expect(hiddenInstructions).toContainText('rombo, emplazamiento');
    await expect(hiddenInstructions).toContainText(
      'aliado, enemigo, neutral y sin dato visible',
    );
    await expect(map).toHaveAttribute('aria-describedby', /map-instructions/);

    const closedMetrics = await page.evaluate(({ width, height, label }) => {
      const summaryElement = document.querySelector<HTMLElement>('[data-map-help-summary]');
      const mapElement = document.querySelector<HTMLElement>('[data-map-canvas]');
      const summaryBox = summaryElement?.getBoundingClientRect();
      const mapBox = mapElement?.getBoundingClientRect();

      return {
        label,
        viewport: { width, height },
        permanentHelpHeight: summaryBox?.height ?? null,
        mapTop: mapBox?.top ?? null,
        actionsToFullHelp: 1,
        horizontalOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }, viewport);

    console.log(`MAP036_CLOSED_METRICS ${JSON.stringify(closedMetrics)}`);
    await testInfo.attach(`MAP-036 closed metrics ${viewport.label}`, {
      body: JSON.stringify(closedMetrics, null, 2),
      contentType: 'application/json',
    });
    await capture(page, testInfo, viewport.label, 'closed');

    await summary.click();
    await expect(help).toHaveAttribute('open', '');
    await expect(panel).toBeVisible();
    await expect(legend).toBeVisible();
    await expect(panel).toContainText('Buscar.');
    await expect(panel).toContainText('Filtrar.');
    await expect(panel).toContainText('Abrir un pin.');
    await expect(legend).toContainText('Personaje');
    await expect(legend).toContainText('Emplazamiento');
    await expect(legend).toContainText('Aliado');
    await expect(legend).toContainText('Enemigo');
    await expect(legend).toContainText('Neutral');
    await expect(legend).toContainText('Sin dato visible');
    await expect(panel).toContainText('La disposición es por jugador');
    await expect(panel).toContainText('sin depender del color ni del hover');
    await expectNoHorizontalOverflow(page);

    const openMetrics = await page.evaluate(({ height }) => {
      const panelElement = document.querySelector<HTMLElement>('[data-map-help-panel]');
      const mapElement = document.querySelector<HTMLElement>('[data-map-canvas]');
      const panelBox = panelElement?.getBoundingClientRect();
      const mapBox = mapElement?.getBoundingClientRect();

      return {
        panelHeight: panelBox?.height ?? null,
        panelBottom: panelBox?.bottom ?? null,
        mapTop: mapBox?.top ?? null,
        panelViewportRatio: panelBox ? Number((panelBox.height / height).toFixed(3)) : null,
        horizontalOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }, viewport);

    console.log(
      `MAP036_OPEN_METRICS ${JSON.stringify({ label: viewport.label, ...openMetrics })}`,
    );
    await testInfo.attach(`MAP-036 open metrics ${viewport.label}`, {
      body: JSON.stringify(openMetrics, null, 2),
      contentType: 'application/json',
    });

    expect(openMetrics.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(openMetrics.panelHeight ?? 0).toBeGreaterThan(0);
    expect(openMetrics.panelHeight ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      viewport.height * 0.7,
    );
    if (openMetrics.panelBottom !== null && openMetrics.mapTop !== null) {
      expect(openMetrics.mapTop).toBeGreaterThanOrEqual(openMetrics.panelBottom - 2);
    }
    await capture(page, testInfo, viewport.label, 'open');

    await summary.click();
    await expect(help).not.toHaveAttribute('open', '');
    await expect(panel).toBeHidden();
    await summary.click();
    await expect(panel).toBeVisible();
    await summary.click();
    await expect(panel).toBeHidden();

    const marker = page.getByTestId('place-marker').first();
    await marker.focus();
    await marker.press('Enter');
    await expect(page.getByTestId('place-details')).toBeVisible();
  });
}

test('supports native keyboard disclosure without custom focus trapping', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyMap(page);

  const help = page.locator('[data-map-help]');
  const summary = page.locator('[data-map-help-summary]');
  const panel = page.locator('[data-map-help-panel]');
  const searchToggle = page.locator('[data-place-search-toggle]');

  await page.locator('body').focus();
  let reachedSummary = false;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await summary.evaluate((element) => element === document.activeElement)) {
      reachedSummary = true;
      break;
    }
  }

  expect(reachedSummary).toBe(true);
  await expect(summary).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(help).toHaveAttribute('open', '');
  await expect(panel).toBeVisible();
  await expect(summary).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(searchToggle).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Space');
  await expect(help).not.toHaveAttribute('open', '');
  await expect(panel).toBeHidden();
  await expect(summary).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await expect(summary).toBeFocused();
});
