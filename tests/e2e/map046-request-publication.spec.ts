import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map046_request_access_token';
const REFRESH_TOKEN = 'map046_request_refresh_token';
const PUBLISHABLE_KEY = 'sb_publishable_map046_request_key';
const REQUEST_ID = '46000000-0000-4000-8000-000000000001';
const DRAFT_ID = 'entity-request-46000000000040008000000000000001';
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

interface CategoryRow extends Record<string, unknown> {
  id: string;
  slug: string;
  name: string;
  description: string;
  publication_status: PublicationStatus;
  published_at: string | null;
  updated_at: string;
}

interface TagRow extends Record<string, unknown> {
  id: string;
  name: string;
  description: string;
  publication_status: PublicationStatus;
  published_at: string | null;
  updated_at: string;
}

interface EntityRow extends Record<string, unknown> {
  id: string;
  slug: string;
  entity_type: 'character' | 'location';
  visibility: 'pin' | 'search_only';
  audience: 'public' | 'master';
  portrait_path: string | null;
  name: string;
  summary: string;
  description: string;
  x: number;
  y: number;
  category_id: string | null;
  publication_status: PublicationStatus;
  published_at: string | null;
  archived_at: string | null;
  updated_at: string;
}

interface RequestRow extends Record<string, unknown> {
  id: string;
  sender_name: string;
  proposed_name: string;
  entity_type: 'character';
  x: number;
  y: number;
  description: string;
  reason: string;
  request_status: 'pending' | 'converted';
  moderator_user_id: string | null;
  moderation_note: string | null;
  converted_entity_id: string | null;
  moderated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BackendControl {
  getEntity(): EntityRow | undefined;
  getRequest(): RequestRow;
  getSaveCount(): number;
  getUploadCount(): number;
  getTagIds(): readonly string[];
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
  let counter = 10;
  let saveCount = 0;
  let uploadCount = 0;
  const storedPortraits = new Set<string>();
  const entityTags = new Map<string, string[]>();
  const categories: CategoryRow[] = [];
  const tags: TagRow[] = [];
  const entities: EntityRow[] = [];
  const request: RequestRow = {
    id: REQUEST_ID,
    sender_name: 'MAP-046 Visitor',
    proposed_name: 'MAP-046 Requested Character',
    entity_type: 'character',
    x: 1500,
    y: 1100,
    description: 'A public request promoted through the full editorial flow.',
    reason: 'Regression coverage for MAP-046 and absorbed MAP-047.',
    request_status: 'pending',
    moderator_user_id: null,
    moderation_note: null,
    converted_entity_id: null,
    moderated_at: null,
    created_at: '2026-08-13T07:00:00.000Z',
    updated_at: '2026-08-13T07:00:00.000Z',
  };

  const timestamp = (): string => `2026-08-13T08:00:${String(counter++).padStart(2, '0')}.000Z`;
  const detailFor = (entity: EntityRow): Record<string, unknown> => ({
    record: entity,
    tag_links: (entityTags.get(entity.id) ?? []).map((tagId) => ({
      id: `entity-tag-${entity.id}-${tagId}`,
      tag_id: tagId,
      publication_status: entity.publication_status === 'published' ? 'published' : 'draft',
      published_at: entity.publication_status === 'published' ? entity.published_at : null,
      updated_at: entity.updated_at,
    })),
    dispositions: [],
    relations_revision: `revision-${entity.id}-${(entityTags.get(entity.id) ?? []).join('-')}`,
    delete_blockers: {
      aliases: 0,
      tags: (entityTags.get(entity.id) ?? []).length,
      geographic_names: 0,
      notes: 0,
      location_events: 0,
      requests: 1,
    },
  });

  await page.addInitScript(
    ({ projectUrl, publishableKey }) => {
      window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        timeoutMs: 2_000,
        retryDelaysMs: [0],
      };
      window.__MAP017_AUTH_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        timeoutMs: 2_000,
      };
    },
    { projectUrl: PROJECT_URL, publishableKey: PUBLISHABLE_KEY },
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
          id: '00000000-0000-4000-8000-000000000046',
          email: 'admin-map046@example.invalid',
        },
      }),
    });
  });

  await page.route('**/storage/v1/**', async (route) => {
    const requestInfo = route.request();
    const url = new URL(requestInfo.url());
    const authorization = requestInfo.headers()['authorization'] ?? '';
    if (authorization !== `Bearer ${ACCESS_TOKEN}`) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      return;
    }
    if (
      requestInfo.method() === 'POST' &&
      url.pathname.startsWith('/storage/v1/object/character-portraits/')
    ) {
      const path = decodeURIComponent(
        url.pathname.slice('/storage/v1/object/character-portraits/'.length),
      );
      uploadCount += 1;
      storedPortraits.add(path);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ Key: `character-portraits/${path}` }),
      });
      return;
    }
    if (
      requestInfo.method() === 'DELETE' &&
      url.pathname === '/storage/v1/object/character-portraits'
    ) {
      const body = requestInfo.postDataJSON() as { prefixes?: unknown };
      if (Array.isArray(body.prefixes)) {
        body.prefixes.map(String).forEach((path) => storedPortraits.delete(path));
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/rest/v1/**', async (route) => {
    const requestInfo = route.request();
    const url = new URL(requestInfo.url());
    const authorization = requestInfo.headers()['authorization'] ?? '';
    const table = url.pathname.split('/').at(-1) ?? '';

    if (authorization !== `Bearer ${ACCESS_TOKEN}` && requestInfo.method() === 'GET') {
      const publishedEntities = entities.filter(
        (entity) => entity.publication_status === 'published' && entity.audience === 'public',
      );
      const rows: Record<string, unknown>[] =
        table === 'categories'
          ? categories
              .filter(({ publication_status }) => publication_status === 'published')
              .map(({ id, slug, name, description }) => ({ id, slug, name, description }))
          : table === 'tags'
            ? tags
                .filter(({ publication_status }) => publication_status === 'published')
                .map(({ id, name, description }) => ({ id, name, description }))
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
                : [];
      const select = (url.searchParams.get('select') ?? '').split(',').filter(Boolean);
      const projected = select.length
        ? rows.map((row) => Object.fromEntries(select.map((field) => [field, row[field]])))
        : rows;
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

    if (url.pathname.endsWith('/rpc/admin_moderate_public_request')) {
      const body = requestInfo.postDataJSON() as Record<string, unknown>;
      const moderatedAt = timestamp();
      request.request_status = 'converted';
      request.moderator_user_id = '00000000-0000-4000-8000-000000000046';
      request.moderation_note =
        typeof body.p_moderation_note === 'string' ? body.p_moderation_note.trim() || null : null;
      request.moderated_at = moderatedAt;
      request.updated_at = moderatedAt;
      request.converted_entity_id = DRAFT_ID;
      entities.push({
        id: DRAFT_ID,
        slug: 'request-map046-requested-character',
        entity_type: 'character',
        visibility: 'pin',
        audience: 'public',
        portrait_path: null,
        name: request.proposed_name,
        summary: '',
        description: request.description,
        x: request.x,
        y: request.y,
        category_id: null,
        publication_status: 'draft',
        published_at: null,
        archived_at: null,
        updated_at: moderatedAt,
      });
      entityTags.set(DRAFT_ID, []);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ request, draft_entity_id: DRAFT_ID }),
      });
      return;
    }

    if (url.pathname.endsWith('/rpc/admin_get_map_entity_editor_v3')) {
      const body = requestInfo.postDataJSON() as { p_entity_id?: string };
      const entity = entities.find(({ id }) => id === body.p_entity_id);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(entity ? detailFor(entity) : null),
      });
      return;
    }

    if (url.pathname.endsWith('/rpc/admin_save_map_entity_v3')) {
      const body = requestInfo.postDataJSON() as Record<string, unknown>;
      const entity = entities.find(({ id }) => id === body.p_id);
      if (!entity) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        return;
      }
      const updatedAt = timestamp();
      entity.slug = String(body.p_slug);
      entity.entity_type = body.p_entity_type as EntityRow['entity_type'];
      entity.visibility = body.p_visibility as EntityRow['visibility'];
      entity.audience = body.p_audience as EntityRow['audience'];
      entity.portrait_path = body.p_portrait_path == null ? null : String(body.p_portrait_path);
      entity.name = String(body.p_name);
      entity.summary = String(body.p_summary);
      entity.description = String(body.p_description);
      entity.x = Number(body.p_x);
      entity.y = Number(body.p_y);
      entity.category_id = String(body.p_category_id);
      entity.publication_status = body.p_publication_status as PublicationStatus;
      entity.published_at =
        entity.published_at ?? (entity.publication_status === 'published' ? updatedAt : null);
      entity.archived_at = entity.publication_status === 'archived' ? updatedAt : null;
      entity.updated_at = updatedAt;
      entityTags.set(entity.id, Array.isArray(body.p_tag_ids) ? body.p_tag_ids.map(String) : []);
      saveCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detailFor(entity)),
      });
      return;
    }

    if (requestInfo.method() === 'POST' && (table === 'categories' || table === 'tags')) {
      const body = requestInfo.postDataJSON() as Record<string, unknown>;
      const updatedAt = timestamp();
      const publishedAt = body.publication_status === 'published' ? updatedAt : null;
      if (table === 'categories') {
        const row: CategoryRow = {
          id: String(body.id),
          slug: String(body.slug),
          name: String(body.name),
          description: String(body.description ?? ''),
          publication_status: body.publication_status as PublicationStatus,
          published_at: publishedAt,
          updated_at: updatedAt,
        };
        categories.push(row);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify([row]),
        });
        return;
      }
      const row: TagRow = {
        id: String(body.id),
        name: String(body.name),
        description: String(body.description ?? ''),
        publication_status: body.publication_status as PublicationStatus,
        published_at: publishedAt,
        updated_at: updatedAt,
      };
      tags.push(row);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify([row]),
      });
      return;
    }

    if (requestInfo.method() === 'GET') {
      const rows: Record<string, unknown>[] =
        table === 'categories'
          ? categories
          : table === 'tags'
            ? tags
            : table === 'map_entities'
              ? entities
              : table === 'public_requests'
                ? [request]
                : [];
      const range = rangeResponse(rows);
      await route.fulfill({ status: 200, headers: range.headers, body: range.body });
      return;
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  return {
    getEntity(): EntityRow | undefined {
      return entities.find(({ id }) => id === DRAFT_ID);
    },
    getRequest(): RequestRow {
      return request;
    },
    getSaveCount(): number {
      return saveCount;
    },
    getUploadCount(): number {
      return uploadCount;
    },
    getTagIds(): readonly string[] {
      return [...(entityTags.get(DRAFT_ID) ?? [])];
    },
  };
}

async function login(page: Page): Promise<void> {
  await expect(page.locator('.backend-status')).toHaveAttribute('data-backend-state', 'connected');
  await page.getByRole('button', { name: 'Administrar' }).click();
  await page.getByLabel('Correo').fill('admin-map046@example.invalid');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();
  await expect(page.getByText(/solicitudes administrativas disponibles/)).toBeVisible();
}

async function createPublishedCatalog(
  page: Page,
  includeCharacterNavigation: boolean,
): Promise<void> {
  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Crear registro' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await page.getByRole('button', { name: 'Etiquetas' }).click();
  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Crear registro' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

  if (includeCharacterNavigation) {
    await page.getByRole('button', { name: 'Crear personaje' }).click();
    await expect(page.getByRole('heading', { name: 'Crear character' })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar editor' }).click();
  }

  await page.getByRole('button', { name: 'Categorías' }).click();
  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await page.getByRole('textbox', { name: 'ID estable' }).fill('category-map046');
  await page.getByRole('textbox', { name: 'Slug', exact: true }).fill('category-map046');
  await page.getByLabel('Nombre', { exact: true }).fill('MAP-046 Category');
  await page.getByLabel('Estado editorial').selectOption('published');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('MAP-046 Category', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Etiquetas' }).click();
  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await page.getByRole('textbox', { name: 'ID estable' }).fill('tag-map046');
  await page.getByLabel('Nombre', { exact: true }).fill('MAP-046 Tag');
  await page.getByLabel('Estado editorial').selectOption('published');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('MAP-046 Tag', { exact: true })).toBeVisible();
}

async function convertRequest(page: Page): Promise<void> {
  const card = page.getByRole('heading', { name: 'MAP-046 Requested Character' }).locator('..');
  await card.getByRole('button', { name: 'Convertir en borrador' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Crear borrador' }).click();
  await expect(
    page.getByRole('heading', { name: 'Editar MAP-046 Requested Character' }),
  ).toBeVisible();
  await expect(page.getByLabel('Categoría', { exact: true })).toHaveValue('');
}

for (const withPortrait of [false, true]) {
  test(`request converts, rejects invalid publication and later publishes ${withPortrait ? 'with portrait after repeated navigation' : 'without portrait or entity warm-up'}`, async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    const backend = await configureBackend(page);
    await page.goto('/');
    await login(page);
    await createPublishedCatalog(page, withPortrait);
    await convertRequest(page);

    await page
      .getByLabel('Resumen')
      .fill('The editor must preserve this value after a failed publish.');
    if (withPortrait) {
      await page.getByTestId('admin-character-portrait-input').setInputFiles({
        name: 'map046-portrait.png',
        mimeType: 'image/png',
        buffer: PORTRAIT_PNG,
      });
      await expect(page.getByText('El retrato se añadirá al guardar.')).toBeVisible();
    }

    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText('Selecciona una categoría disponible.')).toBeVisible();
    await expect(
      page.getByText(
        'No se ha publicado. Corrige los campos indicados antes de volver a intentarlo.',
      ),
    ).toBeVisible();
    await expect(page.getByLabel('Categoría', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Resumen')).toHaveValue(
      'The editor must preserve this value after a failed publish.',
    );
    if (withPortrait) {
      await expect(page.getByText('El retrato se añadirá al guardar.')).toBeVisible();
    }
    expect(backend.getSaveCount()).toBe(0);
    expect(backend.getUploadCount()).toBe(0);
    expect(backend.getEntity()).toMatchObject({
      id: DRAFT_ID,
      publication_status: 'draft',
      category_id: null,
      portrait_path: null,
    });

    await page.getByLabel('Categoría', { exact: true }).selectOption('category-map046');
    await page.getByLabel('MAP-046 Tag · published').check();
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText('Entidad publicada correctamente.')).toBeVisible();

    expect(backend.getSaveCount()).toBe(1);
    expect(backend.getUploadCount()).toBe(withPortrait ? 1 : 0);
    expect(backend.getTagIds()).toEqual(['tag-map046']);
    expect(backend.getRequest()).toMatchObject({
      request_status: 'converted',
      converted_entity_id: DRAFT_ID,
    });
    expect(backend.getEntity()).toMatchObject({
      id: DRAFT_ID,
      name: 'MAP-046 Requested Character',
      category_id: 'category-map046',
      publication_status: 'published',
      summary: 'The editor must preserve this value after a failed publish.',
    });
    if (withPortrait) expect(backend.getEntity()?.portrait_path).toMatch(/^portraits\/.+\.png$/);
    else expect(backend.getEntity()?.portrait_path).toBeNull();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}
