import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const PUBLIC_KEY = 'sb_publishable_map055_master_public_key';
const AUTH_KEY = 'sb_publishable_map055_master_auth_key';
const ADMIN_TOKEN = 'map055-master-admin-token';
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const CAMPAIGN_A_ID = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B_ID = '00000000-0000-4000-8000-000000000054';
const MASTER_A_ID = 'entity-master-campaign-a';
const MASTER_B_ID = 'entity-master-campaign-b';
const MASTER_A_NAME = 'MAP055 SECRETO A';
const MASTER_B_NAME = 'MAP055 SECRETO B';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

interface MasterBackend {
  getMasterCampaignRequests(): readonly string[];
  releaseCampaignB(): void;
}

function contentRange(rows: readonly unknown[]): string {
  return rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;
}

function campaignIdFromUrl(url: URL): string {
  return url.searchParams.get('campaign_id')?.replace(/^eq\./, '') ?? CAMPAIGN_A_ID;
}

function publicRows(table: string, campaignId: string): readonly Record<string, unknown>[] {
  const suffix = campaignId === CAMPAIGN_B_ID ? 'b' : 'a';
  const entityId = `place-master-public-${suffix}`;
  const categoryId = `category-master-campaign-${suffix}`;

  switch (table) {
    case 'categories':
      return [
        {
          id: categoryId,
          slug: `master-campaign-${suffix}`,
          name: `Categoría Máster ${suffix.toUpperCase()}`,
          description: `Categoría pública de campaña ${suffix.toUpperCase()}`,
        },
      ];
    case 'map_entities':
      return [
        {
          id: entityId,
          slug: `master-public-${suffix}`,
          entity_type: 'location',
          visibility: 'pin',
          name: `Público ${suffix.toUpperCase()}`,
          name_language: 'en',
          summary: `Resumen público ${suffix.toUpperCase()}`,
          description: `Descripción pública ${suffix.toUpperCase()}`,
          portrait_path: null,
          x: suffix === 'b' ? 2500 : 800,
          y: suffix === 'b' ? 1500 : 650,
          category_id: categoryId,
        },
      ];
    default:
      return [];
  }
}

function masterCatalog(campaignId: string): Record<string, unknown> {
  const isB = campaignId === CAMPAIGN_B_ID;
  const suffix = isB ? 'b' : 'a';
  const entityId = isB ? MASTER_B_ID : MASTER_A_ID;
  const name = isB ? MASTER_B_NAME : MASTER_A_NAME;
  const categoryId = `category-master-campaign-${suffix}`;
  const x = isB ? 2150 : 1150;
  const y = isB ? 1250 : 850;

  return {
    entities: [
      {
        id: entityId,
        slug: `master-secret-${suffix}`,
        entity_type: 'character',
        visibility: 'pin',
        audience: 'master',
        name,
        summary: `Resumen privado ${suffix.toUpperCase()}`,
        description: `Descripción privada ${suffix.toUpperCase()}`,
        portrait_path: null,
        geometry: { kind: 'point', coordinates: { x, y } },
        x,
        y,
        category_id: categoryId,
        updated_at: '2026-08-27T12:00:00.000Z',
      },
    ],
    categories: [{ id: categoryId, name: `Categoría Máster ${suffix.toUpperCase()}` }],
    aliases: [
      {
        id: `alias-master-campaign-${suffix}`,
        entity_id: entityId,
        value: `Canario privado ${suffix.toUpperCase()}`,
      },
    ],
    tags: [],
    entity_tags: [],
    players: [],
    dispositions: [],
    associations: [],
    relations: [],
    relation_entities: [],
  };
}

