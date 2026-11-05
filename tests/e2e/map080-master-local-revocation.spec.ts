import { readFileSync } from 'node:fs';

import { expect, test, type Page, type Route } from '@playwright/test';

const SNAPSHOT = readFileSync(
  new URL('../../public/data/public-catalog.snapshot.json', import.meta.url),
  'utf8',
);
const PROJECT_URL = 'http://127.0.0.1:4173';
const ADMIN_TOKEN = 'map080-local-revoke-admin-token';
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const MASTER_ID = 'entity-map080-master-canary';
const MASTER_NAME = 'MAP080 LOCAL MASTER SECRET';
const MAP_IMAGE_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';

interface MasterBackend {
  readonly started: () => number;
  readonly completed: () => number;
  readonly release: () => void;
}

async function configureBackend(page: Page): Promise<MasterBackend> {
  const snapshot = JSON.parse(SNAPSHOT) as {
    campaignCatalogs: Array<{ campaignId: string; categories: Array<{ id: string }> }>;
    campaigns: Array<{ id: string; slug: string }>;
  };
  const campaignId = snapshot.campaigns.find(
    (campaign) => campaign.slug === 'un-aliento-menos',
  )?.id;
  const categoryId = snapshot.campaignCatalogs.find(
    (campaign) => campaign.campaignId === campaignId,
  )?.categories[0]?.id;
  if (!categoryId) throw new Error('Missing public category in MAP-080 V4 snapshot.');

  let unblock: (() => void) | null = null;
  let started = 0;
  let completed = 0;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });

  await page.addInitScript(
    ({ projectUrl }) => {
      window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
        projectUrl,
        publishableKey: 'sb_publishable_map080_local_public_key',
        timeoutMs: 250,
        retryDelaysMs: [0],
      };
      window.__MAP017_AUTH_TEST_CONFIG__ = {
        projectUrl,
        publishableKey: 'sb_publishable_map080_local_auth_key',
        timeoutMs: 10000,
      };
      // Simulate a transport ignoring abort, to test the controller generation
      // gate independently of fetch cancellation.
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/rest/v1/rpc/admin_get_master_catalog_v7') && init) {
          const withoutSignal = { ...init };
          delete withoutSignal.signal;
          return nativeFetch(input, withoutSignal);
        }
        return nativeFetch(input, init);
      };
    },
    { projectUrl: PROJECT_URL },
  );

  await page.route(MAP_IMAGE_URL, async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329"></svg>',
    }),
  );
  await page.route('**/data/public-catalog.snapshot.json', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: SNAPSHOT }),
  );
  await page.route('**/auth/v1/**', async (route: Route) => {
    if (route.request().url().includes('/auth/v1/token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: ADMIN_TOKEN,
          refresh_token: 'map080-local-refresh-token',
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
    const resource = new URL(request.url()).pathname.split('/rest/v1/')[1] ?? '';
    const authorized = request.headers()['authorization'] === `Bearer ${ADMIN_TOKEN}`;
    if (authorized && resource === 'rpc/current_user_is_admin') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      return;
    }
    if (authorized && resource === 'rpc/admin_get_master_catalog_v7') {
      started += 1;
      await gate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          entities: [
            {
              id: MASTER_ID,
              slug: 'map080-master-canary',
              entity_type: 'character',
              visibility: 'pin',
              audience: 'master',
              name: MASTER_NAME,
              summary: 'PRIVATE MAP080 CANARY',
              description: 'PRIVATE MAP080 CANARY',
              portrait_path: null,
              geometry: { kind: 'point', coordinates: { x: 1100, y: 850 } },
              x: 1100,
              y: 850,
              category_id: categoryId,
              updated_at: '2026-10-30T00:00:00.000Z',
            },
          ],
          categories: [{ id: categoryId, name: 'Public category' }],
          aliases: [],
          tags: [],
          entity_tags: [],
          players: [],
          dispositions: [],
          associations: [],
          relations: [],
          relation_entities: [],
        }),
      });
      completed += 1;
      return;
    }
    if (authorized) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Content-Range': '*/0' },
        body: '[]',
      });
      return;
    }
    // V4 bundled fallback supplies the complete public map while the
    // administrative auth/RPC side remains independently reachable.
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });

  return { started: () => started, completed: () => completed, release: () => unblock?.() };
}

test('MAP080-REV-01 pending Master response cannot reactivate private state after local entry', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await page.goto('/?campaign=un-aliento-menos');
  await expect(page.getByLabel('Campaña', { exact: true })).toHaveValue('un-aliento-menos');

  await page.getByRole('button', { name: 'Administrar' }).click();
  await expect(page.getByRole('dialog', { name: 'Acceso administrativo' })).toBeVisible();
  await page.getByLabel('Correo').fill('admin@example.invalid');
  await page.getByLabel('Contraseña').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar acceso administrativo' }).click();
  // In this fixture the public REST endpoint deliberately fails to exercise
  // the complete V4 fallback. Admin RPCs remain reachable: announce this
  // distinct administrative connectivity explicitly to the test app.
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'degraded',
  );
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
    ),
  );

  const toggle = page.locator('[data-master-mode-toggle]');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => backend.started()).toBe(1);

  // Popstate reproduces the same route restoration as Back/Forward without
  // destroying the current app instance or its pending private request.
  await page.evaluate(() => {
    history.pushState({}, '', '/?campaign=un-aliento-menos&map=neverwinter');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toBeDisabled();

  backend.release();
  await expect.poll(() => backend.completed()).toBe(1);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator(`[data-entity-id="${MASTER_ID}"]`)).toHaveCount(0);

  await page.getByRole('button', { name: 'Mapa general' }).click();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const search = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await search.fill(MASTER_NAME);
  await expect(page.locator(`[data-search-result-id="${MASTER_ID}"]`)).toHaveCount(0);
  await expect(page.getByText(MASTER_NAME, { exact: true })).toHaveCount(0);
});
