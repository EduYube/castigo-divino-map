import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const CAMPAIGN_A_ID = '00000000-0000-4000-8000-000000000053';
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
      description: 'Descripción larga de categoría que no debe aparecer en la ficha compacta.',
    },
    {
      id: 'category-landmark',
      slug: 'lugares-destacados',
      name: 'Lugar destacado',
      description: 'Descripción secundaria que no debe aparecer.',
    },
  ],
  tags: [
    { id: 'coastal', name: 'Costero', description: 'Descripción de etiqueta.' },
    { id: 'watch', name: 'Vigilancia', description: 'Descripción de etiqueta.' },
  ],
  players: [
    {
      id: 'player-a',
      slug: 'player-a',
      display_name: 'Alicia',
      name_language: 'en',
      accent_color: '#2563eb',
    },
    {
      id: 'player-b',
      slug: 'player-b',
      display_name: 'Borin',
      name_language: 'en',
      accent_color: '#b45309',
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
      summary: 'Resumen largo que no debe mostrarse en la ficha compacta.',
      description: 'Descripción larga del puerto que queda reservada para la ficha completa.',
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
      summary: 'Resumen largo de personaje que no debe aparecer.',
      description: 'Descripción larga del personaje que no debe aparecer.',
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
      category_id: 'category-landmark',
    },
  ],
  entity_aliases: [
    {
      id: 'alias-harbor',
      entity_id: 'place-demo-harbor',
      language: 'en',
      value: 'Harbor Alias That Must Stay Out',
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
    { entity_id: 'entity-scout', player_id: 'player-a', disposition: 'enemy' },
    { entity_id: 'entity-scout', player_id: 'player-b', disposition: 'ally' },
  ],
  character_location_relations: [
    {
      character_id: 'entity-harbor-guard',
      location_id: 'place-demo-harbor',
      relation_status: 'present',
    },
  ],
  public_notes: [
    {
      id: 'note-harbor-secret-shape',
      slug: 'harbor-public-note',
      entity_id: 'place-demo-harbor',
      title: 'Título de nota pública que no debe aparecer',
      body: 'Cuerpo de nota pública deliberadamente largo que no debe aparecer en la ficha compacta.',
      sort_order: 0,
    },
  ],
  public_note_tags: [],
  geographic_names: [],
  geographic_name_aliases: [],
  character_location_events: [],
};

async function mockOfficialMap(page: Page): Promise<void> {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });
}

async function configureBackend(page: Page, available = true): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map023_test_key',
      timeoutMs: 400,
      retryDelaysMs: [0, 0, 0],
    };
  }, LOCAL_SUPABASE_URL);

  await page.route('**/rest/v1/**', async (route: Route) => {
    if (!available) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '[]' });
      return;
    }

    const match = /\/rest\/v1\/([^?]+)/.exec(route.request().url());
    const table = match?.[1] ?? '';
    const rows =
      table === 'campaigns'
        ? [
            {
              id: CAMPAIGN_A_ID,
              slug: 'castigo-divino',
              name: 'Castigo Divino',
              status: 'active',
              display_order: 0,
            },
          ]
        : (PUBLIC_ROWS[table] ?? []);
    const contentRange = rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange },
      body: JSON.stringify(rows),
    });
  });
}

async function openMap(page: Page, available = true): Promise<void> {
  await mockOfficialMap(page);
  await configureBackend(page, available);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    available ? 'connected' : /degraded|offline/,
  );
}

test('renders compact location data and exposes a safe full-details link', async ({ page }) => {
  await openMap(page);

  await page.getByTestId('coincident-pin').click();
  await page.getByTestId('coincident-pin-option').first().click();

  const panel = page.getByTestId('place-details');
  const title = panel.getByRole('heading', { level: 3, name: 'Demonstration Harbor' });
  const important = panel.getByRole('heading', { level: 4, name: 'Personajes importantes aquí' });

  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-entity-type', 'location');
  await expect(panel).toHaveAttribute('data-detail-source', 'beta02');
  await expect(title).toBeFocused();
  await expect(panel).toContainText('Emplazamiento');
  await expect(panel).toContainText('Asentamiento');
  await expect(panel).toContainText('Costero');
  await expect(panel).toContainText('Vigilancia');
  await expect(panel).toContainText('Relación con los personajes');
  await expect(panel).toContainText('Alicia');
  await expect(panel).toContainText('Aliado');
  await expect(panel).toContainText('Borin');
  await expect(panel).toContainText('Neutral');
  await expect(panel.getByRole('listitem', { name: 'Alicia: Aliado' })).toBeVisible();
  await expect(panel.getByRole('listitem', { name: 'Borin: Neutral' })).toBeVisible();
  await expect(important).toBeVisible();
  await expect(panel).toContainText('Harbor Guard');
  await expect(panel).toContainText('Presente');

  await expect(panel).not.toContainText('Harbor Alias That Must Stay Out');
  await expect(panel).not.toContainText('Resumen largo que no debe mostrarse');
  await expect(panel).not.toContainText('Descripción larga del puerto');
  await expect(panel).not.toContainText('Título de nota pública que no debe aparecer');
  await expect(panel).not.toContainText('Cuerpo de nota pública deliberadamente largo');

  const fullAction = panel.getByRole('link', {
    name: 'Abrir ficha completa de Demonstration Harbor en una pestaña nueva',
  });
  await expect(fullAction).toBeVisible();
  await expect(fullAction).toHaveAttribute('target', '_blank');
  await expect(fullAction).toHaveAttribute('rel', /noopener/);
  await expect(fullAction).toHaveAttribute(
    'href',
    /\?entity=puerto-de-demostracion&campaign=castigo-divino$/,
  );
  await expect(panel).toContainText(
    'Se abrirá en una pestaña nueva para conservar el estado actual del mapa.',
  );
});

