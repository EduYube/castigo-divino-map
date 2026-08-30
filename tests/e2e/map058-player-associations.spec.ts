import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const PORTRAIT_PATH = 'portraits/12345678-1234-4123-8123-123456789abc.png';
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
      id: 'category-map058',
      slug: 'map058',
      name: 'MAP-058',
      description: '',
    },
  ],
  tags: [],
  players: [
    {
      id: 'player-skade',
      slug: 'skade',
      display_name: 'Skade',
      name_language: 'en',
      accent_color: '#c2410c',
    },
    {
      id: 'player-ura',
      slug: 'ura',
      display_name: 'Ura',
      name_language: 'en',
      accent_color: '#1e3a8a',
    },
    {
      id: 'player-veyra',
      slug: 'veyra',
      display_name: 'Veyra',
      name_language: 'en',
      accent_color: '#9d174d',
    },
  ],
  map_entities: [
    {
      id: 'entity-map058-none',
      slug: 'map058-none',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Sin asociación',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      x: 700,
      y: 620,
      category_id: 'category-map058',
    },
    {
      id: 'entity-map058-skade',
      slug: 'map058-skade',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Retrato de Skade',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: PORTRAIT_PATH,
      x: 1050,
      y: 760,
      category_id: 'category-map058',
    },
    {
      id: 'entity-map058-ura',
      slug: 'map058-ura',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Vínculo de Ura',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      x: 1400,
      y: 920,
      category_id: 'category-map058',
    },
    {
      id: 'entity-map058-veyra',
      slug: 'map058-veyra',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Vínculo de Veyra',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      x: 1750,
      y: 1080,
      category_id: 'category-map058',
    },
    {
      id: 'place-map058-multi',
      slug: 'map058-multi',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Emplazamiento compartido',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      x: 2100,
      y: 1240,
      category_id: 'category-map058',
    },
  ],
  entity_aliases: [],
  entity_tags: [],
  entity_player_dispositions: [],
  entity_player_associations: [
    { entity_id: 'entity-map058-skade', player_id: 'player-skade' },
    { entity_id: 'entity-map058-ura', player_id: 'player-ura' },
    { entity_id: 'entity-map058-veyra', player_id: 'player-veyra' },
    { entity_id: 'place-map058-multi', player_id: 'player-skade' },
    { entity_id: 'place-map058-multi', player_id: 'player-ura' },
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
      publishableKey: 'sb_publishable_map058_test_key',
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

function marker(page: Page, id: string) {
  return page.locator(`[data-testid="entity-pin"][data-pin-id="${id}"]`);
}

test('renders zero, single and multiple player associations without changing pin semantics', async ({
  page,
}) => {
  await openMap(page);

  const none = marker(page, 'entity-map058-none');
  const skade = marker(page, 'entity-map058-skade');
  const ura = marker(page, 'entity-map058-ura');
  const veyra = marker(page, 'entity-map058-veyra');
  const multi = marker(page, 'place-map058-multi');

  await expect(none.locator('.pin-player-association-ring')).toHaveCount(0);
  await expect(none).not.toHaveAttribute('data-association-count');

  for (const [pin, color, playerName] of [
    [skade, '#c2410c', 'Skade'],
    [ura, '#1e3a8a', 'Ura'],
    [veyra, '#9d174d', 'Veyra'],
  ] as const) {
    await expect(pin).toHaveAttribute('data-association-count', '1');
    await expect(pin).toHaveAttribute(
      'aria-description',
      new RegExp(`Relacionado con: ${playerName}`),
    );
    await expect(pin.locator('.pin-player-association-ring')).toHaveCSS(
      '--pin-player-association-accent',
      color,
    );
  }

  await expect(multi).toHaveAttribute('data-association-count', '2');
  await expect(multi).toHaveAttribute('aria-description', /Relacionado con: Skade, Ura\./);
  const multiAccent = await multi
    .locator('.pin-player-association-ring')
    .evaluate((element) =>
      element.style.getPropertyValue('--pin-player-association-accent').replaceAll(' ', ''),
    );
  expect(multiAccent).toContain('#c2410c');
  expect(multiAccent).toContain('#1e3a8a');
  expect(multiAccent).toContain('conic-gradient');

  await expect(multi.locator('.pin-visual')).toHaveClass(/pin-visual--location/);
  await expect(multi.locator('.pin-player-association-ring')).toHaveClass(
    /pin-player-association-ring--location/,
  );

  const skadeBox = await skade.boundingBox();
  const multiBox = await multi.boundingBox();
  expect(skadeBox?.width).toBe(52);
  expect(skadeBox?.height).toBe(52);
  expect(multiBox?.width).toBe(52);
  expect(multiBox?.height).toBe(52);
});

test('keeps portrait footprint, keyboard interaction and textual association details', async ({
  page,
}) => {
  await openMap(page);
  const skade = marker(page, 'entity-map058-skade');

  await expect(skade.locator('.pin-visual__portrait')).toBeVisible();
  await expect(skade).toHaveAttribute('data-portrait-marker', 'true');
  const before = await skade.boundingBox();
  expect(before?.width).toBe(52);
  expect(before?.height).toBe(52);

  await skade.focus();
  await expect(skade).toBeFocused();
  await page.keyboard.press('Enter');

  const details = page.getByTestId('place-details');
  await expect(details).toBeVisible();
  await expect(details).toContainText('Relacionado con');
  await expect(details).toContainText('Skade');
  await expect(details).toContainText('Relación con los personajes');

  const fullAction = details.getByRole('link', { name: /Abrir ficha completa/ });
  const fullHref = await fullAction.getAttribute('href');
  await page.goto(fullHref ?? '/');
  await expect(page.getByRole('heading', { level: 2, name: 'Relacionado con' })).toBeVisible();
  await expect(page.locator('.full-entity__associations')).toContainText('Skade');
});

test('keeps associations perceivable without relying on color in forced-colors mode', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await openMap(page);

  const multi = marker(page, 'place-map058-multi');
  await expect(multi.locator('.pin-player-association-count')).toBeVisible();
  await expect(multi.locator('.pin-player-association-count')).toHaveText('2');
  await expect(multi).toHaveAttribute('aria-description', /Relacionado con: Skade, Ura\./);

  await multi.focus();
  await expect(multi).toBeFocused();
  await expect(multi).toHaveCSS('outline-style', 'solid');
});
