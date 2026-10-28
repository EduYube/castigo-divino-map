import { expect, test, type Page, type Route } from '@playwright/test';

const PROJECT_URL = 'http://127.0.0.1:4173';
const KEY = 'sb_publishable_map078_e2e_key';
const TOKEN = 'map078_admin_token';
const CAMPAIGN = '00000000-0000-4000-8000-000000000068';
const NEVERWINTER = {
  id: 'map-neverwinter',
  slug: 'neverwinter',
  name: 'Neverwinter',
  parent_id: null,
  width: 2048,
  height: 1582,
  publication_status: 'published',
  image_uri: null,
  loading_strategy: null,
  source_url: null,
  rights_holder: null,
  attribution: null,
  license_notes: 'RIGHTS_METADATA_PENDING',
  updated_at: '2026-10-28T12:00:00.000Z',
};
type Row = Record<string, unknown>;
function answer(rows: readonly Row[]) {
  return {
    status: 200,
    contentType: 'application/json',
    headers: {
      'Content-Range': rows.length ? '0-' + (rows.length - 1) + '/' + rows.length : '*/0',
    },
    body: JSON.stringify(rows),
  };
}
async function setup(page: Page) {
  const contexts: Row[] = [{ ...NEVERWINTER }];
  const bindings: Row[] = [
    {
      campaign_id: CAMPAIGN,
      geographic_name_id: 'geo-neverwinter',
      map_context_id: 'map-neverwinter',
    },
  ];
  const placements: Row[] = [];
  let writes = 0;
  await page.addInitScript(
    ({ url, key }) => {
      window.__MAP017_AUTH_TEST_CONFIG__ = {
        projectUrl: url,
        publishableKey: key,
        timeoutMs: 2000,
      };
      window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
        projectUrl: url,
        publishableKey: key,
        timeoutMs: 2000,
        retryDelaysMs: [0],
      };
    },
    { url: PROJECT_URL, key: KEY },
  );
  await page.route(
    'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg',
    (r) =>
      r.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329"></svg>',
      }),
  );
  await page.route('**/auth/v1/**', async (r) => {
    const logout = r.request().url().includes('/logout');
    await r.fulfill(
      logout
        ? { status: 204, body: '' }
        : {
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              access_token: TOKEN,
              refresh_token: 'test-refresh',
              expires_in: 3600,
              user: { id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.invalid' },
            }),
          },
    );
  });
  await page.route('**/rest/v1/rpc/current_user_is_admin', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: 'true' }),
  );
  await page.route('**/rest/v1/**', async (route: Route) => {
    const req = route.request(),
      u = new URL(req.url()),
      table = u.pathname.split('/').at(-1) ?? '';
    const admin = req.headers()['authorization'] === 'Bearer ' + TOKEN;
    const method = req.method();
    const campaign = u.searchParams.get('campaign_id')?.replace(/^eq\./, '');
    const rows =
      table === 'map_contexts'
        ? contexts
        : table === 'campaign_geographic_map_context_links'
          ? bindings.filter((b) => b.campaign_id === campaign)
          : table === 'entity_map_placements'
            ? placements.filter((p) => p.campaign_id === campaign)
            : table === 'geographic_names'
              ? [
                  {
                    id: 'geo-neverwinter',
                    slug: 'neverwinter',
                    name: 'Neverwinter',
                    language: 'en',
                    x: 1400,
                    y: 1300,
                    recommended_zoom: 1,
                    entity_id: null,
                    publication_status: 'published',
                    published_at: '2026-10-28',
                    updated_at: '2026-10-28',
                  },
                ]
              : table === 'map_entities' && admin
                ? [
                    {
                      id: 'entity-test',
                      slug: 'test',
                      name: 'Entidad sintética',
                      entity_type: 'character',
                      lifecycle_status: null,
                      visibility: 'pin',
                      audience: 'public',
                      portrait_path: null,
                      summary: '',
                      description: '',
                      x: 100,
                      y: 100,
                      geometry: null,
                      category_id: 'category-test',
                      publication_status: 'draft',
                      published_at: null,
                      archived_at: null,
                      updated_at: '2026-10-28',
                    },
                  ]
                : table === 'campaigns'
                  ? [
                      {
                        id: CAMPAIGN,
                        slug: 'un-aliento-menos',
                        name: 'Un aliento menos',
                        status: 'active',
                        display_order: 0,
                        archived_at: null,
                        updated_at: '2026-10-28',
                      },
                    ]
                  : [];
    if (method === 'GET') {
      await route.fulfill(answer(rows));
      return;
    }
    if (!admin) {
      await route.fulfill({ status: 403, body: '{}' });
      return;
    }
    if (table === 'map_contexts' && method === 'POST') {
      writes++;
      const data = req.postDataJSON() as Row;
      contexts.push({ ...data, updated_at: '2026-10-28T12:01:00.000Z' });
      await route.fulfill(answer([contexts.at(-1)!]));
      return;
    }
    if (table === 'map_contexts' && method === 'PATCH') {
      writes++;
      const id = u.searchParams.get('id')?.slice(3);
      const row = contexts.find((c) => c.id === id);
      if (!row) {
        await route.fulfill(answer([]));
        return;
      }
      Object.assign(row, req.postDataJSON(), { updated_at: '2026-10-28T12:02:00.000Z' });
      await route.fulfill(answer([row]));
      return;
    }
    if (table === 'campaign_geographic_map_context_links' && method === 'POST') {
      writes++;
      const data = req.postDataJSON() as Row;
      bindings.push(data);
      await route.fulfill(answer([data]));
      return;
    }
    if (table === 'campaign_geographic_map_context_links' && method === 'DELETE') {
      writes++;
      const idx = bindings.findIndex(
        (b) => b.geographic_name_id === u.searchParams.get('geographic_name_id')?.slice(3),
      );
      const row = idx >= 0 ? bindings.splice(idx, 1) : [];
      await route.fulfill(answer(Array.isArray(row) ? row : []));
      return;
    }
    if (table === 'entity_map_placements' && method === 'POST') {
      writes++;
      const data = req.postDataJSON() as Row;
      const row = { ...data, updated_at: '2026-10-28T12:03:00.000Z' };
      placements.push(row);
      await route.fulfill(answer([row]));
      return;
    }
    await route.fulfill(answer([]));
  });
  return { contexts, bindings, placements, getWrites: () => writes };
}
async function login(page: Page) {
  await page.goto('/');
  await expect(page.locator('.backend-status')).toHaveAttribute('data-backend-state', 'connected');
  await page.getByRole('button', { name: 'Administrar' }).click();
  await page.getByLabel('Correo').fill('admin@example.invalid');
  await page.getByLabel('Contraseña').fill('secret-test');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Mapas locales' })).toBeVisible();
}
test('MAP-078 does not expose admin to non-admin; Neverwinter stays unchanged', async ({
  page,
}) => {
  const backend = await setup(page);
  await page.goto('/');
  await expect(page.locator('.admin-auth__shell')).toBeHidden();
  expect(backend.getWrites()).toBe(0);
  await login(page);
  await expect(page.locator('#local-context-list')).toContainText('Neverwinter');
  await expect(page.locator('#local-context-list')).toContainText('2048 × 1582');
  await expect(page.locator('#local-context-list')).toContainText('procedencia pendiente');
  expect(backend.getWrites()).toBe(0);
});
test('MAP-078 creates only synthetic contexts and holds immutable ID/slug', async ({ page }) => {
  const backend = await setup(page);
  await login(page);
  await page.getByRole('button', { name: 'Crear contexto' }).click();
  await page.locator('#local-context-id').fill('map-test-only');
  await page.locator('#local-context-slug').fill('test-only');
  await page.locator('#local-context-name').fill('Mapa de prueba');
  await page.getByRole('button', { name: 'Guardar contexto' }).click();
  await expect(page.locator('#local-context-list')).toContainText('Mapa de prueba');
  expect(backend.contexts).toHaveLength(2);
  await page
    .locator('#local-context-list')
    .getByRole('button', { name: 'Editar contexto' })
    .last()
    .click();
  await expect(page.locator('#local-context-id')).toHaveJSProperty('readOnly', true);
  await expect(page.locator('#local-context-slug')).toHaveJSProperty('readOnly', true);
  await page.getByRole('button', { name: 'Cancelar edición' }).click();
  expect(backend.contexts[0]).toEqual(NEVERWINTER);
});
test('MAP-078 rejects incomplete provenance before any write', async ({ page }) => {
  const backend = await setup(page);
  await login(page);
  await page.getByRole('button', { name: 'Crear contexto' }).click();
  await page.locator('#local-context-id').fill('map-no-rights');
  await page.locator('#local-context-slug').fill('no-rights');
  await page.locator('#local-context-name').fill('Sin derechos');
  await page.locator('#local-context-uri').fill('/not-authorized.png');
  await page.locator('#local-context-strategy').selectOption('bundled');
  await page.getByRole('button', { name: 'Guardar contexto' }).click();
  await expect(page.locator('#local-context-error')).toContainText('fuente');
  expect(backend.getWrites()).toBe(0);
});
test('MAP-078 keeps bindings campaign-scoped and excludes organization placements', async ({
  page,
}) => {
  const backend = await setup(page);
  await login(page);
  await page.getByRole('button', { name: 'Bindings de campaña' }).click();
  await expect(page.locator('#local-binding-list')).not.toContainText('Neverwinter');
  await page.getByRole('button', { name: 'Placements de campaña' }).click();
  await page.getByRole('button', { name: 'Crear placement' }).click();
  const options = await page.locator('#local-placement-entity option').allTextContents();
  expect(options.join(' ')).toContain('Entidad sintética');
  expect(options.join(' ')).not.toContain('organization');
  await expect(page.locator('#local-placement-kind option[value="polygon"]')).toBeDisabled();
  expect(backend.placements).toHaveLength(0);
});
test('MAP-078 mobile forms do not overflow at 320/390/430', async ({ page }) => {
  await setup(page);
  await login(page);
  await page.getByRole('button', { name: 'Crear contexto' }).click();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 750 });
    const overflow = await page
      .locator('.admin-local-maps')
      .evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    expect(overflow).toBe(false);
  }
});
