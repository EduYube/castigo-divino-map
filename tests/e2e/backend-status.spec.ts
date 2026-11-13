import { readFileSync } from 'node:fs';

import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

import { PUBLIC_CATALOG_TABLE_QUERIES } from '../../src/data-access/publicCatalogQueryContract.js';
import { waitForFirstRemoteCheck } from '../deployment/remote-health';

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

interface Qa226BackendOptions {
  readonly timeoutMs?: number;
  readonly retryDelaysMs?: readonly number[];
  readonly initialRequestDelayMs?: number;
  readonly transientFailures?: number;
  readonly simulateOffline?: boolean;
}

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

async function configurePublicDataTest(
  page: Page,
  options: Qa226BackendOptions = {},
): Promise<PublicDataTestBackend> {
  let mode: BackendMode = 'success';
  let requestCount = 0;
  let transientFailures = options.transientFailures ?? 0;

  if (options.simulateOffline) {
    // Keep the local fixture routable while testing the app's navigator signal.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    });
  }
  await page.addInitScript(
    ({ projectUrl, timeoutMs, retryDelaysMs }) => {
      window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
        projectUrl,
        publishableKey: 'sb_publishable_map016_test_key',
        timeoutMs,
        retryDelaysMs,
      };
    },
    {
      projectUrl: LOCAL_SUPABASE_URL,
      timeoutMs: options.timeoutMs ?? 2000,
      retryDelaysMs: options.retryDelaysMs ?? [0, 0, 0],
    },
  );
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });
  await page.route(SUPABASE_PATTERN, async (route: Route) => {
    requestCount += 1;

    if (mode === 'failure' || transientFailures > 0) {
      if (transientFailures > 0) transientFailures -= 1;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }

    if (requestCount === 1 && (options.initialRequestDelayMs ?? 0) > 0) {
      // Deterministic network simulation, not a smoke synchronization sleep.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, options.initialRequestDelayMs);
      });
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

  await expectConnected(status, backend);
  await expect(status).toContainText('Servicio de datos conectado');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect(details).toHaveAttribute('data-active-place-id', 'place-demo-pass');
  await expect(searchbox).toHaveValue('paso');
  await expect(category).toBeChecked();
  await expect(tag).toBeChecked();
  const originalUrl = page.url();
  expect(new URL(originalUrl).searchParams.get('campaign')).toBe('castigo-divino');

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

test('QA-226 slow success keeps the snapshot usable beyond the old five-second assertion', async ({
  page,
}) => {
  const backend = await configurePublicDataTest(page, {
    initialRequestDelayMs: 5750,
    timeoutMs: 8000,
  });
  await page.goto('/?q=paso');

  const status = page.locator('[data-backend-status]');
  await expect(status).toHaveAttribute('data-backend-state', 'checking');
  await expect(status).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('paso');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);

  // Sensitivity: the legacy published assertion must fail while a legitimate
  // remote acquisition is still pending, even though the snapshot is usable.
  await expect(
    expect(status).toHaveAttribute('data-backend-state', 'connected', { timeout: 5000 }),
  ).rejects.toThrow();

  const final = await waitForFirstRemoteCheck(page);
  expect(final).toMatchObject({ state: 'connected', reason: 'none', ariaBusy: 'false' });
  expect(final.attempt).toBe(1);
  expect(backend.getRequestCount()).toBeGreaterThanOrEqual(13);
});

test('QA-226 transient 503 recovers with a completed second remote attempt', async ({ page }) => {
  const backend = await configurePublicDataTest(page, { transientFailures: 1 });
  await page.goto('/?q=paso');

  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('paso');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  const final = await waitForFirstRemoteCheck(page);
  expect(final).toMatchObject({ state: 'connected', reason: 'none', attempt: 2 });
  expect(backend.getRequestCount()).toBeGreaterThanOrEqual(14);
});

test('QA-226 persistent 503 remains functionally available but fails remote health', async ({
  page,
}) => {
  const backend = await configurePublicDataTest(page);
  backend.setMode('failure');
  await page.goto('/?q=paso');

  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('paso');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  const final = await waitForFirstRemoteCheck(page);
  expect(final).toMatchObject({
    state: 'degraded',
    reason: 'http-error',
    source: 'bundled-snapshot',
    attempt: 3,
  });
  await expect(page.locator('[data-backend-status]')).toContainText('Modo de respaldo');
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await expect(page.getByText('Contenido del Máster', { exact: true })).toHaveCount(0);
});

test('QA-226 offline reports offline and retains the public snapshot without REST calls', async ({
  page,
}) => {
  const backend = await configurePublicDataTest(page, { simulateOffline: true });
  await page.goto('/?q=paso');

  const final = await waitForFirstRemoteCheck(page);
  expect(final).toMatchObject({
    state: 'offline',
    reason: 'network-unavailable',
    source: 'bundled-snapshot',
    attempt: 0,
  });
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('paso');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  expect(backend.getRequestCount()).toBe(0);
});
