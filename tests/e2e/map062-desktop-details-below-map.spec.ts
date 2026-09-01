import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const PUBLIC_KEY = 'sb_publishable_map062_layout_key';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const POINT_A_ID = 'entity-map062-rich-character';
const POINT_B_ID = 'entity-map062-second-character';
const REGION_ID = 'entity-map062-region';
const RELATED_ID = 'entity-map062-related-character';
const PORTRAIT_PATH = 'portraits/map062-rich-character.png';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
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
      id: 'category-map062-character',
      slug: 'map062-character',
      name: 'Personaje MAP-062',
      description: '',
    },
    {
      id: 'category-map062-region',
      slug: 'map062-region',
      name: 'Región MAP-062',
      description: '',
    },
  ],
  tags: [
    { id: 'tag-map062-a', name: 'Costa', description: '' },
    { id: 'tag-map062-b', name: 'Vigilancia', description: '' },
    { id: 'tag-map062-c', name: 'Juramento antiguo', description: '' },
  ],
  players: [
    {
      id: 'player-map062-a',
      slug: 'player-map062-a',
      display_name: 'Alicia',
      name_language: 'en',
      accent_color: '#2563eb',
    },
    {
      id: 'player-map062-b',
      slug: 'player-map062-b',
      display_name: 'Borin',
      name_language: 'en',
      accent_color: '#b45309',
    },
    {
      id: 'player-map062-c',
      slug: 'player-map062-c',
      display_name: 'Celia',
      name_language: 'en',
      accent_color: '#15803d',
    },
  ],
  map_entities: [
    {
      id: POINT_A_ID,
      slug: 'map062-rich-character',
      entity_type: 'character',
      visibility: 'pin',
      name: 'MAP062 Rich Character',
      name_language: 'en',
      summary: 'Resumen deliberadamente reservado para la ficha completa.',
      description: 'Descripción deliberadamente reservada para la ficha completa.',
      portrait_path: PORTRAIT_PATH,
      geometry: { kind: 'point', coordinates: { x: 2680, y: 780 } },
      x: 2680,
      y: 780,
      category_id: 'category-map062-character',
      publication_status: 'published',
    },
    {
      id: POINT_B_ID,
      slug: 'map062-second-character',
      entity_type: 'character',
      visibility: 'pin',
      name: 'MAP062 Second Character',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      geometry: { kind: 'point', coordinates: { x: 1850, y: 1550 } },
      x: 1850,
      y: 1550,
      category_id: 'category-map062-character',
      publication_status: 'published',
    },
    {
      id: REGION_ID,
      slug: 'map062-region',
      entity_type: 'location',
      visibility: 'pin',
      name: 'MAP062 Campaign Region',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      geometry: {
        kind: 'polygon',
        vertices: [
          { x: 650, y: 550 },
          { x: 1350, y: 550 },
          { x: 1350, y: 1150 },
          { x: 650, y: 1150 },
        ],
      },
      x: 1000,
      y: 850,
      category_id: 'category-map062-region',
      publication_status: 'published',
    },
    {
      id: RELATED_ID,
      slug: 'map062-related-character',
      entity_type: 'character',
      visibility: 'pin',
      name: 'MAP062 Related Character',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      geometry: { kind: 'point', coordinates: { x: 3200, y: 1900 } },
      x: 3200,
      y: 1900,
      category_id: 'category-map062-character',
      publication_status: 'published',
    },
  ],
  entity_aliases: [],
  entity_tags: [
    { entity_id: POINT_A_ID, tag_id: 'tag-map062-a' },
    { entity_id: POINT_A_ID, tag_id: 'tag-map062-b' },
    { entity_id: POINT_A_ID, tag_id: 'tag-map062-c' },
    { entity_id: REGION_ID, tag_id: 'tag-map062-a' },
  ],
  entity_player_dispositions: [
    { entity_id: POINT_A_ID, player_id: 'player-map062-a', disposition: 'ally' },
    { entity_id: POINT_A_ID, player_id: 'player-map062-b', disposition: 'enemy' },
    { entity_id: POINT_A_ID, player_id: 'player-map062-c', disposition: 'neutral' },
  ],
  entity_player_associations: [
    { entity_id: POINT_A_ID, player_id: 'player-map062-a' },
    { entity_id: POINT_A_ID, player_id: 'player-map062-b' },
    { entity_id: POINT_A_ID, player_id: 'player-map062-c' },
  ],
  character_location_relations: [
    { character_id: RELATED_ID, location_id: REGION_ID, relation_status: 'present' },
  ],
  public_notes: [],
  public_note_tags: [],
  geographic_names: [],
  geographic_name_aliases: [],
  character_location_events: [],
  campaign_geographic_entity_links: [],
};

