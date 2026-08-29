import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map019_e2e_access_token';
const CAMPAIGN_A_ID = '00000000-0000-4000-8000-000000000053';
const PUBLIC_KEY = 'sb_publishable_map019_e2e_key';
const REFRESH_TOKEN = 'map019_e2e_refresh_token';
const PORTRAIT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

type PublicationStatus = 'draft' | 'published' | 'archived';
type Disposition = 'ally' | 'enemy' | 'neutral';
type Audience = 'public' | 'master';

interface EntityRow extends Record<string, unknown> {
  id: string;
  slug: string;
  entity_type: 'character' | 'location';
  visibility: 'pin' | 'search_only';
  audience: Audience;
  portrait_path: string | null;
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
  getLastAssociationIds(): readonly string[];
  getStoredPortraits(): readonly string[];
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
  let lastAssociationIds: string[] = [];
  const storedPortraits = new Set<string>();

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
    {
      id: 'player-skade',
      display_name: 'Skade',
      publication_status: 'published',
      accent_color: '#c2410c',
    },
    {
      id: 'player-ura',
      display_name: 'Ura',
      publication_status: 'published',
      accent_color: '#1e3a8a',
    },
    {
      id: 'player-veyra',
      display_name: 'Veyra',
      publication_status: 'published',
      accent_color: '#9d174d',
    },
  ];
  const entities: EntityRow[] = [
    {
      id: 'entity-aster-guide',
      slug: 'aster-guide',
      entity_type: 'character',
      visibility: 'pin',
      audience: 'public',
      portrait_path: null,
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
    [
      'entity-aster-guide',
      { 'player-skade': 'ally', 'player-ura': 'neutral', 'player-veyra': 'enemy' },
    ],
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
      associations: [],
      relations_revision: relationRevision(id),
      delete_blockers: {
        aliases: 0,
        tags: tagIds.length,
        geographic_names: 0,
        notes: 0,
        location_events: 0,
        requests: 0,
        player_associations: 0,
      },
    };
  };

  await page.addInitScript(
    ({ projectUrl, publishableKey }) => {
      window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        timeoutMs: 2_000,
        retryDelaysMs: [0, 0, 0],
      };
      window.__MAP017_AUTH_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        timeoutMs: 2_000,
      };
    },
    { projectUrl: PROJECT_URL, publishableKey: PUBLIC_KEY },
  );

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

  await page.route('**/storage/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const authorization = request.headers()['authorization'] ?? '';
    if (request.method() === 'GET' && authorization === `Bearer ${PUBLIC_KEY}`) {
      const encodedPath = url.pathname.split('/character-portraits/')[1] ?? '';
      const path = decodeURIComponent(encodedPath);
      const authorized = entities.some(
        (entity) =>
          entity.entity_type === 'character' &&
          entity.audience === 'public' &&
          entity.publication_status === 'published' &&
          entity.portrait_path === path,
      );
      if (!authorized) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'image/png', body: PORTRAIT_PNG });
      return;
    }
    if (authorization !== `Bearer ${ACCESS_TOKEN}`) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      return;
    }
    if (
      request.method() === 'POST' &&
      url.pathname.startsWith('/storage/v1/object/character-portraits/')
    ) {
      const path = decodeURIComponent(
        url.pathname.slice('/storage/v1/object/character-portraits/'.length),
      );
      storedPortraits.add(path);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ Key: `character-portraits/${path}` }),
      });
      return;
    }
    if (
      request.method() === 'DELETE' &&
      url.pathname === '/storage/v1/object/character-portraits'
    ) {
      const body = request.postDataJSON() as { prefixes?: unknown };
      if (Array.isArray(body.prefixes))
        body.prefixes.map(String).forEach((path) => storedPortraits.delete(path));
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const authorization = request.headers()['authorization'] ?? '';
    if (authorization !== `Bearer ${ACCESS_TOKEN}` && request.method() === 'GET') {
      const table = url.pathname.split('/').at(-1) ?? '';
      const publishedEntities = entities.filter(
        (entity) => entity.publication_status === 'published' && entity.audience === 'public',
      );
      const publicRows: Record<string, unknown>[] =
        table === 'campaigns'
          ? [
              {
                id: CAMPAIGN_A_ID,
                slug: 'castigo-divino',
                name: 'Castigo Divino',
                status: 'active',
                display_order: 0,
              },
            ]
          : table === 'categories'
            ? categories
                .filter(({ publication_status }) => publication_status === 'published')
                .map(({ id, name }) => ({ id, slug: id, name, description: '' }))
            : table === 'tags'
              ? tags
                  .filter(({ publication_status }) => publication_status === 'published')
                  .map(({ id, name }) => ({ id, name, description: '' }))
              : table === 'players'
                ? players
                    .filter(({ publication_status }) => publication_status === 'published')
                    .map(({ id, display_name, accent_color }) => ({
                      id,
                      slug: id,
                      display_name,
                      name_language: 'en',
                      accent_color,
                    }))
                : table === 'map_entities'
                  ? publishedEntities.map((entity) => ({
                      id: entity.id,
                      slug: entity.slug,
                      entity_type: entity.entity_type,
                      visibility: entity.visibility,
                      name: entity.name,
                      name_language: 'en',
                      summary: entity.summary,
                      description: entity.description,
                      portrait_path: entity.portrait_path,
                      x: entity.x,
                      y: entity.y,
                      category_id: entity.category_id,
                    }))
                  : table === 'entity_tags'
                    ? publishedEntities.flatMap((entity) =>
                        (entityTags.get(entity.id) ?? []).map((tagId) => ({
                          entity_id: entity.id,
                          tag_id: tagId,
                        })),
                      )
                    : table === 'entity_player_dispositions'
                      ? publishedEntities.flatMap((entity) =>
                          Object.entries(dispositions.get(entity.id) ?? {}).map(
                            ([playerId, playerDisposition]) => ({
                              entity_id: entity.id,
                              player_id: playerId,
                              disposition: playerDisposition,
                            }),
                          ),
                        )
                      : [];
      const select = (url.searchParams.get('select') ?? '').split(',').filter(Boolean);
      const projected = select.length
        ? publicRows.map((row) => Object.fromEntries(select.map((field) => [field, row[field]])))
        : publicRows;
      const range = rangeResponse(projected);
      await route.fulfill({ status: 200, headers: range.headers, body: range.body });
      return;
    }
    if (authorization !== `Bearer ${ACCESS_TOKEN}`) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      return;
    }

    if (url.pathname.endsWith('/rpc/current_user_is_admin')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      return;
    }

    if (url.pathname.endsWith('/rpc/admin_get_map_entity_editor_v5')) {
      const body = request.postDataJSON() as { p_entity_id?: string };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detailFor(body.p_entity_id ?? '')),
      });
      return;
    }

    if (url.pathname.endsWith('/rpc/admin_save_map_entity_v5')) {
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
        audience: body.p_audience as Audience,
        portrait_path: body.p_portrait_path == null ? null : String(body.p_portrait_path),
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
      lastAssociationIds = Array.isArray(body.p_player_association_ids)
        ? body.p_player_association_ids.map(String)
        : [];
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
    getLastAssociationIds(): readonly string[] {
      return [...lastAssociationIds];
    },
    getStoredPortraits(): readonly string[] {
      return [...storedPortraits];
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
  await expect(page.getByRole('button', { name: 'Administración' })).toBeVisible();
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
  const skade = page.getByTestId('admin-player-disposition-player-skade');
  const ura = page.getByTestId('admin-player-disposition-player-ura');
  const veyra = page.getByTestId('admin-player-disposition-player-veyra');
  await expect(skade).toHaveAttribute('aria-label', 'Skade: Neutral');
  await expect(ura).toHaveAttribute('aria-label', 'Ura: Neutral');
  await expect(veyra).toHaveAttribute('aria-label', 'Veyra: Neutral');

  const skadeAssociation = page.getByTestId('admin-player-association-player-skade');
  const uraAssociation = page.getByTestId('admin-player-association-player-ura');
  await expect(skadeAssociation).toBeVisible();
  await expect(uraAssociation).toBeVisible();
  await expect(page.getByRole('group', { name: 'Relacionado con' })).toBeVisible();
  const skadeAccent = await skadeAssociation.evaluate((checkbox) =>
    checkbox.parentElement
      ?.querySelector<HTMLElement>('.admin-map-entity__association-accent')
      ?.style.getPropertyValue('--player-association-accent'),
  );
  expect(skadeAccent).toBe('#c2410c');
  await skadeAssociation.check();
  await uraAssociation.check();

  await skade.focus();
  await page.keyboard.press('ArrowDown');
  await expect(skade).toHaveValue('enemy');
  await ura.selectOption('ally');
  await expect(skade).toHaveAttribute('aria-label', 'Skade: Enemigo');
  await expect(ura).toHaveAttribute('aria-label', 'Ura: Aliado');
  await expect(veyra).toHaveAttribute('aria-label', 'Veyra: Neutral');

  const map = page.getByTestId('admin-coordinate-map');
  await expect(map).toHaveClass(/leaflet-container/);
  const mapSize = await map.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
  }));
  expect(mapSize.width).toBeGreaterThan(0);
  expect(mapSize.height).toBeGreaterThan(0);
  await map.click({
    position: {
      x: mapSize.width * 0.55,
      y: mapSize.height * 0.45,
    },
  });
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
  expect(backend.getLastAssociationIds()).toEqual(['player-skade', 'player-ura']);

  await page.reload();
  const adminEntry = page.getByRole('button', { name: 'Administración' });
  await expect(adminEntry).toBeVisible();
  await adminEntry.click();
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
    );
  });
  await expect(page.getByText('MAP-019 Character', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar MAP-019 Character' }).click();
  await expect(page.getByLabel('Nombre principal (inglés)')).toHaveValue('MAP-019 Character');
  await expect(page.getByTestId('admin-player-disposition-player-skade')).toHaveValue('enemy');
  await expect(page.getByTestId('admin-player-disposition-player-ura')).toHaveValue('ally');
  await expect(page.getByTestId('admin-player-disposition-player-veyra')).toHaveValue('neutral');

  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText('Entidad publicada correctamente.')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar editor' }).click();
  await page.getByRole('button', { name: 'Cerrar acceso administrativo' }).click();

  const publicMarker = page.locator(
    '.campaign-marker-icon[data-entity-id="entity-map019-character"]',
  );
  await expect(publicMarker).toBeVisible();
  await publicMarker.click();
  const panel = page.getByTestId('place-details');
  await expect(
    panel.getByRole('heading', { level: 4, name: 'Relación con los personajes' }),
  ).toBeVisible();
  await expect(panel.getByRole('listitem', { name: 'Skade: Enemigo' })).toBeVisible();
  await expect(panel.getByRole('listitem', { name: 'Ura: Aliado' })).toBeVisible();
  await expect(panel.getByRole('listitem', { name: 'Veyra: Neutral' })).toBeVisible();

  const fullAction = panel.getByRole('link', {
    name: 'Abrir ficha completa de MAP-019 Character en una pestaña nueva',
  });
  const fullHref = await fullAction.getAttribute('href');
  expect(fullHref).toMatch(/\?entity=map019-character&campaign=castigo-divino$/);
  await page.goto(fullHref ?? '/');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Relación con los personajes' }),
  ).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Skade: Enemigo' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Ura: Aliado' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Veyra: Neutral' })).toBeVisible();
});

