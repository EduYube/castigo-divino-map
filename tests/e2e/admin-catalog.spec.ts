import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map018_e2e_access_token';
const REFRESH_TOKEN = 'map018_e2e_refresh_token';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

interface AdminBackend {
  getRecords(table: string): readonly Row[];
  expireNextMutation(): void;
  failNextMutation(): void;
}

interface Row extends Record<string, unknown> {
  id: string;
  publication_status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  updated_at: string;
}

function withRange(rows: readonly Row[]): {
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

async function configureAdminBackend(page: Page, publicProjection = false): Promise<AdminBackend> {
  let mutationMode: 'normal' | 'expired' | 'network' = 'normal';
  let updatedCounter = 1;
  const categories: Row[] = [
    {
      id: 'category-cities',
      slug: 'cities',
      name: 'Cities',
      description: 'Settlements with city status.',
      publication_status: 'published',
      published_at: '2026-08-07T10:00:00.000Z',
      updated_at: '2026-08-07T10:00:00.000Z',
    },
    {
      id: 'category-villages',
      slug: 'villages',
      name: 'Villages',
      description: '',
      publication_status: 'draft',
      published_at: null,
      updated_at: '2026-08-07T10:00:01.000Z',
    },
  ];
  const rowsByTable: Record<string, Row[]> & {
    categories: Row[];
    tags: Row[];
    map_entities: Row[];
    entity_tags: Row[];
  } = {
    categories,
    tags: [
      {
        id: 'trade-route',
        name: 'Trade route',
        description: '',
        publication_status: 'draft',
        published_at: null,
        updated_at: '2026-08-07T10:00:02.000Z',
      },
    ],
    entity_aliases: [
      {
        id: 'alias-city-of-splendors',
        entity_id: 'place-waterdeep',
        language: 'en',
        value: 'City of Splendors',
        publication_status: 'draft',
        published_at: null,
        updated_at: '2026-08-07T10:00:03.000Z',
      },
    ],
    geographic_names: [
      {
        id: 'geo-waterdeep',
        slug: 'waterdeep',
        name: 'Waterdeep',
        language: 'en',
        x: 1200,
        y: 800,
        recommended_zoom: 2,
        entity_id: 'place-waterdeep',
        publication_status: 'published',
        published_at: '2026-08-07T10:00:04.000Z',
        updated_at: '2026-08-07T10:00:04.000Z',
      },
    ],
    geographic_name_aliases: [
      {
        id: 'geo-alias-city-of-splendors',
        geographic_name_id: 'geo-waterdeep',
        language: 'en',
        value: 'City of Splendors',
        publication_status: 'draft',
        published_at: null,
        updated_at: '2026-08-07T10:00:05.000Z',
      },
    ],
    map_entities: [
      {
        id: 'place-waterdeep',
        slug: 'waterdeep',
        entity_type: 'location',
        lifecycle_status: null,
        visibility: 'pin',
        name: 'Waterdeep',
        name_language: 'en',
        summary: 'MAP-074 public projection fixture',
        description: '',
        portrait_path: null,
        x: 1200,
        y: 800,
        category_id: 'category-cities',
        publication_status: 'published',
        published_at: '2026-08-07T10:00:06.000Z',
        updated_at: '2026-08-07T10:00:06.000Z',
      },
    ],
    entity_tags: [],
  };

  const router = publicProjection ? page.context() : page;
  await router.addInitScript(
    ({ projectUrl, publicProjection }) => {
      if (publicProjection) {
        window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
          projectUrl,
          publishableKey: 'sb_publishable_map074_editorial_key',
          timeoutMs: 2_000,
          retryDelaysMs: [0],
        };
      }
      window.__MAP017_AUTH_TEST_CONFIG__ = {
        projectUrl,
        publishableKey: 'sb_publishable_map018_e2e_key',
        timeoutMs: 2_000,
      };
    },
    { projectUrl: PROJECT_URL, publicProjection },
  );

  await router.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await router.route('**/auth/v1/**', async (route: Route) => {
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

  await router.route('**/rest/v1/rpc/current_user_is_admin', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
  });

  // The public app reads the same mutable tables through its real query contract.
  // In particular, archived records never appear in the projected public rows.
  const publicRows = (table: string): readonly Record<string, unknown>[] => {
    const published = (name: string): Row[] =>
      (rowsByTable[name] ?? []).filter((row) => row.publication_status === 'published');
    if (table === 'campaigns') {
      return [
        {
          id: '00000000-0000-4000-8000-000000000053',
          slug: 'castigo-divino',
          name: 'Castigo Divino',
          status: 'active',
          display_order: 0,
        },
      ];
    }
    if (table === 'players') {
      return [
        {
          id: 'player-map074',
          slug: 'map074',
          display_name: 'MAP074',
          name_language: 'en',
          accent_color: '#475569',
        },
      ];
    }
    if (table === 'map_entities' || table === 'entity_tags') {
      return published(table);
    }
    if (table === 'campaign_geographic_entity_links') {
      return published('geographic_names')
        .filter((row) => row.id === 'geo-map074' && typeof row.entity_id === 'string')
        .map((row) => ({
          campaign_id: '00000000-0000-4000-8000-000000000053',
          geographic_name_id: row.id,
          entity_id: row.entity_id,
        }));
    }
    return published(table);
  };

  // Mirror 009_admin_catalog_crud.test.sql and the published-endpoint invariants.
  // Only an explicit change to the persisted dependency can unblock withdrawal.
  const violatesPublicationInvariant = (
    table: string,
    current: Row | undefined,
    changes: Record<string, unknown>,
  ): boolean => {
    const status = changes.publication_status ?? current?.publication_status;
    const id = current?.id;
    if (current?.publication_status === 'archived' && status === 'published') {
      return true;
    }
    if (current?.publication_status === 'published' && status !== 'published') {
      if (
        table === 'categories' &&
        rowsByTable.map_entities.some(
          (entity) => entity.publication_status === 'published' && entity.category_id === id,
        )
      ) {
        return true;
      }
      if (
        table === 'tags' &&
        rowsByTable.entity_tags.some(
          (relation) => relation.publication_status === 'published' && relation.tag_id === id,
        )
      ) {
        return true;
      }
    }
    if (status === 'published' && table === 'map_entities') {
      const categoryId = changes.category_id ?? current?.category_id;
      if (
        !rowsByTable.categories.some(
          (category) => category.id === categoryId && category.publication_status === 'published',
        )
      ) {
        return true;
      }
    }
    if (status === 'published' && table === 'entity_tags') {
      const entityId = changes.entity_id ?? current?.entity_id;
      const tagId = changes.tag_id ?? current?.tag_id;
      if (
        !rowsByTable.map_entities.some(
          (entity) => entity.id === entityId && entity.publication_status === 'published',
        ) ||
        !rowsByTable.tags.some((tag) => tag.id === tagId && tag.publication_status === 'published')
      ) {
        return true;
      }
    }
    return false;
  };

  const rejectPublicationInvariant = async (route: Route): Promise<void> => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        code: '23514',
        message: 'a published dependency prevents editorial withdrawal',
      }),
    });
  };

  await router.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1) ?? '';
    if (table === 'rpc' || table === 'current_user_is_admin') {
      await route.fallback();
      return;
    }

    if (
      publicProjection &&
      request.method() === 'GET' &&
      request.headers()['authorization'] !== `Bearer ${ACCESS_TOKEN}`
    ) {
      const fields = (url.searchParams.get('select') ?? '').split(',');
      const rows = publicRows(table).map((row) =>
        Object.fromEntries(
          fields.filter((field) => field in row).map((field) => [field, row[field]]),
        ),
      );
      const range = withRange(rows as Row[]);
      await route.fulfill({ status: 200, headers: range.headers, body: range.body });
      return;
    }
    const authorization = request.headers()['authorization'];
    if (authorization !== `Bearer ${ACCESS_TOKEN}`) {
      await route.fallback();
      return;
    }
    const rows = rowsByTable[table];
    if (!rows) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return;
    }

    if (request.method() === 'GET') {
      const range = withRange(rows);
      await route.fulfill({ status: 200, headers: range.headers, body: range.body });
      return;
    }

    if (mutationMode === 'expired') {
      mutationMode = 'normal';
      await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
      return;
    }
    if (mutationMode === 'network') {
      mutationMode = 'normal';
      await route.abort('failed');
      return;
    }

    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (violatesPublicationInvariant(table, undefined, body)) {
        await rejectPublicationInvariant(route);
        return;
      }
      if (body.name === 'Conflict') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            code: '23505',
            message: 'duplicate key value violates secret_internal_constraint',
          }),
        });
        return;
      }
      const created = {
        ...body,
        published_at: body.publication_status === 'published' ? '2026-08-07T11:00:00.000Z' : null,
        updated_at: `2026-08-07T11:00:${String(updatedCounter++).padStart(2, '0')}.000Z`,
      } as Row;
      rows.push(created);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify([created]),
      });
      return;
    }

    const id = (url.searchParams.get('id') ?? '').replace(/^eq\./, '');
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }

    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (violatesPublicationInvariant(table, rows[index], body)) {
        await rejectPublicationInvariant(route);
        return;
      }
      const next = {
        ...rows[index],
        ...body,
        published_at:
          rows[index]?.published_at ??
          (body.publication_status === 'published' ? '2026-08-07T11:00:00.000Z' : null),
        updated_at: `2026-08-07T11:01:${String(updatedCounter++).padStart(2, '0')}.000Z`,
      } as Row;
      rows[index] = next;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([next]),
      });
      return;
    }

    if (request.method() === 'DELETE') {
      const [removed] = rows.splice(index, 1);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: removed?.id }]),
      });
      return;
    }

    await route.fulfill({ status: 405, body: '' });
  });

  return {
    getRecords(table: string): readonly Row[] {
      return rowsByTable[table] ?? [];
    },
    expireNextMutation(): void {
      mutationMode = 'expired';
    },
    failNextMutation(): void {
      mutationMode = 'network';
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
  await expect(page.getByText(/2 de 2 registros/)).toBeVisible();
}

test('anonymous visitor has no CRUD controls and the public map remains available', async ({
  page,
}) => {
  await configureAdminBackend(page);
  await page.goto('/');

  await expect(page.getByTestId('map-shell')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contenido administrativo' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Crear', exact: true })).toBeHidden();
});

