import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map027_e2e_access_token';
const REFRESH_TOKEN = 'map027_e2e_refresh_token';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

type RequestStatus = 'pending' | 'accepted' | 'rejected' | 'converted' | 'archived';

interface RequestRow extends Record<string, unknown> {
  id: string;
  sender_name: string;
  proposed_name: string;
  entity_type: 'character' | 'location';
  x: number;
  y: number;
  description: string;
  reason: string;
  request_status: RequestStatus;
  moderator_user_id: string | null;
  moderation_note: string | null;
  converted_entity_id: string | null;
  moderated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface EntityRow extends Record<string, unknown> {
  id: string;
  slug: string;
  entity_type: 'character' | 'location';
  visibility: 'pin' | 'search_only';
  audience: 'public' | 'master';
  name: string;
  summary: string;
  description: string;
  x: number;
  y: number;
  category_id: string | null;
  publication_status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  archived_at: string | null;
  updated_at: string;
}

interface BackendControl {
  getRequest(id: string): RequestRow | undefined;
  getEntity(id: string): EntityRow | undefined;
  getModerationCount(): number;
  failNextModeration(): void;
  expireNextModeration(): void;
  staleNextModeration(): void;
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
  let mode: 'normal' | 'network' | 'expired' | 'stale' = 'normal';
  let moderationCount = 0;
  let timestampCounter = 10;
  const requests: RequestRow[] = [
    {
      id: '10000000-0000-4000-8000-000000000271',
      sender_name: 'Older Visitor',
      proposed_name: 'Older Requested Place',
      entity_type: 'location',
      x: 1200,
      y: 900,
      description: 'An older public request.',
      reason: 'Add this place to the atlas.',
      request_status: 'pending',
      moderator_user_id: null,
      moderation_note: null,
      converted_entity_id: null,
      moderated_at: null,
      created_at: '2026-08-08T09:00:00.000Z',
      updated_at: '2026-08-08T09:00:00.000Z',
    },
    {
      id: '10000000-0000-4000-8000-000000000272',
      sender_name: 'Newer Visitor',
      proposed_name: 'Newer Requested Character',
      entity_type: 'character',
      x: 1500,
      y: 1100,
      description: 'A newer public request.',
      reason: 'Add this character to the atlas.',
      request_status: 'pending',
      moderator_user_id: null,
      moderation_note: null,
      converted_entity_id: null,
      moderated_at: null,
      created_at: '2026-08-08T10:00:00.000Z',
      updated_at: '2026-08-08T10:00:00.000Z',
    },
    {
      id: '10000000-0000-4000-8000-000000000273',
      sender_name: 'Reviewed Visitor',
      proposed_name: 'Already Rejected',
      entity_type: 'location',
      x: 100,
      y: 100,
      description: 'Already reviewed.',
      reason: 'Historical audit row.',
      request_status: 'rejected',
      moderator_user_id: '00000000-0000-4000-8000-000000000001',
      moderation_note: 'Historical rejection.',
      converted_entity_id: null,
      moderated_at: '2026-08-08T08:30:00.000Z',
      created_at: '2026-08-08T08:00:00.000Z',
      updated_at: '2026-08-08T08:30:00.000Z',
    },
  ];
  const entities: EntityRow[] = [];
  const timestamp = (): string =>
    `2026-08-08T12:00:${String(timestampCounter++).padStart(2, '0')}.000Z`;

  await page.addInitScript((projectUrl) => {
    window.__MAP017_AUTH_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map027_e2e_key',
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

    if (url.pathname.endsWith('/rpc/admin_moderate_public_request_v2')) {
      moderationCount += 1;
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
          body: JSON.stringify({ code: '40001', message: 'raw request transition detail' }),
        });
        return;
      }

