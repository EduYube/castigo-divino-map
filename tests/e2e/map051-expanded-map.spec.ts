import { expect, test, type Page, type TestInfo } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

interface MapViewState {
  readonly center: readonly [number, number];
  readonly zoom: number;
}

async function mockOfficialMap(page: Page): Promise<void> {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });
}

async function openReadyMap(page: Page): Promise<void> {
  await mockOfficialMap(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.locator('[data-map-expand-control]')).toHaveAttribute(
    'aria-label',
    'Expandir mapa',
  );
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
}

async function readMapView(page: Page): Promise<MapViewState> {
  const shell = page.getByTestId('map-shell');
  await expect(shell).toHaveAttribute('data-map-center', /,/);
  await expect(shell).toHaveAttribute('data-map-zoom', /-?\d/);
  const centerText = (await shell.getAttribute('data-map-center')) ?? '0,0';
  const zoomText = (await shell.getAttribute('data-map-zoom')) ?? '0';
  const [lat = 0, lng = 0] = centerText.split(',').map(Number);
  return { center: [lat, lng], zoom: Number(zoomText) };
}

function viewsAreEquivalent(actual: MapViewState, expected: MapViewState): boolean {
  return (
    Math.abs(actual.center[0] - expected.center[0]) <= 1 &&
    Math.abs(actual.center[1] - expected.center[1]) <= 1 &&
    Math.abs(actual.zoom - expected.zoom) <= 0.02
  );
}

function expectEquivalentView(actual: MapViewState, expected: MapViewState): void {
  expect(viewsAreEquivalent(actual, expected)).toBe(true);
}

