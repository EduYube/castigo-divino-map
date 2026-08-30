import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map059-master-admin-token';
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const CAMPAIGN_A_ID = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B_ID = '00000000-0000-4000-8000-000000000054';
const PUBLIC_A_ID = 'entity-map059-public-a';
const PUBLIC_B_ID = 'entity-map059-public-b';
const MASTER_A_ID = 'entity-map059-master-a';
const MASTER_B_ID = 'entity-map059-master-b';
const MASTER_A_NAME = 'Secreto MAP059 A';
const MASTER_B_NAME = 'Secreto MAP059 B';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

function contentRange(rows: readonly unknown[]): string {
  return rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;
}

function campaignIdFromUrl(url: URL): string {
  return url.searchParams.get('campaign_id')?.replace(/^eq\./, '') ?? CAMPAIGN_A_ID;
}

function publicRows(table: string, campaignId: string): readonly Record<string, unknown>[] {
  const isB = campaignId === CAMPAIGN_B_ID;
  const suffix = isB ? 'b' : 'a';
  const categoryId = `category-map059-${suffix}`;

  switch (table) {
    case 'categories':
      return [
        {
          id: categoryId,
          slug: `map059-${suffix}`,
          name: `Categoría MAP059 ${suffix.toUpperCase()}`,
          description: '',
        },
      ];
    case 'map_entities':
      return [
        {
          id: isB ? PUBLIC_B_ID : PUBLIC_A_ID,
          slug: `map059-public-${suffix}`,
          entity_type: 'location',
          visibility: 'pin',
          name: `Público MAP059 ${suffix.toUpperCase()}`,
          name_language: 'en',
          summary: '',
          description: '',
          portrait_path: null,
          x: isB ? 2300 : 1000,
          y: isB ? 1300 : 800,
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
  const categoryId = `category-map059-${suffix}`;

  return {
    entities: [
      {
        id: isB ? MASTER_B_ID : MASTER_A_ID,
        slug: `map059-master-${suffix}`,
        entity_type: 'character',
        visibility: 'pin',
        audience: 'master',
        name: isB ? MASTER_B_NAME : MASTER_A_NAME,
        summary: '',
        description: '',
        portrait_path: null,
        x: isB ? 2320 : 1020,
        y: isB ? 1300 : 800,
        category_id: categoryId,
        updated_at: '2026-08-30T10:00:00.000Z',
      },
    ],
    categories: [{ id: categoryId, name: `Categoría MAP059 ${suffix.toUpperCase()}` }],
    aliases: [],
    tags: [],
    entity_tags: [],
    players: [],
    dispositions: [],
    associations: [],
    relations: [],
    relation_entities: [],
  };
}

async function configureBackend(page: Page): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map059_master_public',
      timeoutMs: 2000,
      retryDelaysMs: [0, 0, 0],
    };
    window.__MAP017_AUTH_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map059_master_auth',
      timeoutMs: 2000,
    };
  }, PROJECT_URL);

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await page.route('**/auth/v1/**', async (route: Route) => {
    if (route.request().url().includes('/auth/v1/token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: ACCESS_TOKEN,
          refresh_token: 'map059-master-refresh-token',
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
    const isAdmin = request.headers()['authorization'] === `Bearer ${ACCESS_TOKEN}`;

    if (isAdmin && resource === 'rpc/current_user_is_admin') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      return;
    }

    if (isAdmin && resource === 'rpc/admin_get_master_catalog_v4') {
      const body = JSON.parse(request.postData() ?? '{}') as { p_campaign_id?: unknown };
      const campaignId =
        typeof body.p_campaign_id === 'string' ? body.p_campaign_id : CAMPAIGN_A_ID;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(masterCatalog(campaignId)),
      });
      return;
    }

    if (isAdmin) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Content-Range': '*/0' },
        body: '[]',
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
}

async function signIn(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Administrar' }).click();
  await page.getByLabel('Correo').fill('admin@example.invalid');
  await page.getByLabel('Contraseña').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar acceso administrativo' }).click();
  await expect(page.getByRole('button', { name: 'Administración' })).toBeVisible();
}