interface MapViewState {
  readonly center: string;
  readonly zoom: string;
}

async function configureBackend(page: Page): Promise<void> {
  await page.addInitScript(
    ({ projectUrl, publishableKey }) => {
      window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        timeoutMs: 2_000,
        retryDelaysMs: [0, 0, 0],
      };
    },
    { projectUrl: PROJECT_URL, publishableKey: PUBLIC_KEY },
  );

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await page.route('**/rest/v1/**', async (route: Route) => {
    const resource = new URL(route.request().url()).pathname.split('/rest/v1/')[1] ?? '';
    if (resource.startsWith('rpc/')) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      return;
    }
    const table = resource.split('?')[0] ?? '';
    const rows = ROWS[table] ?? [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}` },
      body: JSON.stringify(rows),
    });
  });

  await page.route('**/storage/v1/**', async (route: Route) => {
    const request = route.request();
    const isPortrait = new URL(request.url()).pathname.endsWith(
      `/character-portraits/${PORTRAIT_PATH}`,
    );
    if (!isPortrait || request.headers()['authorization'] !== `Bearer ${PUBLIC_KEY}`) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
}

async function openReadyMap(page: Page): Promise<void> {
  await configureBackend(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'connected',
  );
}

function point(page: Page, id: string): Locator {
  return page.locator(`.campaign-marker-icon[data-pin-id="${id}"]`);
}

function region(page: Page): Locator {
  return page.locator(`.campaign-region[data-region-id="${REGION_ID}"]`);
}

async function readMapView(page: Page): Promise<MapViewState> {
  const shell = page.getByTestId('map-shell');
  return {
    center: (await shell.getAttribute('data-map-center')) ?? '',
    zoom: (await shell.getAttribute('data-map-zoom')) ?? '',
  };
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
}

async function expectUniqueCompactIds(page: Page): Promise<void> {
  const duplicateIds = await page.evaluate(() => {
    const counts = new Map<string, number>();
    document.querySelectorAll<HTMLElement>('[id]').forEach((element) => {
      counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
    });
    return [...counts.entries()].filter(([, count]) => count > 1);
  });
  expect(duplicateIds).toEqual([]);
}

async function expectDesktopDetailsBelowMap(page: Page, mapBeforeWidth: number): Promise<void> {
  const map = page.locator('[data-map-canvas]');
  const panel = page.getByTestId('place-details');
  const mapBox = await map.boundingBox();
  const panelBox = await panel.boundingBox();
  expect(mapBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  if (!mapBox || !panelBox) return;

  expect(Math.abs(mapBox.width - mapBeforeWidth)).toBeLessThanOrEqual(2);
  expect(panelBox.y).toBeGreaterThanOrEqual(mapBox.y + mapBox.height - 1);
  expect(panelBox.width).toBeGreaterThanOrEqual(mapBox.width * 0.98);
  expect(Math.abs(panelBox.x - mapBox.x)).toBeLessThanOrEqual(1);
  const overflowY = await panel.evaluate((element) => getComputedStyle(element).overflowY);
  expect(overflowY).toBe('visible');
}

async function toggleExpanded(page: Page, expanded: boolean): Promise<void> {
  const control = page.locator('[data-map-expand-control]');
  await control.click();
  await expect(page.locator('.map-experience')).toHaveAttribute(
    'data-map-expanded',
    expanded ? 'true' : 'false',
  );
  await expect(control).toHaveAttribute('aria-pressed', expanded ? 'true' : 'false');
}

test('1440 desktop keeps map width and viewport stable while exposing a broad natural-flow card', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReadyMap(page);

  const map = page.locator('[data-map-canvas]');
  const mapBefore = await map.boundingBox();
  expect(mapBefore).not.toBeNull();
  const viewBefore = await readMapView(page);
  await map.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);

  const marker = point(page, POINT_A_ID);
  await marker.click();
  const panel = page.getByTestId('place-details');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { level: 3, name: 'MAP062 Rich Character' })).toBeFocused();
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThanOrEqual(1);
  await expectDesktopDetailsBelowMap(page, mapBefore?.width ?? 0);
  expect(await readMapView(page)).toEqual(viewBefore);

  await expect(panel.getByTestId('compact-character-portrait')).toBeVisible();
  await expect(panel).toContainText('Alicia');
  await expect(panel).toContainText('Borin');
  await expect(panel).toContainText('Celia');
  await expect(panel).toContainText('Costa');
  await expect(panel).toContainText('Vigilancia');
  await expect(panel).toContainText('Juramento antiguo');
  await expect(panel).not.toContainText('Resumen deliberadamente reservado');
  await expect(panel).not.toContainText('Descripción deliberadamente reservada');
  await expect(panel.getByRole('button', { name: 'Volver al pin de MAP062 Rich Character' })).toBeVisible();
  await expect(panel.getByRole('link', { name: /Abrir ficha completa de MAP062 Rich Character/ })).toBeVisible();
  await expectUniqueCompactIds(page);
  await expectNoHorizontalOverflow(page);

  await panel.getByRole('button', { name: 'Volver al pin de MAP062 Rich Character' }).click();
  await expect(marker).toBeFocused();
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: 'Cerrar la ficha de MAP062 Rich Character' }).click();
  await expect(panel).toBeHidden();
  await expect(marker).toBeFocused();
  await expect(marker).toHaveAttribute('aria-pressed', 'false');
});

test('1920 expanded keeps full horizontal map geometry, reuses one details region and restore does not close it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openReadyMap(page);
  await toggleExpanded(page, true);

  const map = page.locator('[data-map-canvas]');
  const expandedBefore = await map.boundingBox();
  expect(expandedBefore).not.toBeNull();
  const viewBeforeOpen = await readMapView(page);

  await point(page, POINT_A_ID).click();
  const panel = page.getByTestId('place-details');
  await expectDesktopDetailsBelowMap(page, expandedBefore?.width ?? 0);
  expect(await readMapView(page)).toEqual(viewBeforeOpen);
  await expect(page.locator('.map-experience')).toHaveAttribute('data-map-expanded', 'true');

  await point(page, POINT_B_ID).click();
  await expect(panel).toHaveCount(1);
  await expect(panel).toHaveAttribute('data-active-pin-id', POINT_B_ID);
  await expect(panel.getByRole('heading', { level: 3, name: 'MAP062 Second Character' })).toBeFocused();
  await expectUniqueCompactIds(page);

  await toggleExpanded(page, false);
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-active-pin-id', POINT_B_ID);
  await expect(page.locator('.map-experience')).toHaveAttribute('data-map-expanded', 'false');
  await expectNoHorizontalOverflow(page);

  await toggleExpanded(page, true);
  await panel.getByRole('button', { name: 'Cerrar la ficha de MAP062 Second Character' }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator('.map-experience')).toHaveAttribute('data-map-expanded', 'true');
});

test('polygon selection uses the same lower details region and returns focus to the region', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReadyMap(page);

  const map = page.locator('[data-map-canvas]');
  const mapBefore = await map.boundingBox();
  expect(mapBefore).not.toBeNull();
  const campaignRegion = region(page);
  await campaignRegion.focus();
  await page.keyboard.press('Enter');

  const panel = page.getByTestId('place-details');
  await expect(panel).toHaveAttribute('data-active-pin-id', REGION_ID);
  await expect(panel.getByRole('heading', { level: 3, name: 'MAP062 Campaign Region' })).toBeFocused();
  await expect(panel).toContainText('MAP062 Related Character');
  await expectDesktopDetailsBelowMap(page, mapBefore?.width ?? 0);
  await expect(panel.getByRole('button', { name: 'Volver a la región de MAP062 Campaign Region' })).toBeVisible();

  await panel
    .getByRole('button', { name: 'Volver a la región de MAP062 Campaign Region' })
    .click();
  await expect(campaignRegion).toBeFocused();
  await expect(campaignRegion).toHaveAttribute('aria-pressed', 'true');

  await panel.getByRole('button', { name: 'Cerrar la ficha de MAP062 Campaign Region' }).click();
  await expect(panel).toBeHidden();
  await expect(campaignRegion).toBeFocused();
  await expect(campaignRegion).toHaveAttribute('aria-pressed', 'false');
});

for (const width of [320, 390, 430]) {
  test(`MAP-037 bottom sheet remains an overlay at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openReadyMap(page);
    const map = page.locator('[data-map-canvas]');
    await map.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await point(page, POINT_A_ID).click();

    const panel = page.getByTestId('place-details');
    const mapBox = await map.boundingBox();
    const panelBox = await panel.boundingBox();
    expect(mapBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    if (mapBox && panelBox) {
      expect(panelBox.y).toBeLessThan(mapBox.y + mapBox.height);
      expect(panelBox.height).toBeLessThanOrEqual(mapBox.height * 0.53);
    }
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThanOrEqual(1);
    await expect(panel.getByRole('button', { name: 'Volver al pin de MAP062 Rich Character' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });
}

test('reflows without horizontal overflow at a 200%-equivalent CSS viewport and in forced colors', async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await openReadyMap(page);
  await point(page, POINT_A_ID).click();

  const panel = page.getByTestId('place-details');
  await expect(panel).toBeVisible();
  await expect(page.locator('[data-map-expand-control]')).toBeHidden();
  await expectNoHorizontalOverflow(page);
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox?.width ?? 0).toBeLessThanOrEqual(720);
  await expectUniqueCompactIds(page);
});
