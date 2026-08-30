import { expect, test, type Page, type Route } from '@playwright/test';

import { INITIAL_PUBLIC_CAMPAIGN_ID } from '../../src/data-access/publicCatalogQueryContract.js';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

const PUBLIC_ROWS: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  campaigns: [
    {
      id: INITIAL_PUBLIC_CAMPAIGN_ID,
      slug: 'castigo-divino',
      name: 'Castigo Divino',
      status: 'active',
      display_order: 0,
    },
  ],
  categories: [
    {
      id: 'category-settlement',
      slug: 'settlements',
      name: 'Settlement',
      description: 'Settlement fixture category.',
    },
    {
      id: 'category-landmark',
      slug: 'landmarks',
      name: 'Landmark',
      description: 'Landmark fixture category.',
    },
  ],
  tags: [],
  players: [],
  map_entities: [
    {
      id: 'place-demo-harbor',
      slug: 'puerto-de-demostracion',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Yawning Portal',
      name_language: 'en',
      summary: 'Campaign location exactly at the Waterdeep search coordinate.',
      description: 'Exact-coordinate fixture for MAP-042.',
      x: 1626,
      y: 1465,
      category_id: 'category-settlement',
    },
    {
      id: 'place-demo-pass',
      slug: 'paso-de-demostracion',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Dock Ward Contact',
      name_language: 'en',
      summary: 'Nearby campaign location inside the Waterdeep viewport.',
      description: 'Nearby fixture for MAP-042.',
      x: 1690,
      y: 1420,
      category_id: 'category-landmark',
    },
    {
      id: 'entity-sword-coast-scout',
      slug: 'sword-coast-scout',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Sword Coast Scout',
      name_language: 'en',
      summary: 'First coincident regional pin.',
      description: 'Coincident fixture for MAP-042.',
      x: 1500,
      y: 1000,
      category_id: 'category-landmark',
    },
    {
      id: 'entity-sword-coast-witness',
      slug: 'sword-coast-witness',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Sword Coast Witness',
      name_language: 'en',
      summary: 'Second coincident regional pin.',
      description: 'Coincident fixture for MAP-042.',
      x: 1500,
      y: 1000,
      category_id: 'category-landmark',
    },
  ],
  entity_aliases: [],
  entity_tags: [],
  entity_player_dispositions: [],
  character_location_relations: [],
  public_notes: [],
  public_note_tags: [],
  geographic_names: [
    {
      id: 'geo-waterdeep',
      slug: 'waterdeep',
      name: 'Waterdeep',
      language: 'en',
      x: 1626,
      y: 1465,
      recommended_zoom: 0.75,
      entity_id: null,
      search_min_x: null,
      search_max_x: null,
      search_min_y: null,
      search_max_y: null,
    },
    {
      id: 'geo-sword-coast',
      slug: 'sword-coast',
      name: 'Sword Coast',
      language: 'en',
      x: 1450,
      y: 1049,
      recommended_zoom: 0.5,
      entity_id: null,
      search_min_x: 1380,
      search_max_x: 1710,
      search_min_y: 750,
      search_max_y: 1500,
    },
  ],
  geographic_name_aliases: [
    {
      id: 'geo-alias-waterdeep-es',
      geographic_name_id: 'geo-waterdeep',
      language: 'es',
      value: 'Aguas Profundas',
    },
    {
      id: 'geo-alias-sword-coast-es',
      geographic_name_id: 'geo-sword-coast',
      language: 'es',
      value: 'Costa de la Espada',
    },
  ],
  character_location_events: [],
};

async function configureMap(page: Page): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map042_test_key',
      timeoutMs: 2000,
      retryDelaysMs: [0, 0, 0],
    };
  }, LOCAL_SUPABASE_URL);
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });
  await page.route('**/rest/v1/**', async (route: Route) => {
    const match = /\/rest\/v1\/([^?]+)/.exec(route.request().url());
    const table = match?.[1] ?? '';
    const rows = PUBLIC_ROWS[table] ?? [];
    const contentRange = rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange },
      body: JSON.stringify(rows),
    });
  });
}

async function openReadyMap(page: Page): Promise<void> {
  await configureMap(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'connected',
  );

  const searchToggle = page.locator('[data-place-search-toggle]');
  if ((await searchToggle.getAttribute('aria-expanded')) === 'false') await searchToggle.click();
}

async function selectGeographicResult(page: Page, query: string, name: RegExp): Promise<void> {
  const input = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await input.fill(query);
  await input.press('Escape');
  await page
    .getByRole('list', { name: 'Resultados de búsqueda de lugares' })
    .getByRole('button', { name })
    .click();
}

