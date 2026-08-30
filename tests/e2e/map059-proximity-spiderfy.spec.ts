import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const PORTRAIT_PATH = 'portraits/59000000-0000-4000-8000-000000000001.png';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9WlH0AAAAASUVORK5CYII=',
  'base64',
);

const CHARACTER_ID = 'entity-map059-character';
const LOCATION_ID = 'entity-map059-location';
const MULTI_ID = 'entity-map059-multi';
const FOURTH_ID = 'entity-map059-fourth';
const ZOOM_A_ID = 'entity-map059-zoom-a';
const ZOOM_B_ID = 'entity-map059-zoom-b';
const EXACT_ID = 'entity-map059-exact';

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
      id: 'category-map059-character',
      slug: 'map059-personajes',
      name: 'Personajes MAP059',
      description: '',
    },
    {
      id: 'category-map059-location',
      slug: 'map059-emplazamientos',
      name: 'Emplazamientos MAP059',
      description: '',
    },
    {
      id: 'category-map059-zoom',
      slug: 'map059-zoom',
      name: 'Zoom MAP059',
      description: '',
    },
    {
      id: 'category-map059-legacy',
      slug: 'map059-legacy',
      name: 'Legacy MAP059',
      description: '',
    },
  ],
  tags: [],
  players: [
    {
      id: 'player-map059-one',
      slug: 'map059-one',
      display_name: 'Skade',
      name_language: 'en',
      accent_color: '#c2410c',
    },
    {
      id: 'player-map059-two',
      slug: 'map059-two',
      display_name: 'Ura',
      name_language: 'en',
      accent_color: '#1e3a8a',
    },
  ],
  map_entities: [
    {
      id: CHARACTER_ID,
      slug: 'map059-character',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Ariane MAP059',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: PORTRAIT_PATH,
      x: 800,
      y: 700,
      category_id: 'category-map059-character',
    },
    {
      id: LOCATION_ID,
      slug: 'map059-location',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Torre MAP059',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      x: 820,
      y: 700,
      category_id: 'category-map059-location',
    },
    {
      id: MULTI_ID,
      slug: 'map059-multi',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Puente MAP059',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      x: 840,
      y: 700,
      category_id: 'category-map059-location',
    },
    {
      id: FOURTH_ID,
      slug: 'map059-fourth',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Cuarto MAP059',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      x: 860,
      y: 700,
      category_id: 'category-map059-character',
    },
    {
      id: ZOOM_A_ID,
      slug: 'map059-zoom-a',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Zoom A MAP059',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      x: 1500,
      y: 1000,
      category_id: 'category-map059-zoom',
    },
    {
      id: ZOOM_B_ID,
      slug: 'map059-zoom-b',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Zoom B MAP059',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      x: 1600,
      y: 1000,
      category_id: 'category-map059-zoom',
    },
    {
      id: 'place-demo-harbor',
      slug: 'puerto-de-demostracion',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Puerto de demostración',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      x: 2400,
      y: 1400,
      category_id: 'category-map059-legacy',
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
      portrait_path: null,
      x: 2400,
      y: 1400,
      category_id: 'category-map059-legacy',
    },
    {
      id: EXACT_ID,
      slug: 'map059-exact',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Exacto MAP059',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      x: 2400,
      y: 1400,
      category_id: 'category-map059-legacy',
    },
    {
      id: 'entity-map059-far',
      slug: 'map059-far',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Lejano MAP059',
      name_language: 'en',
      summary: '',
      description: '',
      portrait_path: null,
      x: 3300,
      y: 2000,
      category_id: 'category-map059-location',
    },
  ],
  entity_aliases: [],
  entity_tags: [],
  entity_player_dispositions: [],
  entity_player_associations: [
    { entity_id: CHARACTER_ID, player_id: 'player-map059-one' },
    { entity_id: LOCATION_ID, player_id: 'player-map059-one' },
    { entity_id: MULTI_ID, player_id: 'player-map059-one' },
    { entity_id: MULTI_ID, player_id: 'player-map059-two' },
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
      publishableKey: 'sb_publishable_map059_test_key',
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

function cluster(page: Page, count: number): Locator {
  return page.locator(`[data-proximity-cluster="true"][data-pin-count="${count}"]`);
}

function spiderPin(page: Page, id: string): Locator {
  return page.locator(`[data-spiderfied="true"][data-pin-id="${id}"]`);
}

async function closeDetails(page: Page, name: string): Promise<void> {
  const details = page.getByTestId('place-details');
  await details
    .getByRole('button', { name: new RegExp(`Cerrar la ficha de ${name}`, 'i') })
    .click();
  await expect(details).toBeHidden();
}

test('clusters near pins, keeps exact-coordinate legacy integrated, and separates only the near pair with zoom', async ({
  page,
}) => {
  await openMap(page);

  await expect(cluster(page, 4)).toHaveAttribute('aria-label', '4 pines agrupados');
  await expect(cluster(page, 2)).toBeVisible();
  await expect(cluster(page, 3)).toBeVisible();
  await expect(cluster(page, 3)).toHaveAttribute('aria-label', '3 pines agrupados');

  const zoomPairIsGrouped = async (): Promise<boolean> =>
    page.locator('[data-proximity-cluster="true"]').evaluateAll((elements) =>
      elements.some((element) => {
        const marker = element as HTMLElement;
        const lat = Number(marker.dataset.markerLat);
        const lng = Number(marker.dataset.markerLng);
        return Math.abs(lat - 1000) < 80 && Math.abs(lng - 1550) < 80;
      }),
    );
  await expect.poll(zoomPairIsGrouped).toBe(true);

  for (let attempt = 0; attempt < 8 && (await zoomPairIsGrouped()); attempt += 1) {
    const zoomIn = page.getByTitle('Acercar');
    if (await zoomIn.isDisabled()) break;
    await zoomIn.click();
  }

  await expect.poll(zoomPairIsGrouped).toBe(false);
  await expect(cluster(page, 3)).toBeVisible();
});

test('click spiderfy preserves portrait, location shape and MAP-058 association accents, then each member opens its normal details', async ({
  page,
}) => {
  await openMap(page);
  const group = cluster(page, 4);

  await expect(group.locator('.pin-player-association-ring')).toHaveCount(0);
  await expect(group).not.toHaveAttribute('data-association-count');
  await group.click();

  await expect(page.locator('[data-spiderfied="true"]')).toHaveCount(4);
  await expect(page.locator('.pin-spider-leg')).toHaveCount(4);

  const character = spiderPin(page, CHARACTER_ID);
  const location = spiderPin(page, LOCATION_ID);
  const multi = spiderPin(page, MULTI_ID);

  await expect(character.locator('.pin-visual__portrait')).toBeVisible();
  await expect(character).toHaveAttribute('data-portrait-marker', 'true');
  await expect(character).toHaveAttribute('data-association-count', '1');
  await expect(character.locator('.pin-player-association-ring')).toHaveCSS(
    '--pin-player-association-accent',
    '#c2410c',
  );

  await expect(location.locator('.pin-visual')).toHaveClass(/pin-visual--location/);
  await expect(location).toHaveAttribute('data-association-count', '1');

  await expect(multi.locator('.pin-visual')).toHaveClass(/pin-visual--location/);
  await expect(multi).toHaveAttribute('data-association-count', '2');
  const multiAccent = await multi
    .locator('.pin-player-association-ring')
    .evaluate((element) =>
      element.style.getPropertyValue('--pin-player-association-accent').replaceAll(' ', ''),
    );
  expect(multiAccent).toContain('#c2410c');
  expect(multiAccent).toContain('#1e3a8a');
  expect(multiAccent).toContain('conic-gradient');

  await character.click();
  await expect(page.getByTestId('place-details')).toContainText('Ariane MAP059');
  await closeDetails(page, 'Ariane MAP059');

  await cluster(page, 4).click();
  await spiderPin(page, MULTI_ID).click();
  await expect(page.getByTestId('place-details')).toContainText('Puente MAP059');
  await closeDetails(page, 'Puente MAP059');
});

test('keyboard Enter and Space open spiderfy, Tab preserves it, and Escape collapses with focus restored', async ({
  page,
}) => {
  await openMap(page);
  const group = cluster(page, 4);

  await group.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-spiderfied="true"]')).toHaveCount(4);
  await expect(spiderPin(page, CHARACTER_ID)).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.locator('[data-spiderfied="true"]')).toHaveCount(4);
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('[data-spiderfied="true"]')).toHaveCount(4);

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-spiderfied="true"]')).toHaveCount(0);
  await expect(group).toBeFocused();

  await page.keyboard.press('Space');
  await expect(page.locator('[data-spiderfied="true"]')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(group).toBeFocused();
});

