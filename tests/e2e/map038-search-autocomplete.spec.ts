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
    {
      id: 'category-demo',
      slug: 'demo',
      name: 'Demo',
      description: '',
    },
  ],
  tags: [],
  players: [],
  map_entities: [
    {
      id: 'entity-waterdeep',
      slug: 'waterdeep-campaign',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Waterdeep',
      name_language: 'en',
      summary: '',
      description: '',
      x: 1690,
      y: 1020,
      category_id: 'category-demo',
    },
    {
      id: 'entity-waterfall-pass',
      slug: 'waterfall-pass',
      entity_type: 'location',
      visibility: 'search_only',
      name: 'Waterfall Pass',
      name_language: 'en',
      summary: '',
      description: '',
      x: 1780,
      y: 1110,
      category_id: 'category-demo',
    },
    {
      id: 'entity-waterdhavian-guide',
      slug: 'waterdhavian-guide',
      entity_type: 'character',
      visibility: 'search_only',
      name: 'Waterdhavian Guide',
      name_language: 'en',
      summary: '',
      description: '',
      x: 1760,
      y: 1090,
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
      x: 1690,
      y: 1020,
      recommended_zoom: 0.75,
      entity_id: 'entity-waterdeep',
    },
    {
      id: 'geo-waterdeep-harbor',
      slug: 'waterdeep-harbor',
      name: 'Waterdeep Harbor',
      language: 'en',
      x: 1710,
      y: 1000,
      recommended_zoom: 1,
      entity_id: null,
    },
  ],
  geographic_name_aliases: [
    {
      id: 'geo-alias-city-of-splendors',
      geographic_name_id: 'geo-waterdeep',
      language: 'en',
      value: 'City of Splendors',
    },
  ],
  character_location_events: [],
};

async function configureAutocomplete(page: Page): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map038_test_key',
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

async function openAutocomplete(page: Page): Promise<void> {
  await configureAutocomplete(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'connected',
  );

  const toggle = page.locator('[data-place-search-toggle]');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click();
  }
}

function searchInput(page: Page) {
  return page.getByRole('searchbox', { name: 'Buscar lugares' });
}

test('shows ranked typed suggestions with combobox/listbox semantics', async ({ page }) => {
  await openAutocomplete(page);

  const input = searchInput(page);
  const combobox = page.getByRole('combobox', { name: 'Buscar lugares' });
  const listbox = page.getByRole('listbox', { name: 'Sugerencias de búsqueda' });

  await input.fill('Water');

  await expect(combobox).toHaveAttribute('aria-expanded', 'true');
  await expect(input).toHaveAttribute('aria-autocomplete', 'list');
  await expect(input).toHaveAttribute('aria-controls', 'place-search-suggestions');
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole('option')).toHaveCount(5);

  const labels = await listbox.getByRole('option').allTextContents();
  expect(labels[0]).toContain('Waterdeep');
  expect(labels[0]).toContain('Lugar geográfico');
  expect(labels[1]).toContain('Waterdeep Harbor');
  expect(labels).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Emplazamiento de campaña'),
      expect.stringContaining('Personaje'),
    ]),
  );
});

test('navigates suggestions with arrows and Enter while preserving the selected identity', async ({
  page,
}) => {
  await openAutocomplete(page);

  const input = searchInput(page);
  const listbox = page.getByRole('listbox', { name: 'Sugerencias de búsqueda' });

  await input.fill('Waterd');
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'place-search-suggestion-0');
  await expect(listbox.getByRole('option').nth(0)).toHaveAttribute('aria-selected', 'true');

  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'place-search-suggestion-1');
  await input.press('ArrowUp');
  await expect(input).toHaveAttribute('aria-activedescendant', 'place-search-suggestion-0');
  await input.press('Enter');

  await expect(input).toHaveValue('Waterdeep');
  await expect(input).toBeFocused();
  await expect(listbox).toBeHidden();
  await expect(input).not.toHaveAttribute('aria-activedescendant', /.+/);
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-center', '1020.00,1690.00');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-zoom', '0.75');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-search-highlight', 'true');
  expect(new URL(page.url()).searchParams.get('q')).toBe('Waterdeep');
});