async function expectPinNotTextDimmed(pin: ReturnType<Page['locator']>): Promise<void> {
  await expect(pin).toBeVisible();
  await expect(pin).not.toHaveClass(/campaign-marker-icon--dimmed/);
  await expect(pin.locator('.pin-visual')).not.toHaveClass(/pin-visual--dimmed/);
  await expect(pin).toHaveAttribute('data-filter-match', 'true');
  await expect(pin).toHaveAttribute('data-matching-semantics', 'filters-only');
  await expect(pin).not.toHaveAttribute('aria-description', /No coincide con la búsqueda/i);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
}

test('Waterdeep keeps the exact-coordinate campaign pin above the point focus and directly operable', async ({
  page,
}) => {
  await openReadyMap(page);
  await selectGeographicResult(page, 'Waterdeep', /Waterdeep.*Lugar geográfico/i);

  const shell = page.getByTestId('map-shell');
  const pin = page.locator('[data-place-id="place-demo-harbor"]');
  const highlight = page.locator('.geographic-search-highlight');

  await expect(shell).toHaveAttribute('data-map-center', '1465.00,1626.00');
  await expect(shell).toHaveAttribute('data-map-zoom', '0.75');
  await expect(shell).toHaveAttribute('data-search-highlight-kind', 'point');
  await expect(page).toHaveURL(/q=Waterdeep&geo=geo-waterdeep/);
  await expectPinNotTextDimmed(pin);
  await expect(highlight).toBeVisible();
  await expect(highlight).toHaveAttribute('aria-hidden', 'true');
  await expect(highlight).toHaveCSS('pointer-events', 'none');
  expect(await highlight.getAttribute('tabindex')).toBeNull();

  const zOrder = await page.evaluate(() => ({
    focus: Number(
      getComputedStyle(document.querySelector('.geographic-search-focus-pane')!).zIndex,
    ),
    pins: Number(getComputedStyle(document.querySelector('.leaflet-marker-pane')!).zIndex),
  }));
  expect(zOrder.focus).toBeLessThan(zOrder.pins);

  await pin.click();
  await expect(page.getByTestId('place-details')).toBeVisible();
  await expect(page.getByTestId('place-details')).toContainText('Yawning Portal');
  await expect(page).toHaveURL(/place=puerto-de-demostracion&q=Waterdeep&geo=geo-waterdeep/);
  await expect(shell).not.toHaveAttribute('data-search-highlight-kind', 'point');
  await expectPinNotTextDimmed(pin);
});

test('a nearby pin remains visible, focusable and keyboard-operable during geographic navigation', async ({
  page,
}) => {
  await openReadyMap(page);
  await selectGeographicResult(page, 'Waterdeep', /Waterdeep.*Lugar geográfico/i);

  const nearbyPin = page.locator('[data-place-id="place-demo-pass"]');
  await expectPinNotTextDimmed(nearbyPin);
  await expect(nearbyPin).toHaveAttribute('role', 'button');
  await expect(nearbyPin).toHaveAttribute('tabindex', '0');

  await nearbyPin.focus();
  await expect(nearbyPin).toBeFocused();
  await nearbyPin.press('Enter');
  await expect(page.getByTestId('place-details')).toBeVisible();
  await expect(page.getByTestId('place-details')).toContainText('Dock Ward Contact');
  await expect(page).toHaveURL(/geo=geo-waterdeep/);
});

test('MAP-041 regional focus stays below pins and coincident pin groups remain operable', async ({
  page,
}) => {
  await openReadyMap(page);
  await selectGeographicResult(page, 'Sword Coast', /Sword Coast.*Lugar geográfico/i);

  const shell = page.getByTestId('map-shell');
  const group = page.locator(
    '[data-proximity-cluster="true"][data-marker-lat="1000"][data-marker-lng="1500"]',
  );

  await expect(shell).toHaveAttribute('data-search-highlight-kind', 'area');
  await expect(shell).toHaveAttribute('data-search-highlight-bounds', '1380,1710,750,1500');
  await expect(page.locator('.geographic-search-area-highlight')).toBeVisible();
  await expect(group).toBeVisible();
  await expect(group).toHaveAttribute('role', 'button');

  const zOrder = await page.evaluate(() => ({
    focus: Number(
      getComputedStyle(document.querySelector('.geographic-search-focus-pane')!).zIndex,
    ),
    pins: Number(getComputedStyle(document.querySelector('.leaflet-marker-pane')!).zIndex),
  }));
  expect(zOrder.focus).toBeLessThan(zOrder.pins);

  await group.click();
  const option = page.locator('[data-spiderfied="true"][data-pin-id="entity-sword-coast-scout"]');
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.getByTestId('place-details')).toBeVisible();
  await expect(page.getByTestId('place-details')).toContainText('Sword Coast Scout');
  await expect(page).toHaveURL(/geo=geo-sword-coast/);
});