async function configureBackend(page: Page): Promise<MasterBackend> {
  const masterCampaignRequests: string[] = [];
  let releaseB: (() => void) | null = null;
  const campaignBGate = new Promise<void>((resolve) => {
    releaseB = resolve;
  });

  await page.addInitScript(
    ({ projectUrl, publicKey, authKey }) => {
      window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
        projectUrl,
        publishableKey: publicKey,
        timeoutMs: 2000,
        retryDelaysMs: [0, 0, 0],
      };
      window.__MAP017_AUTH_TEST_CONFIG__ = {
        projectUrl,
        publishableKey: authKey,
        timeoutMs: 2000,
      };
    },
    { projectUrl: LOCAL_SUPABASE_URL, publicKey: PUBLIC_KEY, authKey: AUTH_KEY },
  );

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await page.route('**/auth/v1/**', async (route: Route) => {
    if (route.request().url().includes('/auth/v1/token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: ADMIN_TOKEN,
          refresh_token: 'map055-master-refresh-token',
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
    const resource = url.pathname.split('/rest/v1/')[1] ?? '';
    const authorization = request.headers()['authorization'] ?? '';
    const isAdmin = authorization === `Bearer ${ADMIN_TOKEN}`;

    if (isAdmin && resource === 'rpc/current_user_is_admin') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      return;
    }

    if (isAdmin && resource === 'rpc/admin_get_master_catalog_v6') {
      const body = JSON.parse(request.postData() ?? '{}') as { p_campaign_id?: unknown };
      const campaignId =
        typeof body.p_campaign_id === 'string' ? body.p_campaign_id : CAMPAIGN_A_ID;
      masterCampaignRequests.push(campaignId);
      if (campaignId === CAMPAIGN_B_ID) await campaignBGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(masterCatalog(campaignId)),
      });
      return;
    }

    if (isAdmin) {
      const rows: readonly Record<string, unknown>[] = [];
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
              id: CAMPAIGN_A_ID,
              slug: 'castigo-divino',
              name: 'Castigo Divino',
              status: 'active',
              display_order: 0,
            },
            {
              id: CAMPAIGN_B_ID,
              slug: 'campaign-b',
              name: 'Campaña B',
              status: 'active',
              display_order: 1,
            },
          ]
        : table === 'geographic_names' || table === 'geographic_name_aliases'
          ? []
          : publicRows(table, campaignIdFromUrl(url));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange(rows) },
      body: JSON.stringify(rows),
    });
  });

  return {
    getMasterCampaignRequests: () => masterCampaignRequests,
    releaseCampaignB(): void {
      releaseB?.();
    },
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

test('admin session survives A to B while Master Mode remains OFF and no private catalog is requested', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await page.goto('/');
  await signIn(page);

  const selector = page.getByLabel('Campaña', { exact: true });
  const toggle = page.locator('[data-master-mode-toggle]');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(backend.getMasterCampaignRequests()).toEqual([]);

  await selector.selectOption('campaign-b');
  await expect(selector).toHaveValue('campaign-b');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Administración' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.sessionStorage.getItem('castigo-divino-map:auth:v1')))
    .not.toBeNull();
  expect(backend.getMasterCampaignRequests()).toEqual([]);
});

test('Master Mode ON purges secret A before delayed secret B is adopted without reauthentication', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await page.goto('/');
  await signIn(page);

  const selector = page.getByLabel('Campaña', { exact: true });
  const toggle = page.locator('[data-master-mode-toggle]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => backend.getMasterCampaignRequests()).toContain(CAMPAIGN_A_ID);

  const secretA = page.locator(`[data-entity-id="${MASTER_A_ID}"]`);
  await expect(secretA).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar lugares' }).fill('Canario privado A');
  const resultA = page.locator(`[data-search-result-id="${MASTER_A_ID}"]`);
  await expect(resultA).toBeVisible();
  await resultA.click();
  await expect(page.getByTestId('place-details')).toContainText(MASTER_A_NAME);

  await selector.selectOption('campaign-b');
  await expect.poll(() => backend.getMasterCampaignRequests()).toContain(CAMPAIGN_B_ID);

  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-master-mode]')).toHaveAttribute('data-state', 'loading');
  await expect(secretA).toHaveCount(0);
  await expect(page.getByText(MASTER_A_NAME, { exact: true })).toHaveCount(0);
  await expect(page.locator(`[data-search-result-id="${MASTER_A_ID}"]`)).toHaveCount(0);
  await expect(page.getByTestId('place-details')).not.toContainText(MASTER_A_NAME);
  expect(page.url()).not.toContain(MASTER_A_ID);
  expect(page.url()).not.toContain('master-secret-a');
  await expect(page.getByRole('button', { name: 'Administración' })).toBeVisible();

  backend.releaseCampaignB();

  const secretB = page.locator(`[data-entity-id="${MASTER_B_ID}"]`);
  await expect(secretB).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-master-mode]')).toHaveAttribute('data-state', 'on');
  await expect(secretA).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Buscar lugares' }).fill('Canario privado B');
  await expect(page.locator(`[data-search-result-id="${MASTER_B_ID}"]`)).toBeVisible();
  await expect(page.locator(`[data-search-result-id="${MASTER_A_ID}"]`)).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.sessionStorage.getItem('castigo-divino-map:auth:v1')))
    .not.toBeNull();
});
