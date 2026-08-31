import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const REGION_A_ID = 'entity-map061-cromryn';
const REGION_B_ID = 'entity-map061-overlap';
const INNER_PIN_ID = 'entity-map061-witness';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
    <text x="1000" y="800">Raster label below MAP-061 regions</text>
  </svg>
`;

const PUBLIC_ROWS: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  campaigns: [
    {
      id: CAMPAIGN_ID,
      slug: 'castigo-divino',
      name: 'Castigo Divino',
      status: 'active',
      display_order: 0,
    },
  ],
  categories: [
    {
      id: 'category-map061-regions',
      slug: 'map061-regions',
      name: 'Regiones MAP061',
      description: '',
    },
    {
      id: 'category-map061-overlap',
      slug: 'map061-overlap',
      name: 'Región solapada MAP061',
      description: '',
    },
    {
      id: 'category-map061-pins',
      slug: 'map061-pins',
      name: 'Pines MAP061',
      description: '',
    },
  ],
  tags: [{ id: 'map061-region', name: 'Área MAP061', description: '' }],
  players: [],
  map_entities: [
    {
      id: REGION_A_ID,
      slug: 'cromryn-map061',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Cromryn Region MAP061',
      name_language: 'en',
      summary: 'Persistent polygon region.',
      description: '',
      portrait_path: null,
      geometry: {
        kind: 'polygon',
        vertices: [
          { x: 800, y: 600 },
          { x: 1200, y: 600 },
          { x: 1200, y: 1000 },
          { x: 800, y: 1000 },
        ],
      },
      x: 1000,
      y: 800,
      category_id: 'category-map061-regions',
    },
    {
      id: REGION_B_ID,
      slug: 'overlap-map061',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Overlap Region MAP061',
      name_language: 'en',
      summary: 'Second translucent polygon.',
      description: '',
      portrait_path: null,
      geometry: {
        kind: 'polygon',
        vertices: [
          { x: 1050, y: 700 },
          { x: 1350, y: 700 },
          { x: 1350, y: 950 },
          { x: 1050, y: 950 },
        ],
      },
      x: 1200,
      y: 825,
      category_id: 'category-map061-overlap',
    },
    {
      id: INNER_PIN_ID,
      slug: 'witness-map061',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Witness Inside MAP061',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      geometry: { kind: 'point', coordinates: { x: 1000, y: 800 } },
      x: 1000,
      y: 800,
      category_id: 'category-map061-pins',
    },
  ],
  entity_aliases: [],
  entity_tags: [{ entity_id: REGION_A_ID, tag_id: 'map061-region' }],
  entity_player_dispositions: [],
  entity_player_associations: [],
  character_location_relations: [],
  public_notes: [
    {
      id: 'note-map061-cromryn',
      slug: 'map061-cromryn-note',
      entity_id: REGION_A_ID,
      title: 'Cromryn remains the same entity',
      body: 'Public identity survives point-to-polygon conversion.',
      sort_order: 0,
    },
  ],
  public_note_tags: [],
  geographic_names: [],
  geographic_name_aliases: [],
  character_location_events: [],
  campaign_geographic_entity_links: [],
};

async function configureBackend(page: Page): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map061_region_key',
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

async function openMap(page: Page): Promise<void> {
  await configureBackend(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'connected',
  );
  await expect(region(page, REGION_A_ID)).toBeVisible();
  await expect(region(page, REGION_B_ID)).toBeVisible();
}

function region(page: Page, id: string) {
  return page.locator(`.campaign-region[data-region-id="${id}"]`);
}

function insidePin(page: Page) {
  return page.locator(`[data-pin-id="${INNER_PIN_ID}"]`);
}

async function closeDetails(page: Page): Promise<void> {
  const panel = page.getByTestId('place-details');
  if (await panel.isVisible()) {
    await panel.locator('[data-place-details-close]').click();
    await expect(panel).toBeHidden();
  }
}

test('renders translucent overlapping regions below an operable inner pin without clustering polygons', async ({
  page,
}) => {
  await openMap(page);
  const cromryn = region(page, REGION_A_ID);
  const overlap = region(page, REGION_B_ID);
  const pin = insidePin(page);

  await expect(cromryn).toHaveAttribute('role', 'button');
  await expect(cromryn).toHaveAttribute('tabindex', '0');
  await expect(cromryn).toHaveAttribute('aria-label', /Cromryn Region MAP061.*Región de campaña/i);
  await expect(page.locator(`[data-pin-id="${REGION_A_ID}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-pin-id="${REGION_B_ID}"]`)).toHaveCount(0);
  await expect(pin).toBeVisible();

  const layerOrder = await page.evaluate(() => ({
    regions: Number(getComputedStyle(document.querySelector('.campaign-regions-pane')!).zIndex),
    pins: Number(getComputedStyle(document.querySelector('.leaflet-marker-pane')!).zIndex),
  }));
  expect(layerOrder.regions).toBeLessThan(layerOrder.pins);

  const opacity = await cromryn.evaluate((element) =>
    Number(getComputedStyle(element).fillOpacity),
  );
  const overlapOpacity = await overlap.evaluate((element) =>
    Number(getComputedStyle(element).fillOpacity),
  );
  expect(opacity).toBeLessThanOrEqual(0.1);
  expect(overlapOpacity).toBeLessThanOrEqual(0.1);

  await pin.click();
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    INNER_PIN_ID,
  );
  await expect(page.getByTestId('place-details')).toContainText('Witness Inside MAP061');
  await closeDetails(page);

  await cromryn.click();
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    REGION_A_ID,
  );
  await expect(page.getByTestId('place-details')).toContainText('Cromryn Region MAP061');
  await expect(cromryn).toHaveClass(/campaign-region--active/);
  await expect(cromryn).toHaveAttribute('aria-pressed', 'true');

  await closeDetails(page);
  await expect(cromryn).toBeFocused();
  await cromryn.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    REGION_A_ID,
  );
});

