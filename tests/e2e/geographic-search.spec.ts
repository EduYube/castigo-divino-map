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
      id: 'entity-durnan',
      slug: 'durnan',
      entity_type: 'character',
      visibility: 'search_only',
      name: 'Durnan',
      name_language: 'en',
      summary: '',
      description: '',
      x: 1691,
      y: 1021,
      category_id: 'category-demo',
    },
    {
      id: 'place-demo-harbor',
      slug: 'puerto-de-demostracion',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Demonstration Harbor',
      name_language: 'en',
      summary: '',
      description: '',
      x: 2040,
      y: 1380,
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
      recommended_zoom: 1.5,
      entity_id: 'entity-waterdeep',
    },
    {
      id: 'geo-sword-mountains',
      slug: 'sword-mountains',
      name: 'Sword Mountains',
      language: 'en',
      x: 1900,
      y: 940,
      recommended_zoom: 0.5,
      entity_id: null,
    },
    {
      id: 'geo-harbor-district',
      slug: 'harbor-district',
      name: 'Harbor District',
      language: 'en',
      x: 2040,
      y: 1380,
      recommended_zoom: 2,
      entity_id: 'place-demo-harbor',
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

async function configureGeographicSearch(page: Page): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map021_test_key',
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

async function openGeographicSearch(page: Page, path = '/'): Promise<void> {
  await configureGeographicSearch(page);
  await page.goto(path);
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'connected',
  );
}

test('searches Waterdeep as a separate geographic identity and applies its recommended zoom', async ({
  page,
}) => {
  await openGeographicSearch(page);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await searchbox.fill('Waterdeep');

  const results = page.getByRole('list', { name: 'Resultados de búsqueda de lugares' });
  const geographic = results.getByRole('button', {
    name: /Waterdeep.*Lugar geográfico.*Coincidencia por nombre principal/i,
  });
  const campaignLocation = results.getByRole('button', {
    name: /Waterdeep.*Emplazamiento de campaña.*Coincidencia por nombre principal/i,
  });

  await expect(geographic).toBeVisible();
  await expect(campaignLocation).toBeVisible();
  await geographic.click();

  const shell = page.getByTestId('map-shell');
  await expect(shell).toHaveAttribute('data-map-center', '1020.00,1690.00');
  await expect(shell).toHaveAttribute('data-map-zoom', '1.50');
  await expect(shell).toHaveAttribute('data-search-highlight', 'true');
  await expect(page.locator('.geographic-search-highlight__symbol')).toBeVisible();
  await expect(page.locator('[data-map-search-status]')).toContainText(
    'Mapa centrado en Waterdeep, lugar geográfico',
  );
  await expect(page.getByTestId('place-details')).toBeHidden();
  await expect(geographic).toBeFocused();

  const url = new URL(page.url());
  expect(url.searchParams.get('q')).toBe('Waterdeep');
  expect(url.searchParams.has('geo')).toBe(false);
});

test('keeps an associated campaign card as a separate action from geographic selection', async ({
  page,
}) => {
  await openGeographicSearch(page);

  await page.getByRole('searchbox', { name: 'Buscar lugares' }).fill('Harbor District');
  const results = page.getByRole('list', { name: 'Resultados de búsqueda de lugares' });
  const geographic = results.getByRole('button', {
    name: /Harbor District.*Lugar geográfico/i,
  });
  const openCard = results.getByRole('button', { name: 'Abrir ficha de Harbor District' });

  await geographic.click();
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-search-highlight', 'true');
  await expect(page.getByTestId('place-details')).toBeHidden();

  await openCard.click();
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    'place-demo-harbor',
  );
  await expect(page.getByTestId('map-shell')).not.toHaveAttribute('data-search-highlight', 'true');
});

test('labels characters textually and reports an accessible no-results state', async ({ page }) => {
  await openGeographicSearch(page);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  const results = page.getByRole('list', { name: 'Resultados de búsqueda de lugares' });

  await searchbox.fill('Durnan');
  await expect(
    results.getByRole('button', {
      name: /Durnan.*Personaje.*Coincidencia por nombre principal/i,
    }),
  ).toBeVisible();

  await searchbox.fill('A place that does not exist');
  await expect(page.locator('[data-place-search-status]')).toContainText(
    'No hay lugares, personajes ni nombres geográficos',
  );
  await expect(results).toBeHidden();
});

test('operates an unlinked geographic result with the keyboard without stealing focus', async ({
  page,
}) => {
  await openGeographicSearch(page);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await searchbox.fill('Sword Mountains');
  await searchbox.press('ArrowDown');

  const result = page.getByRole('button', {
    name: /Sword Mountains.*Lugar geográfico/i,
  });
  await expect(result).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(result).toBeFocused();
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-center', '940.00,1900.00');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-zoom', '0.50');
  await expect(page.locator('.geographic-search-highlight__symbol')).toBeVisible();
});

test('keeps the geographic highlight static when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGeographicSearch(page);

  await page.getByRole('searchbox', { name: 'Buscar lugares' }).fill('City of Splendors');
  await page
    .getByRole('button', { name: /Waterdeep.*Lugar geográfico.*Coincidencia por alias/i })
    .click();

  const animationName = await page
    .locator('.geographic-search-highlight__symbol')
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(animationName).toBe('none');
});

test('remains usable at 320 px and restores the geographic query after reload', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openGeographicSearch(page, '/?q=Waterdeep');

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await expect(searchbox).toHaveValue('Waterdeep');
  const geographic = page.getByRole('button', {
    name: /Waterdeep.*Lugar geográfico/i,
  });
  await geographic.click();
  await expect(page.locator('.geographic-search-highlight__symbol')).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBe(false);

  await page.reload();
  await expect(searchbox).toHaveValue('Waterdeep');
  await expect(
    page.getByRole('button', {
      name: /Waterdeep.*Lugar geográfico/i,
    }),
  ).toBeVisible();
});