test('outside pointer, pan and zoom collapse spiderfy without stale members', async ({ page }) => {
  await openMap(page);

  await cluster(page, 4).click();
  await expect(page.locator('[data-spiderfied="true"]')).toHaveCount(4);
  await page.getByRole('heading', { level: 1 }).click();
  await expect(page.locator('[data-spiderfied="true"]')).toHaveCount(0);

  await cluster(page, 4).click();
  const mapBox = await page.locator('[data-map-canvas]').boundingBox();
  expect(mapBox).not.toBeNull();
  if (mapBox) {
    const x = mapBox.x + mapBox.width * 0.72;
    const y = mapBox.y + mapBox.height * 0.72;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 80, y, { steps: 5 });
    await page.mouse.up();
  }
  await expect(page.locator('[data-spiderfied="true"]')).toHaveCount(0);

  await cluster(page, 4).click();
  await page.getByTitle('Acercar').click();
  await expect(page.locator('[data-spiderfied="true"]')).toHaveCount(0);
});

test('search automatically reveals and focuses a pin that is currently grouped', async ({
  page,
}) => {
  await openMap(page);

  await page.getByRole('searchbox', { name: 'Buscar lugares' }).fill('Torre MAP059');
  const result = page.locator(`[data-search-result-id="${LOCATION_ID}"]`);
  await expect(result).toBeVisible();
  await result.click();

  const target = spiderPin(page, LOCATION_ID);
  await expect(target).toBeVisible();
  await expect(target).toBeFocused();
});

