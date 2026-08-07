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
  players: [
    {
      id: 'player-a',
      slug: 'player-a',
      display_name: 'Alicia',
      name_language: 'en',
    },
    {
      id: 'player-b',
      slug: 'player-b',
      display_name: 'Borin',
      name_language: 'en',
    },
  ],
  map_entities: [
    {
      id: 'place-demo-harbor',
      slug: 'puerto-de-demostracion',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Demonstration Harbor',
      name_language: 'en',
      summary: '',
      description: '',
      x: 1080.5,
      y: 820,
      category_id: 'category-settlement',
    },
    {
      id: 'entity-harbor-guard',
      slug: 'harbor-guard',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Harbor Guard',
      name_language: 'en',
      summary: '',
      description: '',
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
      summary: '',
      description: '',
      x: 1500,
      y: 1000,
      category_id: 'category-settlement',
    },
    {
      id: 'entity-watchtower',
      slug: 'watchtower',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Watchtower',
      name_language: 'en',
      summary: '',
      description: '',
      x: 1850,
      y: 950,
      category_id: 'category-landmark',
    },
    {
      id: 'entity-search-only',
      slug: 'search-only',
      entity_type: 'character',
      visibility: 'search_only',
      name: 'Search Only Character',
      name_language: 'en',
      summary: '',
      description: '',
      x: 1900,
      y: 970,
      category_id: 'category-landmark',
    },
  ],
  entity_aliases: [],
  entity_tags: [],
  entity_player_dispositions: [
    { entity_id: 'place-demo-harbor', player_id: 'player-a', disposition: 'ally' },
    { entity_id: 'place-demo-harbor', player_id: 'player-b', disposition: 'neutral' },
    { entity_id: 'entity-harbor-guard', player_id: 'player-a', disposition: 'enemy' },
    { entity_id: 'entity-scout', player_id: 'player-a', disposition: 'enemy' },
    { entity_id: 'entity-scout', player_id: 'player-b', disposition: 'neutral' },
    { entity_id: 'entity-watchtower', player_id: 'player-a', disposition: 'ally' },
    { entity_id: 'entity-watchtower', player_id: 'player-b', disposition: 'enemy' },
  ],
  character_location_relations: [],
  public_notes: [],
  public_note_tags: [],
  geographic_names: [],
  geographic_name_aliases: [],
  character_location_events: [],
};

async function configurePinVisualBackend(page: Page): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map022_test_key',
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

async function openPinVisualMap(page: Page): Promise<void> {
  await configurePinVisualBackend(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'connected',
  );
}

test('distinguishes character and location pins by shape and exposes per-player dispositions in text', async ({
  page,
}) => {
  await openPinVisualMap(page);

  const character = page.locator('[data-testid="entity-pin"][data-pin-id="entity-scout"]');
  const location = page.locator('[data-testid="entity-pin"][data-pin-id="entity-watchtower"]');

  await expect(character).toHaveAttribute('data-entity-type', 'character');
  await expect(character.locator('.pin-visual')).toHaveClass(/pin-visual--character/);
  await expect(character).toHaveAttribute(
    'aria-label',
    /Scout\. Personaje\. Disposición por jugador: Alicia: enemigo; Borin: neutral\./i,
  );
  await expect(location).toHaveAttribute('data-entity-type', 'location');
  await expect(location.locator('.pin-visual')).toHaveClass(/pin-visual--location/);
  await expect(location).toHaveAttribute(
    'aria-label',
    /Watchtower\. Emplazamiento\. Disposición por jugador: Alicia: aliado; Borin: enemigo\./i,
  );

  await expect(character.locator('.pin-disposition--enemy')).toHaveText('−');
  await expect(character.locator('.pin-disposition--neutral')).toHaveText('•');
  await expect(location.locator('.pin-disposition--ally')).toHaveText('+');
  await expect(page.locator('[data-pin-id="entity-search-only"]')).toHaveCount(0);

  const legend = page.locator('[data-pin-legend]');
  await expect(legend).toContainText('Personaje');
  await expect(legend).toContainText('Emplazamiento');
  await expect(legend).toContainText('Aliado');
  await expect(legend).toContainText('Enemigo');
  await expect(legend).toContainText('Neutral');
});