      const body = request.postDataJSON() as Record<string, unknown>;
      const requestRow = requests.find((candidate) => candidate.id === body.p_request_id);
      if (
        !requestRow ||
        requestRow.request_status !== 'pending' ||
        requestRow.updated_at !== body.p_expected_updated_at
      ) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: '40001', message: 'raw stale request' }),
        });
        return;
      }

      const moderatedAt = timestamp();
      requestRow.moderator_user_id = '00000000-0000-4000-8000-000000000001';
      requestRow.moderation_note =
        typeof body.p_moderation_note === 'string' ? body.p_moderation_note.trim() || null : null;
      requestRow.moderated_at = moderatedAt;
      requestRow.updated_at = moderatedAt;

      let draftEntityId: string | null = null;
      if (body.p_action === 'reject') {
        requestRow.request_status = 'rejected';
      } else {
        requestRow.request_status = 'converted';
        draftEntityId = `entity-request-${requestRow.id.replaceAll('-', '')}`;
        requestRow.converted_entity_id = draftEntityId;
        entities.push({
          id: draftEntityId,
          slug: `request-${requestRow.id.replaceAll('-', '')}`,
          entity_type: requestRow.entity_type,
          visibility: 'pin',
          audience: 'public',
          name: requestRow.proposed_name,
          summary: '',
          description: requestRow.description,
          x: requestRow.x,
          y: requestRow.y,
          category_id: null,
          publication_status: 'draft',
          published_at: null,
          archived_at: null,
          updated_at: moderatedAt,
        });
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ request: requestRow, draft_entity_id: draftEntityId }),
      });
      return;
    }

    if (url.pathname.endsWith('/rpc/admin_get_map_entity_editor_v7')) {
      const body = request.postDataJSON() as { p_entity_id?: string };
      const entity = entities.find((candidate) => candidate.id === body.p_entity_id);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          entity
            ? {
                record: entity,
                tag_links: [],
                dispositions: [],
                relations_revision: `revision-${entity.id}`,
                delete_blockers: {
                  aliases: 0,
                  tags: 0,
                  geographic_names: 0,
                  notes: 0,
                  location_events: 0,
                  requests: 1,
                },
              }
            : null,
        ),
      });
      return;
    }

    const table = url.pathname.split('/').at(-1) ?? '';
    if (request.method() === 'GET') {
      const rows: Record<string, unknown>[] =
        table === 'public_requests' ? requests : table === 'map_entities' ? entities : [];
      const range = rangeResponse(rows);
      await route.fulfill({ status: 200, headers: range.headers, body: range.body });
      return;
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  return {
    getRequest(id): RequestRow | undefined {
      return requests.find((request) => request.id === id);
    },
    getEntity(id): EntityRow | undefined {
      return entities.find((entity) => entity.id === id);
    },
    getModerationCount(): number {
      return moderationCount;
    },
    failNextModeration(): void {
      mode = 'network';
    },
    expireNextModeration(): void {
      mode = 'expired';
    },
    staleNextModeration(): void {
      mode = 'stale';
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
  await expect(page.getByText(/solicitudes administrativas disponibles/)).toBeVisible();
}

test('anonymous visitors never receive the moderation inbox', async ({ page }) => {
  await configureBackend(page);
  await page.goto('/');

  await expect(page.getByTestId('map-shell')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Solicitudes públicas' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Convertir en borrador' })).toBeHidden();
});

test('the admin inbox filters and sorts request details without exposing a needs-changes action', async ({
  page,
}) => {
  await configureBackend(page);
  await page.goto('/');
  await loginAndConnect(page);

  const headings = page.locator('.admin-public-requests__card-heading');
  await expect(headings).toHaveCount(2);
  await expect(headings.nth(0)).toHaveText('Newer Requested Character');
  await expect(headings.nth(1)).toHaveText('Older Requested Place');
  await expect(page.getByText('Newer Visitor')).toBeVisible();
  await expect(page.getByText('X 1500 · Y 1100')).toBeVisible();
  await expect(page.getByText('A newer public request.')).toBeVisible();
  await expect(page.getByText('Add this character to the atlas.')).toBeVisible();
  await expect(page.getByText(/“Necesita cambios” no está disponible/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Necesita cambios/i })).toHaveCount(0);

  const newerCard = page.getByRole('heading', { name: 'Newer Requested Character' }).locator('..');
  await newerCard
    .getByLabel('Nota administrativa (opcional)')
    .fill('Draft note survives rerenders.');
  await page.getByLabel('Orden por fecha').selectOption('oldest');
  await expect(headings.nth(0)).toHaveText('Older Requested Place');
  await expect(
    page
      .getByRole('heading', { name: 'Newer Requested Character' })
      .locator('..')
      .getByLabel('Nota administrativa (opcional)'),
  ).toHaveValue('Draft note survives rerenders.');

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
    );
  });
  await expect(
    page
      .getByRole('heading', { name: 'Newer Requested Character' })
      .locator('..')
      .getByLabel('Nota administrativa (opcional)'),
  ).toHaveValue('Draft note survives rerenders.');

  await page.getByLabel('Filtrar por estado').selectOption('rejected');
  await expect(page.getByText('Already Rejected', { exact: true })).toBeVisible();
  await expect(page.getByText('Historical rejection.')).toBeVisible();
});

