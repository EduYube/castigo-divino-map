import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map061-admin-access-token';
const PUBLIC_KEY = 'sb_publishable_map061_admin_key';
const REFRESH_TOKEN = 'map061-admin-refresh-token';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const ENTITY_ID = 'entity-map061-admin-cromryn';
const PLAYER_ID = 'player-map061-admin';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

type Geometry =
  | { readonly kind: 'point'; readonly coordinates: { readonly x: number; readonly y: number } }
  | {
      readonly kind: 'polygon';
      readonly vertices: readonly { readonly x: number; readonly y: number }[];
    };

interface EntityRow extends Record<string, unknown> {
  id: string;
  slug: string;
  entity_type: 'location';
  visibility: 'pin';
  audience: 'public';
  portrait_path: null;
  geometry: Geometry;
  name: string;
  summary: string;
  description: string;
  x: number;
  y: number;
  category_id: string;
  publication_status: 'published';
  published_at: string;
  archived_at: null;
  updated_at: string;
}

interface BackendControl {
  getSaveCount(): number;
  getLastSaveBody(): Record<string, unknown> | null;
  getGeometry(): Geometry;
}

function rangeResponse(rows: readonly Record<string, unknown>[]): {
  readonly headers: Record<string, string>;
  readonly body: string;
} {
  return {
    headers: {
      'Content-Type': 'application/json',
      'Content-Range': rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`,
    },
    body: JSON.stringify(rows),
  };
}

function representative(geometry: Geometry): { readonly x: number; readonly y: number } {
  if (geometry.kind === 'point') return geometry.coordinates;
  const xs = geometry.vertices.map(({ x }) => x);
  const ys = geometry.vertices.map(({ y }) => y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

async function configureBackend(page: Page): Promise<BackendControl> {
  let saveCount = 0;
  let lastSaveBody: Record<string, unknown> | null = null;
  let updateCounter = 1;
  const entity: EntityRow = {
    id: ENTITY_ID,
    slug: 'cromryn-admin-map061',
    entity_type: 'location',
    visibility: 'pin',
    audience: 'public',
    portrait_path: null,
    geometry: { kind: 'point', coordinates: { x: 1000, y: 800 } },
    name: 'Cromryn Admin MAP061',
    summary: 'Existing published location.',
    description: 'Identity and relations must survive geometry changes.',
    x: 1000,
    y: 800,
    category_id: 'category-map061-admin-places',
    publication_status: 'published',
    published_at: '2026-08-30T10:00:00.000Z',
    archived_at: null,
    updated_at: '2026-08-30T10:00:00.000Z',
  };

  const categoryAdmin = {
    id: 'category-map061-admin-places',
    name: 'Lugares MAP061 Admin',
    publication_status: 'published',
  };
  const tagAdmin = {
    id: 'map061-admin-tag',
    name: 'Persistente MAP061',
    publication_status: 'published',
  };
  const playerAdmin = {
    id: PLAYER_ID,
    display_name: 'Skade MAP061',
    publication_status: 'published',
    accent_color: '#c2410c',
    display_order: 0,
  };

  const detail = (): Record<string, unknown> => ({
    record: entity,
    tag_links: [
      {
        id: 'entity-tag-map061-admin',
        tag_id: tagAdmin.id,
        publication_status: 'published',
        published_at: entity.published_at,
        updated_at: entity.updated_at,
      },
    ],
    dispositions: [
      {
        player_id: PLAYER_ID,
        display_name: playerAdmin.display_name,
        disposition: 'ally',
        updated_at: entity.updated_at,
      },
    ],
    associations: [
      {
        player_id: PLAYER_ID,
        display_name: playerAdmin.display_name,
        accent_color: playerAdmin.accent_color,
        publication_status: 'published',
        created_at: '2026-08-29T10:00:00.000Z',
      },
    ],
    relations_revision: `map061-relations-${updateCounter}`,
    delete_blockers: {
      aliases: 1,
      tags: 1,
      geographic_names: 0,
      notes: 1,
      location_events: 0,
      requests: 0,
      player_associations: 1,
    },
  });

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
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await page.route('**/auth/v1/**', async (route: Route) => {
    if (route.request().url().includes('/logout')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
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
        body: JSON.stringify(detail()),
      });
      return;
    }

    if (
      isAdmin &&
      (resource === 'rpc/admin_save_map_entity_v6' || resource === 'rpc/admin_save_map_entity_v3')
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      lastSaveBody = structuredClone(body);
      const geometry = body.p_geometry as Geometry;
      const point = representative(geometry);
      entity.geometry = geometry;
      entity.x = point.x;
      entity.y = point.y;
      entity.updated_at = `2026-08-30T10:00:${String(updateCounter++).padStart(2, '0')}.000Z`;
      saveCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detail()),
      });
      return;
    }

    if (isAdmin && resource === 'players' && url.searchParams.has('publication_status')) {
      const rows = [playerAdmin];
      const range = rangeResponse(rows);
      await route.fulfill({ status: 200, headers: range.headers, body: range.body });
      return;
    }

    if (isAdmin && resource === 'entity_player_associations') {
      const rows = [{ player_id: PLAYER_ID }];
      const range = rangeResponse(rows);
      await route.fulfill({ status: 200, headers: range.headers, body: range.body });
      return;
    }

    if (isAdmin) {
      const rows: Record<string, unknown>[] =
        resource === 'map_entities'
          ? [entity]
          : resource === 'categories'
            ? [categoryAdmin]
            : resource === 'tags'
              ? [tagAdmin]
              : resource === 'players'
                ? [playerAdmin]
                : [];
      const range = rangeResponse(rows);
      await route.fulfill({ status: 200, headers: range.headers, body: range.body });
      return;
    }

    const publicEntity = {
      id: entity.id,
      slug: entity.slug,
      entity_type: entity.entity_type,
      visibility: entity.visibility,
      name: entity.name,
      name_language: 'en',
      summary: entity.summary,
      description: entity.description,
      portrait_path: null,
      geometry: entity.geometry,
      x: entity.x,
      y: entity.y,
      category_id: entity.category_id,
    };
    const publicRows: Record<string, unknown>[] =
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
                id: categoryAdmin.id,
                slug: 'map061-admin-places',
                name: categoryAdmin.name,
                description: '',
              },
            ]
          : resource === 'tags'
            ? [{ id: tagAdmin.id, name: tagAdmin.name, description: '' }]
            : resource === 'players'
              ? [
                  {
                    id: playerAdmin.id,
                    slug: 'map061-admin-player',
                    display_name: playerAdmin.display_name,
                    name_language: 'en',
                    accent_color: playerAdmin.accent_color,
                  },
                ]
              : resource === 'map_entities'
                ? [publicEntity]
                : resource === 'entity_tags'
                  ? [{ entity_id: entity.id, tag_id: tagAdmin.id }]
                  : resource === 'entity_player_dispositions'
                    ? [
                        {
                          entity_id: entity.id,
                          player_id: PLAYER_ID,
                          disposition: 'ally',
                        },
                      ]
                    : resource === 'entity_player_associations'
                      ? [{ entity_id: entity.id, player_id: PLAYER_ID }]
                      : resource === 'public_notes'
                        ? [
                            {
                              id: 'note-map061-admin',
                              slug: 'map061-admin-note',
                              entity_id: entity.id,
                              title: 'Persistent note MAP061',
                              body: 'This note is outside geometry persistence.',
                              sort_order: 0,
                            },
                          ]
                        : [];
    const range = rangeResponse(publicRows);
    await route.fulfill({ status: 200, headers: range.headers, body: range.body });
  });

  return {
    getSaveCount(): number {
      return saveCount;
    },
    getLastSaveBody(): Record<string, unknown> | null {
      return lastSaveBody;
    },
    getGeometry(): Geometry {
      return entity.geometry;
    },
  };
}

async function loginAndConnect(page: Page): Promise<void> {
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
}

async function openExistingEditor(page: Page): Promise<void> {
  await page.getByRole('button', { name: `Editar Cromryn Admin MAP061` }).click();
  await expect(page.getByRole('heading', { name: 'Editar Cromryn Admin MAP061' })).toBeVisible();
  await expect(page.getByTestId('admin-geometry-kind')).toBeEnabled();
}

async function openAdmin(page: Page): Promise<BackendControl> {
  const backend = await configureBackend(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await loginAndConnect(page);
  await openExistingEditor(page);
  return backend;
}

test('point → polygon is local until save, cancel restores persisted point, and polygon → point requires explicit confirmation', async ({
  page,
}) => {
  const backend = await openAdmin(page);
  const kind = page.getByTestId('admin-geometry-kind');

  await expect(kind).toHaveValue('point');
  await kind.selectOption('polygon');
  await expect(kind).toHaveValue('polygon');
  await expect(page.locator('[data-testid^="admin-polygon-vertex-"]')).toHaveCount(4);
  await expect(page.getByLabel('Coordenada X representativa')).toHaveAttribute('readonly', '');
  await expect(page.getByLabel('Coordenada Y representativa')).toHaveAttribute('readonly', '');
  expect(backend.getSaveCount()).toBe(0);
  expect(backend.getGeometry().kind).toBe('point');

  await page.getByRole('button', { name: 'Cerrar editor' }).click();
  await openExistingEditor(page);
  await expect(page.getByTestId('admin-geometry-kind')).toHaveValue('point');
  expect(backend.getSaveCount()).toBe(0);

  await page.getByTestId('admin-geometry-kind').selectOption('polygon');
  await page.getByTestId('admin-geometry-kind').selectOption('point');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('sustituirá el contorno y todos sus vértices');
  await expect(dialog).toContainText('no se persiste hasta Guardar/Publicar');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByTestId('admin-geometry-kind')).toHaveValue('polygon');

  await page.getByTestId('admin-geometry-kind').selectOption('point');
  await dialog.getByRole('button', { name: 'Convertir a punto' }).click();
  await expect(page.getByTestId('admin-geometry-kind')).toHaveValue('point');
  await expect(page.getByText(/Conversión preparada/)).toBeVisible();
  expect(backend.getSaveCount()).toBe(0);
  expect(backend.getGeometry().kind).toBe('point');
});

test('keyboard vertex editing exposes invalid geometry and blocks any partial save', async ({
  page,
}) => {
  const backend = await openAdmin(page);
  await page.getByTestId('admin-geometry-kind').selectOption('polygon');
  const firstVertex = page.getByTestId('admin-polygon-vertex-0');
  await firstVertex.focus();

  for (let index = 0; index < 7; index += 1) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');

  await expect(page.locator('#admin-map-entity-field-geometryKind-error')).toContainText(
    /cannot repeat vertices/i,
  );
  await expect(page.getByTestId('admin-coordinate-map')).toHaveAttribute('aria-invalid', 'true');

  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText(/No se ha publicado.*Corrige los campos/i)).toBeVisible();
  expect(backend.getSaveCount()).toBe(0);
  expect(backend.getGeometry().kind).toBe('point');
});

test('saving a valid polygon preserves stable identity, audience, tags, dispositions and player associations', async ({
  page,
}) => {
  const backend = await openAdmin(page);
  await expect(page.getByTestId(`admin-player-association-${PLAYER_ID}`)).toBeChecked();
  await page.getByTestId('admin-geometry-kind').selectOption('polygon');

  const canvas = page.getByTestId('admin-coordinate-map');
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  if (!canvasBox) throw new Error('El mapa administrativo no tiene un área interactiva.');
  await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await expect(page.locator('[data-testid^="admin-polygon-vertex-"]')).toHaveCount(5);
  const deleteVertex = page.getByTestId('admin-polygon-delete-vertex');
  await expect(deleteVertex).toBeEnabled();
  await deleteVertex.click();
  await expect(page.locator('[data-testid^="admin-polygon-vertex-"]')).toHaveCount(4);

  const firstVertex = page.getByTestId('admin-polygon-vertex-0');
  await firstVertex.focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Previsualizar' }).click();
  await expect(page.getByText(/Área\/Región · 4 vértices/)).toBeVisible();

  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText('Entidad publicada correctamente.')).toBeVisible();
  expect(backend.getSaveCount()).toBe(1);
  expect(backend.getGeometry().kind).toBe('polygon');

  const body = backend.getLastSaveBody();
  expect(body).not.toBeNull();
  expect(body).toMatchObject({
    p_id: ENTITY_ID,
    p_slug: 'cromryn-admin-map061',
    p_entity_type: 'location',
    p_visibility: 'pin',
    p_audience: 'public',
    p_category_id: 'category-map061-admin-places',
    p_publication_status: 'published',
    p_tag_ids: ['map061-admin-tag'],
    p_player_association_ids: [PLAYER_ID],
    p_dispositions: [{ playerId: PLAYER_ID, disposition: 'ally' }],
    p_geometry: { kind: 'polygon' },
  });
  expect((body?.p_geometry as { vertices?: unknown[] }).vertices).toHaveLength(4);

  await page.getByRole('button', { name: 'Cerrar editor' }).click();
  await openExistingEditor(page);
  await expect(page.getByTestId('admin-geometry-kind')).toHaveValue('polygon');
  await expect(page.getByLabel('ID estable')).toHaveValue(ENTITY_ID);
  await expect(page.getByRole('textbox', { name: 'Slug', exact: true })).toHaveValue(
    'cromryn-admin-map061',
  );
  await expect(page.getByTestId(`admin-player-association-${PLAYER_ID}`)).toBeChecked();
});