test('opens a character card and returns focus on close', async ({ page }) => {
  await openMap(page);

  const character = page.locator('[data-testid="entity-pin"][data-pin-id="entity-scout"]');
  await character.focus();
  await page.keyboard.press('Space');

  const panel = page.getByTestId('place-details');
  const title = panel.getByRole('heading', { level: 3, name: 'Scout' });
  const important = panel.getByRole('heading', { level: 4, name: 'Personajes importantes aquí' });

  await expect(panel).toHaveAttribute('data-entity-id', 'entity-scout');
  await expect(panel).toHaveAttribute('data-entity-type', 'character');
  await expect(title).toBeFocused();
  await expect(panel).toContainText('Personaje');
  await expect(panel).toContainText('Lugar destacado');
  await expect(panel).toContainText('Vigilancia');
  await expect(panel).toContainText('Alicia');
  await expect(panel).toContainText('Enemigo');
  await expect(panel).toContainText('Borin');
  await expect(panel).toContainText('Aliado');
  await expect(important).toHaveCount(0);
  await expect(
    panel.getByRole('link', { name: 'Abrir ficha completa de Scout en una pestaña nueva' }),
  ).toHaveAttribute('href', /\?entity=scout&campaign=castigo-divino$/);

  await panel.getByRole('button', { name: 'Cerrar la ficha de Scout' }).click();
  await expect(panel).toBeHidden();
  await expect(character).toBeFocused();
  await expect(character).toHaveAttribute('aria-pressed', 'false');
});

test('offline snapshot card hides player relations instead of showing technical fallbacks', async ({
  page,
}) => {
  await openMap(page, false);

  const marker = page.locator('[data-testid="place-marker"][data-place-id="place-demo-harbor"]');
  await marker.click();

  const panel = page.getByTestId('place-details');
  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-harbor');
  await expect(panel).toHaveAttribute('data-detail-source', 'beta02');
  await expect(panel).toContainText('Puerto de demostración');
  await expect(panel).toContainText('Emplazamiento');
  await expect(panel).toContainText('Asentamiento');
  await expect(panel).toContainText('Costero');
  await expect(panel).toContainText('Dato de demostración');
  await expect(panel).toContainText('Ruta comercial');
  await expect(panel).not.toContainText('Perspectiva no disponible');
  await expect(panel).not.toContainText('Sin disposición disponible');
  await expect(
    panel.getByRole('heading', { level: 4, name: 'Relación con los personajes' }),
  ).toHaveCount(0);
  await expect(panel).not.toContainText('Puerto de ejemplo');
  await expect(panel).not.toContainText('Información pública de demostración');
  await expect(panel).not.toContainText('Este puerto ficticio');

  const fullAction = panel.getByRole('link', {
    name: 'Abrir ficha completa de Puerto de demostración en una pestaña nueva',
  });
  await expect(fullAction).toBeVisible();
  await expect(fullAction).toHaveAttribute('target', '_blank');
  await expect(fullAction).toHaveAttribute('rel', /noopener/);
  await expect(fullAction).toHaveAttribute(
    'href',
    /\?entity=puerto-de-demostracion&campaign=castigo-divino$/,
  );
});

for (const width of [320, 390, 430]) {
  test(`stays usable at ${width} px in forced colors and reduced motion`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await openMap(page);

    const searchToggle = page.locator('[data-place-search-toggle]');
    if ((await searchToggle.getAttribute('aria-expanded')) === 'false') await searchToggle.click();
    const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
    await searchbox.fill('Scout');
    await page.locator('[data-search-result-id="entity-scout"]').click();
    const character = page.locator('[data-pin-id="entity-scout"]');
    await expect(character).toBeVisible();
    await character.click();

    const panel = page.getByTestId('place-details');
    await panel.scrollIntoViewIfNeeded();
    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox?.x ?? 0).toBeGreaterThanOrEqual(0);
    expect((panelBox?.x ?? 0) + (panelBox?.width ?? 0)).toBeLessThanOrEqual(width);

    const fullAction = panel.getByRole('link', {
      name: 'Abrir ficha completa de Scout en una pestaña nueva',
    });
    const actionBox = await fullAction.boundingBox();
    expect(actionBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    const shape = panel.locator('.compact-details__type-shape');
    const typeStyle = await shape.evaluate((element) => {
      const style = getComputedStyle(element);
      return { borderStyle: style.borderStyle, transitionDuration: style.transitionDuration };
    });
    expect(typeStyle.borderStyle).not.toBe('none');
    expect(Number.parseFloat(typeStyle.transitionDuration)).toBeLessThanOrEqual(0.00001);

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBe(false);
  });
}