async function captureReference(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const path = testInfo.outputPath(`map051-${label}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(`MAP-051 ${label}`, { path, contentType: 'image/png' });
}

async function toggleExpanded(page: Page, expanded: boolean): Promise<void> {
  const control = page.locator('[data-map-expand-control]');
  const experience = page.locator('.map-experience');
  const expectedLabel = expanded ? 'Restaurar tamaño del mapa' : 'Expandir mapa';

  await control.click();
  await expect(experience).toHaveAttribute('data-map-expanded', expanded ? 'true' : 'false');
  await expect(control).toHaveAttribute('aria-pressed', expanded ? 'true' : 'false');
  await expect(control).toHaveAttribute('aria-label', expectedLabel);
  await expect(control).toHaveAttribute('title', expectedLabel);
  await expect(control).toBeFocused();
}

test('desktop wide expands the cartographic surface and restores its geometry', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openReadyMap(page);

  const map = page.locator('[data-map-canvas]');
  const experience = page.locator('.map-experience');
  const initialMapBox = await map.boundingBox();
  const initialExperienceBox = await experience.boundingBox();
  expect(initialMapBox).not.toBeNull();
  expect(initialExperienceBox).not.toBeNull();

  await expect(page.locator('[data-place-search]')).toBeVisible();
  await expect(page.locator('[data-place-filters]')).toBeVisible();
  await expect(page.locator('[data-map-help-summary]')).toBeVisible();
  await captureReference(page, testInfo, 'desktop-normal-1920x1080');

  await toggleExpanded(page, true);
  const expandedMapBox = await map.boundingBox();
  const expandedExperienceBox = await experience.boundingBox();
  expect(expandedMapBox).not.toBeNull();
  expect(expandedExperienceBox).not.toBeNull();

  if (initialMapBox && expandedMapBox) {
    expect(expandedMapBox.width - initialMapBox.width).toBeGreaterThan(300);
  }
  if (expandedExperienceBox) {
    expect(expandedExperienceBox.x).toBeGreaterThanOrEqual(0);
    expect(expandedExperienceBox.x + expandedExperienceBox.width).toBeLessThanOrEqual(1920);
  }
  await expect(page.locator('.leaflet-control-zoom')).toBeVisible();
  await expect(page.locator('[data-place-search]')).toBeVisible();
  await expect(page.locator('[data-place-filters]')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await captureReference(page, testInfo, 'desktop-expanded-1920x1080');

  await toggleExpanded(page, false);
  const restoredMapBox = await map.boundingBox();
  const restoredExperienceBox = await experience.boundingBox();
  expect(restoredMapBox).not.toBeNull();
  expect(restoredExperienceBox).not.toBeNull();

  if (initialMapBox && restoredMapBox) {
    expect(Math.abs(restoredMapBox.width - initialMapBox.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(restoredMapBox.x - initialMapBox.x)).toBeLessThanOrEqual(2);
  }
  if (initialExperienceBox && restoredExperienceBox) {
    expect(Math.abs(restoredExperienceBox.width - initialExperienceBox.width)).toBeLessThanOrEqual(
      2,
    );
  }
  await expectNoHorizontalOverflow(page);
});

test('pan and zoom survive expanded and restored transitions', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openReadyMap(page);

  const zoomIn = page.locator('.leaflet-control-zoom-in');
  await zoomIn.click();
  await zoomIn.click();

  const map = page.locator('[data-map-canvas]');
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.42, { steps: 5 });
  await page.mouse.up();

  const before = await readMapView(page);
  await toggleExpanded(page, true);
  await expect.poll(async () => viewsAreEquivalent(await readMapView(page), before)).toBe(true);
  expectEquivalentView(await readMapView(page), before);

  await toggleExpanded(page, false);
  await expect.poll(async () => viewsAreEquivalent(await readMapView(page), before)).toBe(true);
  expectEquivalentView(await readMapView(page), before);
});

test('Beta 0.2 filters, search results, matching and URL remain unchanged', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReadyMap(page);

  const category = page.getByRole('checkbox', { name: /Personaje/ });
  const tag = page.getByRole('checkbox', { name: /Veyra/ });
  const search = page.getByRole('searchbox', { name: 'Buscar lugares' });

  await category.check();
  await tag.check();
  await search.fill('Veyra');
  await expect(
    page
      .getByRole('list', { name: 'Resultados de búsqueda de lugares' })
      .getByRole('button', { name: /Veyra/ }),
  ).toBeVisible();

  const statusBefore = await page.locator('[data-place-filters-status]').textContent();
  const matchingBefore = await page.locator('[data-filter-match="true"]').count();
  const urlBefore = page.url();

  await toggleExpanded(page, true);

  await expect(category).toBeChecked();
  await expect(tag).toBeChecked();
  await expect(search).toHaveValue('Veyra');
  await expect(page.locator('[data-place-filters-status]')).toHaveText(statusBefore ?? '');
  await expect(page.locator('[data-filter-match="true"]')).toHaveCount(matchingBefore);
  expect(page.url()).toBe(urlBefore);
  await expectNoHorizontalOverflow(page);
  await captureReference(page, testInfo, 'desktop-expanded-filters-search-1440x900');
});

test('compact details stay visible and do not disable expanded mode', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openReadyMap(page);

  const pin = page.locator('[data-testid="entity-pin"][data-category-id="category-pj"]');
  await expect(pin).toHaveCount(1);
  await pin.click();

  const panel = page.getByTestId('place-details');
  await expect(panel).toBeVisible();
  const map = page.locator('[data-map-canvas]');
  const normalWithDetails = await map.boundingBox();

  await toggleExpanded(page, true);
  await expect(panel).toBeVisible();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  const expandedWithDetails = await map.boundingBox();
  if (normalWithDetails && expandedWithDetails) {
    expect(expandedWithDetails.width).toBeGreaterThan(normalWithDetails.width + 100);
  }
  await captureReference(page, testInfo, 'desktop-expanded-details-1600x900');

  await panel.getByRole('button', { name: /Cerrar la ficha/ }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator('.map-experience')).toHaveAttribute('data-map-expanded', 'true');
  await expect(page.locator('[data-map-expand-control]')).toHaveAttribute('aria-pressed', 'true');
});

for (const viewport of [
  { width: 1600, height: 900 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
] as const) {
  test(`expanded layout remains bounded at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openReadyMap(page);

    const map = page.locator('[data-map-canvas]');
    const normal = await map.boundingBox();
    await toggleExpanded(page, true);
    const expanded = await map.boundingBox();

    expect(normal).not.toBeNull();
    expect(expanded).not.toBeNull();
    if (normal && expanded) expect(expanded.width).toBeGreaterThanOrEqual(normal.width - 1);
    await expect(page.locator('[data-place-search]')).toBeVisible();
    await expect(page.locator('[data-place-filters]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

for (const viewport of [
  { width: 768, height: 1024, label: 'tablet-768x1024' },
  { width: 430, height: 932, label: 'mobile-430x932' },
  { width: 390, height: 844, label: 'mobile-390x844' },
  { width: 320, height: 740, label: 'mobile-320x740' },
] as const) {
  test(`mobile/tablet keeps controls visible without a useless expand action at ${viewport.label}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await openReadyMap(page);

    await expect(page.locator('[data-map-expand-control]')).toBeHidden();
    const searchToggle = page.locator('[data-place-search-toggle]');
    const filtersToggle = page.locator('[data-place-filters-toggle]');
    await expect(searchToggle).toBeVisible();
    await expect(filtersToggle).toBeVisible();

    for (const control of [searchToggle, filtersToggle]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(43.9);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.9);
    }

    await expect(page.locator('[data-map-canvas]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await captureReference(page, testInfo, viewport.label);
  });
}

test('keyboard toggle preserves focus and updates its accessible state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReadyMap(page);

  const control = page.locator('[data-map-expand-control]');
  let reached = false;
  for (let index = 0; index < 80; index += 1) {
    await page.keyboard.press('Tab');
    if (await control.evaluate((element) => document.activeElement === element)) {
      reached = true;
      break;
    }
  }
  expect(reached).toBe(true);
  await expect(control).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(control).toBeFocused();
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  await expect(control).toHaveAttribute('aria-label', 'Restaurar tamaño del mapa');
  await expect(page.locator('.map-experience')).toHaveAttribute('data-map-expanded', 'true');

  await page.keyboard.press('Space');
  await expect(control).toBeFocused();
  await expect(control).toHaveAttribute('aria-pressed', 'false');
  await expect(control).toHaveAttribute('aria-label', 'Expandir mapa');
  await expect(page.locator('.map-experience')).toHaveAttribute('data-map-expanded', 'false');
});

test('forced colors and 200% reflow equivalent keep the layout operable', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.setViewportSize({ width: 1024, height: 768 });
  await openReadyMap(page);
  await expect(page.locator('[data-map-expand-control]')).toBeVisible();
  await toggleExpanded(page, true);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 512, height: 768 });
  await expect(page.locator('[data-map-expand-control]')).toBeHidden();
  await expect(page.locator('[data-place-search-toggle]')).toBeVisible();
  await expect(page.locator('[data-place-filters-toggle]')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