test('authorized admin can list, search, sort, create, edit, archive and delete never-published content', async ({
  page,
}) => {
  await configureAdminBackend(page);
  await page.goto('/');
  await loginAndConnect(page);

  await expect(page.getByText('Cities', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill('villages');
  await expect(page.getByText('Villages', { exact: true })).toBeVisible();
  await expect(page.getByText('Cities', { exact: true })).toBeHidden();
  await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill('');
  await page.getByLabel('Ordenar').selectOption('name:desc');

  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await page.getByLabel('ID estable').fill('bad id');
  await expect(page.getByText(/Usa un ID category/)).toBeVisible();
  await page.getByLabel('ID estable').fill('category-hamlets');
  await page.getByRole('textbox', { name: 'Slug', exact: true }).fill('hamlets');
  await page.getByLabel('Nombre', { exact: true }).fill('Hamlets');
  await expect(page.getByText(/Hamlets · category-hamlets · draft/)).toBeVisible();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Hamlets', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Editar Hamlets' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Small Hamlets');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Small Hamlets', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Archivar Small Hamlets' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Si está en uso');
  await page.getByRole('button', { name: 'Archivar', exact: true }).click();
  await expect(page.getByText(/category-hamlets · archived/)).toBeVisible();

  await page.getByRole('button', { name: 'Eliminar definitivamente Small Hamlets' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('nunca publicado');
  await page.getByRole('button', { name: 'Eliminar definitivamente' }).click();
  await expect(page.getByText('Small Hamlets', { exact: true })).toBeHidden();
});

test('names reuse existing concepts and conflicts stay safe for the UI', async ({ page }) => {
  await configureAdminBackend(page);
  await page.goto('/');
  await loginAndConnect(page);

  await page.getByRole('button', { name: 'Nombres alternativos de entidades' }).click();
  await expect(page.getByText('City of Splendors', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar City of Splendors' }).click();
  await expect(page.getByLabel('Entidad propietaria')).toHaveValue('place-waterdeep');
  await expect(page.getByLabel('Idioma')).toHaveValue('English (en)');
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: 'Nombres geográficos', exact: true }).click();
  await expect(page.getByText('Waterdeep', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar Waterdeep' }).click();
  await expect(page.getByLabel('Nombre principal (inglés)')).toHaveValue('Waterdeep');
  await expect(page.getByLabel('Coordenada X')).toHaveValue('1200');
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: 'Categorías' }).click();
  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await page.getByLabel('ID estable').fill('category-conflict');
  await page.getByRole('textbox', { name: 'Slug', exact: true }).fill('conflict');
  await page.getByLabel('Nombre', { exact: true }).fill('Conflict');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('alert')).toContainText('entra en conflicto');
  await expect(page.getByRole('alert')).not.toContainText('secret_internal_constraint');
});

test('network failure and session expiry fail safely without breaking the public map', async ({
  page,
}) => {
  const backend = await configureAdminBackend(page);
  await page.goto('/');
  await loginAndConnect(page);

  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await page.getByLabel('ID estable').fill('category-network');
  await page.getByRole('textbox', { name: 'Slug', exact: true }).fill('network');
  await page.getByLabel('Nombre', { exact: true }).fill('Network');
  backend.failNextMutation();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo contactar');
  await expect(page.getByTestId('map-shell')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: 'Editar Cities' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Cities updated');
  backend.expireNextMutation();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.locator('#admin-auth-status')).toContainText('ha caducado');
  await expect(page.getByTestId('map-shell')).toBeVisible();
});

test('admin CRUD remains keyboard-usable at 320px and never exposes tokens', async ({ page }) => {
  await configureAdminBackend(page);
  await page.setViewportSize({ width: 320, height: 720 });
  const consoleMessages: string[] = [];
  page.on('console', (message) => consoleMessages.push(message.text()));
  await page.goto('/');
  await loginAndConnect(page);

  const create = page.getByRole('button', { name: 'Crear', exact: true });
  await create.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('ID estable')).toBeVisible();
  await expect(page.getByLabel('ID estable')).toBeFocused();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(create).toBeFocused();
  expect(page.url()).not.toContain(ACCESS_TOKEN);
  expect(await page.locator('body').innerText()).not.toContain(ACCESS_TOKEN);
  expect(await page.locator('body').innerText()).not.toContain(REFRESH_TOKEN);
  expect(consoleMessages.join('\n')).not.toContain(ACCESS_TOKEN);
  expect(consoleMessages.join('\n')).not.toContain(REFRESH_TOKEN);
});

test('MAP-074 editorial draft, publish and archive cycles cover all five catalog resources', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await configureAdminBackend(page, true);
  await page.goto('/');
  await loginAndConnect(page);

  const cases = [
    {
      label: 'Categorías',
      table: 'categories',
      id: 'category-map074',
      title: 'MAP074 Category',
      fields: { slug: 'map074-category', name: 'MAP074 Category' },
    },
    {
      label: 'Etiquetas',
      table: 'tags',
      id: 'tag-map074',
      title: 'MAP074 Tag',
      fields: { name: 'MAP074 Tag' },
    },
    {
      label: 'Nombres alternativos de entidades',
      table: 'entity_aliases',
      id: 'alias-map074',
      title: 'MAP074 Alias',
      fields: { value: 'MAP074 Alias', entityId: 'place-waterdeep' },
    },
    {
      label: 'Nombres geográficos',
      table: 'geographic_names',
      id: 'geo-map074',
      title: 'MAP074 Geography',
      fields: {
        slug: 'map074-geography',
        name: 'MAP074 Geography',
        x: '1230',
        y: '890',
        entityId: 'place-waterdeep',
      },
    },
    {
      label: 'Nombres geográficos alternativos',
      table: 'geographic_name_aliases',
      id: 'geo-alias-map074',
      title: 'MAP074 Geo Alias',
      fields: { value: 'MAP074 Geo Alias', geographicNameId: 'geo-waterdeep' },
    },
  ] as const;

  // Exercise the same PostgREST routes and responses used by the admin UI.
  // Dependencies are explicit persisted rows, not derived from a category/tag status.
  const writeDependency = async (
    table: 'map_entities' | 'entity_tags',
    id: string,
    method: 'POST' | 'PATCH',
    changes: Record<string, unknown>,
  ): Promise<void> => {
    const result = await page.evaluate(
      async ({ table, id, method, changes, accessToken }) => {
        const query = method === 'PATCH' ? `?id=eq.${encodeURIComponent(id)}` : '';
        const response = await fetch(`/rest/v1/${table}${query}`, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify(changes),
        });
        return { status: response.status, rows: await response.json() };
      },
      { table, id, method, changes, accessToken: ACCESS_TOKEN },
    );
    expect(result.status, `${method} ${table}/${id}`).toBe(method === 'POST' ? 201 : 200);
    expect(result.rows).toMatchObject([{ id }]);
    await expect
      .poll(() => backend.getRecords(table).find((row) => row.id === id))
      .toMatchObject({
        id,
        ...changes,
      });
  };

  const checkPublic = async (isPublished: boolean): Promise<void> => {
    // A new page forces a fresh public catalog read, rather than trusting admin state.
    const publicPage = await page.context().newPage();
    try {
      await publicPage.goto('/');
      await expect(publicPage.locator('[data-backend-status]')).toHaveAttribute(
        'data-backend-state',
        'connected',
      );
      for (const kind of ['category', 'tag'] as const) {
        const id = kind === 'category' ? 'category-map074' : 'tag-map074';
        await expect(
          publicPage.locator(
            `input[data-place-filter-kind="${kind}"][data-place-filter-id="${id}"]`,
          ),
        ).toHaveCount(isPublished ? 1 : 0);
      }
      const search = publicPage.getByRole('searchbox', { name: 'Buscar lugares' });
      for (const { term, id } of [
        { term: 'MAP074 Alias', id: 'place-waterdeep' },
        { term: 'MAP074 Geography', id: 'geo-map074' },
        { term: 'MAP074 Geo Alias', id: 'geo-waterdeep' },
      ]) {
        await search.fill(term);
        await search.press('Escape');
        await expect(publicPage.locator(`[data-search-suggestion-id="${id}"]`)).toHaveCount(
          isPublished ? 1 : 0,
        );
        await search.fill('');
      }
    } finally {
      await publicPage.close();
    }
  };

  for (const entry of cases) {
    await test.step(`Draft: ${entry.label}`, async () => {
      await page.getByRole('button', { name: entry.label, exact: true }).click();
      await page.getByRole('button', { name: 'Crear', exact: true }).click();
      const stableId = page.getByLabel('ID estable');
      // The editor schedules initial focus in requestAnimationFrame. Wait for
      // that focus before filling or it may steal subsequent typed values.
      await expect(stableId).toBeFocused();
      await stableId.fill(entry.id);
      await expect(stableId).toHaveValue(entry.id);

      for (const [field, value] of Object.entries(entry.fields)) {
        const labels: Record<string, string> = {
          slug: 'Slug',
          name: entry.table === 'geographic_names' ? 'Nombre principal (inglés)' : 'Nombre',
          entityId:
            entry.table === 'geographic_names'
              ? 'Entidad de localización enlazada (opcional)'
              : 'Entidad propietaria',
          geographicNameId: 'Nombre geográfico principal',
          value: 'Nombre alternativo (inglés)',
          x: 'Coordenada X',
          y: 'Coordenada Y',
        };
        const control = page.getByLabel(labels[field]!, { exact: true });
        if (field === 'entityId' || field === 'geographicNameId') {
          await control.selectOption(value);
        } else {
          await control.fill(value);
        }
        await expect(control).toHaveValue(value);
      }

      await expect(stableId).toHaveValue(entry.id);
      await page.getByLabel('Estado editorial').selectOption('draft');
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByText(entry.title, { exact: true })).toBeVisible();
      await expect
        .poll(() => backend.getRecords(entry.table).find((row) => row.id === entry.id))
        .toMatchObject({
          publication_status: 'draft',
          published_at: null,
        });
    });
  }

  await test.step('Insert stable draft category/tag dependencies', async () => {
    await writeDependency('map_entities', 'place-map074-category-projection', 'POST', {
      id: 'place-map074-category-projection',
      slug: 'map074-category-projection',
      entity_type: 'location',
      lifecycle_status: null,
      visibility: 'pin',
      name: 'MAP074 Categorized Place',
      name_language: 'en',
      summary: 'Stable editorial dependency',
      description: '',
      portrait_path: null,
      x: 1320,
      y: 920,
      category_id: 'category-map074',
      publication_status: 'draft',
    });
    await writeDependency('entity_tags', 'entity-tag-map074', 'POST', {
      id: 'entity-tag-map074',
      entity_id: 'place-waterdeep',
      tag_id: 'tag-map074',
      publication_status: 'draft',
    });
  });
  await test.step('Drafts are absent from the public UI', () => checkPublic(false));

  for (const entry of cases) {
    await test.step(`Publish: ${entry.label}`, async () => {
      await page.getByRole('button', { name: entry.label, exact: true }).click();
      await page.getByRole('button', { name: `Editar ${entry.title}` }).click();
      await page.getByLabel('Estado editorial').selectOption('published');
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByRole('button', { name: `Archivar ${entry.title}` })).toBeVisible();
      await expect
        .poll(() => backend.getRecords(entry.table).find((row) => row.id === entry.id))
        .toMatchObject({
          publication_status: 'published',
        });
    });
  }
  await test.step('Publish stable dependencies after their endpoints', async () => {
    await writeDependency('map_entities', 'place-map074-category-projection', 'PATCH', {
      publication_status: 'published',
    });
    await writeDependency('entity_tags', 'entity-tag-map074', 'PATCH', {
      publication_status: 'published',
    });
    expect(backend.getRecords('map_entities')).toContainEqual(
      expect.objectContaining({
        id: 'place-map074-category-projection',
        category_id: 'category-map074',
        publication_status: 'published',
      }),
    );
    expect(backend.getRecords('entity_tags')).toContainEqual(
      expect.objectContaining({
        id: 'entity-tag-map074',
        tag_id: 'tag-map074',
        publication_status: 'published',
      }),
    );
  });
  await test.step('Published resources appear in public filters/search', () => checkPublic(true));

  for (const entry of cases.slice(0, 2)) {
    await test.step(`Reject withdrawal of referenced ${entry.label}`, async () => {
      await page.getByRole('button', { name: entry.label, exact: true }).click();
      await page.getByRole('button', { name: `Archivar ${entry.title}` }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Archivar' }).click();
      await expect(page.locator('.admin-catalog__status[role="status"]')).toContainText(
        'PostgreSQL rechazó la operación',
      );
      await expect(page.getByRole('alertdialog')).toBeVisible();
      expect(backend.getRecords(entry.table).find((row) => row.id === entry.id)).toMatchObject({
        publication_status: 'published',
      });
      await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
    });
  }
  await test.step('Rejected withdrawals preserve the public projection', () => checkPublic(true));

  await test.step('Reassign entity and retire the published tag relation', async () => {
    // A published entity can move to another *published* category, and the
    // association can be archived. Neither dependency is erased by the mock.
    await writeDependency('map_entities', 'place-map074-category-projection', 'PATCH', {
      category_id: 'category-cities',
    });
    await writeDependency('entity_tags', 'entity-tag-map074', 'PATCH', {
      publication_status: 'archived',
    });
    expect(backend.getRecords('map_entities')).toContainEqual(
      expect.objectContaining({
        id: 'place-map074-category-projection',
        category_id: 'category-cities',
        publication_status: 'published',
      }),
    );
    expect(backend.getRecords('entity_tags')).toContainEqual(
      expect.objectContaining({
        id: 'entity-tag-map074',
        tag_id: 'tag-map074',
        publication_status: 'archived',
      }),
    );
  });

  for (const entry of cases) {
    await test.step(`Archive: ${entry.label}`, async () => {
      await page.getByRole('button', { name: entry.label, exact: true }).click();
      await page.getByRole('button', { name: `Archivar ${entry.title}` }).click();
      await expect(page.getByRole('alertdialog')).toContainText('Se archivará');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Archivar' }).click();
      await expect
        .poll(() => backend.getRecords(entry.table).find((row) => row.id === entry.id))
        .toMatchObject({
          publication_status: 'archived',
        });
      await expect(page.getByRole('button', { name: `Archivar ${entry.title}` })).toBeDisabled();
    });
  }
  await test.step('Archived resources disappear from public filters/search', () =>
    checkPublic(false));
});
