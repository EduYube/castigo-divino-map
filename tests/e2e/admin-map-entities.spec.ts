import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map019_e2e_access_token';
const REFRESH_TOKEN = 'map019_e2e_refresh_token';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

type PublicationStatus = 'draft' | 'published' | 'archived';
type Disposition = 'ally' | 'enemy' | 'neutral';

interface EntityRow extends Record<string, unknown> {
  id: string;
  slug: string;
  entity_type: 'character' | 'location';
  visibility: 'pin' | 'search_only';
  name: string;
  summary: string;
  description: string;
  x: number;
  y: number;
  category_id: string;
  publication_status: PublicationStatus;
  published_at: string | null;
  archived_at: string | null;
  updated_at: string;
}

interface BackendControl {
  getEntity(id: string): EntityRow | undefined;
  getSaveCount(): number;
  failNextSave(): void;
  expireNextSave(): void;
  staleNextSave(): void;
  invalidateNextRelation(): void;
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

async function configureBackend(page: Page): Promise<BackendControl> {
  let mode: 'normal' | 'network' | 'expired' | 'stale' | 'invalid-relation' = 'normal';
  let counter = 10;
  let saveCount = 0;

  const categories = [
    { id: 'category-people', name: 'People', publication_status: 'published' },
    { id: 'category-places', name: 'Places', publication_status: 'published' },
    { id: 'category-draft', name: 'Draft category', publication_status: 'draft' },
  ];
  const tags = [
    { id: 'notable', name: 'Notable', publication_status: 'published' },
    { id: 'draft-tag', name: 'Draft tag', publication_status: 'draft' },
  ];
  const players = [
    { id: 'player-demo-one', display_name: 'Demo Player One', publication_status: 'published' },
    { id: 'player-demo-two', display_name: 'Demo Player Two', publication_status: 'published' },
  ];
  const entities: EntityRow[] = [
    {
      id: 'entity-aster-guide',
      slug: 'aster-guide',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Aster Guide',
      summary: 'A fictitious ally.',
      description: '',
      x: 800,
      y: 500,
      category_id: 'category-people',
      publication_status: 'published',
      published_at: '2026-08-07T10:00:00.000Z',
      archived_at: null,
      updated_at: '2026-08-07T10:00:00.000Z',
    },
  ];
  const entityTags = new Map<string, string[]>([['entity-aster-guide', ['notable']]]);
  const dispositions = new Map<string, Record<string, Disposition>>([
    ['entity-aster-guide', { 'player-demo-one': 'ally', 'player-demo-two': 'neutral' }],
  ]);

  const timestamp = (): string => `2026-08-07T12:00:${String(counter++).padStart(2, '0')}.000Z`;
  const relationRevision = (id: string): string =>
    `revision-${id}-${(entityTags.get(id) ?? []).join('-')}-${Object.values(dispositions.get(id) ?? {}).join('-')}`;

  const detailFor = (id: string): Record<string, unknown> | null => {
    const entity = entities.find((candidate) => candidate.id === id);
    if (!entity) return null;
    const tagIds = entityTags.get(id) ?? [];
    const currentDispositions = dispositions.get(id) ?? {};
    return {
      record: entity,
      tag_links: tagIds.map((tagId) => ({
        id: `entity-tag-${id}-${tagId}`,
        tag_id: tagId,
        publication_status: entity.publication_status === 'published' ? 'published' : 'draft',
        published_at: entity.publication_status === 'published' ? entity.published_at : null,
        updated_at: entity.updated_at,
      })),
      dispositions: players.map((player) => ({
        player_id: player.id,
        display_name: player.display_name,
        disposition: currentDispositions[player.id] ?? 'neutral',
        updated_at: entity.updated_at,
      })),
      relations_revision: relationRevision(id),
      delete_blockers: {
        aliases: 0,
        tags: tagIds.length,
        geographic_names: 0,
        notes: 0,
        location_events: 0,
        requests: 0,
      },
    };
  };

  await page.addInitScript((projectUrl) => {
    window.__MAP017_AUTH_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map019_e2e_key',
      timeoutMs: 2_000,
    };
  }, PROJECT_URL);

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await page.route('**/auth/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/logout')) {
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
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          email: 'admin@example.invalid',
        },
      }),
    });
  });

  await page.route('**/rest/v1/rpc/current_user_is_admin', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
  });

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.headers()['authorization'] !== `Bearer ${ACCESS_TOKEN}`) {
      await route.fallback();
      return;
    }

    if (url.pathname.endsWith('/rpc/current_user_is_admin')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      return;
    }

    if (url.pathname.endsWith('/rpc/admin_get_map_entity_editor')) {
      const body = request.postDataJSON() as { p_entity_id?: string };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detailFor(body.p_entity_id ?? '')),
      });
      return;
    }

    if (url.pathname.endsWith('/rpc/admin_save_map_entity')) {
      if (mode === 'network') {
        mode = 'normal';
        await route.abort('failed');
        return;
      }
      if (mode === 'expired') {
        mode = 'normal';
        await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
        return;
      }
      if (mode === 'stale') {
        mode = 'normal';
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            code: '40001',
            message: 'raw stale relation implementation detail',
          }),
        });
        return;
      }
      if (mode === 'invalid-relation') {
        mode = 'normal';
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            code: '23503',
            message: 'raw foreign key implementation detail',
          }),
        });
        return;
      }

      const body = request.postDataJSON() as Record<string, unknown>;
      const id = String(body.p_id);
      const existing = entities.find((candidate) => candidate.id === id);
      if (
        existing &&
        body.p_expected_updated_at !== null &&
        body.p_expected_updated_at !== existing.updated_at
      ) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: '40001', message: 'raw updated_at conflict' }),
        });
        return;
      }

      const nextStatus = body.p_publication_status as PublicationStatus;
      const updatedAt = timestamp();
      const next: EntityRow = {
        id,
        slug: String(body.p_slug),
        entity_type: body.p_entity_type as EntityRow['entity_type'],
        visibility: body.p_visibility as EntityRow['visibility'],
        name: String(body.p_name),
        summary: String(body.p_summary),
        description: String(body.p_description),
        x: Number(body.p_x),
        y: Number(body.p_y),
        category_id: String(body.p_category_id),
        publication_status: nextStatus,
        published_at: existing?.published_at ?? (nextStatus === 'published' ? updatedAt : null),
        archived_at: nextStatus === 'archived' ? updatedAt : null,
        updated_at: updatedAt,
      };
      if (existing) Object.assign(existing, next);
      else entities.push(next);
      entityTags.set(id, Array.isArray(body.p_tag_ids) ? body.p_tag_ids.map(String) : []);
      const nextDispositions: Record<string, Disposition> = {};
      if (Array.isArray(body.p_dispositions)) {
        for (const value of body.p_dispositions) {
          if (typeof value === 'object' && value !== null) {
            const row = value as Record<string, unknown>;
            nextDispositions[String(row.playerId)] = row.disposition as Disposition;
          }
        }
      }
      dispositions.set(id, nextDispositions);
      saveCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detailFor(id)),
      });
      return;
    }

    const table = url.pathname.split('/').at(-1) ?? '';
    if (request.method() === 'GET') {
      const rows: Record<string, unknown>[] =
        table === 'map_entities'
          ? entities
          : table === 'categories'
            ? categories
            : table === 'tags'
              ? tags
              : table === 'players'
                ? players
                : [];
      const range = rangeResponse(rows);
      await route.fulfill({ status: 200, headers: range.headers, body: range.body });
      return;
    }

    if (table === 'map_entities' && request.method() === 'DELETE') {
      const id = (url.searchParams.get('id') ?? '').replace(/^eq\./, '');
      const expectedUpdatedAt = (url.searchParams.get('updated_at') ?? '').replace(/^eq\./, '');
      const index = entities.findIndex(
        (entity) => entity.id === id && entity.updated_at === expectedUpdatedAt,
      );
      if (index < 0) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return;
      }
      const [removed] = entities.splice(index, 1);
      entityTags.delete(id);
      dispositions.delete(id);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: removed?.id }]),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  return {
    getEntity(id): EntityRow | undefined {
      return entities.find((entity) => entity.id === id);
    },
    getSaveCount(): number {
      return saveCount;
    },
    failNextSave(): void {
      mode = 'network';
    },
    expireNextSave(): void {
      mode = 'expired';
    },
    staleNextSave(): void {
      mode = 'stale';
    },
    invalidateNextRelation(): void {
      mode = 'invalid-relation';
    },
  };
}