test('keeps selection and keyboard focus independent from type and disposition styling', async ({
  page,
}) => {
  await openPinVisualMap(page);

  const character = page.locator('[data-testid="entity-pin"][data-pin-id="entity-scout"]');
  await character.focus();
  await expect(character).toBeFocused();
  await page.keyboard.press('Enter');

  const panel = page.getByTestId('place-details');
  await expect(character).toHaveClass(/campaign-marker-icon--active/);
  await expect(character.locator('.pin-visual')).toHaveClass(/pin-visual--character/);
  await expect(character.locator('.pin-disposition--enemy')).toBeVisible();
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-entity-type', 'character');
  await expect(panel.getByRole('heading', { level: 3, name: 'Scout' })).toBeFocused();
  await expect(panel).toContainText('Personaje');
  await expect(panel).toContainText('Alicia');
  await expect(panel).toContainText('Enemigo');
  await expect(panel).toContainText('Borin');
  await expect(panel).toContainText('Neutral');
  await expect(page.locator('[data-map-search-status]')).toContainText(
    'Scout, personaje, seleccionado en el mapa. Ficha compacta abierta.',
  );

  await panel.getByRole('button', { name: /Cerrar la ficha de Scout/i }).click();
  await expect(panel).toBeHidden();
  await expect(character).toBeFocused();
  await expect(character).toHaveAttribute('aria-pressed', 'false');
});

test('opens all coincident pins as keyboard-operable options without changing their canonical coordinate', async ({
  page,
}) => {
  await openPinVisualMap(page);

  const coincident = page.getByTestId('coincident-pin');
  await expect(coincident).toHaveAttribute('data-pin-count', '2');
  await expect(coincident).toHaveAttribute('data-marker-lat', '820');
  await expect(coincident).toHaveAttribute('data-marker-lng', '1080.5');
  await coincident.focus();
  await page.keyboard.press('Enter');

  const options = page.getByTestId('coincident-pin-option');
  await expect(options).toHaveCount(2);
  await expect(options.first()).toBeFocused();
  await expect(options.first()).toHaveAttribute('data-entity-type', 'location');
  await expect(options.nth(1)).toHaveAttribute('data-entity-type', 'character');
  await expect(options.nth(1)).toHaveAttribute(
    'aria-label',
    /Harbor Guard\. Personaje\. Disposición por jugador: Alicia: enemigo; Borin: sin disposición disponible/i,
  );

  await options.first().click();
  const panel = page.getByTestId('place-details');
  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-harbor');
  await panel.getByRole('button', { name: /Cerrar la ficha de Demonstration Harbor/i }).click();
  await expect(coincident).toBeFocused();

  await coincident.click();
  await page.getByTestId('coincident-pin-option').nth(1).click();
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-entity-id', 'entity-harbor-guard');
  await expect(panel).toHaveAttribute('data-entity-type', 'character');
  await expect(panel.getByRole('heading', { level: 3, name: 'Harbor Guard' })).toBeFocused();
  await expect(coincident).toHaveClass(/campaign-marker-icon--active/);
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-center', '820.00,1080.50');

  await panel.getByRole('button', { name: /Cerrar la ficha de Harbor Guard/i }).click();
  await expect(panel).toBeHidden();
  await expect(coincident).toBeFocused();
});

test('preserves legacy filter dimming while keeping type semantics and pins operable', async ({
  page,
}) => {
  await openPinVisualMap(page);

  await page.getByRole('checkbox', { name: /Asentamiento/ }).check();
  const pass = page.locator('[data-testid="place-marker"][data-place-id="place-demo-pass"]');

  await expect(pass).toHaveClass(/campaign-marker-icon--dimmed/);
  await expect(pass).toHaveAttribute('data-filter-match', 'false');
  await expect(pass).toHaveAttribute('data-entity-type', 'location');
  await expect(pass.locator('.pin-visual--location')).toBeVisible();
  await pass.focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    'place-demo-pass',
  );
});

test('remains usable at 320 px, keeps touch targets large and honors forced colors and reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await openPinVisualMap(page);

  const character = page.locator('[data-testid="entity-pin"][data-pin-id="entity-scout"]');
  const box = await character.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await character.focus();

  const styles = await character.locator('.pin-visual').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transitionDuration: style.transitionDuration,
      outlineStyle: style.outlineStyle,
    };
  });
  expect(Number.parseFloat(styles.transitionDuration)).toBeLessThanOrEqual(0.00001);
  expect(styles.outlineStyle).not.toBe('none');

  await page.getByTestId('coincident-pin').click();
  const optionBox = await page.getByTestId('coincident-pin-option').first().boundingBox();
  expect(optionBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBe(false);
  await expect(page.locator('[data-pin-legend]')).toBeVisible();
});
