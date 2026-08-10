import { readFileSync } from 'node:fs';

import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

interface SnapshotGeographicAlias {
  id: string;
  geographicNameId: string;
  language: string;
  value: string;
}

interface SnapshotGeographicName {
  id: string;
  slug: string;
  name: string;
  language: string;
  aliases: SnapshotGeographicAlias[];
  coordinates: { x: number; y: number };
  recommendedZoom: number | null;
  entityId: string | null;
}

interface SnapshotPayload {
  content: {
    geographicNames: SnapshotGeographicName[];
  };
}

const SNAPSHOT = JSON.parse(
  readFileSync(
    new URL('../../public/data/public-catalog.snapshot.json', import.meta.url),
    'utf8',
  ),
) as SnapshotPayload;

const GEOGRAPHIC_ROWS = SNAPSHOT.content.geographicNames.map((entry) => ({
  id: entry.id,
  slug: entry.slug,
  name: entry.name,
  language: entry.language,
  x: entry.coordinates.x,
  y: entry.coordinates.y,
  recommended_zoom: entry.recommendedZoom,
  entity_id: entry.entityId,
}));

const GEOGRAPHIC_ALIAS_ROWS = SNAPSHOT.content.geographicNames.flatMap((entry) =>
  entry.aliases.map((alias) => ({
    id: alias.id,
    geographic_name_id: alias.geographicNameId,
    language: alias.language,
    value: alias.value,
  })),
);

const PUBLIC_ROWS: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  categories: [],
  tags: [],
  players: [],
  map_entities: [],
  entity_aliases: [],
  entity_tags: [],
  entity_player_dispositions: [],
  character_location_relations: [],
  public_notes: [],
  public_note_tags: [],
  geographic_names: GEOGRAPHIC_ROWS,
  geographic_name_aliases: GEOGRAPHIC_ALIAS_ROWS,
  character_location_events: [],
};

async function mockMap(page: Page): Promise<void> {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });
}

async function openSearchPanel(page: Page): Promise<void> {
  const toggle = page.locator('[data-place-search-toggle]');
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click();
  }
}

async function openRemoteCoverage(page: Page): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map039_geography_test_key',
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

  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'connected',
  );
  await openSearchPanel(page);
}

function searchInput(page: Page) {
  return page.getByRole('searchbox', { name: 'Buscar lugares' });
}

test('finds the MAP-039 known examples by exact and partial queries from Supabase data', async ({
  page,
}) => {
  await openRemoteCoverage(page);
  const input = searchInput(page);

  for (const name of [
    'The Dalelands',
    'Thunder Peaks',
    'The Shining Plains',
    'The High Ice',
    'Omans Isle',
  ]) {
    await input.fill(name);
    await expect(
      page.getByRole('button', { name: new RegExp(`${name}.*Lugar geográfico`, 'i') }),
    ).toBeVisible();
  }

  await input.fill('Dalel');
  await expect(
    page.getByRole('button', { name: /The Dalelands.*Lugar geográfico/i }),
  ).toBeVisible();

  await input.fill('Star Mountains');
  await expect(
    page.getByRole('button', { name: /Star Mounts.*Lugar geográfico.*Coincidencia por alias/i }),
  ).toBeVisible();
});

test('keyboard autocomplete selects the geographic identity and applies center, zoom and highlight', async ({
  page,
}) => {
  await openRemoteCoverage(page);
  const input = searchInput(page);
  const listbox = page.getByRole('listbox', { name: 'Sugerencias de búsqueda' });

  await input.fill('Thunder');
  await expect(listbox.getByRole('option')).toContainText(['Thunder Peaks']);
  await input.press('ArrowDown');
  await input.press('Enter');

  await expect(input).toHaveValue('Thunder Peaks');
  const shell = page.getByTestId('map-shell');
  await expect(shell).toHaveAttribute('data-map-center', '859.00,3100.00');
  await expect(shell).toHaveAttribute('data-map-zoom', '0.5');
  await expect(shell).toHaveAttribute('data-search-highlight', 'true');
  await expect(page.locator('[data-map-search-status]')).toContainText(
    'Mapa centrado en Thunder Peaks, lugar geográfico',
  );
  await expect(page.getByTestId('place-details')).toBeHidden();
});

test('uses the bundled MAP-039 snapshot when Supabase is unavailable', async ({ page }) => {
  await mockMap(page);
  await page.route('**/rest/v1/**', async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/?q=Omans');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'degraded',
  );
  await openSearchPanel(page);

  const result = page.getByRole('button', { name: /Omans Isle.*Lugar geográfico/i });
  await expect(result).toBeVisible();
  await result.click();

  const shell = page.getByTestId('map-shell');
  await expect(shell).toHaveAttribute('data-map-center', '899.00,1090.00');
  await expect(shell).toHaveAttribute('data-map-zoom', '0.5');
  await expect(shell).toHaveAttribute('data-search-highlight', 'true');
  await expect(page.getByTestId('place-details')).toBeHidden();
});
