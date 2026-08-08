import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Route,
} from '@playwright/test';

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
      description: 'Núcleo urbano público del Atlas.',
    },
    {
      id: 'category-landmark',
      slug: 'lugares-destacados',
      name: 'Lugar destacado',
      description: 'Lugar notable público.',
    },
  ],
  tags: [
    { id: 'coastal', name: 'Costero', description: 'Junto al mar.' },
    { id: 'watch', name: 'Vigilancia', description: 'Puesto vigilado.' },
  ],
  players: [
    { id: 'player-a', slug: 'player-a', display_name: 'Alicia', name_language: 'en' },
    { id: 'player-b', slug: 'player-b', display_name: 'Borin', name_language: 'en' },
  ],
  map_entities: [
    {
      id: 'place-demo-harbor',
      slug: 'puerto-de-demostracion',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Demonstration Harbor',
      name_language: 'en',
      summary: 'Resumen público del puerto.',
      description: '<script>Descripción literal, no HTML confiable.</script>',
      x: 1080.5,
      y: 820,
      category_id: 'category-settlement',
    },
    {
      id: 'entity-harbor-guard',
      slug: 'harbor-guard',
      entity_type: 'character',
      visibility: 'search_only',
      name: 'Harbor Guard',
      name_language: 'en',
      summary: 'Guardia relacionado con el puerto.',
      description: 'Información pública del personaje.',
      x: 1080.5,
      y: 820,
      category_id: 'category-settlement',
    },
    {
      id: 'entity-scout',
      slug: 'scout',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Scout',
      name_language: 'en',
      summary: 'Explorador público.',
      description: 'Un personaje suplementario visible como pin.',
      x: 1500,
      y: 1000,
      category_id: 'category-landmark',
    },
  ],
  entity_aliases: [
    {
      id: 'alias-harbor',
      entity_id: 'place-demo-harbor',
      language: 'en',
      value: '<Harbor Alias>',
    },
  ],
  entity_tags: [
    { entity_id: 'place-demo-harbor', tag_id: 'coastal' },
    { entity_id: 'place-demo-harbor', tag_id: 'watch' },
    { entity_id: 'entity-harbor-guard', tag_id: 'watch' },
    { entity_id: 'entity-scout', tag_id: 'watch' },
  ],
  entity_player_dispositions: [
    { entity_id: 'place-demo-harbor', player_id: 'player-a', disposition: 'ally' },
    { entity_id: 'place-demo-harbor', player_id: 'player-b', disposition: 'neutral' },
    { entity_id: 'entity-harbor-guard', player_id: 'player-a', disposition: 'enemy' },
    { entity_id: 'entity-harbor-guard', player_id: 'player-b', disposition: 'neutral' },
    { entity_id: 'entity-scout', player_id: 'player-a', disposition: 'neutral' },
    { entity_id: 'entity-scout', player_id: 'player-b', disposition: 'ally' },
  ],
  character_location_relations: [
    {
      character_id: 'entity-harbor-guard',
      location_id: 'place-demo-harbor',
      relation_status: 'last-seen',
    },
  ],
  public_notes: [
    {
      id: 'note-harbor-public',
      slug: 'harbor-public-note',
      entity_id: 'place-demo-harbor',
      title: '<b>Nota pública literal</b>',
      body: '<img src=x onerror=alert(1)>',
      sort_order: 0,
    },
  ],
  public_note_tags: [{ note_id: 'note-harbor-public', tag_id: 'watch' }],
  geographic_names: [
    {
      id: 'geo-demo-region',
      slug: 'demo-region',
      name: 'Demo Region',
      language: 'en',
      x: 1090,
      y: 830,
      recommended_zoom: 1,
      entity_id: 'place-demo-harbor',
    },
  ],
  geographic_name_aliases: [],
  character_location_events: [
    {
      id: 'location-event-guard-sighting',
      character_id: 'entity-harbor-guard',
      event_type: 'sighting',
      location_entity_id: 'place-demo-harbor',
      geographic_name_id: null,
      x: null,
      y: null,
      location_label: null,
      summary: 'Visto vigilando la entrada.',
      language: 'en',
      observed_at: '2026-08-07T20:00:00.000Z',
      related_sighting_id: null,
    },
    {
      id: 'location-event-guard-departure',
      character_id: 'entity-harbor-guard',
      event_type: 'departure',
      location_entity_id: null,
      geographic_name_id: 'geo-demo-region',
      x: null,
      y: null,
      location_label: 'La costa',
      summary: 'Abandonó el puesto.',
      language: 'en',
      observed_at: '2026-08-08T08:00:00.000Z',
      related_sighting_id: 'location-event-guard-sighting',
    },
  ],
};

async function configureRuntime(
  context: BrowserContext,
  options: { readonly available?: boolean; readonly rows?: typeof PUBLIC_ROWS } = {},
): Promise<void> {
  const available = options.available ?? true;
  const rowsByTable = options.rows ?? PUBLIC_ROWS;

  await context.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map024_test_key',
      timeoutMs: 250,
      retryDelaysMs: [0, 0, 0],
    };
  }, LOCAL_SUPABASE_URL);

  await context.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await context.route('**/rest/v1/**', async (route: Route) => {
    if (!available) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '[]' });
      return;
    }

    const match = /\/rest\/v1\/([^?]+)/.exec(route.request().url());
    const table = match?.[1] ?? '';
    const rows = rowsByTable[table] ?? [];
    const contentRange = rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange },
      body: JSON.stringify(rows),
    });
  });
}

