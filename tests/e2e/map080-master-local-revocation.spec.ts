import { createHash } from 'node:crypto';
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
const COLLISION_NAME = 'Nombre compartido MAP219';
const PUBLIC_COLLISION_ID = 'entity-map219-public-collision';
const MASTER_COLLISION_ID = 'entity-map219-master-collision';
const MASTER_COLLISION_SECRET = 'MAP219 PRIVATE ONLY DETAIL';
const MAP_IMAGE_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';

interface MasterBackend {
  readonly started: () => number;
  readonly completed: () => number;
  readonly release: () => void;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

async function configureBackend(page: Page): Promise<MasterBackend> {
  const snapshot = JSON.parse(SNAPSHOT) as {
    campaignCatalogs: Array<{
      campaignId: string;
      categories: Array<{ id: string }>;
      entities: Array<Record<string, unknown>>;
    }>;
    campaigns: Array<{ id: string; slug: string }>;
    checksum: string;
    sourceRevision: string;
  };
  const campaignId = snapshot.campaigns.find(
    (campaign) => campaign.slug === 'un-aliento-menos',
  )?.id;
  const categoryId = snapshot.campaignCatalogs.find(
    (campaign) => campaign.campaignId === campaignId,
  )?.categories[0]?.id;
  if (!categoryId) throw new Error('Missing public category in MAP-080 V4 snapshot.');

  // Real public and Master identities with byte-identical display names. Build
  // a valid in-memory V4 fixture; neither the checked-in snapshot nor its schema changes.
  const publicCatalog = snapshot.campaignCatalogs.find(
    (campaign) => campaign.campaignId === campaignId,
  );
  if (!publicCatalog) throw new Error('Missing public campaign for QA-219.');
  publicCatalog.entities.push({
    id: PUBLIC_COLLISION_ID,
    slug: 'map219-public-collision',
    entityType: 'character',
    visibility: 'pin',
    name: COLLISION_NAME,
    nameLanguage: 'en',
    aliases: [],
    summary: 'Public MAP219 fixture',
    description: '',
    coordinates: { x: 1000, y: 940 },
    categoryId,
    tagIds: [],
  });
  const hashContent: Record<string, unknown> = { ...snapshot };
  delete hashContent.generatedAt;
  delete hashContent.checksum;
  delete hashContent.sourceRevision;
  const hash = createHash('sha256')
    .update(JSON.stringify(canonicalize(hashContent)))
    .digest('hex');
  snapshot.sourceRevision = `sha256:${hash}`;
  snapshot.checksum = `sha256:${hash}`;
  const snapshotJson = JSON.stringify(snapshot);

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
    route.fulfill({ status: 200, contentType: 'application/json', body: snapshotJson }),
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
            {
              id: MASTER_COLLISION_ID,
              slug: 'map219-master-collision',
              entity_type: 'character',
              visibility: 'pin',
              audience: 'master',
              name: COLLISION_NAME,
              summary: MASTER_COLLISION_SECRET,
              description: MASTER_COLLISION_SECRET,
              portrait_path: null,
              geometry: { kind: 'point', coordinates: { x: 1230, y: 940 } },
              x: 1230,
              y: 940,
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

// R2 MAP080-REV-04: a completed private pin selection has already written to
// the live-region DOM before popstate opens a public local map. A controller
// race test alone cannot detect this stale accessible announcement.
test('MAP080-REV-04 purges announced Master content on popstate', async ({ page }) => {
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
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'degraded',
  );
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
    );
  });

  const toggle = page.locator('[data-master-mode-toggle]');
  await expect(toggle).toBeEnabled();
  backend.release();
  await toggle.click();
  const masterPin = page.locator(`.campaign-marker-icon[data-entity-id="${MASTER_ID}"]`);
  await expect(masterPin).toHaveCount(1);
  await masterPin.focus();
  await masterPin.press('Enter');

  const status = page.locator('[data-map-search-status]');
  const privateContentInDom = () =>
    page.evaluate((secret) => document.documentElement.outerHTML.includes(secret), MASTER_NAME);
  await expect(page.getByTestId('place-details')).toContainText(MASTER_NAME);
  await expect(status).toContainText(MASTER_NAME);
  await expect(status).toContainText('Contenido del Máster');

