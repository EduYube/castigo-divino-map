import { readFileSync } from 'node:fs';

import { expect, test, type Page, type Route } from '@playwright/test';

import { PUBLIC_CATALOG_TABLE_QUERIES } from '../../src/data-access/publicCatalogQueryContract.js';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const ADMIN_TOKEN = 'map044-admin-access-token';
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const PUBLIC_PORTRAIT_AUTHORIZATION = 'Bearer sb_publishable_map044_public_key';
const MASTER_ID = 'entity-master-e2e';
const COINCIDENT_MASTER_ID = 'entity-master-coincident-e2e';
const MASTER_NAME = 'MAP044 E2E SECRET';
const MASTER_ASSOCIATION_PLAYER_ID = 'player-map044-e2e';
const MASTER_ASSOCIATION_PLAYER_NAME = 'MAP044 E2E Player';
const MASTER_ASSOCIATION_PLAYER_ACCENT = '#c2410c';
const MASTER_PORTRAIT_PATH = 'portraits/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
const PORTRAIT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
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
  portrait_path: MASTER_PORTRAIT_PATH,
  x: 1700,
  y: 1100,
  category_id: 'category-landmark',
  publication_status: 'published',
  published_at: '2026-08-10T21:00:00.000Z',
  archived_at: null,
  updated_at: '2026-08-10T21:00:00.000Z',
};

const COINCIDENT_MASTER_ROW = {
  ...MASTER_ROW,
  id: COINCIDENT_MASTER_ID,
  slug: 'map044-e2e-coincident-secret',
  name: 'MAP044 E2E COINCIDENT SECRET',
  summary: 'Private coincident E2E summary',
  description: 'Private coincident E2E description',
  x: 1080.5,
  y: 820,
};

interface Map044BackendOptions {
  readonly includeCoincidentMaster?: boolean;
}

interface PortraitRequest {
  readonly path: string;
  readonly authorization: string;
}

interface Map044Backend {
  getAudience(): 'public' | 'master';
  getSaveCount(): number;
  setMasterCatalogStatus(status: 200 | 401 | 403): void;
  getPortraitRequests(): readonly PortraitRequest[];
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
  if (table === 'players') {
    entries.push({
      id: MASTER_ASSOCIATION_PLAYER_ID,
      slug: 'map044-e2e-player',
      display_name: MASTER_ASSOCIATION_PLAYER_NAME,
      name_language: 'en',
      accent_color: MASTER_ASSOCIATION_PLAYER_ACCENT,
      publication_status: 'published',
    });
  }
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

function toMasterCatalogEntity(row: typeof MASTER_ROW) {
  return {
    id: row.id,
    slug: row.slug,
    entity_type: row.entity_type,
    visibility: row.visibility,
    audience: 'master',
    name: row.name,
    summary: row.summary,
    description: row.description,
    portrait_path: row.portrait_path,
    x: row.x,
    y: row.y,
    category_id: row.category_id,
    updated_at: row.updated_at,
  };
}

function masterCatalog(audience: 'public' | 'master', includeCoincidentMaster: boolean) {
  const entities = audience === 'master' ? [toMasterCatalogEntity(MASTER_ROW)] : [];
  if (audience === 'master' && includeCoincidentMaster) {
    entities.push(toMasterCatalogEntity(COINCIDENT_MASTER_ROW));
  }

  return {
    entities,
    categories: [{ id: 'category-landmark', name: 'Lugar destacado' }],
    aliases:
      audience === 'master'
        ? [{ id: 'alias-master-e2e', entity_id: MASTER_ID, value: 'Xanathar oculto' }]
        : [],
    tags: [],
    entity_tags: [],
    players:
      audience === 'master'
        ? [
            {
              id: MASTER_ASSOCIATION_PLAYER_ID,
              display_name: MASTER_ASSOCIATION_PLAYER_NAME,
              accent_color: MASTER_ASSOCIATION_PLAYER_ACCENT,
            },
          ]
        : [],
    dispositions: [],
    associations:
      audience === 'master'
        ? [{ entity_id: MASTER_ID, player_id: MASTER_ASSOCIATION_PLAYER_ID }]
        : [],
    relations: [],
    relation_entities: [],
  };
}

async function configureMap044Backend(
  page: Page,
  options: Map044BackendOptions = {},
): Promise<Map044Backend> {
  let audience: 'public' | 'master' = 'master';
  let saveCount = 0;
  let masterCatalogStatus: 200 | 401 | 403 = 200;
  const portraitRequests: PortraitRequest[] = [];
  const includeCoincidentMaster = options.includeCoincidentMaster === true;

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

  await page.route('**/storage/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const authorization = request.headers()['authorization'] ?? '';
    const encodedPath = url.pathname.split('/character-portraits/')[1] ?? '';
    const path = decodeURIComponent(encodedPath);
    portraitRequests.push({ path, authorization });
    const authorized =
      authorization === PUBLIC_PORTRAIT_AUTHORIZATION
        ? path !== MASTER_PORTRAIT_PATH || audience === 'public'
        : path === MASTER_PORTRAIT_PATH && authorization === `Bearer ${ADMIN_TOKEN}`;
    if (!authorized) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'image/png', body: PORTRAIT_PNG });
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
    if (adminRequest && resource === 'rpc/admin_get_master_catalog_v4') {
      if (masterCatalogStatus !== 200) {
        await route.fulfill({
          status: masterCatalogStatus,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'administrative authorization rejected' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(masterCatalog(audience, includeCoincidentMaster)),
      });
      return;
    }
    if (adminRequest && resource === 'rpc/admin_get_map_entity_editor_v5') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(adminDetail(audience)),
      });
      return;
    }
    if (adminRequest && resource === 'rpc/admin_save_map_entity_v5') {
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
    const rows =
      table === 'campaigns'
        ? [
            {
              id: '00000000-0000-4000-8000-000000000053',
              slug: 'castigo-divino',
              name: 'Castigo Divino',
              status: 'active',
              display_order: 0,
            },
          ]
        : projectRows(table, audience);
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
    setMasterCatalogStatus(status): void {
      masterCatalogStatus = status;
    },
    getPortraitRequests: () => portraitRequests,
  };
}