async function loginAndConnect(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Administrar' }).click();
  await page.getByLabel('Correo').fill('admin@example.invalid');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
    );
  });
  await expect(page.getByText(/entidades administrativas/)).toBeVisible();
}

async function fillIdentity(
  page: Page,
  values: { readonly id: string; readonly slug: string; readonly name: string },
): Promise<void> {
  await page.getByLabel('ID estable').fill(values.id);
  await page.getByRole('textbox', { name: 'Slug', exact: true }).fill(values.slug);
  await page.getByLabel('Nombre principal (inglés)').fill(values.name);
}

test('anonymous visitors never receive administrative entity controls', async ({ page }) => {
  await configureBackend(page);
  await page.goto('/');

  await expect(page.getByTestId('map-shell')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Personajes y emplazamientos' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Crear personaje' })).toBeHidden();
});

test('an administrator can select and drag a CRS.Simple point, preview it, save a draft and reload it', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await page.goto('/');
  await loginAndConnect(page);

  await page.getByRole('button', { name: 'Crear personaje' }).click();
  await fillIdentity(page, {
    id: 'entity-map019-character',
    slug: 'map019-character',
    name: 'MAP-019 Character',
  });
  await page.getByLabel('Categoría', { exact: true }).selectOption('category-people');
  await page.getByLabel(/Notable · published/).check();
  await page.getByLabel('Demo Player One · published').selectOption('ally');

  const map = page.getByTestId('admin-coordinate-map');
  await expect(map).toHaveClass(/leaflet-container/);
  const mapBox = await map.boundingBox();
  expect(mapBox).not.toBeNull();
  await page.mouse.click(
    (mapBox?.x ?? 0) + (mapBox?.width ?? 0) * 0.55,
    (mapBox?.y ?? 0) + (mapBox?.height ?? 0) * 0.45,
  );
  const xInput = page.getByLabel('Coordenada X');
  const yInput = page.getByLabel('Coordenada Y');
  await expect(xInput).not.toHaveValue('');
  await expect(yInput).not.toHaveValue('');
  const xBeforeDrag = Number(await xInput.inputValue());
  const yBeforeDrag = Number(await yInput.inputValue());
  expect(xBeforeDrag).toBeGreaterThanOrEqual(0);
  expect(xBeforeDrag).toBeLessThanOrEqual(3600);
  expect(yBeforeDrag).toBeGreaterThanOrEqual(0);
  expect(yBeforeDrag).toBeLessThanOrEqual(2329);

  const marker = page.getByTestId('admin-coordinate-marker');
  await expect(marker).toBeVisible();
  const markerBox = await marker.boundingBox();
  expect(markerBox).not.toBeNull();
  await page.mouse.move(
    (markerBox?.x ?? 0) + (markerBox?.width ?? 0) / 2,
    (markerBox?.y ?? 0) + (markerBox?.height ?? 0) / 2,
  );
  await page.mouse.down();
  await page.mouse.move((markerBox?.x ?? 0) + 55, (markerBox?.y ?? 0) + 25, { steps: 5 });
  await page.mouse.up();
  await expect(xInput).not.toHaveValue(String(xBeforeDrag));

  await page.getByRole('button', { name: 'Previsualizar' }).click();
  await expect(page.getByRole('heading', { name: 'Previsualización no publicada' })).toBeVisible();
  await expect(page.getByText('MAP-019 Character', { exact: true })).toBeVisible();
  expect(backend.getSaveCount()).toBe(0);

  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Borrador guardado correctamente.')).toBeVisible();
  expect(backend.getEntity('entity-map019-character')?.publication_status).toBe('draft');

  await page.reload();
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
    );
  });
  await expect(page.getByText('MAP-019 Character', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar MAP-019 Character' }).click();
  await expect(page.getByLabel('Nombre principal (inglés)')).toHaveValue('MAP-019 Character');
});

