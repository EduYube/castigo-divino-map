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

async function configureAdminBackend(page: Page): Promise<AdminBackend> {
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
  const rowsByTable: Record<string, Row[]> = {
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
        name: 'Waterdeep',
        entity_type: 'location',
        publication_status: 'published',
        published_at: '2026-08-07T10:00:06.000Z',
        updated_at: '2026-08-07T10:00:06.000Z',
      },
    ],
  };

  await page.addInitScript((projectUrl) => {
    window.__MAP017_AUTH_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map018_e2e_key',
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
    const table = url.pathname.split('/').at(-1) ?? '';
    if (table === 'rpc' || table === 'current_user_is_admin') {
      await route.fallback();
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
      const next = {
        ...rows[index],
        ...body,
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
  const backend = await configureAdminBackend(page);
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

  for (const entry of cases) {
    await test.step(entry.label, async () => {
      await page.getByRole('button', { name: entry.label, exact: true }).click();
      await page.getByRole('button', { name: 'Crear', exact: true }).click();
      await page.getByLabel('ID estable').fill(entry.id);

      for (const [field, value] of Object.entries(entry.fields)) {
        const labels: Record<string, string> = {
          slug: 'Slug',
          name:
            entry.table === 'geographic_names' ? 'Nombre principal (inglés)' : 'Nombre',
          entityId:
            entry.table === 'geographic_names'
              ? 'Entidad de localización enlazada (opcional)'
              : 'Entidad propietaria',
          geographicNameId: 'Nombre geográfico principal',
          value: 'Nombre alternativo (inglés)',
          x: 'Coordenada X',
          y: 'Coordenada Y',
        };
        const control = page.getByLabel(labels[field]!);
        if (field === 'entityId' || field === 'geographicNameId') {
          await control.selectOption(value);
        } else {
          await control.fill(value);
        }
      }

      await page.getByLabel('Estado editorial').selectOption('draft');
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByText(entry.title, { exact: true })).toBeVisible();
      expect(backend.getRecords(entry.table).find((row) => row.id === entry.id))
        .toMatchObject({ publication_status: 'draft', published_at: null });

      await page.getByRole('button', { name: `Editar ${entry.title}` }).click();
      await page.getByLabel('Estado editorial').selectOption('published');
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByRole('button', { name: `Archivar ${entry.title}` })).toBeVisible();
      expect(backend.getRecords(entry.table).find((row) => row.id === entry.id))
        .toMatchObject({ publication_status: 'published' });

      await page.getByRole('button', { name: `Archivar ${entry.title}` }).click();
      await expect(page.getByRole('alertdialog')).toContainText('Se archivará');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Archivar' }).click();
      expect(backend.getRecords(entry.table).find((row) => row.id === entry.id))
        .toMatchObject({ publication_status: 'archived' });
      await expect(page.getByRole('button', { name: `Archivar ${entry.title}` }))
        .toBeDisabled();
    });
  }
});