async function signIn(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Administrar' }).click();
  await expect(page.getByRole('dialog', { name: 'Acceso administrativo' })).toBeVisible();
  await page.getByLabel('Correo').fill('admin@example.invalid');
  await page.getByLabel('Contraseña').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar acceso administrativo' }).click();
  await expect(page.getByRole('button', { name: 'Administración' })).toBeVisible();
}

async function expectMasterAbsentFromMapExperience(page: Page): Promise<void> {
  await expect(page.locator('.campaign-marker-icon[data-audience="master"]')).toHaveCount(0);
  await expect(page.locator(`[data-search-result-id="${MASTER_ID}"]`)).toHaveCount(0);
  await expect(page.getByTestId('place-details')).not.toContainText(MASTER_NAME);
}

test('visitor and admin OFF cannot see master data; ON loads it ephemerally and logout purges it', async ({
  page,
}) => {
  const backend = await configureMap044Backend(page);
  await page.goto('/');

  await expect(page.locator('[data-master-mode-toggle]')).toHaveCount(0);
  expect(backend.getPortraitRequests().filter(({ path }) => path === MASTER_PORTRAIT_PATH)).toEqual(
    [],
  );
  await expect(page.getByText(MASTER_NAME, { exact: true })).toHaveCount(0);
  await expect(page.locator('.campaign-marker-icon[data-audience="master"]')).toHaveCount(0);

  await signIn(page);
  const toggle = page.locator('[data-master-mode-toggle]');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expectMasterAbsentFromMapExperience(page);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const privateMarker = page.locator('.campaign-marker-icon[data-audience="master"]');
  await expect(privateMarker).toHaveCount(1);
  await expect(privateMarker).toHaveAttribute('aria-label', /Contenido del Máster/);
  await expect(privateMarker).toHaveAttribute('data-portrait-marker', 'true');
  await expect(privateMarker).toHaveAttribute('data-association-count', '1');
  await expect(privateMarker).toHaveAttribute(
    'aria-description',
    new RegExp(`Relacionado con: ${MASTER_ASSOCIATION_PLAYER_NAME}\\.`),
  );
  await expect(privateMarker.locator('.pin-player-association-ring')).toHaveCSS(
    '--pin-player-association-accent',
    MASTER_ASSOCIATION_PLAYER_ACCENT,
  );
  await expect
    .poll(() =>
      backend
        .getPortraitRequests()
        .some(
          ({ path, authorization }) =>
            path === MASTER_PORTRAIT_PATH && authorization === `Bearer ${ADMIN_TOKEN}`,
        ),
    )
    .toBe(true);

  await page.getByRole('searchbox', { name: 'Buscar lugares' }).fill('Xanathar oculto');
  const masterResult = page.locator(`[data-search-result-id="${MASTER_ID}"]`);
  await expect(masterResult).toBeVisible();
  await expect(masterResult).toContainText('Máster');

  await toggle.click();
  await expect(privateMarker).toHaveCount(0);
  await expect(masterResult).toHaveCount(0);

  await toggle.click();
  await expect(privateMarker).toHaveCount(1);
  await page.getByRole('button', { name: 'Administración' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.locator('[data-master-mode-toggle]')).toHaveCount(0);
  await expect(privateMarker).toHaveCount(0);
  await expect(page.getByText(MASTER_NAME, { exact: true })).toHaveCount(0);
});

for (const status of [401, 403] as const) {
  test(`a ${status} on a subsequent private catalog load purges prior master state and invalidates Auth`, async ({
    page,
  }) => {
    const backend = await configureMap044Backend(page);
    await page.goto('/');
    await signIn(page);

    const toggle = page.locator('[data-master-mode-toggle]');
    await toggle.click();
    const privateMarker = page.locator('.campaign-marker-icon[data-audience="master"]');
    await expect(privateMarker).toHaveCount(1);

    await toggle.click();
    await expect(privateMarker).toHaveCount(0);
    backend.setMasterCatalogStatus(status);
    await toggle.click();

    await expect(page.locator('[data-master-mode-toggle]')).toHaveCount(0);
    await expect(privateMarker).toHaveCount(0);
    await expect(page.getByText(MASTER_NAME, { exact: true })).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.sessionStorage.getItem('castigo-divino-map:auth:v1')))
      .toBeNull();
  });
}

