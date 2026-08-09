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
      id: 'category-settlement',
      slug: 'asentamientos',
      name: 'Asentamiento',
      description: '',
    },
    {
      id: 'category-landmark',
      slug: 'lugares-destacados',
      name: 'Lugar destacado',
      description: '',
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
      name: 'Puerto de demostración',
      name_language: 'en',
      summary: '',
      description: '',
      x: 1080.5,
      y: 820,
      category_id: 'category-settlement',
    },
    {
      id: 'place-demo-pass',
      slug: 'paso-de-demostracion',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Paso de demostración',
      name_language: 'en',
      summary: '',
      description: '',
      x: 2240,
      y: 1240.25,
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
      id: 'geo-daggerford',
      slug: 'daggerford',
      name: 'Daggerford',
      language: 'en',
      x: 1742,
      y: 1386,
      recommended_zoom: 0.75,
      entity_id: null,
    },
    {
      id: 'geo-fields-of-the-dead',
      slug: 'the-fields-of-the-dead',
      name: 'The Fields of the Dead',
      language: 'en',
      x: 2016,
      y: 959,
      recommended_zoom: 0.5,
      entity_id: null,
    },
    {
      id: 'geo-high-forest',
      slug: 'the-high-forest',
      name: 'The High Forest',
      language: 'en',
      x: 2098,
      y: 1809,
      recommended_zoom: 0.5,
      entity_id: null,
    },
    {
      id: 'geo-neverwinter',
      slug: 'neverwinter',
      name: 'Neverwinter',
      language: 'en',
      x: 1433,
      y: 1853,
      recommended_zoom: 0.75,
      entity_id: null,
    },
    {
      id: 'geo-sword-mountains',
      slug: 'sword-mountains',
      name: 'Sword Mountains',
      language: 'en',
      x: 1610,
      y: 1569,
      recommended_zoom: 0.5,
      entity_id: null,
    },
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
      id: 'geo-alias-fields-of-the-dead',
      geographic_name_id: 'geo-fields-of-the-dead',
      language: 'en',
      value: 'Fields of the Dead',
    },
    {
      id: 'geo-alias-high-forest',
      geographic_name_id: 'geo-high-forest',
      language: 'en',
      value: 'High Forest',
    },
    {
      id: 'geo-alias-waterdeep-city-of-splendors',
      geographic_name_id: 'geo-waterdeep',
      language: 'en',
      value: 'City of Splendors',
    },
  ],
  character_location_events: [],
};

async function mockMap(page: Page): Promise<void> {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });
}

async function configureRemoteGeography(page: Page): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map032_geography_test_key',
      timeoutMs: 2000,
      retryDelaysMs: [0, 0, 0],
    };
  }, LOCAL_SUPABASE_URL);
  await mockMap(page);
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

async function openRemoteGeography(page: Page): Promise<void> {
  await configureRemoteGeography(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'connected',
  );
}

test('locates Waterdeep from remote geographic data at the measured position and zoom', async ({
  page,
}) => {
  await openRemoteGeography(page);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await searchbox.fill('Waterdeep');
  const result = page.getByRole('button', {
    name: /Waterdeep.*Lugar geográfico.*Coincidencia por nombre principal/i,
  });

  await expect(result).toBeVisible();
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await result.click();

  const shell = page.getByTestId('map-shell');
  await expect(shell).toHaveAttribute('data-map-center', '1465.00,1626.00');
  await expect(shell).toHaveAttribute('data-map-zoom', '0.75');
  await expect(shell).toHaveAttribute('data-search-highlight', 'true');
  await expect(page.locator('[data-map-search-status]')).toContainText(
    'Mapa centrado en Waterdeep, lugar geográfico',
  );
  await expect(page.getByTestId('place-details')).toBeHidden();
});

test('searches a representative settlement and region sample without campaign pins', async ({
  page,
}) => {
  await openRemoteGeography(page);
  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });

  for (const [query, expectedName] of [
    ['Neverwinter', 'Neverwinter'],
    ['Daggerford', 'Daggerford'],
    ['Sword Mountains', 'Sword Mountains'],
    ['High Forest', 'The High Forest'],
    ['Fields of the Dead', 'The Fields of the Dead'],
  ] as const) {
    await searchbox.fill(query);
    await expect(
      page.getByRole('button', { name: new RegExp(`${expectedName}.*Lugar geográfico`, 'i') }),
    ).toBeVisible();
  }

  await searchbox.fill('City of Splendors');
  await expect(
    page.getByRole('button', { name: /Waterdeep.*Lugar geográfico.*Coincidencia por alias/i }),
  ).toBeVisible();
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
});

test('locates Waterdeep from the bundled snapshot when Supabase is unavailable', async ({ page }) => {
  await mockMap(page);
  await page.route('**/rest/v1/**', async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/?q=Waterdeep');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'degraded',
  );

  const result = page.getByRole('button', {
    name: /Waterdeep.*Lugar geográfico.*Coincidencia por nombre principal/i,
  });
  await expect(result).toBeVisible();
  await result.click();

  const shell = page.getByTestId('map-shell');
  await expect(shell).toHaveAttribute('data-map-center', '1465.00,1626.00');
  await expect(shell).toHaveAttribute('data-map-zoom', '0.75');
  await expect(shell).toHaveAttribute('data-search-highlight', 'true');
});