test('explicit filters keep their real effect while geographic text matching is suppressed', async ({
  page,
}) => {
  await openReadyMap(page);

  const filtersToggle = page.locator('[data-place-filters-toggle]');
  if ((await filtersToggle.getAttribute('aria-expanded')) === 'false') await filtersToggle.click();
  await page.getByRole('checkbox', { name: /Settlement/i }).check();
  await selectGeographicResult(page, 'Waterdeep', /Waterdeep.*Lugar geográfico/i);

  const settlementPin = page.locator('[data-place-id="place-demo-harbor"]');
  const landmarkPin = page.locator('[data-place-id="place-demo-pass"]');

  await expectPinNotTextDimmed(settlementPin);
  await expect(landmarkPin).toHaveAttribute('data-filter-match', 'false');
  await expect(landmarkPin).toHaveAttribute('data-matching-semantics', 'filters-only');
  await expect(landmarkPin).toHaveClass(/campaign-marker-icon--dimmed/);
  await expect(landmarkPin.locator('.pin-visual')).toHaveClass(/pin-visual--dimmed/);
  await expect(landmarkPin).toHaveAttribute(
    'aria-description',
    /No coincide con los filtros explícitos actuales/i,
  );
  await expect(landmarkPin).not.toHaveAttribute('aria-description', /búsqueda y los filtros/i);

  await landmarkPin.click();
  await expect(page.getByTestId('place-details')).toContainText('Dock Ward Contact');
  await expect(page).toHaveURL(/geo=geo-waterdeep/);
});

test('Aguas Profundas reuses the canonical Waterdeep navigation identity and pin semantics', async ({
  page,
}) => {
  await openReadyMap(page);
  await selectGeographicResult(
    page,
    'Aguas Profundas',
    /Waterdeep.*Lugar geográfico.*Coincidencia por alias/i,
  );

  const shell = page.getByTestId('map-shell');
  await expect(shell).toHaveAttribute('data-map-center', '1465.00,1626.00');
  await expect(shell).toHaveAttribute('data-map-zoom', '0.75');
  await expect(page).toHaveURL(/q=Aguas\+Profundas&geo=geo-waterdeep/);
  await expectPinNotTextDimmed(page.locator('[data-place-id="place-demo-harbor"]'));
  await expectPinNotTextDimmed(page.locator('[data-place-id="place-demo-pass"]'));
});

test('Back and Forward reconstruct geographic navigation without restoring textual dimming', async ({
  page,
}) => {
  await openReadyMap(page);
  await selectGeographicResult(page, 'Waterdeep', /Waterdeep.*Lugar geográfico/i);

  const exactPin = page.locator('[data-place-id="place-demo-harbor"]');
  const nearbyPin = page.locator('[data-place-id="place-demo-pass"]');
  await exactPin.click();
  await expect(page).toHaveURL(/place=puerto-de-demostracion&q=Waterdeep&geo=geo-waterdeep/);

  await page.goBack();
  await expect(page).toHaveURL(/q=Waterdeep&geo=geo-waterdeep/);
  await expect(page).not.toHaveURL(/place=/);
  await expect(page.getByTestId('map-shell')).toHaveAttribute(
    'data-search-highlight-kind',
    'point',
  );
  await expect(page.getByTestId('place-details')).toBeHidden();
  await expectPinNotTextDimmed(exactPin);
  await expectPinNotTextDimmed(nearbyPin);

  await page.goForward();
  await expect(page).toHaveURL(/place=puerto-de-demostracion&q=Waterdeep&geo=geo-waterdeep/);
  await expect(page.getByTestId('place-details')).toBeVisible();
  await expect(page.getByTestId('place-details')).toContainText('Yawning Portal');
  await expectPinNotTextDimmed(exactPin);
  await expectPinNotTextDimmed(nearbyPin);
});

for (const viewport of [
  { width: 320, height: 740 },
  { width: 430, height: 932 },
] as const) {
  test(`geographic navigation and the MAP-037 bottom sheet stay usable at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openReadyMap(page);
    await selectGeographicResult(page, 'Waterdeep', /Waterdeep.*Lugar geográfico/i);

    const exactPin = page.locator('[data-place-id="place-demo-harbor"]');
    await expectPinNotTextDimmed(exactPin);
    await exactPin.click();

    const mapBox = await page.locator('[data-map-canvas]').boundingBox();
    const panel = page.getByTestId('place-details');
    const panelBox = await panel.boundingBox();

    await expect(panel).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(mapBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    if (mapBox && panelBox) {
      expect(panelBox.height).toBeLessThanOrEqual(mapBox.height * 0.49);
      expect(panelBox.y).toBeGreaterThanOrEqual(mapBox.y + mapBox.height * 0.5);
    }
  });
}
