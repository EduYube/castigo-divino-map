import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

const PUBLIC_ROWS: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  categories: [
    { id: 'category-demo', slug: 'demo', name: 'Demo', description: '' },
  ],
  tags: [],
  players: [],
  map_entities: [
    {
      id: 'entity-sword-coast-witness',
      slug: 'sword-coast-witness',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Sword Coast Witness',
      name_language: 'en',
      summary: 'Campaign pin inside the representative Sword Coast extent.',
      description: '',
      x: 1500,
      y: 1000,
      category_id: 'category-demo',
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

async function configureMap(page: Page, remoteAvailable: boolean): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map041_test_key',
      timeoutMs: 2000,
      retryDelaysMs: [0, 0, 0],
    };
  }, LOCAL_SUPABASE_URL);
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });
  await page.route('**/rest/v1/**', async (route: Route) => {
    if (!remoteAvailable) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }

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

async function openSearch(page: Page, remoteAvailable = true): Promise<void> {
  await configureMap(page, remoteAvailable);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    remoteAvailable ? 'connected' : 'degraded',
  );
  const toggle = page.locator('[data-place-search-toggle]');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
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

test('switches point → extent → point and replaces the previous focus highlight', async ({ page }) => {
  await openSearch(page);
  const shell = page.getByTestId('map-shell');

  await selectGeographicResult(page, 'Waterdeep', /Waterdeep.*Lugar geográfico/i);
  await expect(shell).toHaveAttribute('data-search-highlight-kind', 'point');
  await expect(shell).toHaveAttribute('data-map-center', '1465.00,1626.00');
  await expect(shell).toHaveAttribute('data-map-zoom', '0.75');
  await expect(page.locator('[data-map-search-status]')).toContainText(
    'Mapa centrado en Waterdeep, lugar geográfico',
  );

  await selectGeographicResult(page, 'Sword Coast', /Sword Coast.*Lugar geográfico/i);
  await expect(shell).toHaveAttribute('data-search-highlight-kind', 'area');
  await expect(shell).toHaveAttribute('data-search-highlight-bounds', '1380,1710,750,1500');
  await expect(page.locator('.geographic-search-area-highlight')).toHaveCount(1);
  await expect(page.locator('.geographic-search-highlight__symbol')).toHaveCount(0);
  await expect(page.locator('[data-map-search-status]')).toContainText(
    'extensión aproximada de búsqueda resaltada',
  );

  await selectGeographicResult(page, 'Aguas Profundas', /Waterdeep.*Lugar geográfico.*alias/i);
  await expect(shell).toHaveAttribute('data-search-highlight-kind', 'point');
  await expect(shell).toHaveAttribute('data-map-center', '1465.00,1626.00');
  await expect(shell).toHaveAttribute('data-map-zoom', '0.75');
  await expect(page.locator('.geographic-search-area-highlight')).toHaveCount(0);
});

test('Spanish region alias uses identical bounds and the area layer never obstructs a campaign pin', async ({
  page,
}) => {
  await openSearch(page);
  const shell = page.getByTestId('map-shell');
  const pin = page.locator('[data-pin-id="entity-sword-coast-witness"]');

  await selectGeographicResult(page, 'Sword Coast', /Sword Coast.*Lugar geográfico/i);
  const englishCenter = await shell.getAttribute('data-map-center');
  const englishZoom = await shell.getAttribute('data-map-zoom');
  const englishBounds = await shell.getAttribute('data-search-highlight-bounds');

  await selectGeographicResult(
    page,
    'Costa de la Espada',
    /Sword Coast.*Lugar geográfico.*Coincidencia por alias/i,
  );
  await expect(shell).toHaveAttribute('data-map-center', englishCenter ?? '');
  await expect(shell).toHaveAttribute('data-map-zoom', englishZoom ?? '');
  await expect(shell).toHaveAttribute('data-search-highlight-bounds', englishBounds ?? '');
  await expect(pin).toBeVisible();
  await expect(page.locator('.geographic-search-area-pane')).toHaveCSS('pointer-events', 'none');
  await expect(page.locator('.geographic-search-area-highlight')).toHaveCSS('pointer-events', 'none');

  const zOrder = await page.evaluate(() => ({
    area: Number(getComputedStyle(document.querySelector('.geographic-search-area-pane')!).zIndex),
    pins: Number(getComputedStyle(document.querySelector('.leaflet-marker-pane')!).zIndex),
  }));
  expect(zOrder.area).toBeLessThan(zOrder.pins);

  await pin.click();
  await expect(shell).not.toHaveAttribute('data-search-highlight-kind', 'area');
  await expect(page.getByTestId('place-details')).toBeVisible();
});

test('extent framing remains usable without horizontal overflow at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openSearch(page);
  await selectGeographicResult(page, 'Sword Coast', /Sword Coast.*Lugar geográfico/i);

  await expect(page.locator('.geographic-search-area-highlight')).toBeVisible();
  await expect(page.locator('[data-pin-id="entity-sword-coast-witness"]')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
});

test('bundled snapshot preserves the Spanish region extent when Supabase is degraded', async ({
  page,
}) => {
  await openSearch(page, false);
  await selectGeographicResult(
    page,
    'Costa de la Espada',
    /Sword Coast.*Lugar geográfico.*Coincidencia por alias/i,
  );

  const shell = page.getByTestId('map-shell');
  await expect(shell).toHaveAttribute('data-search-highlight-kind', 'area');
  await expect(shell).toHaveAttribute('data-search-highlight-bounds', '1380,1710,750,1500');
  await expect(page.locator('.geographic-search-area-highlight')).toBeVisible();
});