test('turning Master Mode OFF prevents Back/Forward from restoring a private selection', async ({
  page,
}) => {
  await configureMap044Backend(page);
  await page.goto('/');
  await signIn(page);

  const toggle = page.locator('[data-master-mode-toggle]');
  await toggle.click();
  await page.getByRole('searchbox', { name: 'Buscar lugares' }).fill('Xanathar oculto');
  const masterResult = page.locator(`[data-search-result-id="${MASTER_ID}"]`);
  await masterResult.click();
  await expect(page.getByTestId('place-details')).toContainText(MASTER_NAME);

  await toggle.click();
  await expectMasterAbsentFromMapExperience(page);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await searchbox.fill('paso');
  await page.locator('[data-search-result-id="place-demo-pass"]').click();
  await expect(page).toHaveURL(/place=paso-de-demostracion/);

  await page.goBack();
  await expectMasterAbsentFromMapExperience(page);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await page.goForward();
  await expectMasterAbsentFromMapExperience(page);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('public and master coincident pins expose count 2 only while Master Mode is ON', async ({
  page,
}) => {
  await configureMap044Backend(page, { includeCoincidentMaster: true });
  await page.goto('/');
  await signIn(page);

  const harbor = page.locator('[data-testid="place-marker"][data-place-id="place-demo-harbor"]');
  await expect(harbor).toHaveCount(1);
  await expect(page.getByTestId('coincident-pin')).toHaveCount(0);

  const toggle = page.locator('[data-master-mode-toggle]');
  await toggle.click();
  const coincident = page.getByTestId('coincident-pin');
  await expect(coincident).toHaveCount(1);
  await expect(coincident).toHaveAttribute('data-pin-count', '2');
  await expect(coincident).toHaveAttribute('aria-label', '2 pines agrupados');
  await expect(coincident).not.toHaveAttribute('data-audience', /.+/);
  await expect(coincident).not.toHaveAttribute('aria-description', /Máster/i);

  await toggle.click();
  await expect(coincident).toHaveCount(0);
  await expect(harbor).toHaveCount(1);
  await expect(harbor).toHaveAttribute('data-audience', 'public');
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
  const disclosure = details.locator('[data-master-audience-disclosure]');
  const audienceToggle = details.locator('[data-master-audience-start]');
  await expect(audienceToggle).toHaveText('Cambiar a Público');
  await audienceToggle.click();
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(audienceToggle).toHaveText('Cancelar');
  await expect(details).toContainText(/volverá a ser visible y buscable para jugadores/i);
  await audienceToggle.click();
  await expect(disclosure).not.toHaveAttribute('open', '');
  await expect(audienceToggle).toHaveText('Cambiar a Público');
  expect(backend.getSaveCount()).toBe(0);
  expect(backend.getAudience()).toBe('master');

  await audienceToggle.click();
  await expect(disclosure).toHaveAttribute('open', '');
  await details.getByRole('button', { name: 'Confirmar cambio de audiencia' }).click();
  await expect.poll(() => backend.getSaveCount()).toBe(1);
  await expect.poll(() => backend.getAudience()).toBe('public');
  await expect(page.locator('.campaign-marker-icon[data-audience="master"]')).toHaveCount(0);
  const transitionedPublicMarker = page.locator(
    `.campaign-marker-icon[data-entity-id="${MASTER_ID}"][data-audience="public"]`,
  );
  await expect(transitionedPublicMarker).toHaveCount(1);
  await expect(transitionedPublicMarker).toHaveAttribute('data-portrait-marker', 'true');
  await expect
    .poll(() =>
      backend
        .getPortraitRequests()
        .some(
          ({ path, authorization }) =>
            path === MASTER_PORTRAIT_PATH && authorization === PUBLIC_PORTRAIT_AUTHORIZATION,
        ),
    )
    .toBe(true);
  await expect(page.locator('[data-master-mode-status]')).toContainText(
    /No hay entidades Máster publicadas/i,
  );
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
  await expect(toggle).toBeVisible();
  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await searchbox.fill(MASTER_NAME);
  await page.locator(`[data-search-result-id="${MASTER_ID}"]`).click();
  const marker = page.locator(
    `[data-spiderfied="true"][data-entity-id="${MASTER_ID}"][data-audience="master"]`,
  );
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveAttribute('aria-label', /Contenido del Máster/);
  await expect(marker.locator('.pin-visual--master')).toHaveCount(1);
});
