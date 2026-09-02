import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map064-master-admin-token';
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const CAMPAIGN_A_ID = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B_ID = '00000000-0000-4000-8000-000000000054';
const MASTER_MISSION_A_ID = 'entity-map064-master-mission-a';
const MASTER_HAZARD_A_ID = 'entity-map064-master-hazard-a';
const MASTER_MISSION_B_ID = 'entity-map064-master-mission-b';
const MASTER_HAZARD_B_ID = 'entity-map064-master-hazard-b';
const MASTER_MISSION_A_NAME = 'Operación Secreta MAP064 A';
const MASTER_HAZARD_A_NAME = 'Amenaza Secreta MAP064 A';
const MASTER_MISSION_B_NAME = 'Operación Secreta MAP064 B';
const MASTER_HAZARD_B_NAME = 'Amenaza Secreta MAP064 B';
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
  const categoryId = `category-map064-${suffix}`;

  switch (table) {
    case 'categories':
      return [
        {
          id: categoryId,
          slug: `map064-${suffix}`,
          name: `Categoría MAP064 ${suffix.toUpperCase()}`,
          description: '',
        },
      ];
    case 'map_entities':
      return [
        {
          id: `entity-map064-public-${suffix}`,
          slug: `map064-public-${suffix}`,
          entity_type: 'location',
          lifecycle_status: null,
          visibility: 'pin',
          name: `Público MAP064 ${suffix.toUpperCase()}`,
          name_language: 'en',
          summary: '',
          description: '',
          portrait_path: null,
          x: isB ? 2800 : 500,
          y: isB ? 1700 : 350,
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
  const categoryId = `category-map064-${suffix}`;

  return {
    entities: [
      {
        id: isB ? MASTER_MISSION_B_ID : MASTER_MISSION_A_ID,
        slug: `map064-master-mission-${suffix}`,
        entity_type: 'mission',
        lifecycle_status: isB ? 'completed' : 'active',
        visibility: 'pin',
        audience: 'master',
        name: isB ? MASTER_MISSION_B_NAME : MASTER_MISSION_A_NAME,
        summary: '',
        description: '',
        portrait_path: null,
        geometry: {
          kind: 'point',
          coordinates: { x: isB ? 2600 : 900, y: isB ? 1450 : 650 },
        },
        x: isB ? 2600 : 900,
        y: isB ? 1450 : 650,
        category_id: categoryId,
        updated_at: '2026-09-02T12:00:00.000Z',
      },
      {
        id: isB ? MASTER_HAZARD_B_ID : MASTER_HAZARD_A_ID,
        slug: `map064-master-hazard-${suffix}`,
        entity_type: 'hazard',
        lifecycle_status: 'resolved',
        visibility: 'pin',
        audience: 'master',
        name: isB ? MASTER_HAZARD_B_NAME : MASTER_HAZARD_A_NAME,
        summary: '',
        description: '',
        portrait_path: null,
        geometry: {
          kind: 'point',
          coordinates: { x: isB ? 3100 : 1500, y: isB ? 1850 : 1050 },
        },
        x: isB ? 3100 : 1500,
        y: isB ? 1850 : 1050,
        category_id: categoryId,
        updated_at: '2026-09-02T12:00:00.000Z',
      },
    ],
    categories: [{ id: categoryId, name: `Categoría MAP064 ${suffix.toUpperCase()}` }],
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
      publishableKey: 'sb_publishable_map064_master_public',
      timeoutMs: 2000,
      retryDelaysMs: [0, 0, 0],
    };
    window.__MAP017_AUTH_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map064_master_auth',
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
          refresh_token: 'map064-master-refresh-token',
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

    if (isAdmin && resource === 'rpc/admin_get_master_catalog_v6') {
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

async function openAuthorizedMap(page: Page): Promise<void> {
  await configureBackend(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');

  await page.getByRole('button', { name: 'Administrar' }).click();
  await page.getByLabel('Correo').fill('admin@example.invalid');
  await page.getByLabel('Contraseña').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar acceso administrativo' }).click();
  await expect(page.getByRole('button', { name: 'Administración' })).toBeVisible();
}

function entityMarker(page: Page, id: string) {
  return page.locator(`[data-entity-id="${id}"]`);
}

test('Master mission and hazard stay unsearchable while OFF, remain campaign-scoped while ON, and purge on OFF', async ({
  page,
}) => {
  await openAuthorizedMap(page);
  const toggle = page.locator('[data-master-mode-toggle]');
  const selector = page.getByLabel('Campaña', { exact: true });
  const search = page.locator('[data-place-search-input]');

  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(entityMarker(page, MASTER_MISSION_A_ID)).toHaveCount(0);
  await expect(entityMarker(page, MASTER_HAZARD_A_ID)).toHaveCount(0);
  await search.fill(MASTER_MISSION_A_NAME);
  await expect(page.locator(`[data-search-result-id="${MASTER_MISSION_A_ID}"]`)).toHaveCount(0);
  await search.fill('');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const missionA = entityMarker(page, MASTER_MISSION_A_ID);
  const hazardA = entityMarker(page, MASTER_HAZARD_A_ID);
  await expect(missionA).toBeVisible();
  await expect(hazardA).toBeVisible();
  await expect(missionA.locator('.pin-visual--mission')).toBeVisible();
  await expect(hazardA.locator('.pin-visual--hazard')).toBeVisible();
  await expect(missionA.locator('.pin-visual--master')).toBeVisible();
  await expect(hazardA.locator('.pin-visual--master')).toBeVisible();
  await expect(missionA).toHaveAttribute('aria-label', /Misión/i);
  await expect(hazardA).toHaveAttribute('aria-label', /Peligro/i);

  await search.fill(MASTER_MISSION_A_NAME);
  await expect(page.locator(`[data-search-result-id="${MASTER_MISSION_A_ID}"]`)).toBeVisible();
  await search.fill('');

  await selector.selectOption('campaign-b');
  await expect(selector).toHaveValue('campaign-b');
  await expect(entityMarker(page, MASTER_MISSION_A_ID)).toHaveCount(0);
  await expect(entityMarker(page, MASTER_HAZARD_A_ID)).toHaveCount(0);
  const missionB = entityMarker(page, MASTER_MISSION_B_ID);
  const hazardB = entityMarker(page, MASTER_HAZARD_B_ID);
  await expect(missionB).toBeVisible();
  await expect(hazardB).toBeVisible();
  await expect(missionB.locator('.pin-visual--mission')).toBeVisible();
  await expect(hazardB.locator('.pin-visual--hazard')).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(missionB).toHaveCount(0);
  await expect(hazardB).toHaveCount(0);
  await expect(page.getByText(MASTER_MISSION_B_NAME, { exact: true })).toHaveCount(0);
  await expect(page.getByText(MASTER_HAZARD_B_NAME, { exact: true })).toHaveCount(0);
});