test('filters recalculate mixed cluster state without hiding or miscounting dimmed authorized members', async ({
  page,
}) => {
  await openMap(page);
  const group = cluster(page, 4);

  await page.getByRole('checkbox', { name: /Personajes MAP059/ }).check();
  await expect(group).toHaveAttribute('data-pin-count', '4');
  await expect(group).toHaveAttribute('data-filter-match', 'mixed');
  await expect(group).toHaveAttribute('aria-description', /atenuados/i);

  await group.click();
  await expect(spiderPin(page, CHARACTER_ID)).toHaveAttribute('data-filter-match', 'true');
  await expect(spiderPin(page, LOCATION_ID)).toHaveAttribute('data-filter-match', 'false');
  await expect(spiderPin(page, LOCATION_ID)).toHaveClass(/campaign-marker-icon--dimmed/);
});

test('forced-colors keeps cluster/member focus and association multiplicity non-color-only', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await openMap(page);
  const group = cluster(page, 4);

  await group.focus();
  await expect(group).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');

  const multi = spiderPin(page, MULTI_ID);
  await expect(multi.locator('.pin-player-association-count')).toBeVisible();
  await expect(multi.locator('.pin-player-association-count')).toHaveText('2');
  await multi.focus();
  await expect(multi).toHaveCSS('outline-style', 'solid');
});

test('prefers-reduced-motion removes cluster/pin transitions while preserving spiderfy spatial state', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMap(page);
  const group = cluster(page, 4);

  const transitionDuration = await group
    .locator('.pin-visual')
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.00001);
  await group.click();
  await expect(page.locator('[data-spiderfied="true"]')).toHaveCount(4);
  await expect(page.locator('.pin-spider-leg')).toHaveCount(4);
});

for (const width of [320, 390, 430]) {
  test(`keeps 52px spiderfied targets operable inside the map at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openMap(page);

    const group = page.locator('[data-proximity-cluster="true"]').first();
    await expect(group).toBeVisible();
    const memberCount = Number(await group.getAttribute('data-pin-count'));
    expect(memberCount).toBeGreaterThan(1);
    await group.click();

    const spiderfied = page.locator('[data-spiderfied="true"]');
    await expect(spiderfied).toHaveCount(memberCount);
    const mapBox = await page.locator('[data-map-canvas]').boundingBox();
    expect(mapBox).not.toBeNull();
    const boxes = await spiderfied.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      }),
    );

    expect(boxes).toHaveLength(memberCount);
    for (const box of boxes) {
      expect(box.width).toBe(52);
      expect(box.height).toBe(52);
      if (mapBox) {
        expect(box.left).toBeGreaterThanOrEqual(mapBox.x - 1);
        expect(box.right).toBeLessThanOrEqual(mapBox.x + mapBox.width + 1);
        expect(box.top).toBeGreaterThanOrEqual(mapBox.y - 1);
        expect(box.bottom).toBeLessThanOrEqual(mapBox.y + mapBox.height + 1);
      }
    }
  });
}
