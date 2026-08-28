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
  categories: [],
  tags: [],
  players: [],
  map_entities: [],
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
    },
  ],
  geographic_name_aliases: [
    {
      id: 'geo-alias-waterdeep-city-of-splendors',
      geographic_name_id: 'geo-waterdeep',
      language: 'en',
      value: 'City of Splendors',
    },
    {
      id: 'geo-alias-waterdeep-es',
      geographic_name_id: 'geo-waterdeep',
      language: 'es',
      value: 'Aguas Profundas',
    },
  ],
  character_location_events: [],
};

async function configureMap(page: Page, remoteAvailable: boolean): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map040_test_key',
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

async function openSearch(page: Page): Promise<void> {
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  const toggle = page.locator('[data-place-search-toggle]');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click();
  }
}

function searchInput(page: Page) {
  return page.getByRole('searchbox', { name: 'Buscar lugares' });
}

function searchSuggestions(page: Page) {
  return page.getByRole('listbox', { name: 'Sugerencias de búsqueda' });
}

async function chooseFirstSuggestion(page: Page, query: string): Promise<void> {
  const input = searchInput(page);
  await input.fill(query);
  await expect(searchSuggestions(page)).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');
}

test('Aguas Profundas and Waterdeep select the exact same geographic target through Supabase', async ({
  page,
}) => {
  await configureMap(page, true);
  await page.goto('/');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'connected',
  );
  await openSearch(page);

  const input = searchInput(page);
  const mapShell = page.getByTestId('map-shell');
  const initialMarkerCount = await page.getByTestId('place-marker').count();

  await input.fill('aguas');
  const partialSuggestion = searchSuggestions(page).getByRole('option').first();
  await expect(partialSuggestion).toContainText('Waterdeep');
  await expect(partialSuggestion).toContainText('Coincidencia por alias: Aguas Profundas');

  await input.fill('Aguas Profundas');
  await input.press('ArrowDown');
  await input.press('Enter');

  await expect(input).toHaveValue('Waterdeep');
  await expect(mapShell).toHaveAttribute('data-map-center', '1465.00,1626.00');
  await expect(mapShell).toHaveAttribute('data-map-zoom', '0.75');
  await expect(mapShell).toHaveAttribute('data-search-highlight', 'true');
  expect(await page.getByTestId('place-marker').count()).toBe(initialMarkerCount);
  const spanishCenter = await mapShell.getAttribute('data-map-center');
  const spanishZoom = await mapShell.getAttribute('data-map-zoom');

  await chooseFirstSuggestion(page, 'Waterdeep');
  await expect(mapShell).toHaveAttribute('data-map-center', spanishCenter ?? '');
  await expect(mapShell).toHaveAttribute('data-map-zoom', spanishZoom ?? '');
  await expect(mapShell).toHaveAttribute('data-search-highlight', 'true');
  expect(await page.getByTestId('place-marker').count()).toBe(initialMarkerCount);
  expect(new URL(page.url()).searchParams.get('q')).toBe('Waterdeep');
});

test('Aguas Profundas remains searchable from the bundled snapshot when Supabase is degraded', async ({
  page,
}) => {
  await configureMap(page, false);
  await page.goto('/');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'degraded',
  );
  await openSearch(page);

  const mapShell = page.getByTestId('map-shell');
  const initialMarkerCount = await page.getByTestId('place-marker').count();
  const input = searchInput(page);

  await input.fill('aguas');
  const suggestion = searchSuggestions(page).getByRole('option').first();
  await expect(suggestion).toContainText('Waterdeep');
  await expect(suggestion).toContainText('Aguas Profundas');
  await input.press('ArrowDown');
  await input.press('Enter');

  await expect(input).toHaveValue('Waterdeep');
  await expect(mapShell).toHaveAttribute('data-map-center', '1465.00,1626.00');
  await expect(mapShell).toHaveAttribute('data-map-zoom', '0.75');
  await expect(mapShell).toHaveAttribute('data-search-highlight', 'true');
  expect(await page.getByTestId('place-marker').count()).toBe(initialMarkerCount);
});