  await page.evaluate(() => {
    history.pushState({}, '', '/?campaign=un-aliento-menos&map=neverwinter');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toBeDisabled();
  await expect(status).not.toContainText(MASTER_NAME);
  await expect.poll(privateContentInDom).toBe(false);

  await page.getByRole('button', { name: 'Mapa general' }).click();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator(`[data-entity-id="${MASTER_ID}"]`)).toHaveCount(0);
  await expect.poll(privateContentInDom).toBe(false);

  // When Master is enabled but a different, public status is the current
  // announcement, entering local view must preserve that public live message.
  await toggle.click();
  await expect(masterPin).toHaveCount(1);
  const publicPin = page.locator(`.campaign-marker-icon[data-entity-id="${PUBLIC_COLLISION_ID}"]`);
  await expect(publicPin).toHaveCount(1);
  await publicPin.focus();
  await publicPin.press('Enter');
  await expect(status).toContainText('Ficha compacta abierta.');
  const publicAnnouncement = await status.textContent();
  expect(publicAnnouncement).toContain(COLLISION_NAME);
  await page.evaluate(() => {
    history.pushState({}, '', '/?campaign=un-aliento-menos&map=neverwinter');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  await expect(status).toHaveText(publicAnnouncement!);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(privateContentInDom).toBe(false);
});

test('QA219 sensitivity: exact-name public announcement survives revoking a different Master ID', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await page.goto('/?campaign=un-aliento-menos');
  await page.getByRole('button', { name: 'Administrar' }).click();
  await page.getByLabel('Correo').fill('admin@example.invalid');
  await page.getByLabel('Contraseña').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar acceso administrativo' }).click();
  await page.evaluate(() => {
    dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
    );
  });
  backend.release();
  const toggle = page.locator('[data-master-mode-toggle]');
  await toggle.click();
  const publicPin = page.locator(`.campaign-marker-icon[data-entity-id="${PUBLIC_COLLISION_ID}"]`);
  const masterPin = page.locator(`.campaign-marker-icon[data-entity-id="${MASTER_COLLISION_ID}"]`);
  await expect(publicPin).toHaveCount(1);
  await expect(masterPin).toHaveCount(1);
  await publicPin.focus();
  await publicPin.press('Enter');
  const status = page.locator('[data-map-search-status]');
  await expect(status).toContainText('Ficha compacta abierta.');
  const actualPublicMessage = await status.textContent();
  expect(actualPublicMessage).toContain(COLLISION_NAME);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(status).toHaveText(actualPublicMessage!);
  await expect(masterPin).toHaveCount(0);
  await expect(page.locator(`[data-search-result-id="${MASTER_COLLISION_ID}"]`)).toHaveCount(0);
  await expect(page.getByTestId('place-details')).not.toContainText(MASTER_COLLISION_SECRET);
  await expect
    .poll(() =>
      page.evaluate(
        ({ id, secret }) =>
          document.documentElement.outerHTML.includes(id) ||
          document.documentElement.outerHTML.includes(secret),
        { id: MASTER_COLLISION_ID, secret: MASTER_COLLISION_SECRET },
      ),
    )
    .toBe(false);
  expect(page.url()).not.toContain(MASTER_COLLISION_ID);
  expect(
    await page.evaluate(
      (id) => Object.values(sessionStorage).join('').includes(id),
      MASTER_COLLISION_ID,
    ),
  ).toBe(false);
});

test('QA219 Master announcement is removed and Master to public replacement stays public', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await page.goto('/?campaign=un-aliento-menos');
  await page.getByRole('button', { name: 'Administrar' }).click();
  await page.getByLabel('Correo').fill('admin@example.invalid');
  await page.getByLabel('Contraseña').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar acceso administrativo' }).click();
  await page.evaluate(() => {
    dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
    );
  });
  backend.release();
  const toggle = page.locator('[data-master-mode-toggle]');
  const status = page.locator('[data-map-search-status]');
  const masterPin = page.locator(`.campaign-marker-icon[data-entity-id="${MASTER_COLLISION_ID}"]`);
  const publicPin = page.locator(`.campaign-marker-icon[data-entity-id="${PUBLIC_COLLISION_ID}"]`);
  await toggle.click();
  await expect(masterPin).toHaveCount(1);
  await masterPin.focus();
  await masterPin.press('Enter');
  await expect(status).toContainText('Contenido del Máster');
  await toggle.click();
  await expect(status).toBeEmpty();
  await expect(masterPin).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        (secret) => document.documentElement.outerHTML.includes(secret),
        MASTER_COLLISION_SECRET,
      ),
    )
    .toBe(false);

  await toggle.click();
  await expect(masterPin).toHaveCount(1);
  await masterPin.focus();
  await masterPin.press('Enter');
  await expect(status).toContainText('Contenido del Máster');
  await publicPin.focus();
  await publicPin.press('Enter');
  await expect(status).toContainText('Ficha compacta abierta.');
  const publicMessage = await status.textContent();
  expect(publicMessage).toContain(COLLISION_NAME);
  expect(publicMessage).not.toContain('Contenido del Máster');
  await toggle.click();
  await expect(status).toHaveText(publicMessage!);
});

test('QA219 pending Master selection RAF cannot revive revoked private announcement', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await page.goto('/?campaign=un-aliento-menos');
  await page.getByRole('button', { name: 'Administrar' }).click();
  await page.getByLabel('Correo').fill('admin@example.invalid');
  await page.getByLabel('Contraseña').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar acceso administrativo' }).click();
  await page.evaluate(() => {
    dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
    );
  });
  backend.release();
  const toggle = page.locator('[data-master-mode-toggle]');
  await toggle.click();
  const masterPin = page.locator(`.campaign-marker-icon[data-entity-id="${MASTER_COLLISION_ID}"]`);
  await expect(masterPin).toHaveCount(1);

  await page.evaluate(() => {
    const nativeRaf = window.requestAnimationFrame.bind(window);
    const queued: FrameRequestCallback[] = [];
    const testWindow = window as Window & { __map219Release?: () => void };
    window.requestAnimationFrame = (callback) => {
      queued.push(callback);
      return queued.length + 1_000_000;
    };
    testWindow.__map219Release = () => {
      window.requestAnimationFrame = nativeRaf;
      queued.forEach((callback) => callback(performance.now()));
    };
  });
  await masterPin.focus();
  await masterPin.press('Enter');
  await toggle.evaluate((button: HTMLElement) => button.click());
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => {
    (window as Window & { __map219Release?: () => void }).__map219Release?.();
  });
  const status = page.locator('[data-map-search-status]');
  await expect(status).not.toContainText('Contenido del Máster');
  await expect
    .poll(() =>
      page.evaluate((id) => document.documentElement.outerHTML.includes(id), MASTER_COLLISION_ID),
    )
    .toBe(false);
});