test('keyboard coordinate editing can create, publish and archive an emplacement', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await page.goto('/');
  await loginAndConnect(page);

  await page.getByRole('button', { name: 'Crear emplazamiento' }).click();
  await fillIdentity(page, {
    id: 'place-map019-harbor',
    slug: 'map019-harbor',
    name: 'MAP-019 Harbor',
  });
  await page.getByLabel('Categoría', { exact: true }).selectOption('category-places');
  await page.getByLabel('Visibilidad cartográfica').selectOption('search_only');
  await page.getByLabel('Coordenada X').fill('1200');
  await page.getByLabel('Coordenada Y').fill('900');
  await page.getByRole('button', { name: 'Previsualizar' }).click();
  await expect(page.getByText(/location · Places · X 1200, Y 900/)).toBeVisible();

  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText('Entidad publicada correctamente.')).toBeVisible();
  expect(backend.getEntity('place-map019-harbor')?.publication_status).toBe('published');

  await page.getByRole('button', { name: 'Cerrar editor' }).click();
  await page.getByRole('button', { name: 'Archivar MAP-019 Harbor' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('dejará de formar parte');
  await page.getByRole('button', { name: 'Archivar', exact: true }).click();
  await expect(page.getByText(/place-map019-harbor · location · archived/)).toBeVisible();
  expect(backend.getEntity('place-map019-harbor')?.publication_status).toBe('archived');
});

