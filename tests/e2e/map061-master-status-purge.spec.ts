import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map061-status-admin-token';
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const CAMPAIGN_A_ID = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B_ID = '00000000-0000-4000-8000-000000000054';
const MASTER_REGION_A_ID = 'entity-map061-status-region-a';
const MASTER_REGION_B_ID = 'entity-map061-status-region-b';
const MASTER_REGION_A_NAME = 'Secreto regional MAP061 A';
const MASTER_REGION_B_NAME = 'Secreto regional MAP061 B';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

interface BackendControl {
  denyMasterCatalog(): void;
}

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
          name_language: 'en',
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

async function configureBackend(page: Page): Promise<BackendControl> {
  let denyMasterCatalog = false;

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
      if (denyMasterCatalog) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ code: '42501', message: 'forbidden' }),
        });
        return;
      }
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

  return {
    denyMasterCatalog(): void {
      denyMasterCatalog = true;
    },
  };
}

async function signIn(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Administrar' }).click();
  await page.getByLabel('Correo').fill('admin@example.invalid');
  await page.getByLabel('Contraseña').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  const closeAccess = page.getByRole('button', { name: 'Cerrar acceso administrativo' });
  await expect(closeAccess).toBeVisible();
  await closeAccess.click();
  await expect(page.getByRole('button', { name: 'Administración' })).toBeVisible();
}

async function openAuthorizedMap(page: Page): Promise<BackendControl> {
  const backend = await configureBackend(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await signIn(page);
  return backend;
}

async function searchMasterRegion(page: Page, name: string): Promise<void> {
  const searchToggle = page.locator('[data-place-search-toggle]');
  if ((await searchToggle.getAttribute('aria-expanded')) === 'false') await searchToggle.click();

  const input = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await input.fill(name);
  await input.press('Escape');
  const result = page
    .getByRole('list', { name: 'Resultados de búsqueda de lugares' })
    .getByRole('button', { name: new RegExp(name, 'i') });
  await expect(result).toBeVisible();
  await result.click();

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

async function holdAnimationFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __MAP061_RAF_CONTROL__?: { readonly pending: () => number; readonly release: () => void };
    };
    const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = 1_000_000;

    testWindow.__MAP061_RAF_CONTROL__ = {
      pending: () => pending.size,
      release: () => {
        window.requestAnimationFrame = originalRequestAnimationFrame;
        window.cancelAnimationFrame = originalCancelAnimationFrame;
        const callbacks = [...pending.values()];
        pending.clear();
        callbacks.forEach((callback) => callback(performance.now()));
      },
    };
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const id = nextId;
      nextId += 1;
      pending.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id: number): void => {
      if (!pending.delete(id)) originalCancelAnimationFrame(id);
    };
  });
}

async function heldAnimationFrameCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const testWindow = window as typeof window & {
      __MAP061_RAF_CONTROL__?: { readonly pending: () => number };
    };
    return testWindow.__MAP061_RAF_CONTROL__?.pending() ?? 0;
  });
}

async function releaseAnimationFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __MAP061_RAF_CONTROL__?: { readonly release: () => void };
    };
    testWindow.__MAP061_RAF_CONTROL__?.release();
    delete testWindow.__MAP061_RAF_CONTROL__;
  });
}
test('purges Master region search status on OFF and campaign replacement without residual metadata', async ({
  page,
}) => {
  await openAuthorizedMap(page);
  const masterToggle = page.locator('[data-master-mode-toggle]');
  const campaignSelector = page.getByLabel('Campaña', { exact: true });
  const regionA = page.locator(`[data-region-entity-id="${MASTER_REGION_A_ID}"]`);

  await masterToggle.click();
  await expect(masterToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(regionA).toHaveCount(1);
  await expect(regionA).toHaveAttribute('data-audience', 'master');

  await searchMasterRegion(page, MASTER_REGION_A_NAME);
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue(
    MASTER_REGION_A_NAME,
  );

  await masterToggle.click();
  await expect(masterToggle).toHaveAttribute('aria-pressed', 'false');
  await expectSecretPurged(page, MASTER_REGION_A_NAME, MASTER_REGION_A_ID);

  await masterToggle.click();
  await expect(masterToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(regionA).toHaveCount(1);
  await expect(regionA).toHaveAttribute('data-audience', 'master');
  await searchMasterRegion(page, MASTER_REGION_A_NAME);

  await campaignSelector.selectOption('campaign-b');
  await expect(campaignSelector).toHaveValue('campaign-b');
  const regionB = page.locator(`[data-region-entity-id="${MASTER_REGION_B_ID}"]`);
  await expect(regionB).toHaveCount(1);
  await expect(regionB).toHaveAttribute('data-audience', 'master');
  await expect(regionB).toHaveAttribute('aria-label', new RegExp(MASTER_REGION_B_NAME, 'i'));
  await expectSecretPurged(page, MASTER_REGION_A_NAME, MASTER_REGION_A_ID);
});

test('purges Master region search status when a deferred selection frame runs after OFF', async ({
  page,
}) => {
  await openAuthorizedMap(page);
  const masterToggle = page.locator('[data-master-mode-toggle]');
  const regionA = page.locator(`[data-region-entity-id="${MASTER_REGION_A_ID}"]`);
  const status = page.locator('[data-map-search-status]');

  await masterToggle.click();
  await expect(masterToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(regionA).toHaveCount(1);
  await searchMasterRegion(page, MASTER_REGION_A_NAME);

  await holdAnimationFrames(page);
  await regionA.focus();
  await regionA.press('Enter');
  expect(await heldAnimationFrameCount(page)).toBeGreaterThan(0);

  await masterToggle.click();
  await expect(masterToggle).toHaveAttribute('aria-pressed', 'false');
  await expectSecretPurged(page, MASTER_REGION_A_NAME, MASTER_REGION_A_ID);

  const newerPublicStatus = 'Estado público posterior MAP061.';
  await status.evaluate((element, message) => {
    element.textContent = message;
  }, newerPublicStatus);
  await releaseAnimationFrames(page);

  await expect(status).toHaveText(newerPublicStatus);
  await expect(status).not.toContainText(MASTER_REGION_A_NAME);
  await expectSecretPurged(page, MASTER_REGION_A_NAME, MASTER_REGION_A_ID);
});
test('purges Master region search status after a 403 revokes administrative authorization', async ({
  page,
}) => {
  const backend = await openAuthorizedMap(page);
  const masterToggle = page.locator('[data-master-mode-toggle]');
  const campaignSelector = page.getByLabel('Campaña', { exact: true });
  const regionA = page.locator(`[data-region-entity-id="${MASTER_REGION_A_ID}"]`);

  await masterToggle.click();
  await expect(masterToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(regionA).toHaveCount(1);
  await expect(regionA).toHaveAttribute('data-audience', 'master');
  await searchMasterRegion(page, MASTER_REGION_A_NAME);

  await holdAnimationFrames(page);
  await regionA.focus();
  await regionA.press('Enter');
  expect(await heldAnimationFrameCount(page)).toBeGreaterThan(0);

  backend.denyMasterCatalog();
  await campaignSelector.selectOption('campaign-b');
  await expect(campaignSelector).toHaveValue('campaign-b');
  await expect(masterToggle).toHaveCount(0);
  await releaseAnimationFrames(page);
  await expectSecretPurged(page, MASTER_REGION_A_NAME, MASTER_REGION_A_ID);
  await expect(page.getByRole('button', { name: 'Administrar' })).toBeVisible();
});