for (const width of [320, 390, 430]) {
  test(`MAP-057 relation editor reflows at ${width} px with forced colors`, async ({ page }) => {
    await page.setViewportSize({ width, height: 760 });
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await configureBackend(page);
    await page.goto('/');
    await loginAndConnect(page);
    await page.getByRole('button', { name: 'Editar Aster Guide' }).click();

    const relations = page.getByRole('group', { name: 'Relación con los personajes' });
    await expect(relations).toBeVisible();
    await expect(page.getByTestId('admin-player-disposition-player-skade')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    const selectBox = await page.getByTestId('admin-player-disposition-player-skade').boundingBox();
    expect(selectBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
}

test('MAP-045 edits coordinates and portrait in one character flow without changing identity', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await page.goto('/');
  const publicMarker = page.locator('.campaign-marker-icon[data-entity-id="entity-aster-guide"]');
  await expect(publicMarker).toHaveCount(1);
  await expect(publicMarker).toHaveAttribute('data-marker-lat', '500');
  await expect(publicMarker).toHaveAttribute('data-marker-lng', '800');
  await expect(publicMarker).not.toHaveAttribute('data-portrait-marker', 'true');

  await loginAndConnect(page);
  await page.getByRole('button', { name: 'Editar Aster Guide' }).click();

  const original = backend.getEntity('entity-aster-guide');
  expect(original?.id).toBe('entity-aster-guide');
  expect(original?.slug).toBe('aster-guide');
  expect(original?.portrait_path).toBeNull();

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const input = page.getByTestId('admin-character-portrait-input');
  await input.setInputFiles({ name: 'secret-npc-name.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('El retrato se añadirá al guardar.')).toBeVisible();
  await page.getByLabel('Coordenada X').fill('901');
  await page.getByLabel('Coordenada Y').fill('601');
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText('Entidad publicada correctamente.')).toBeVisible();

  const afterAdd = backend.getEntity('entity-aster-guide');
  expect(afterAdd).toMatchObject({
    id: 'entity-aster-guide',
    slug: 'aster-guide',
    x: 901,
    y: 601,
    publication_status: 'published',
  });
  expect(afterAdd?.portrait_path).toMatch(/^portraits\/[0-9a-f-]{36}\.png$/);
  expect(afterAdd?.portrait_path).not.toContain('secret-npc-name');
  await expect.poll(() => backend.getStoredPortraits().length).toBe(1);
  await expect(publicMarker).toHaveCount(1);
  await expect(publicMarker).toHaveAttribute('data-marker-lat', '601');
  await expect(publicMarker).toHaveAttribute('data-marker-lng', '901');
  await expect(publicMarker).toHaveAttribute('data-portrait-marker', 'true');
  const firstPath = afterAdd?.portrait_path;

  await input.setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('El retrato actual se sustituirá al guardar.')).toBeVisible();
  await page.getByLabel('Coordenada X').fill('902');
  await page.getByLabel('Coordenada Y').fill('602');
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect.poll(() => backend.getSaveCount()).toBe(2);
  await expect.poll(() => backend.getStoredPortraits().length).toBe(1);
  const afterReplace = backend.getEntity('entity-aster-guide');
  expect(afterReplace).toMatchObject({
    id: 'entity-aster-guide',
    slug: 'aster-guide',
    x: 902,
    y: 602,
  });
  expect(afterReplace?.portrait_path).not.toBe(firstPath);
  expect(backend.getStoredPortraits()).not.toContain(firstPath ?? '');
  await expect(publicMarker).toHaveCount(1);
  await expect(publicMarker).toHaveAttribute('data-marker-lat', '602');
  await expect(publicMarker).toHaveAttribute('data-marker-lng', '902');
  await expect(publicMarker).toHaveAttribute('data-portrait-marker', 'true');

  await page.getByTestId('admin-character-portrait-remove').click();
  await expect(page.getByText('El retrato se quitará al guardar.')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect.poll(() => backend.getStoredPortraits().length).toBe(0);
  expect(backend.getEntity('entity-aster-guide')).toMatchObject({
    id: 'entity-aster-guide',
    slug: 'aster-guide',
    portrait_path: null,
    x: 902,
    y: 602,
  });
  await expect(publicMarker).toHaveCount(1);
  await expect(publicMarker).not.toHaveAttribute('data-portrait-marker', 'true');
  await expect(
    publicMarker.locator('.pin-visual--character:not(.pin-visual--portrait)'),
  ).toHaveCount(1);
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
