import { readFileSync } from 'node:fs';

import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

import { PUBLIC_CATALOG_TABLE_QUERIES } from '../../src/data-access/publicCatalogQueryContract.js';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const CAMPAIGN_A_ID = '00000000-0000-4000-8000-000000000053';
const SUPABASE_PATTERN = '**/rest/v1/**';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;
const BETA01_FIXTURE = JSON.parse(
  readFileSync(new URL('../../scripts/fixtures/beta01-public-rows.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;
const FIXTURE_KEYS_BY_TABLE: Readonly<Record<string, string>> = {
  categories: 'categories',
  tags: 'tags',
  players: 'players',
  map_entities: 'entities',
  entity_aliases: 'entityAliases',
  entity_tags: 'entityTags',
  entity_player_dispositions: 'dispositions',
  character_location_relations: 'characterLocationRelations',
  public_notes: 'notes',
  public_note_tags: 'noteTags',
  geographic_names: 'geographicNames',
  geographic_name_aliases: 'geographicAliases',
  character_location_events: 'locationEvents',
};

type BackendMode = 'success' | 'failure';

interface PublicDataTestBackend {
  setMode(mode: BackendMode): void;
  getRequestCount(): number;
}

function projectFixtureRows(table: string): readonly Record<string, unknown>[] {
  if (table === 'campaigns') {
    return [
      {
        id: CAMPAIGN_A_ID,
        slug: 'castigo-divino',
        name: 'Castigo Divino',
        status: 'active',
        display_order: 0,
      },
    ];
  }

  const query = Object.values(PUBLIC_CATALOG_TABLE_QUERIES).find(({ name }) => name === table);
  const fixtureKey = FIXTURE_KEYS_BY_TABLE[table];
  const fixtureRows = fixtureKey ? BETA01_FIXTURE[fixtureKey] : undefined;

  if (!query || !Array.isArray(fixtureRows)) {
    return [];
  }

  const fields = query.select.split(',');

  return fixtureRows.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`Expected fixture row object for ${table}.`);
    }

    const row = entry as Record<string, unknown>;
    return Object.fromEntries(fields.map((field) => [field, row[field]]));
  });
}

async function configurePublicDataTest(page: Page): Promise<PublicDataTestBackend> {
  let mode: BackendMode = 'success';
  let requestCount = 0;

  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map016_test_key',
      timeoutMs: 2000,
      retryDelaysMs: [0, 0, 0],
    };
  }, LOCAL_SUPABASE_URL);
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });
  await page.route(SUPABASE_PATTERN, async (route: Route) => {
    requestCount += 1;

    if (mode === 'failure') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }

    const match = /\/rest\/v1\/([^?]+)/.exec(route.request().url());
    const table = match?.[1] ?? '';
    const rows = projectFixtureRows(table);
    const contentRange = rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange },
      body: JSON.stringify(rows),
    });
  });

  return {
    setMode(nextMode: BackendMode): void {
      mode = nextMode;
    },
    getRequestCount(): number {
      return requestCount;
    },
  };
}

async function expectConnected(status: Locator, backend: PublicDataTestBackend): Promise<void> {
  await expect(status).toHaveAttribute('data-backend-state', 'connected');
  await expect(status).toHaveAttribute('data-backend-reason', 'none');
  await expect(status).toHaveAttribute('data-backend-attempt', '1');
  await expect.poll(() => backend.getRequestCount()).toBeGreaterThanOrEqual(13);
}

test('falls back and recovers without changing search, filters, selection or URL', async ({
  page,
}) => {
  const backend = await configurePublicDataTest(page);
  await page.goto(
    '/?place=paso-de-demostracion&q=paso&category=lugares-destacados&tag=mountain-pass',
  );

  const status = page.locator('[data-backend-status]');
  const details = page.getByTestId('place-details');
  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  const category = page.getByRole('checkbox', { name: /Lugar destacado/ });
  const tag = page.getByRole('checkbox', { name: /Paso de montaña/ });
  const originalUrl = page.url();

  await expectConnected(status, backend);
  await expect(status).toContainText('Servicio de datos conectado');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect(details).toHaveAttribute('data-active-place-id', 'place-demo-pass');
  await expect(searchbox).toHaveValue('paso');
  await expect(category).toBeChecked();
  await expect(tag).toBeChecked();

  backend.setMode('failure');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await expect(status).toHaveAttribute('data-backend-state', 'degraded');
  await expect(status).toContainText('Modo de respaldo');
  await expect(status.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect(details).toHaveAttribute('data-active-place-id', 'place-demo-pass');
  await expect(searchbox).toHaveValue('paso');
  await expect(category).toBeChecked();
  await expect(tag).toBeChecked();
  expect(page.url()).toBe(originalUrl);

  backend.setMode('success');
  await status.getByRole('button', { name: 'Reintentar' }).click();

  await expect(status).toHaveAttribute('data-backend-state', 'connected');
  await expect(status).toHaveAttribute('data-backend-reason', 'none');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect(details).toHaveAttribute('data-active-place-id', 'place-demo-pass');
  expect(page.url()).toBe(originalUrl);
});

test('announces offline mode textually and keeps the snapshot usable', async ({
  page,
  context,
}) => {
  const backend = await configurePublicDataTest(page);
  await page.goto('/');

  const status = page.locator('[data-backend-status]');
  await expectConnected(status, backend);

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));

  await expect(status).toHaveAttribute('data-backend-state', 'offline');
  await expect(status).toHaveAttribute('data-backend-reason', 'network-unavailable');
  await expect(status).toContainText('Sin conexión');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect(status.getByRole('button', { name: 'Reintentar' })).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(status).toHaveAttribute('data-backend-state', 'connected');
  await expect(status).toHaveAttribute('data-backend-reason', 'none');
});