async function openAuthorizedMap(page: Page): Promise<void> {
  await configureBackend(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await signIn(page);
}

function clusterTwo(page: Page) {
  return page.locator('[data-proximity-cluster="true"][data-pin-count="2"]');
}

function spiderPin(page: Page, id: string) {
  return page.locator(`[data-spiderfied="true"][data-pin-id="${id}"]`);
}

test('Master OFF never leaks a nearby secret count; ON shows authorized member semantics and ON to OFF purges every trace immediately', async ({
  page,
}) => {
  await openAuthorizedMap(page);
  const toggle = page.locator('[data-master-mode-toggle]');

  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(clusterTwo(page)).toHaveCount(0);
  await expect(page.locator(`[data-pin-id="${PUBLIC_A_ID}"]`)).toBeVisible();
  await expect(page.locator(`[data-entity-id="${MASTER_A_ID}"]`)).toHaveCount(0);
  await expect(page.getByText(MASTER_A_NAME, { exact: true })).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(clusterTwo(page)).toBeVisible();
  await expect(clusterTwo(page)).not.toHaveAttribute('data-audience', 'master');
  await expect(clusterTwo(page)).not.toHaveAttribute('data-audience', 'mixed');
  await expect(clusterTwo(page).locator('.pin-visual--master')).toHaveCount(0);

  await clusterTwo(page).click();
  const publicMember = spiderPin(page, PUBLIC_A_ID);
  const secretMember = spiderPin(page, MASTER_A_ID);
  await expect(publicMember).toHaveAttribute('data-audience', 'public');
  await expect(secretMember).toHaveAttribute('data-audience', 'master');
  await expect(secretMember.locator('.pin-visual')).toHaveClass(/pin-visual--master/);

  await secretMember.click();
  await expect(page.getByTestId('place-details')).toContainText(MASTER_A_NAME);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-spiderfied="true"]')).toHaveCount(0);
  await expect(clusterTwo(page)).toHaveCount(0);
  await expect(page.locator(`[data-entity-id="${MASTER_A_ID}"]`)).toHaveCount(0);
  await expect(page.getByText(MASTER_A_NAME, { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('place-details')).not.toContainText(MASTER_A_NAME);
  await expect(page.locator(`[data-pin-id="${PUBLIC_A_ID}"]`)).toBeVisible();
});

test('campaign A to B destroys the open A spiderfy, rebuilds only B, and keeps the admin session alive', async ({
  page,
}) => {
  await openAuthorizedMap(page);
  const toggle = page.locator('[data-master-mode-toggle]');
  const selector = page.getByLabel('Campaña', { exact: true });

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(clusterTwo(page)).toBeVisible();
  await clusterTwo(page).click();
  await expect(spiderPin(page, MASTER_A_ID)).toBeVisible();
  await expect(spiderPin(page, PUBLIC_A_ID)).toBeVisible();

  await selector.selectOption('campaign-b');
  await expect(selector).toHaveValue('campaign-b');
  await expect(page.locator(`[data-pin-id="${PUBLIC_A_ID}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-pin-id="${MASTER_A_ID}"]`)).toHaveCount(0);
  await expect(page.getByText(MASTER_A_NAME, { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-spiderfied="true"]')).toHaveCount(0);

  await expect(clusterTwo(page)).toBeVisible();
  await clusterTwo(page).click();
  await expect(spiderPin(page, PUBLIC_B_ID)).toBeVisible();
  await expect(spiderPin(page, MASTER_B_ID)).toBeVisible();
  await expect(spiderPin(page, MASTER_A_ID)).toHaveCount(0);
  await expect(spiderPin(page, MASTER_B_ID)).toHaveAttribute('data-audience', 'master');
  await expect(page.getByRole('button', { name: 'Administración' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.sessionStorage.getItem('castigo-divino-map:auth:v1')))
    .not.toBeNull();
});
