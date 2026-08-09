import { readFileSync } from 'node:fs';

import { expect, test, type Page, type Route } from '@playwright/test';

import { PUBLIC_CATALOG_TABLE_QUERIES } from '../../src/data-access/publicCatalogQueryContract.js';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
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

type BackendMode =
  | 'success'
  | 'http-error'
  | 'rate-limited'
  | 'invalid-json'
  | 'missing-content-range'
  | 'slow'
  | 'connection-rejected';

interface TestBackend {
  setMode(mode: BackendMode): void;
  setEntityName(name: string): void;
  requestCount(): number;
}

function projectFixtureRows(table: string): readonly Record<string, unknown>[] {
  const query = Object.values(PUBLIC_CATALOG_TABLE_QUERIES).find(({ name }) => name === table);
  const fixtureKey = FIXTURE_KEYS_BY_TABLE[table];
  const fixtureRows = fixtureKey ? BETA01_FIXTURE[fixtureKey] : undefined;

  if (!query || !Array.isArray(fixtureRows)) return [];

  const fields = query.select.split(',');
  return fixtureRows.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`Expected fixture row object for ${table}.`);
    }
    const row = entry as Record<string, unknown>;
    return Object.fromEntries(fields.map((field) => [field, row[field]]));
  });
}

async function configureBackend(page: Page): Promise<TestBackend> {
  let mode: BackendMode = 'success';
  let requests = 0;
  let entityNameOverride: string | null = null;

  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map029_test_key',
      timeoutMs: 75,
      retryDelaysMs: [0, 0, 0],
    };
  }, LOCAL_SUPABASE_URL);

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await page.route(SUPABASE_PATTERN, async (route: Route) => {
    requests += 1;

    if (mode === 'connection-rejected') {
      await route.abort('connectionrefused');
      return;
    }
    if (mode === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (mode === 'http-error') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }
    if (mode === 'rate-limited') {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'Retry-After': '1' },
        body: '{"message":"rate limited"}',
      });
      return;
    }
    if (mode === 'invalid-json') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Content-Range': '0-0/1' },
        body: '{not-json',
      });
      return;
    }

    const match = /\/rest\/v1\/([^?]+)/.exec(route.request().url());
    const table = match?.[1] ?? '';
    let rows = projectFixtureRows(table);

    if (table === 'map_entities' && entityNameOverride) {
      rows = rows.map((row, index) =>
        index === 0 ? { ...row, name: entityNameOverride } : row,
      );
    }

    const contentRange = rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;
    const headers = mode === 'missing-content-range' ? {} : { 'Content-Range': contentRange };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers,
      body: JSON.stringify(rows),
    });
  });

  return {
    setMode(nextMode): void {
      mode = nextMode;
    },
    setEntityName(name): void {
      entityNameOverride = name;
    },
    requestCount(): number {
      return requests;
    },
  };
}

async function openConnected(page: Page, backend: TestBackend): Promise<void> {
  await page.goto('/');
  const status = page.locator('[data-backend-status]');
  await expect(status).toHaveAttribute('data-backend-state', 'connected');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect
    .poll(() => backend.requestCount())
    .toBe(Object.keys(PUBLIC_CATALOG_TABLE_QUERIES).length);
}

async function expectDegradedWithFallback(page: Page, reason: string): Promise<void> {
  const status = page.locator('[data-backend-status]');
  await expect(status).toHaveAttribute('data-backend-state', 'degraded');
  await expect(status).toHaveAttribute('data-backend-reason', reason);
  await expect(status).toContainText('Modo de respaldo');
  await expect(status.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
}

test('performs one initial public request per contract table and does not poll while idle', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await openConnected(page, backend);

  const settledCount = backend.requestCount();
  expect(settledCount).toBe(Object.keys(PUBLIC_CATALOG_TABLE_QUERIES).length);

  await page.waitForTimeout(300);
  expect(backend.requestCount()).toBe(settledCount);
});

test('renders stored HTML-like public data as inert text instead of executable markup', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  const maliciousName = '<img src=x onerror="window.__map029Xss=1">';
  backend.setEntityName(maliciousName);

  await openConnected(page, backend);
  await page.getByTestId('place-marker').first().click();

  await expect(page.getByTestId('place-details')).toContainText(maliciousName);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { __map029Xss?: number }).__map029Xss ?? 0,
    ),
  ).toBe(0);
});

for (const scenario of [
  { mode: 'http-error' as const, reason: 'http-error' },
  { mode: 'rate-limited' as const, reason: 'rate-limited' },
  { mode: 'invalid-json' as const, reason: 'invalid-json' },
  { mode: 'missing-content-range' as const, reason: 'partial-response' },
  { mode: 'slow' as const, reason: 'request-timeout' },
  { mode: 'connection-rejected' as const, reason: 'network-unavailable' },
]) {
  test(`keeps the atlas usable when Supabase fails as ${scenario.mode}`, async ({ page }) => {
    const backend = await configureBackend(page);
    await openConnected(page, backend);
    const beforeFailure = backend.requestCount();

    backend.setMode(scenario.mode);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await expectDegradedWithFallback(page, scenario.reason);
    expect(backend.requestCount()).toBeGreaterThan(beforeFailure);
  });
}

test('recovers after a rate limit once retry is requested and the backend is healthy again', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await openConnected(page, backend);
  backend.setMode('rate-limited');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expectDegradedWithFallback(page, 'rate-limited');

  backend.setMode('success');
  await page.locator('[data-backend-status]').getByRole('button', { name: 'Reintentar' }).click();

  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'connected',
  );
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
});
