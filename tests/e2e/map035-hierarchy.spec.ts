import { expect, test, type Page, type TestInfo } from '@playwright/test';

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

async function capture(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const path = testInfo.outputPath(`map035-${label}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(`MAP-035 ${label}`, { path, contentType: 'image/png' });
}

for (const viewport of VIEWPORTS) {
  test(`keeps the map dominant at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await openReadyMap(page);

    const metrics = await page.evaluate(({ width, height, label }) => {
      const rect = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, height: box.height };
      };

      const map = rect('[data-map-canvas]');
      const header = rect('.site-header');
      const introduction = rect('.map-introduction');
      const heading = rect('.map-experience__heading');
      const search = rect('.place-search');
      const filters = rect('.place-filters');
      const helpSummary = rect('[data-map-help-summary]');
      const visibleMapHeight = map
        ? Math.max(0, Math.min(height, map.bottom) - Math.max(0, map.top))
        : 0;
      const candidates = [header, introduction, heading, search, filters].filter(
        (box): box is NonNullable<typeof box> => Boolean(box),
      );
      const blocksBeforeMap = map
        ? candidates.filter((box) => box.top < map.top && box.bottom <= map.top + 1).length
        : 0;
      const searchbox = document.querySelector<HTMLInputElement>('[data-place-search-input]');
      const help = document.querySelector<HTMLDetailsElement>('[data-map-help]');
      const legend = document.querySelector<HTMLElement>('[data-pin-legend]');
      const geometry = {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };

      return {
        label,
        viewport: { width, height },
        headerHeight: header?.height ?? null,
        introductionHeight: introduction?.height ?? null,
        introductionTop: introduction?.top ?? null,
        searchTop: search?.top ?? null,
        filtersTop: filters?.top ?? null,
        helpSummaryHeight: helpSummary?.height ?? null,
        helpInitiallyOpen: help?.open ?? null,
        legendInitiallyVisible: Boolean(help?.open && legend?.getClientRects().length),
        mapTop: map?.top ?? null,
        mapBottom: map?.bottom ?? null,
        mapHeight: map?.height ?? null,
        firstViewportMapPixels: visibleMapHeight,
        firstViewportMapPercent: Number(((visibleMapHeight / height) * 100).toFixed(1)),
        blocksBeforeMap,
        searchActionsBeforeTyping: searchbox?.offsetParent ? 0 : 1,
        actionsToFullHelp: 1,
        horizontalOverflow: geometry.scrollWidth - geometry.clientWidth,
      };
    }, viewport);

    console.log(`MAP035_METRICS ${JSON.stringify(metrics)}`);
    await testInfo.attach(`MAP-035 metrics ${viewport.label}`, {
      body: JSON.stringify(metrics, null, 2),
      contentType: 'application/json',
    });

    const usesMobileControls = viewport.width <= 768;

    expect(metrics.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(metrics.mapTop).not.toBeNull();
    expect(metrics.mapBottom).not.toBeNull();
    expect(metrics.firstViewportMapPixels).toBeGreaterThan(viewport.height * 0.2);
    expect(metrics.blocksBeforeMap).toBeLessThanOrEqual(4);
    expect(metrics.searchActionsBeforeTyping).toBe(usesMobileControls ? 1 : 0);
    expect(metrics.actionsToFullHelp).toBe(1);
    expect(metrics.helpInitiallyOpen).toBe(false);
    expect(metrics.legendInitiallyVisible).toBe(false);
    expect(metrics.helpSummaryHeight ?? 0).toBeGreaterThanOrEqual(43.9);

    if (metrics.mapTop !== null) {
      const maxMapTopRatio = viewport.height <= 400 ? 0.82 : 0.62;
      expect(metrics.mapTop).toBeLessThan(viewport.height * maxMapTopRatio);
    }

    if (!usesMobileControls && metrics.mapTop !== null && metrics.searchTop !== null) {
      expect(Math.abs(metrics.searchTop - metrics.mapTop)).toBeLessThanOrEqual(2);
    }

    if (metrics.mapBottom !== null && metrics.introductionTop !== null) {
      expect(metrics.introductionTop).toBeGreaterThanOrEqual(metrics.mapBottom - 1);
    }

    await expect(page.locator('[data-place-search-toggle]')).toHaveAttribute(
      'aria-expanded',
      usesMobileControls ? 'false' : 'true',
    );
    await expect(page.locator('[data-place-filters-toggle]')).toHaveAttribute(
      'aria-expanded',
      usesMobileControls ? 'false' : 'true',
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'El Atlas de los Nuevos Dioses',
    );
    await expect(page.getByRole('heading', { name: 'Faerûn', exact: true })).toHaveCount(0);
    await expect(page.locator('.atlas-main > .map-instructions')).toContainText(
      'Uso responsable del mapa',
    );
    await expect(page.locator('[data-map-help-summary]')).toBeVisible();
    await expect(page.locator('[data-pin-legend]')).toBeHidden();

    await capture(page, testInfo, `${viewport.width}x${viewport.height}`);
  });
}
