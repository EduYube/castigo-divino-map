import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const PUBLIC_KEY = 'sb_publishable_map055_stale_public_key';
const AUTH_KEY = 'sb_publishable_map055_stale_auth_key';
const ADMIN_TOKEN = 'map055-stale-admin-token';
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const CAMPAIGN_A_ID = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B_ID = '00000000-0000-4000-8000-000000000054';
const MASTER_A_ID = 'entity-master-stale-a';
const MASTER_B_ID = 'entity-master-current-b';
const MASTER_A_NAME = 'MAP055 STALE SECRET A';
const MASTER_B_NAME = 'MAP055 CURRENT SECRET B';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

interface StaleBackend {
  getRequestedCampaigns(): readonly string[];
  getCompletedCampaigns(): readonly string[];
  releaseCampaignA(): void;
}

function contentRange(rows: readonly unknown[]): string {
  return rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;
}

function campaignIdFromUrl(url: URL): string {
  return url.searchParams.get('campaign_id')?.replace(/^eq\./, '') ?? CAMPAIGN_A_ID;
}

function publicRows(table: string, campaignId: string): readonly Record<string, unknown>[] {
  const suffix = campaignId === CAMPAIGN_B_ID ? 'b' : 'a';
  const categoryId = `category-stale-${suffix}`;

  switch (table) {
    case 'categories':
      return [
        {
          id: categoryId,
          slug: `stale-${suffix}`,
          name: `Categoría ${suffix.toUpperCase()}`,
          description: `Categoría pública ${suffix.toUpperCase()}`,
        },
      ];
    case 'map_entities':
      return [
        {
          id: `place-stale-public-${suffix}`,
          slug: `stale-public-${suffix}`,
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
  const categoryId = `category-stale-${suffix}`;

  return {
    entities: [
      {
        id: entityId,
        slug: `stale-secret-${suffix}`,
        entity_type: 'character',
        visibility: 'pin',
        audience: 'master',
        name,
        summary: `Resumen privado ${suffix.toUpperCase()}`,
        description: `Descripción privada ${suffix.toUpperCase()}`,
        portrait_path: null,
        x: isB ? 2150 : 1150,
        y: isB ? 1250 : 850,
        category_id: categoryId,
        updated_at: '2026-08-28T12:00:00.000Z',
      },
    ],
    categories: [{ id: categoryId, name: `Categoría ${suffix.toUpperCase()}` }],
    aliases: [
      {
        id: `alias-stale-${suffix}`,
        entity_id: entityId,
        value: isB ? 'Canario actual B' : 'Canario obsoleto A',
      },
    ],
    tags: [],
    entity_tags: [],
    players: [],
    dispositions: [],
    relations: [],
    relation_entities: [],
  };
}

async function configureStaleBackend(page: Page): Promise<StaleBackend> {
  const requestedCampaigns: string[] = [];
  const completedCampaigns: string[] = [];
  let releaseA: (() => void) | null = null;
  const campaignAGate = new Promise<void>((resolve) => {
    releaseA = resolve;
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

      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const requestUrl =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (requestUrl.includes('/rest/v1/rpc/admin_get_master_catalog_v3') && init) {
          const abortIgnoringInit = { ...init };
          delete abortIgnoringInit.signal;
          return nativeFetch(input, abortIgnoringInit);
        }
        return nativeFetch(input, init);
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
          refresh_token: 'map055-stale-refresh-token',
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

    if (isAdmin && resource === 'rpc/admin_get_master_catalog_v3') {
      const body = JSON.parse(request.postData() ?? '{}') as { p_campaign_id?: unknown };
      const campaignId =
        typeof body.p_campaign_id === 'string' ? body.p_campaign_id : CAMPAIGN_A_ID;
      requestedCampaigns.push(campaignId);
      if (campaignId === CAMPAIGN_A_ID) await campaignAGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(masterCatalog(campaignId)),
      });
      completedCampaigns.push(campaignId);
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
    getRequestedCampaigns: () => requestedCampaigns,
    getCompletedCampaigns: () => completedCampaigns,
    releaseCampaignA(): void {
      releaseA?.();
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

test('stale campaign A cannot re-enter the DOM when it resolves after campaign B and ignores abort', async ({
  page,
}) => {
  const backend = await configureStaleBackend(page);
  await page.goto('/');
  await signIn(page);

  const selector = page.getByLabel('Campaña', { exact: true });
  const toggle = page.locator('[data-master-mode-toggle]');
  await expect(selector).toHaveValue('castigo-divino');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => backend.getRequestedCampaigns()).toContain(CAMPAIGN_A_ID);
  await expect(page.locator('[data-master-mode]')).toHaveAttribute('data-state', 'loading');

  await selector.selectOption('campaign-b');
  await expect(selector).toHaveValue('campaign-b');
  await expect.poll(() => backend.getRequestedCampaigns()).toContain(CAMPAIGN_B_ID);
  await expect.poll(() => backend.getCompletedCampaigns()).toContain(CAMPAIGN_B_ID);

  const secretA = page.locator(`[data-entity-id="${MASTER_A_ID}"]`);
  const secretB = page.locator(`[data-entity-id="${MASTER_B_ID}"]`);
  await expect(secretB).toBeVisible();
  await expect(secretA).toHaveCount(0);
  await expect(page.locator('[data-master-mode]')).toHaveAttribute('data-state', 'on');

  backend.releaseCampaignA();
  await expect.poll(() => backend.getCompletedCampaigns()).toContain(CAMPAIGN_A_ID);

  await expect(secretB).toBeVisible();
  await expect(secretA).toHaveCount(0);
  await expect(page.getByText(MASTER_A_NAME, { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-master-mode]')).toHaveAttribute('data-state', 'on');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  const search = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await search.fill('Canario obsoleto A');
  await expect(page.locator(`[data-search-result-id="${MASTER_A_ID}"]`)).toHaveCount(0);

  await search.fill('Canario actual B');
  const resultB = page.locator(`[data-search-result-id="${MASTER_B_ID}"]`);
  await expect(resultB).toBeVisible();
  await resultB.focus();
  await resultB.press('Enter');
  await expect(page.getByTestId('place-details')).toContainText(MASTER_B_NAME);
  await expect(page.getByTestId('place-details')).not.toContainText(MASTER_A_NAME);
  await expect
    .poll(() => page.evaluate(() => window.sessionStorage.getItem('castigo-divino-map:auth:v1')))
    .not.toBeNull();
});
