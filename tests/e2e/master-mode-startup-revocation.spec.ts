import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map044-startup-race-admin-token';
const REFRESH_TOKEN = 'map044-startup-race-refresh-token';
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const RACE_ENTITY_ID = 'place-demo-pass';
const RACE_ENTITY_NAME = 'Paso de demostración';
const PUBLIC_CONTROL_ENTITY_ID = 'place-demo-harbor';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

interface EntityRow extends Record<string, unknown> {
  id: string;
  slug: string;
  entity_type: 'location';
  visibility: 'pin';
  audience: 'public' | 'master';
  name: string;
  summary: string;
  description: string;
  x: number;
  y: number;
  category_id: string;
  publication_status: 'draft' | 'published';
  published_at: string | null;
  archived_at: null;
  updated_at: string;
}

interface StartupRaceBackend {
  getAudience(): EntityRow['audience'];
  getSaveCount(): number;
  failDelayedPublicInitialization(): void;
}

function rangeResponse(rows: readonly Record<string, unknown>[]): {
  readonly headers: Record<string, string>;
  readonly body: string;
} {
  return {
    headers: {
      'Content-Type': 'application/json',
      'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
    },
    body: JSON.stringify(rows),
  };
}

function detailFor(entity: EntityRow): Record<string, unknown> {
  return {
    record: entity,
    tag_links: [],
    dispositions: [],
    relations_revision: `startup-race-${entity.updated_at}`,
    delete_blockers: {
      aliases: 1,
      tags: 0,
      geographic_names: 0,
      notes: 1,
      location_events: 0,
      requests: 0,
    },
  };
}

async function configureStartupRaceBackend(page: Page): Promise<StartupRaceBackend> {
  let resolvePublicGate: (() => void) | null = null;
  const publicGate = new Promise<void>((resolve) => {
    resolvePublicGate = resolve;
  });
  let saveCount = 0;
  let publicFailureReleased = false;
  const entity: EntityRow = {
    id: RACE_ENTITY_ID,
    slug: 'paso-de-demostracion',
    entity_type: 'location',
    visibility: 'pin',
    audience: 'public',
    name: RACE_ENTITY_NAME,
    summary: '',
    description: '',
    x: 2240,
    y: 1240.25,
    category_id: 'category-landmark',
    publication_status: 'published',
    published_at: '2026-08-07T10:00:00.000Z',
    archived_at: null,
    updated_at: '2026-08-07T10:00:00.000Z',
  };
  const categories = [
    {
      id: 'category-landmark',
      name: 'Lugar destacado',
      publication_status: 'published',
    },
  ];

  await page.addInitScript(
    ({ projectUrl, accessToken, refreshToken, adminId }) => {
      window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
        projectUrl,
        publishableKey: 'sb_publishable_map044_startup_public_key',
        timeoutMs: 10_000,
        retryDelaysMs: [0, 0, 0],
      };
      window.__MAP017_AUTH_TEST_CONFIG__ = {
        projectUrl,
        publishableKey: 'sb_publishable_map044_startup_auth_key',
        timeoutMs: 2_000,
      };
      window.sessionStorage.setItem(
        'castigo-divino-map:auth:v1',
        JSON.stringify({
          version: 1,
          accessToken,
          refreshToken,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          userId: adminId,
          email: 'admin@example.invalid',
        }),
      );
    },
    {
      projectUrl: PROJECT_URL,
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      adminId: ADMIN_ID,
    },
  );

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await page.route('**/auth/v1/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        expires_in: 3600,
        user: { id: ADMIN_ID, email: 'admin@example.invalid' },
      }),
    });
  });

  await page.route('**/rest/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const authorization = request.headers()['authorization'] ?? '';
    const isAdminRequest = authorization === `Bearer ${ACCESS_TOKEN}`;

    if (!isAdminRequest) {
      await publicGate;
      await route.abort('failed');
      return;
    }

    if (url.pathname.endsWith('/rpc/current_user_is_admin')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      return;
    }

    if (url.pathname.endsWith('/rpc/admin_get_map_entity_editor_v2')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detailFor(entity)),
      });
      return;
    }

    if (url.pathname.endsWith('/rpc/admin_save_map_entity_v2')) {
      const body = request.postDataJSON() as Record<string, unknown>;
      entity.audience = body.p_audience === 'master' ? 'master' : 'public';
      entity.publication_status = body.p_publication_status === 'published' ? 'published' : 'draft';
      entity.updated_at = '2026-08-11T10:30:00.000Z';
      saveCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detailFor(entity)),
      });
      return;
    }

    const table = url.pathname.split('/').at(-1) ?? '';
    if (request.method() === 'GET') {
      const rows: Record<string, unknown>[] =
        table === 'map_entities' ? [entity] : table === 'categories' ? categories : [];
      const response = rangeResponse(rows);
      await route.fulfill({ status: 200, headers: response.headers, body: response.body });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  return {
    getAudience: () => entity.audience,
    getSaveCount: () => saveCount,
    failDelayedPublicInitialization(): void {
      if (publicFailureReleased) return;
      publicFailureReleased = true;
      resolvePublicGate?.();
    },
  };
}

test('public to master revocation survives a delayed public bootstrap and stale bundled fallback', async ({
  page,
}) => {
  const backend = await configureStartupRaceBackend(page);
  await page.goto('/');

  const adminEntry = page.getByRole('button', { name: 'Administración' });
  await expect(adminEntry).toBeVisible();
  await adminEntry.click();

  // The public catalog is still blocked, but the restored administrative session is
  // already authorized and its own repository is available.
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
    );
  });

  const editRaceEntity = page.getByRole('button', { name: `Editar ${RACE_ENTITY_NAME}` });
  await expect(editRaceEntity).toBeVisible();
  await editRaceEntity.click();
  await page.getByLabel('Audiencia').selectOption('master');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect.poll(() => backend.getSaveCount()).toBe(1);
  await expect.poll(() => backend.getAudience()).toBe('master');

  // Only now let the public remote load fail. initialize() must fall back to the bundled
  // snapshot, which still contains place-demo-pass as public in this exact branch.
  backend.failDelayedPublicInitialization();

  const publicControlMarker = page.locator(
    `[data-testid="place-marker"][data-place-id="${PUBLIC_CONTROL_ENTITY_ID}"]`,
  );
  await expect(publicControlMarker).toHaveCount(1);
  await expect(
    page.locator(`[data-testid="place-marker"][data-place-id="${RACE_ENTITY_ID}"]`),
  ).toHaveCount(0);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await searchbox.fill(RACE_ENTITY_NAME);
  await expect(page.locator(`[data-search-result-id="${RACE_ENTITY_ID}"]`)).toHaveCount(0);
});