test('stale relations, invalid relations and network failures stay explicit without leaking backend details', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await page.goto('/');
  await loginAndConnect(page);
  await page.getByRole('button', { name: 'Editar Aster Guide' }).click();

  backend.staleNextSave();
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('alert')).toContainText('cambiaron mientras editabas');
  await expect(page.getByRole('alert')).not.toContainText('raw stale');

  backend.invalidateNextRelation();
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('alert')).toContainText('ya no es válida');
  await expect(page.getByRole('alert')).not.toContainText('raw foreign key');

  backend.failNextSave();
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo contactar');
  await expect(page.getByTestId('map-shell')).toBeVisible();
});

test('an expired session closes entity administration safely', async ({ page }) => {
  const backend = await configureBackend(page);
  await page.goto('/');
  await loginAndConnect(page);
  await page.getByRole('button', { name: 'Editar Aster Guide' }).click();

  backend.expireNextSave();
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('heading', { name: 'Personajes y emplazamientos' })).toBeHidden();
  await expect(page.getByTestId('map-shell')).toBeVisible();
});

test('physical deletion requires confirmation, restores focus on Escape and remains responsive at 320px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const backend = await configureBackend(page);
  await page.goto('/');
  await loginAndConnect(page);

  await page.getByRole('button', { name: 'Crear emplazamiento' }).click();
  await fillIdentity(page, {
    id: 'place-map019-disposable',
    slug: 'map019-disposable',
    name: 'Disposable Place',
  });
  await page.getByLabel('Categoría', { exact: true }).selectOption('category-places');
  await page.getByLabel('Coordenada X').fill('300');
  await page.getByLabel('Coordenada Y').fill('300');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('button', { name: 'Eliminar definitivamente' })).toBeVisible();

  const deleteButton = page.getByRole('button', { name: 'Eliminar definitivamente' });
  await deleteButton.click();
  await expect(page.getByRole('alertdialog')).toContainText('nunca publicado');
  await page.keyboard.press('Escape');
  await expect(deleteButton).toBeFocused();

  await deleteButton.click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Eliminar definitivamente' })
    .click();
  await expect(page.getByText('Disposable Place', { exact: true })).toBeHidden();
  expect(backend.getEntity('place-map019-disposable')).toBeUndefined();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});