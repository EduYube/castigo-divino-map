import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const PORTRAIT_PATH = 'portraits/64000000-0000-4000-8000-000000000064.png';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9WlH0AAAAASUVORK5CYII=',
  'base64',
);

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
      id: 'category-map064-functional',
      slug: 'map064-functional',
      name: 'MAP-064 funcional',
      description: '',
    },
  ],
  tags: [],
  players: [
    {
      id: 'player-map064',
      slug: 'map064-player',
      display_name: 'Skade MAP064',
      name_language: 'en',
      accent_color: '#c2410c',
    },
  ],
  map_entities: [
    {
      id: 'entity-map064-portrait-character',
      slug: 'map064-portrait-character',
      entity_type: 'character',
      lifecycle_status: null,
      visibility: 'pin',
      name: 'Retrato MAP064',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: PORTRAIT_PATH,
      x: 650,
      y: 450,
      category_id: 'category-map064-functional',
    },
    {
      id: 'entity-map064-associated-mission',
      slug: 'map064-associated-mission',
      entity_type: 'mission',
      lifecycle_status: 'active',
      visibility: 'pin',
      name: 'Misión asociada MAP064',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      x: 1200,
      y: 800,
      category_id: 'category-map064-functional',
    },
    {
      id: 'entity-map064-cluster-location',
      slug: 'map064-cluster-location',
      entity_type: 'location',
      lifecycle_status: null,
      visibility: 'pin',
      name: 'Emplazamiento agrupado MAP064',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      x: 1800,
      y: 1100,
      category_id: 'category-map064-functional',
    },
    {
      id: 'entity-map064-cluster-hazard',
      slug: 'map064-cluster-hazard',
      entity_type: 'hazard',
      lifecycle_status: 'resolved',
      visibility: 'pin',
      name: 'Peligro agrupado MAP064',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      x: 1800,
      y: 1100,
      category_id: 'category-map064-functional',
    },
  ],
  entity_aliases: [],
  entity_tags: [],
  entity_player_dispositions: [],
  entity_player_associations: [
    { entity_id: 'entity-map064-associated-mission', player_id: 'player-map064' },
  ],
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
      publishableKey: 'sb_publishable_map064_functional_visuals',
      timeoutMs: 2000,
      retryDelaysMs: [0, 0, 0],
    };
  }, LOCAL_SUPABASE_URL);

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await page.route('**/storage/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG });
  });

  await page.route('**/rest/v1/**', async (route: Route) => {
    const match = /\/rest\/v1\/([^?]+)/.exec(route.request().url());
    const table = match?.[1] ?? '';
    const rows = ROWS[table] ?? [];
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
}

function entityPin(page: Page, id: string) {
  return page.locator(`[data-testid="entity-pin"][data-pin-id="${id}"]`);
}

test('keeps portrait, functional class, player association and coincident grouping as independent visual layers', async ({
  page,
}) => {
  await openMap(page);

  const portrait = entityPin(page, 'entity-map064-portrait-character');
  await expect(portrait).toHaveAttribute('data-entity-type', 'character');
  await expect(portrait.locator('.pin-visual--character')).toBeVisible();
  await expect(portrait.locator('.pin-visual__portrait')).toBeVisible();
  await expect(portrait).toHaveAttribute('data-portrait-marker', 'true');

  const mission = entityPin(page, 'entity-map064-associated-mission');
  await expect(mission).toHaveAttribute('data-entity-type', 'mission');
  await expect(mission.locator('.pin-visual--mission')).toBeVisible();
  await expect(mission).toHaveAttribute('data-association-count', '1');
  await expect(mission.locator('.pin-player-association-ring')).toBeVisible();
  await expect(mission.locator('.pin-player-association-ring')).toHaveClass(
    /pin-player-association-ring--mission/,
  );
  await expect(mission).toHaveAttribute('aria-label', /Misión asociada MAP064\. Misión/i);
  await expect(mission).toHaveAttribute('aria-description', /Relacionado con: Skade MAP064\./i);

  const coincident = page.getByTestId('coincident-pin');
  await expect(coincident).toHaveAttribute('data-pin-count', '2');
  await coincident.focus();
  await page.keyboard.press('Enter');

  const locationOption = page.locator(
    '[data-testid="coincident-pin-option"][data-entity-type="location"]',
  );
  const hazardOption = page.locator(
    '[data-testid="coincident-pin-option"][data-entity-type="hazard"]',
  );

  const options = page.getByTestId('coincident-pin-option');
  await expect(options).toHaveCount(2);
  await expect(locationOption).toHaveCount(1);
  await expect(hazardOption).toHaveCount(1);
  await expect(options.locator('.pin-visual--location')).toHaveCount(1);
  await expect(options.locator('.pin-visual--hazard')).toHaveCount(1);
  await expect(locationOption.or(hazardOption)).toHaveCount(2);

  await hazardOption.click();
  const details = page.getByTestId('place-details');
  await expect(details).toHaveAttribute('data-entity-type', 'hazard');
  await expect(details).toContainText('Peligro');
  await expect(details).toContainText('Resuelto');

  await details
    .getByRole('button', { name: /Cerrar la ficha de Peligro agrupado MAP064/i })
    .click();
  await expect(details).toBeHidden();
  await mission.click();
  await expect(details).toHaveAttribute('data-entity-type', 'mission');
  await expect(details).toContainText('Misión');
  await expect(details).toContainText('Activa');
  await expect(details).toContainText('Relacionado con');
  await expect(details).toContainText('Skade MAP064');
});

test('functional pins keep perceivable focus and text semantics in forced-colors mode', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await openMap(page);

  const mission = entityPin(page, 'entity-map064-associated-mission');
  await mission.focus();
  await expect(mission).toBeFocused();
  await expect(mission).toHaveCSS('outline-style', 'solid');
  await expect(mission).toHaveAttribute('aria-label', /Misión/i);
  await expect(mission).toHaveAttribute('aria-description', /Skade MAP064/i);
});