test('Escape and blur close only the popup and free search remains available', async ({ page }) => {
  await openAutocomplete(page);

  const input = searchInput(page);
  const combobox = page.getByRole('combobox', { name: 'Buscar lugares' });
  const listbox = page.getByRole('listbox', { name: 'Sugerencias de búsqueda' });

  await input.fill('Water');
  await expect(listbox).toBeVisible();
  await input.press('Escape');
  await expect(listbox).toBeHidden();
  await expect(combobox).toHaveAttribute('aria-expanded', 'false');
  await expect(input).toHaveValue('Water');

  await input.type('fall');
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole('option')).toContainText(['Waterfall Pass']);

  await page.locator('[data-place-filters-toggle]').focus();
  await expect(listbox).toBeHidden();
  await expect(input).toHaveValue('Waterfall');

  await input.fill('Consulta libre sin coincidencias');
  await expect(page.locator('[data-place-search-status]')).toContainText(
    'No hay lugares, personajes ni nombres geográficos',
  );
  expect(new URL(page.url()).searchParams.get('q')).toBe('Consulta libre sin coincidencias');
});

test('supports pointer/touch selection at 320 px without overflow or losing the map', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openAutocomplete(page);

  const input = searchInput(page);
  const listbox = page.getByRole('listbox', { name: 'Sugerencias de búsqueda' });
  const mapShell = page.getByTestId('map-shell');

  await input.fill('Waterf');
  const exactSuggestion = page.locator(
    '[role="option"][data-search-suggestion-id="entity-waterfall-pass"]',
  );

  await expect(exactSuggestion).toBeVisible();
  const listboxBox = await listbox.boundingBox();
  expect(listboxBox).not.toBeNull();
  expect(listboxBox!.x).toBeGreaterThanOrEqual(0);
  expect(listboxBox!.x + listboxBox!.width).toBeLessThanOrEqual(321);
  expect(listboxBox!.height).toBeLessThan(210);

  if (testInfo.project.name.startsWith('mobile-')) {
    await exactSuggestion.tap();
  } else {
    await exactSuggestion.click();
  }

  await expect(input).toHaveValue('Waterfall Pass');
  await expect(listbox).toBeHidden();
  await expect(mapShell).toBeVisible();
  const selectedCenter = await mapShell.getAttribute('data-map-center');
  expect(selectedCenter).not.toBeNull();
  const [centerY, centerX] = (selectedCenter ?? '').split(',').map(Number);
  expect(centerX).toBeCloseTo(1780, 1);
  expect(centerY).toBeGreaterThanOrEqual(1110);
  expect(centerY).toBeLessThan(1200);
  expect(new URL(page.url()).searchParams.get('q')).toBe('Waterfall Pass');

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBe(false);

  const filtersToggle = page.locator('[data-place-filters-toggle]');
  await filtersToggle.click();
  await expect(filtersToggle).toHaveAttribute('aria-expanded', 'true');
});

test('keeps the popup bounded without shifting the map in short mobile landscape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 360 });
  await openAutocomplete(page);

  const input = searchInput(page);
  const listbox = page.getByRole('listbox', { name: 'Sugerencias de búsqueda' });
  const mapShell = page.getByTestId('map-shell');

  await input.fill('Water');
  await expect(listbox).toBeVisible();

  const listboxBox = await listbox.boundingBox();
  const mapDocumentTopWithPopup = await mapShell.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  expect(listboxBox).not.toBeNull();
  expect(listboxBox!.height).toBeLessThanOrEqual(112);

  await input.press('Escape');
  await expect(listbox).toBeHidden();
  await expect(input).toHaveValue('Water');

  const mapDocumentTopWithoutPopup = await mapShell.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  expect(Math.abs(mapDocumentTopWithoutPopup - mapDocumentTopWithPopup)).toBeLessThanOrEqual(1);

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBe(false);
});
