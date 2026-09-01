import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map061-status-admin-token';
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const CAMPAIGN_A_ID = '00000000-0000-4000-8000-000000000061';
const CAMPAIGN_B_ID = '00000000-0000-4000-8000-000000000062';
const MASTER_REGION_A_ID = 'entity-map061-status-region-a';
const MASTER_REGION_B_ID = 'entity-map061-status-region-b';
const MASTER_REGION_A_NAME = 'Secreto regional MAP061 A';
const MASTER_REGION_B_NAME = 'Secreto regional MAP061 B';
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
  const categoryId = `category-map061-status-${suffix}`;

  switch (table) {
    case 'categories':
      return [
        {
          id: categoryId,
          slug: `map061-status-${suffix}`,
          name: `Categoría pública MAP061 ${suffix.toUpperCase()}`,
          description: '',
        },
      ];
    case 'map_entities':
      return [
        {
          id: `entity-map061-status-public-${suffix}`,
          slug: `map061-status-public-${suffix}`,
          entity_type: 'location',
          visibility: 'pin',
          name: `Público MAP061 ${suffix.toUpperCase()}`,
          name_language: 'es',
          summary: '',
          description: '',
          portrait_path: null,
          geometry: {
            kind: 'point',
            coordinates: { x: isB ? 2450 : 850, y: isB ? 1450 : 650 },
          },
          x: isB ? 2450 : 850,
          y: isB ? 1450 : 650,
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
  const categoryId = `category-map061-status-${suffix}`;
  const vertices = isB
    ? [
        { x: 2200, y: 1200 },
        { x: 2500, y: 1200 },
        { x: 2500, y: 1500 },
        { x: 2200, y: 1500 },
      ]
    : [
        { x: 700, y: 500 },
        { x: 1100, y: 500 },
        { x: 1100, y: 900 },
        { x: 700, y: 900 },
      ];

  return {
    entities: [
      {
        id: isB ? MASTER_REGION_B_ID : MASTER_REGION_A_ID,
        slug: `map061-status-master-region-${suffix}`,
        entity_type: 'location',
        visibility: 'pin',
        audience: 'master',
        name: isB ? MASTER_REGION_B_NAME : MASTER_REGION_A_NAME,
        summary: '',
        description: '',
        portrait_path: null,
        geometry: { kind: 'polygon', vertices },
        x: isB ? 2350 : 900,
        y: isB ? 1350 : 700,
        category_id: categoryId,
        updated_at: '2026-09-01T05:00:00.000Z',
      },
    ],
    categories: [{ id: categoryId, name: `Categoría MAP061 ${suffix.toUpperCase()}` }],
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
      publishableKey: 'sb_publishable_map061_status_public',
      timeoutMs: 2000,
      retryDelaysMs: [0, 0, 0],
    };
    window.__MAP017_AUTH_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map061_status_auth',
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
          refresh_token: 'map061-status-refresh-token',
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

    if (isAdmin && resource === 'rpc/admin_get_master_catalog_v5') {
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

async function searchMasterRegion(page: Page, name: string): Promise<void> {
  const searchToggle = page.locator('[data-place-search-toggle]');
  if ((await searchToggle.getAttribute('aria-expanded')) === 'false') await searchToggle.click();

  const input = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await input.fill(name);
  await input.press('Escape');
  await page
    .getByRole('list', { name: 'Resultados de búsqueda de lugares' })
    .getByRole('button', { name: new RegExp(name, 'i') })
    .click();

  await expect(page.locator('[data-map-search-status]')).toContainText(name);
}

async function sensitiveAttributeLeaks(page: Page, secret: string): Promise<readonly string[]> {
  return page.evaluate((value) => {
    const leaks: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      for (const attribute of Array.from(element.attributes)) {
        if (!attribute.name.startsWith('aria-') && !attribute.name.startsWith('data-')) continue;
        if (!attribute.value.includes(value)) continue;
        leaks.push(`${element.tagName.toLowerCase()}[${attribute.name}]`);
      }
    }
    return leaks;
  }, secret);
}

async function expectSecretPurged(page: Page, name: string, regionId: string): Promise<void> {
  await expect(page.locator(`[data-region-entity-id="${regionId}"]`)).toHaveCount(0);
  await expect(page.locator('[data-map-canvas]')).not.toHaveAttribute('data-region-focus-bounds');
  await expect(page.locator('[data-map-search-status]')).not.toContainText(name);
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).not.toHaveValue(name);
  await expect(page.locator('body')).not.toContainText(name);
  expect(await sensitiveAttributeLeaks(page, name)).toEqual([]);
}

test('purges Master region search status on OFF and campaign replacement without residual metadata', async ({
  page,
}) => {
  await openAuthorizedMap(page);
  const masterToggle = page.locator('[data-master-mode-toggle]');
  const campaignSelector = page.getByLabel('Campaña', { exact: true });

  await masterToggle.click();
  await expect(masterToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`[data-region-entity-id="${MASTER_REGION_A_ID}"]`)).toBeVisible();

  await searchMasterRegion(page, MASTER_REGION_A_NAME);
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue(
    MASTER_REGION_A_NAME,
  );

  await masterToggle.click();
  await expect(masterToggle).toHaveAttribute('aria-pressed', 'false');
  await expectSecretPurged(page, MASTER_REGION_A_NAME, MASTER_REGION_A_ID);

  await masterToggle.click();
  await expect(masterToggle).toHaveAttribute('aria-pressed', 'true');
  await searchMasterRegion(page, MASTER_REGION_A_NAME);

  await campaignSelector.selectOption('campaign-b');
  await expect(campaignSelector).toHaveValue('campaign-b');
  await expect(page.locator(`[data-region-entity-id="${MASTER_REGION_B_ID}"]`)).toBeVisible();
  await expect(page.locator('[data-region-entity-id]')).not.toHaveAttribute(
    'data-region-entity-id',
    MASTER_REGION_A_ID,
  );
  await expectSecretPurged(page, MASTER_REGION_A_NAME, MASTER_REGION_A_ID);
  await expect(page.locator('body')).toContainText(MASTER_REGION_B_NAME);
});
