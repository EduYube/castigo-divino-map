import { readFileSync } from 'node:fs';

import { expect, test, type Page, type Route } from '@playwright/test';

import { PUBLIC_CATALOG_TABLE_QUERIES } from '../../src/data-access/publicCatalogQueryContract.js';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const ADMIN_TOKEN = 'map044-admin-access-token';
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const MASTER_ID = 'entity-master-e2e';
const MASTER_NAME = 'MAP044 E2E SECRET';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;
const PUBLIC_FIXTURE = JSON.parse(
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

const MASTER_ROW = {
  id: MASTER_ID,
  slug: 'map044-e2e-secret',
  entity_type: 'character',
  visibility: 'pin',
  audience: 'master',
  name: MASTER_NAME,
  name_language: 'en',
  summary: 'Private E2E summary',
  description: 'Private E2E description',
  x: 1700,
  y: 1100,
  category_id: 'category-landmark',
  publication_status: 'published',
  published_at: '2026-08-10T21:00:00.000Z',
  archived_at: null,
  updated_at: '2026-08-10T21:00:00.000Z',
};

interface Map044Backend {
  getAudience(): 'public' | 'master';
  getSaveCount(): number;
}

function projectRows(
  table: string,
  audience: 'public' | 'master',
): readonly Record<string, unknown>[] {
  const query = Object.values(PUBLIC_CATALOG_TABLE_QUERIES).find(({ name }) => name === table);
  const fixtureKey = FIXTURE_KEYS_BY_TABLE[table];
  const fixtureRows = fixtureKey ? PUBLIC_FIXTURE[fixtureKey] : undefined;
  if (!query || !Array.isArray(fixtureRows)) return [];

  const entries = [...fixtureRows] as Record<string, unknown>[];
  if (audience === 'public' && table === 'map_entities') {
    entries.push({ ...MASTER_ROW, audience: undefined });
  }
  if (audience === 'public' && table === 'entity_aliases') {
    entries.push({
      id: 'alias-master-e2e',
      entity_id: MASTER_ID,
      language: 'en',
      value: 'MAP044 public transition alias',
      publication_status: 'published',
    });
  }

  const fields = query.select.split(',');
  return entries.map((entry) => Object.fromEntries(fields.map((field) => [field, entry[field]])));
}

function contentRange(rows: readonly unknown[]): string {
  return rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;
}

function adminDetail(audience: 'public' | 'master') {
  return {
    record: { ...MASTER_ROW, audience },
    tag_links: [],
    dispositions: [],
    relations_revision: `map044-${audience}-revision`,
    delete_blockers: {
      aliases: 1,
      tags: 0,
      geographic_names: 0,
      notes: 0,
      location_events: 0,
      requests: 0,
    },
  };
}

function masterCatalog(audience: 'public' | 'master') {
  return {
    entities:
      audience === 'master'
        ? [
            {
              id: MASTER_ID,
              slug: MASTER_ROW.slug,
              entity_type: MASTER_ROW.entity_type,
              visibility: MASTER_ROW.visibility,
              audience: 'master',
              name: MASTER_NAME,
              summary: MASTER_ROW.summary,
              description: MASTER_ROW.description,
              x: MASTER_ROW.x,
              y: MASTER_ROW.y,
              category_id: MASTER_ROW.category_id,
              updated_at: MASTER_ROW.updated_at,
            },
          ]
        : [],
    categories: [{ id: 'category-landmark', name: 'Lugar destacado' }],
    aliases:
      audience === 'master'
        ? [{ id: 'alias-master-e2e', entity_id: MASTER_ID, value: 'Xanathar oculto' }]
        : [],
    tags: [],
    entity_tags: [],
    players: [],
    dispositions: [],
    relations: [],
    relation_entities: [],
  };
}

async function configureMap044Backend(page: Page): Promise<Map044Backend> {
  let audience: 'public' | 'master' = 'master';
  let saveCount = 0;

  await page.addInitScript(
    ({ projectUrl }) => {
      window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
        projectUrl,
        publishableKey: 'sb_publishable_map044_public_key',
        timeoutMs: 2000,
        retryDelaysMs: [0, 0, 0],
      };
      window.__MAP017_AUTH_TEST_CONFIG__ = {
        projectUrl,
        publishableKey: 'sb_publishable_map044_auth_key',
        timeoutMs: 2000,
      };
    },
    { projectUrl: LOCAL_SUPABASE_URL },
  );

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await page.route('**/auth/v1/**', async (route: Route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: ADMIN_TOKEN,
          refresh_token: 'map044-refresh-token',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: ADMIN_ID, email: 'admin@example.invalid' },
        }),
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/rest/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const authorization = request.headers()['authorization'] ?? '';
    const adminRequest = authorization === `Bearer ${ADMIN_TOKEN}`;
    const resource = url.pathname.split('/rest/v1/')[1] ?? '';

    if (adminRequest && resource === 'rpc/current_user_is_admin') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      return;
    }
    if (adminRequest && resource === 'rpc/admin_get_master_catalog') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(masterCatalog(audience)),
      });
      return;
    }
    if (adminRequest && resource === 'rpc/admin_get_map_entity_editor_v2') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(adminDetail(audience)),
      });
      return;
    }
    if (adminRequest && resource === 'rpc/admin_save_map_entity_v2') {
      saveCount += 1;
      const body = JSON.parse(request.postData() ?? '{}') as { p_audience?: unknown };
      audience = body.p_audience === 'master' ? 'master' : 'public';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(adminDetail(audience)),
      });
      return;
    }

    if (adminRequest) {
      const rows = resource === 'map_entities' ? [{ ...MASTER_ROW, audience }] : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Content-Range': contentRange(rows) },
        body: JSON.stringify(rows),
      });
      return;
    }

    const table = resource.split('?')[0] ?? '';
    const rows = projectRows(table, audience);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange(rows) },
      body: JSON.stringify(rows),
    });
  });

  return {
    getAudience: () => audience,
    getSaveCount: () => saveCount,
  };
}