async function expectLocationDetails(page: Page): Promise<void> {
  const title = page.getByRole('heading', { level: 1, name: 'Demonstration Harbor' });
  await expect(title).toBeVisible();
  await expect(page).toHaveTitle('Demonstration Harbor · El Atlas de los Nuevos Dioses');
  await expect(page.locator('[data-full-entity-type]')).toContainText('Emplazamiento');
  await expect(page.getByText('Resumen público del puerto.')).toBeVisible();
  await expect(page.getByText('<script>Descripción literal, no HTML confiable.</script>')).toBeVisible();
  await expect(page.getByText('<Harbor Alias>')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Categoría' })).toBeVisible();
  await expect(page.getByText('Núcleo urbano público del Atlas.')).toBeVisible();
  await expect(page.getByText('Costero', { exact: true })).toBeVisible();
  await expect(page.getByText('Alicia', { exact: true })).toBeVisible();
  await expect(page.getByText('Aliado', { exact: true })).toBeVisible();
  await expect(page.getByText('Borin', { exact: true })).toBeVisible();
  await expect(page.getByText('Neutral', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Notas públicas' })).toBeVisible();
  await expect(page.getByText('<b>Nota pública literal</b>')).toBeVisible();
  await expect(page.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Personajes importantes aquí' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Harbor Guard' })).toHaveAttribute(
    'href',
    /\?entity=harbor-guard$/,
  );
  await expect(page.getByText('Visto por última vez')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Actualización pública' })).toBeVisible();
  await expect(page.locator('script').filter({ hasText: 'Descripción literal' })).toHaveCount(0);
  await expect(page.locator('img')).toHaveCount(0);
}

test('opens full details in a new tab without changing the map tab', async ({ context, page }) => {
  await configureRuntime(context);
  await page.goto('/?q=harbor');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute('data-backend-state', 'connected');

  await page.getByTestId('coincident-pin').click();
  await page.getByTestId('coincident-pin-option').first().click();
  const panel = page.getByTestId('place-details');
  const originalUrl = page.url();

  const popupPromise = context.waitForEvent('page');
  await panel
    .getByRole('link', {
      name: 'Abrir ficha completa de Demonstration Harbor en una pestaña nueva',
    })
    .click();
  const detailsPage = await popupPromise;

  await expectLocationDetails(detailsPage);
  expect(detailsPage.url()).toMatch(/\?entity=puerto-de-demostracion$/);
  expect(page.url()).toBe(originalUrl);
  await expect(panel).toHaveAttribute('data-entity-id', 'place-demo-harbor');
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('harbor');
});

test('loads, canonicalizes and reloads a character direct URL with inverse relations and history', async ({
  context,
  page,
}) => {
  await configureRuntime(context);
  await page.goto('/?entity=harbor-guard&q=ignored&place=paso-de-demostracion&extra=ignored#map');

  const title = page.getByRole('heading', { level: 1, name: 'Harbor Guard' });
  await expect(title).toBeVisible();
  await expect(title).toBeFocused();
  expect(page.url()).toMatch(/\?entity=harbor-guard$/);
  await expect(page.locator('[data-full-entity-type]')).toContainText('Personaje');
  await expect(page.getByRole('heading', { level: 2, name: 'Ubicaciones relacionadas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Demonstration Harbor' }).first()).toHaveAttribute(
    'href',
    /\?entity=puerto-de-demostracion$/,
  );
  await expect(page.getByRole('heading', { level: 2, name: 'Historial público de localización' })).toBeVisible();
  await expect(page.getByText('Salida', { exact: false })).toBeVisible();
  await expect(page.getByText('Avistamiento', { exact: false })).toBeVisible();
  await expect(page.getByText('Abandonó el puesto.')).toBeVisible();
  await expect(page.getByText('Visto vigilando la entrada.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Harbor Guard' })).toBeVisible();
  expect(page.url()).toMatch(/\?entity=harbor-guard$/);
});

test('uses one generic unavailable state for invalid, missing and non-public identities', async ({
  context,
  page,
}) => {
  await configureRuntime(context);

  for (const url of [
    '/?entity=missing-entity',
    '/?entity=draft-entity',
    '/?entity=%3Cscript%3E',
    '/?entity=one&entity=two',
    '/?entity=demo-region',
  ]) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1, name: 'Entidad no disponible' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(
      'Puede que no exista, no sea pública o los datos remotos no estén disponibles.',
    );
    await expect(page).toHaveTitle('Entidad no disponible · El Atlas de los Nuevos Dioses');
  }
});

test('fails closed when the remote projection is unavailable', async ({ context, page }) => {
  await configureRuntime(context, { available: false });
  await page.goto('/?entity=puerto-de-demostracion');

  await expect(page.getByRole('heading', { level: 1, name: 'Entidad no disponible' })).toBeVisible();
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    /degraded|offline/,
  );
  await expect(page.getByText('Resumen público del puerto.')).toHaveCount(0);
});

test('keeps the independent page usable at 320 px with keyboard and forced colors', async ({
  context,
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await configureRuntime(context);
  await page.goto('/?entity=puerto-de-demostracion');
  await expectLocationDetails(page);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const title = page.getByRole('heading', { level: 1, name: 'Demonstration Harbor' });
  await expect(title).toBeFocused();

  const mapLink = page.getByRole('link', { name: 'Volver al mapa' });
  await mapLink.focus();
  await expect(mapLink).toBeFocused();
  const box = await mapLink.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  const cardStyle = await page.locator('.full-entity__card').evaluate((element) => {
    const style = getComputedStyle(element);
    return { borderStyle: style.borderStyle, transitionDuration: style.transitionDuration };
  });
  expect(cardStyle.borderStyle).not.toBe('none');
  expect(Number.parseFloat(cardStyle.transitionDuration)).toBeLessThanOrEqual(0.001);
});