test('rejecting requires confirmation, stores the optional note and cannot accidentally run twice', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await page.goto('/');
  await loginAndConnect(page);

  const card = page.getByRole('heading', { name: 'Newer Requested Character' }).locator('..');
  await card.getByLabel('Nota administrativa (opcional)').fill('Not enough evidence.');
  const rejectButton = card.getByRole('button', { name: 'Rechazar' });
  await rejectButton.click();
  await expect(page.getByRole('alertdialog')).toContainText('conservará su historial');
  await page.keyboard.press('Escape');
  await expect(rejectButton).toBeFocused();

  await rejectButton.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Rechazar solicitud' }).click();
  await expect(page.getByText(/Solicitud rechazada/)).toBeVisible();
  expect(backend.getModerationCount()).toBe(1);
  expect(backend.getRequest('10000000-0000-4000-8000-000000000272')?.request_status).toBe(
    'rejected',
  );
  expect(backend.getRequest('10000000-0000-4000-8000-000000000272')?.moderation_note).toBe(
    'Not enough evidence.',
  );
});

test('conversion creates an uncategorized untagged draft and opens the existing entity editor', async ({
  page,
}) => {
  const backend = await configureBackend(page);
  await page.goto('/');
  await loginAndConnect(page);

  const card = page.getByRole('heading', { name: 'Older Requested Place' }).locator('..');
  await card.getByRole('button', { name: 'Convertir en borrador' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('sin categoría ni etiquetas');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Crear borrador' }).click();

  const draftId = 'entity-request-10000000000040008000000000000271';
  await expect(page.getByRole('heading', { name: 'Editar Older Requested Place' })).toBeVisible();
  await expect(page.getByLabel('Categoría', { exact: true })).toHaveValue('');
  await expect(page.getByText(/Borrador creado sin categoría ni etiquetas/)).toBeVisible();
  expect(backend.getModerationCount()).toBe(1);
  expect(backend.getRequest('10000000-0000-4000-8000-000000000271')?.request_status).toBe(
    'converted',
  );
  expect(backend.getEntity(draftId)).toMatchObject({
    publication_status: 'draft',
    published_at: null,
    category_id: null,
    name: 'Older Requested Place',
    description: 'An older public request.',
  });
});

test('network, stale and expired-session failures are safe on mobile and do not leak backend details', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const backend = await configureBackend(page);
  await page.goto('/');
  await loginAndConnect(page);

  const card = page.getByRole('heading', { name: 'Older Requested Place' }).locator('..');
  backend.failNextModeration();
  await card.getByRole('button', { name: 'Convertir en borrador' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.getByText('No se pudo contactar con el servicio de moderación.')).toBeVisible();
  expect(backend.getRequest('10000000-0000-4000-8000-000000000271')?.request_status).toBe(
    'pending',
  );

  backend.staleNextModeration();
  await card.getByRole('button', { name: 'Convertir en borrador' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.getByText(/ya cambió o fue procesada/)).toBeVisible();
  await expect(page.getByText(/raw request transition detail/)).toHaveCount(0);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  backend.expireNextModeration();
  await card.getByRole('button', { name: 'Convertir en borrador' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.getByRole('heading', { name: 'Solicitudes públicas' })).toBeHidden();
  await expect(page.getByTestId('map-shell')).toBeVisible();
});
