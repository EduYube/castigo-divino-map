import { expect, test, type Page, type Route } from '@playwright/test';
import type { Request as PlaywrightRequest } from '@playwright/test';

const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map020_e2e_access_token';
const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';

interface RelationRow extends Record<string, unknown> {
  character_id: string;
  location_id: string;
  relation_status: 'present' | 'associated' | 'last-seen';
  publication_status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  archived_at: string | null;
  updated_at: string;
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

async function configureBackend(page: Page): Promise<{
  readonly publicRelationRequests: PlaywrightRequest[];
  relation(): RelationRow | undefined;
}> {
  let counter = 1;
  const publicRelationRequests: PlaywrightRequest[] = [];
  const entities: Record<string, unknown>[] = [
    {
      id: 'entity-aster-guide',
      slug: 'aster-guide',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Aster Guide',
      summary: '',
      description: '',
      x: 800,
      y: 500,
      category_id: 'category-people',
      publication_status: 'published',
      published_at: '2026-08-07T10:00:00.000Z',
      archived_at: null,
      updated_at: '2026-08-07T10:00:00.000Z',
    },
    {
      id: 'entity-bramble-fort',
      slug: 'bramble-fort',
      entity_type: 'location',
      visibility: 'search_only',
      name: 'Bramble Fort',
      summary: '',
      description: '',
      x: 1800,
      y: 1200,
      category_id: 'category-places',
      publication_status: 'published',
      published_at: '2026-08-07T10:00:00.000Z',
      archived_at: null,
      updated_at: '2026-08-07T10:00:00.000Z',
    },
  ];
  const relations: RelationRow[] = [];
  const timestamp = (): string => `2026-08-07T12:00:${String(counter++).padStart(2, '0')}.000Z`;

  await page.addInitScript((projectUrl) => {
    window.__MAP017_AUTH_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map020_e2e_key',
      timeoutMs: 2_000,
    };
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map020_e2e_key',
      timeoutMs: 2_000,
      retryDelaysMs: [],
    };
  }, PROJECT_URL);

  await page.route(OFFICIAL_MAP_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329"></svg>',
    }),
  );

  await page.route('**/auth/v1/**', async (route: Route) => {
    if (new URL(route.request().url()).pathname.endsWith('/logout')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: ACCESS_TOKEN,
        refresh_token: 'map020_refresh_token',
        expires_in: 3600,
        user: { id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.invalid' },
      }),
    });
  });

  await page.route('**/rest/v1/rpc/current_user_is_admin', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'true' }),
  );

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1) ?? '';
    const isAdmin = request.headers()['authorization'] === `Bearer ${ACCESS_TOKEN}`;

    if (url.pathname.endsWith('/rpc/current_user_is_admin')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      return;
    }

    if (!isAdmin) {
      if (table === 'character_location_relations') {
        publicRelationRequests.push(request);
      }
      const rows: Record<string, unknown>[] = [];
      const response = rangeResponse(rows);
      await route.fulfill({ status: 200, headers: response.headers, body: response.body });
      return;
    }

    if (request.method() === 'GET') {
      const rows =
        table === 'map_entities'
          ? entities
          : table === 'character_location_relations'
            ? relations
            : [];
      const response = rangeResponse(rows);
      await route.fulfill({ status: 200, headers: response.headers, body: response.body });
      return;
    }

    if (table === 'character_location_relations' && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (
        relations.some(
          (row) => row.character_id === body.character_id && row.location_id === body.location_id,
        )
      ) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: '23505', message: 'duplicate' }),
        });
        return;
      }
      const updatedAt = timestamp();
      const publicationStatus = body.publication_status as RelationRow['publication_status'];
      const row: RelationRow = {
        character_id: String(body.character_id),
        location_id: String(body.location_id),
        relation_status: body.relation_status as RelationRow['relation_status'],
        publication_status: publicationStatus,
        published_at: publicationStatus === 'published' ? updatedAt : null,
        archived_at: null,
        updated_at: updatedAt,
      };
      relations.push(row);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify([row]),
      });
      return;
    }

    if (table === 'character_location_relations' && request.method() === 'PATCH') {
      const expected = (url.searchParams.get('updated_at') ?? '').replace(/^eq\./, '');
      const row = relations.find(
        (candidate) =>
          candidate.character_id ===
            (url.searchParams.get('character_id') ?? '').replace(/^eq\./, '') &&
          candidate.location_id ===
            (url.searchParams.get('location_id') ?? '').replace(/^eq\./, ''),
      );
      if (!row || row.updated_at !== expected) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return;
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      const updatedAt = timestamp();
      row.relation_status = body.relation_status as RelationRow['relation_status'];
      row.publication_status = body.publication_status as RelationRow['publication_status'];
      row.published_at ??= row.publication_status === 'published' ? updatedAt : null;
      row.archived_at = row.publication_status === 'archived' ? updatedAt : null;
      row.updated_at = updatedAt;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([row]),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  return {
    publicRelationRequests,
    relation: () => relations[0],
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
  await expect(page.getByText(/relaciones administrativas/)).toBeVisible();
}

test('the public runtime fetches only the player-safe relation projection without an admin JWT', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await page.goto('/');
  await expect.poll(() => backend.publicRelationRequests.length).toBeGreaterThan(0);
  const request = backend.publicRelationRequests.at(-1);
  expect(request?.headers()['authorization']).toBeUndefined();
  expect(new URL(request?.url() ?? PROJECT_URL).searchParams.get('select')).toBe(
    'character_id,location_id,relation_status',
  );
});

test('an administrator creates, changes and explicitly retires a relation without duplicates', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await page.goto('/');
  await loginAndConnect(page);

  await page.getByRole('button', { name: 'Crear relación' }).click();
  await page.getByTestId('relation-character').selectOption('entity-aster-guide');
  await page.getByTestId('relation-location').selectOption('entity-bramble-fort');
  await page.getByTestId('relation-status').selectOption('associated');
  await page.getByRole('button', { name: 'Publicar relación' }).click();

  await expect(page.getByText('Bramble Fort — Aster Guide')).toBeVisible();
  await expect(page.getByText('Asociado · published')).toBeVisible();
  expect(backend.relation()?.publication_status).toBe('published');

  await page.getByRole('button', { name: /Editar relación de Aster Guide/ }).click();
  await page.getByTestId('relation-status').selectOption('last-seen');
  await page.getByRole('button', { name: 'Publicar relación' }).click();
  await expect(page.getByText('Visto por última vez · published')).toBeVisible();

  await page.getByRole('button', { name: 'Crear relación' }).click();
  await expect(page.getByTestId('relation-location').locator('option')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar editor' }).click();

  await page.getByRole('button', { name: 'Retirar', exact: true }).click();
  await expect(page.getByText('Visto por última vez · archived')).toBeVisible();
  expect(backend.relation()?.publication_status).toBe('archived');
});

test('the relation editor remains operable on a mobile viewport and with keyboard activation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await configureBackend(page);
  await page.goto('/');
  await loginAndConnect(page);
  const create = page.getByRole('button', { name: 'Crear relación' });
  await create.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Crear relación' })).toBeVisible();
  const box = await page.getByTestId('relation-character').boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(390);
});
