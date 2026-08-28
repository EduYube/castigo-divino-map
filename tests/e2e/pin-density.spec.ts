import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

const DENSE_ENTITIES = Array.from({ length: 16 }, (_, index) => ({
  id: `entity-density-pin-${index}`,
  slug: `density-pin-${index}`,
  entity_type: index % 2 === 0 ? 'location' : 'character',
  visibility: 'pin',
  name: `Density pin ${index}`,
  name_language: 'en',
  summary: '',
  description: '',
  x: 1450 + (index % 4) * 180,
  y: 800 + Math.floor(index / 4) * 180,
  category_id: 'category-density',
}));

function getDensityDisposition(index: number): string {
  return ['ally', 'enemy', 'neutral'][index % 3] ?? 'neutral';
}

const PUBLIC_ROWS: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  campaigns: [
    {
      id: '00000000-0000-4000-8000-000000000053',
      slug: 'castigo-divino',
      name: 'Castigo Divino',
      status: 'active',
      display_order: 0,
    },
  ],
  categories: [
    {
      id: 'category-density',
      slug: 'density',
      name: 'Density fixture',
      description: '',
    },
  ],
  tags: [],
  players: [
    {
      id: 'player-density',
      slug: 'player-density',
      display_name: 'Alicia',
      name_language: 'en',
    },
  ],
  map_entities: DENSE_ENTITIES,
  entity_aliases: [],
  entity_tags: [],
  entity_player_dispositions: DENSE_ENTITIES.map((entity, index) => ({
    entity_id: entity.id,
    player_id: 'player-density',
    disposition: getDensityDisposition(index),
  })),
  character_location_relations: [],
  public_notes: [],
  public_note_tags: [],
  geographic_names: [],
  geographic_name_aliases: [],
  character_location_events: [],
};

async function configureDensityBackend(page: Page): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map031_density_test_key',
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

async function openDensityMap(page: Page): Promise<void> {
  await configureDensityBackend(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'connected',
  );
}

test('keeps 16 nearby markers visually compact while preserving their full Leaflet hit area', async ({
  page,
}) => {
  await openDensityMap(page);

  const pins = page.locator('[data-testid="entity-pin"][data-pin-id^="entity-density-pin-"]');
  await expect(pins).toHaveCount(16);

  const metrics = await pins.evaluateAll((elements) =>
    elements.map((element) => {
      const hitRect = element.getBoundingClientRect();
      const visual = element.querySelector<HTMLElement>('.pin-visual');
      if (!visual) throw new Error('Density marker is missing its visual pin');

      const parts = [
        visual,
        ...visual.querySelectorAll<HTMLElement>('.pin-visual__dispositions, .pin-visual__count'),
      ];
      const partRects = parts.map((part) => part.getBoundingClientRect());
      const left = Math.min(...partRects.map((rect) => rect.left));
      const right = Math.max(...partRects.map((rect) => rect.right));
      const top = Math.min(...partRects.map((rect) => rect.top));
      const bottom = Math.max(...partRects.map((rect) => rect.bottom));
      const visualRect = visual.getBoundingClientRect();
      const hitCenterX = hitRect.left + hitRect.width / 2;
      const hitCenterY = hitRect.top + hitRect.height / 2;
      const visualCenterX = visualRect.left + visualRect.width / 2;
      const visualCenterY = visualRect.top + visualRect.height / 2;

      return {
        hitWidth: hitRect.width,
        hitHeight: hitRect.height,
        footprintWidth: right - left,
        footprintHeight: bottom - top,
        centerDeltaX: Math.abs(visualCenterX - hitCenterX),
        centerDeltaY: Math.abs(visualCenterY - hitCenterY),
      };
    }),
  );

  for (const metric of metrics) {
    expect(metric.hitWidth).toBeGreaterThanOrEqual(44);
    expect(metric.hitHeight).toBeGreaterThanOrEqual(44);
    expect(metric.footprintWidth).toBeLessThanOrEqual(44);
    expect(metric.footprintHeight).toBeLessThanOrEqual(44);
    expect(metric.centerDeltaX).toBeLessThanOrEqual(0.5);
    expect(metric.centerDeltaY).toBeLessThanOrEqual(0.5);
  }

  const visibleArea = metrics.reduce(
    (total, metric) => total + metric.footprintWidth * metric.footprintHeight,
    0,
  );
  const operationalArea = metrics.reduce(
    (total, metric) => total + metric.hitWidth * metric.hitHeight,
    0,
  );
  expect(visibleArea / operationalArea).toBeLessThan(0.7);
});

test('keeps type, disposition, keyboard focus and selection usable inside the dense marker set', async ({
  page,
}) => {
  await openDensityMap(page);

  const location = page.locator('[data-pin-id="entity-density-pin-4"]');
  const character = page.locator('[data-pin-id="entity-density-pin-5"]');

  await expect(location.locator('.pin-visual')).toHaveClass(/pin-visual--location/);
  await expect(character.locator('.pin-visual')).toHaveClass(/pin-visual--character/);
  await expect(location.locator('.pin-disposition')).toBeVisible();
  await expect(character.locator('.pin-disposition')).toBeVisible();

  await character.focus();
  await expect(character).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(character).toHaveClass(/campaign-marker-icon--active/);
  await expect(page.getByTestId('place-details')).toBeVisible();
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-entity-id',
    'entity-density-pin-5',
  );
});