test('searching the region frames persistent polygon bounds and opens the same entity details', async ({
  page,
}) => {
  await openMap(page);
  const toggle = page.locator('[data-place-search-toggle]');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();

  const input = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await input.fill('Cromryn Region MAP061');
  await input.press('Escape');
  await page
    .getByRole('list', { name: 'Resultados de búsqueda de lugares' })
    .getByRole('button', { name: /Cromryn Region MAP061.*Emplazamiento/i })
    .click();

  await expect(page.locator('[data-map-canvas]')).toHaveAttribute(
    'data-region-focus-bounds',
    '800,1200,600,1000',
  );
  await expect(page.getByTestId('map-shell')).not.toHaveAttribute(
    'data-search-highlight-kind',
    'area',
  );
  await expect(page.locator('[data-map-search-status]')).toContainText('región de campaña');
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    REGION_A_ID,
  );
  await expect(page.getByTestId('place-details')).toContainText('Cromryn remains the same entity');
  await expect(region(page, REGION_A_ID)).toHaveAttribute('aria-pressed', 'true');
});

test('explicit filters dim non-matching regions without removing their selection semantics', async ({
  page,
}) => {
  await openMap(page);
  const cromryn = region(page, REGION_A_ID);
  const overlap = region(page, REGION_B_ID);

  await page.getByRole('checkbox', { name: /Regiones MAP061/ }).check();

  await expect(cromryn).toHaveAttribute('data-region-match', 'true');
  await expect(overlap).toHaveAttribute('data-region-match', 'false');
  await expect(overlap).toHaveClass(/campaign-region--dimmed/);
  await expect(insidePin(page)).toHaveAttribute('data-filter-match', 'false');
  await expect(overlap).toHaveAttribute(
    'aria-label',
    /No coincide con los filtros explícitos actuales/i,
  );

  await overlap.click();
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    REGION_B_ID,
  );
  await expect(overlap).toHaveClass(/campaign-region--active/);
  await expect(overlap).toHaveClass(/campaign-region--dimmed/);
});

for (const width of [320, 390, 430]) {
  test(`keeps region selection and details usable at ${width}px without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 780 });
    await openMap(page);
    const cromryn = region(page, REGION_A_ID);

    await cromryn.click();
    await expect(page.getByTestId('place-details')).toHaveAttribute(
      'data-active-place-id',
      REGION_A_ID,
    );
    await expect(page.getByTestId('place-details')).toBeVisible();
    await expect(cromryn).toHaveAttribute('aria-pressed', 'true');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });
}

test('forced-colors keeps a visible non-colour region boundary and keyboard focus state', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await openMap(page);
  const cromryn = region(page, REGION_A_ID);

  await cromryn.focus();
  const visual = await cromryn.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fillOpacity: Number(style.fillOpacity),
      strokeWidth: Number.parseFloat(style.strokeWidth),
      dash: style.strokeDasharray,
    };
  });

  expect(visual.fillOpacity).toBeLessThanOrEqual(0.02);
  expect(visual.strokeWidth).toBeGreaterThanOrEqual(5);
  expect(visual.dash).not.toBe('none');
  await expect(cromryn).toBeFocused();
});