async function signIn(page: Page): Promise<void> {
  await page.getByLabel('Correo electrónico').fill('admin@example.invalid');
  await page.getByLabel('Contraseña').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.locator('[data-admin-auth]')).toHaveAttribute('data-state', 'authorized');
}

test('visitor and admin OFF cannot see master data; ON loads it ephemerally and logout purges it', async ({
  page,
}) => {
  await configureMap044Backend(page);
  await page.goto('/');

  await expect(page.locator('[data-master-mode-toggle]')).toHaveCount(0);
  await expect(page.getByText(MASTER_NAME, { exact: true })).toHaveCount(0);
  await expect(page.locator('.campaign-marker-icon[data-audience="master"]')).toHaveCount(0);

  await signIn(page);
  const toggle = page.locator('[data-master-mode-toggle]');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText(MASTER_NAME, { exact: true })).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const privateMarker = page.locator('.campaign-marker-icon[data-audience="master"]');
  await expect(privateMarker).toHaveCount(1);
  await expect(privateMarker).toHaveAttribute('aria-label', /Contenido del Máster/);

  await page.getByRole('searchbox', { name: 'Buscar lugares' }).fill('Xanathar oculto');
  const masterResult = page.locator(`[data-search-result-id="${MASTER_ID}"]`);
  await expect(masterResult).toBeVisible();
  await expect(masterResult).toContainText('Máster');

  await toggle.click();
  await expect(privateMarker).toHaveCount(0);
  await expect(masterResult).toHaveCount(0);

  await toggle.click();
  await expect(privateMarker).toHaveCount(1);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.locator('[data-master-mode-toggle]')).toHaveCount(0);
  await expect(privateMarker).toHaveCount(0);
  await expect(page.getByText(MASTER_NAME, { exact: true })).toHaveCount(0);
});

test('detail audience transition requires confirmation, supports cancel and refreshes public/private projections', async ({
  page,
}) => {
  const backend = await configureMap044Backend(page);
  await page.goto('/');
  await signIn(page);
  await page.locator('[data-master-mode-toggle]').click();

  const privateMarker = page.locator('.campaign-marker-icon[data-audience="master"]');
  await expect(privateMarker).toHaveCount(1);
  await privateMarker.click();

  const details = page.getByTestId('place-details');
  await expect(details).toContainText('Contenido del Máster');
  const start = details.getByRole('button', { name: 'Cambiar a Público' });
  await start.click();
  await expect(details).toContainText(/volverá a ser visible y buscable para jugadores/i);
  await details.getByRole('button', { name: 'Cancelar' }).click();
  expect(backend.getSaveCount()).toBe(0);
  expect(backend.getAudience()).toBe('master');

  await start.click();
  await details.getByRole('button', { name: 'Confirmar cambio de audiencia' }).click();
  await expect.poll(() => backend.getSaveCount()).toBe(1);
  await expect.poll(() => backend.getAudience()).toBe('public');
  await expect(page.locator('.campaign-marker-icon[data-audience="master"]')).toHaveCount(0);
  await expect(page.locator('.campaign-marker-icon[data-audience="public"]')).toContainText('');
  await expect(page.locator('[data-master-mode-status]')).toContainText(/0 entidades privadas/i);
});

test('master pin remains distinguishable on mobile with reduced motion and forced colors', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await configureMap044Backend(page);
  await page.goto('/');
  await signIn(page);
  await page.locator('[data-master-mode-toggle]').click();

  const toggle = page.locator('[data-master-mode-toggle]');
  const marker = page.locator('.campaign-marker-icon[data-audience="master"]');
  await expect(toggle).toBeVisible();
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveAttribute('aria-label', /Contenido del Máster/);
  await expect(marker.locator('.pin-visual--master')).toHaveCount(1);
});
