import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const REGION_ID = 'entity-map061-selection-region';
const POINT_ID = 'entity-map061-selection-point';

const ROWS: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
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
      id: 'category-map061-selection-region',
      slug: 'map061-selection-region',
      name: 'Región de selección',
      description: '',
    },
    {
      id: 'category-map061-selection-point',
      slug: 'map061-selection-point',
      name: 'Pin de selección',
      description: '',
    },
  ],
  map_entities: [
    {
      id: REGION_ID,
      slug: 'map061-selection-region',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Selection Region MAP061',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      geometry: {
        kind: 'polygon',
        vertices: [
          { x: 850, y: 650 },
          { x: 1250, y: 650 },
          { x: 1250, y: 1050 },
          { x: 850, y: 1050 },
        ],
      },
      x: 1050,
      y: 850,
      category_id: 'category-map061-selection-region',
    },
    {
      id: POINT_ID,
      slug: 'map061-selection-point',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Selection Point MAP061',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      geometry: { kind: 'point', coordinates: { x: 1050, y: 850 } },
      x: 1050,
      y: 850,
      category_id: 'category-map061-selection-point',
    },
  ],
  tags: [],
  players: [],
  entity_aliases: [],
  entity_tags: [],
  entity_player_dispositions: [],
  entity_player_associations: [],
  character_location_relations: [],
  public_notes: [],
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
      publishableKey: 'sb_publishable_map061_selection',
      timeoutMs: 2000,
      retryDelaysMs: [0, 0, 0],
    };
  }, PROJECT_URL);

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329"><rect width="3600" height="2329" fill="#ddd"/></svg>',
    });
  });

  await page.route('**/rest/v1/**', async (route: Route) => {
    const match = /\/rest\/v1\/([^?]+)/.exec(route.request().url());
    const table = match?.[1] ?? '';
    const rows = ROWS[table] ?? [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Content-Range': rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`,
      },
      body: JSON.stringify(rows),
    });
  });
}

test('switching between a supplemental point and region leaves only one active map entity', async ({
  page,
}) => {
  await configureBackend(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');

  const point = page.locator(`[data-pin-id="${POINT_ID}"]`);
  const region = page.locator(`.campaign-region[data-region-id="${REGION_ID}"]`);
  await expect(point).toBeVisible();
  await expect(region).toBeVisible();

  await point.click();
  await expect(point).toHaveAttribute('aria-pressed', 'true');
  await expect(region).toHaveAttribute('aria-pressed', 'false');

  await region.focus();
  await page.keyboard.press('Enter');
  await expect(region).toHaveAttribute('aria-pressed', 'true');
  await expect(point).toHaveAttribute('aria-pressed', 'false');

  await point.click({ force: true });
  await expect(point).toHaveAttribute('aria-pressed', 'true');
  await expect(region).toHaveAttribute('aria-pressed', 'false');
});
