import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map022_admin_access_token';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

const categories = [
  { id: 'category-people', name: 'People', publication_status: 'published' },
  { id: 'category-places', name: 'Places', publication_status: 'published' },
];
const tags = [{ id: 'notable', name: 'Notable', publication_status: 'published' }];
const players = [
  { id: 'player-demo-one', display_name: 'Demo Player One', publication_status: 'published' },
  { id: 'player-demo-two', display_name: 'Demo Player Two', publication_status: 'published' },
];
const entity = {
  id: 'entity-aster-guide',
  slug: 'aster-guide',
  entity_type: 'character',
  visibility: 'pin',
  audience: 'public',
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
};

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

async function configureAdminBackend(page: Page): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP017_AUTH_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map022_admin_key',
      timeoutMs: 2000,
    };
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map022_admin_key',
      timeoutMs: 2000,
      retryDelaysMs: [0, 0, 0],
    };
  }, PROJECT_URL);

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await page.route('**/auth/v1/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: ACCESS_TOKEN,
        refresh_token: 'map022_admin_refresh_token',
        expires_in: 3600,
        user: {
          id: '00000000-0000-4000-8000-000000000022',
          email: 'admin@example.invalid',
        },
      }),
    });
  });

  await page.route('**/rest/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const authenticated = request.headers()['authorization'] === `Bearer ${ACCESS_TOKEN}`;

    if (url.pathname.endsWith('/rpc/current_user_is_admin')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
      return;
    }

    if (authenticated && url.pathname.endsWith('/rpc/admin_get_map_entity_editor_v4')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          record: entity,
          tag_links: [
            {
              id: 'entity-tag-aster-notable',
              tag_id: 'notable',
              publication_status: 'published',
              published_at: entity.published_at,
              updated_at: entity.updated_at,
            },
          ],
          dispositions: [
            {
              player_id: 'player-demo-one',
              display_name: 'Demo Player One',
              disposition: 'ally',
              updated_at: entity.updated_at,
            },
            {
              player_id: 'player-demo-two',
              display_name: 'Demo Player Two',
              disposition: 'neutral',
              updated_at: entity.updated_at,
            },
          ],
          relations_revision: 'map022-revision',
          delete_blockers: {
            aliases: 0,
            tags: 1,
            geographic_names: 0,
            notes: 0,
            location_events: 0,
            requests: 0,
          },
        }),
      });
      return;
    }

    const table = url.pathname.split('/').at(-1) ?? '';
    const rows: Record<string, unknown>[] = authenticated
      ? table === 'map_entities'
        ? [entity]
        : table === 'categories'
          ? categories
          : table === 'tags'
            ? tags
            : table === 'players'
              ? players
              : []
      : [];
    const range = rangeResponse(rows);
    await route.fulfill({ status: 200, headers: range.headers, body: range.body });
  });
}

async function login(page: Page): Promise<void> {
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

test('admin coordinate editor and preview reuse the public type/disposition visual contract', async ({
  page,
}) => {
  await configureAdminBackend(page);
  await page.goto('/');
  await login(page);

  await page.getByRole('button', { name: 'Editar Aster Guide' }).click();
  const marker = page.getByTestId('admin-coordinate-marker');
  await expect(marker).toHaveAttribute('data-entity-type', 'character');
  await expect(marker.locator('.pin-visual')).toHaveClass(/pin-visual--character/);
  await expect(marker.locator('.pin-disposition--ally')).toHaveText('+');
  await expect(marker.locator('.pin-disposition--neutral')).toHaveText('•');
  await expect(marker).toHaveAttribute(
    'aria-label',
    /Personaje\. Relación con los personajes: Demo Player One: aliado; Demo Player Two: neutral/i,
  );

  await page.getByTestId('admin-player-disposition-player-demo-one').selectOption('enemy');
  await expect(marker.locator('.pin-disposition--enemy')).toHaveText('−');
  await expect(marker).toHaveAttribute('aria-label', /Demo Player One: enemigo/i);

  await page.getByRole('button', { name: 'Previsualizar' }).click();
  const preview = page.getByTestId('admin-pin-preview');
  await expect(preview).toHaveAttribute('data-entity-type', 'character');
  await expect(preview.locator('.pin-visual--character')).toBeVisible();
  await expect(preview.locator('.pin-disposition--enemy')).toHaveText('−');
  await expect(preview).toHaveAttribute('title', /Personaje\. Relación con los personajes:/i);
});

test('admin preview shows location shape for a new location without altering persistence', async ({
  page,
}) => {
  await configureAdminBackend(page);
  await page.goto('/');
  await login(page);

  await page.getByRole('button', { name: 'Crear emplazamiento' }).click();
  await page.getByLabel('ID estable').fill('entity-map022-location');
  await page.getByRole('textbox', { name: 'Slug', exact: true }).fill('map022-location');
  await page.getByLabel('Nombre principal (inglés)').fill('MAP-022 Location');
  await page.getByLabel('Categoría', { exact: true }).selectOption('category-places');
  await page.getByLabel('Coordenada X').fill('1200');
  await page.getByLabel('Coordenada Y').fill('900');

  const marker = page.getByTestId('admin-coordinate-marker');
  await expect(marker).toHaveAttribute('data-entity-type', 'location');
  await expect(marker.locator('.pin-visual--location')).toBeVisible();

  await page.getByRole('button', { name: 'Previsualizar' }).click();
  const preview = page.getByTestId('admin-pin-preview');
  await expect(preview).toHaveAttribute('data-entity-type', 'location');
  await expect(preview.locator('.pin-visual--location')).toBeVisible();
  await expect(preview.locator('.pin-disposition--neutral')).toHaveCount(2);
});
