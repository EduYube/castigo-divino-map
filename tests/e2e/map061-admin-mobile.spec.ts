import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map061-admin-mobile-token';
const PUBLIC_KEY = 'sb_publishable_map061_admin_mobile';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const ENTITY_ID = 'entity-map061-admin-mobile';

const ENTITY = {
  id: ENTITY_ID,
  slug: 'cromryn-admin-mobile',
  entity_type: 'location',
  visibility: 'pin',
  audience: 'public',
  portrait_path: null,
  geometry: { kind: 'point', coordinates: { x: 1000, y: 800 } },
  name: 'Cromryn Admin Mobile MAP061',
  summary: 'Mobile geometry editor fixture.',
  description: '',
  x: 1000,
  y: 800,
  category_id: 'category-map061-admin-mobile',
  publication_status: 'published',
  published_at: '2026-08-30T10:00:00.000Z',
  archived_at: null,
  updated_at: '2026-08-30T10:00:00.000Z',
};

const CATEGORY = {
  id: 'category-map061-admin-mobile',
  name: 'Lugares MAP061 Mobile',
  publication_status: 'published',
};

function range(rows: readonly Record<string, unknown>[]) {
  return {
    'Content-Type': 'application/json',
    'Content-Range': rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`,
  };
}

async function configureBackend(page: Page): Promise<void> {
  await page.addInitScript(
    ({ projectUrl, publishableKey }) => {
      window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        timeoutMs: 2000,
        retryDelaysMs: [0, 0, 0],
      };
      window.__MAP017_AUTH_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        timeoutMs: 2000,
      };
    },
    { projectUrl: PROJECT_URL, publishableKey: PUBLIC_KEY },
  );

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329"><rect width="3600" height="2329" fill="#ddd"/></svg>',
    });
  });

  await page.route('**/auth/v1/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: ACCESS_TOKEN,
        refresh_token: 'map061-admin-mobile-refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          email: 'admin@example.invalid',
        },
      }),
    });
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

    if (
      isAdmin &&
      (resource === 'rpc/admin_get_map_entity_editor_v6' ||
        resource === 'rpc/admin_get_map_entity_editor_v3')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          record: ENTITY,
          tag_links: [],
          dispositions: [],
          associations: [],
          relations_revision: 'map061-mobile-revision',
          delete_blockers: {
            aliases: 0,
            tags: 0,
            geographic_names: 0,
            notes: 0,
            location_events: 0,
            requests: 0,
            player_associations: 0,
          },
        }),
      });
      return;
    }

    if (isAdmin) {
      const rows: Record<string, unknown>[] =
        resource === 'map_entities' ? [ENTITY] : resource === 'categories' ? [CATEGORY] : [];
      await route.fulfill({ status: 200, headers: range(rows), body: JSON.stringify(rows) });
      return;
    }

    const rows: Record<string, unknown>[] =
      resource === 'campaigns'
        ? [
            {
              id: CAMPAIGN_ID,
              slug: 'castigo-divino',
              name: 'Castigo Divino',
              status: 'active',
              display_order: 0,
            },
          ]
        : resource === 'categories'
          ? [
              {
                id: CATEGORY.id,
                slug: 'map061-admin-mobile',
                name: CATEGORY.name,
                description: '',
              },
            ]
          : resource === 'map_entities'
            ? [
                {
                  id: ENTITY.id,
                  slug: ENTITY.slug,
                  entity_type: ENTITY.entity_type,
                  visibility: ENTITY.visibility,
                  name: ENTITY.name,
                  name_language: 'en',
                  summary: ENTITY.summary,
                  description: ENTITY.description,
                  portrait_path: null,
                  geometry: ENTITY.geometry,
                  x: ENTITY.x,
                  y: ENTITY.y,
                  category_id: ENTITY.category_id,
                },
              ]
            : [];
    await route.fulfill({ status: 200, headers: range(rows), body: JSON.stringify(rows) });
  });
}

async function openEditor(page: Page): Promise<void> {
  await configureBackend(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await page.getByRole('button', { name: 'Administrar' }).click();
  await page.getByLabel('Correo').fill('admin@example.invalid');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Administración' })).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
    );
  });
  await expect(page.getByText(/entidades administrativas/)).toBeVisible();
  await page.getByRole('button', { name: `Editar ${ENTITY.name}` }).click();
  await expect(page.getByTestId('admin-geometry-kind')).toBeEnabled();
}

for (const width of [320, 390, 430]) {
  test(`touch editing remains usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await openEditor(page);

    await page.getByTestId('admin-geometry-kind').selectOption('polygon');
    await expect(page.locator('[data-testid^="admin-polygon-vertex-"]')).toHaveCount(4);
    await expect(page.getByLabel(/Coordenada X(?: representativa)?/)).toHaveAttribute(
      'readonly',
      '',
    );
    await expect(page.getByLabel(/Coordenada Y(?: representativa)?/)).toHaveAttribute(
      'readonly',
      '',
    );

    const canvas = page.getByTestId('admin-coordinate-map');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error('El mapa administrativo no tiene área táctil.');
    await canvas.tap({ position: { x: box.width * 0.72, y: box.height * 0.52 } });
    await expect(page.locator('[data-testid^="admin-polygon-vertex-"]')).toHaveCount(5);

    const deleteVertex = page.getByTestId('admin-polygon-delete-vertex');
    await expect(deleteVertex).toBeEnabled();
    await deleteVertex.tap();
    await expect(page.locator('[data-testid^="admin-polygon-vertex-"]')).toHaveCount(4);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });
}
