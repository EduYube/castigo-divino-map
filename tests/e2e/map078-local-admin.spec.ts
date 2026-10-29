import { expect, test, type Page, type Route } from '@playwright/test';

const PROJECT_URL = 'http://127.0.0.1:4173';
const KEY = 'sb_publishable_map078_e2e_key';
const TOKEN = 'map078_admin_token';
const CAMPAIGN_A = '00000000-0000-4000-8000-000000000053';
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
    if (table === 'current_user_is_admin') {
      await route.fallback();
      return;
    }
    const admin = req.headers()['authorization'] === 'Bearer ' + TOKEN;
    const method = req.method();
    const campaign = u.searchParams.get('campaign_id')?.replace(/^eq\./, '');
    const rows =
      table === 'map_contexts'
        ? u.searchParams.get('select')?.includes('entity_map_placements(count)')
          ? contexts.map((context) => ({
              id: context.id,
              placements: [
                { count: placements.filter((p) => p.map_context_id === context.id).length },
              ],
              bindings: [{ count: bindings.filter((b) => b.map_context_id === context.id).length }],
            }))
          : contexts
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
                    {
                      id: 'place-synthetic',
                      slug: 'synthetic',
                      name: 'Emplazamiento sintético',
                      entity_type: 'location',
                      lifecycle_status: null,
                      visibility: 'pin',
                      audience: 'public',
                      portrait_path: null,
                      summary: '',
                      description: '',
                      x: 150,
                      y: 150,
                      geometry: null,
                      category_id: 'category-test',
                      publication_status: 'draft',
                      published_at: null,
                      archived_at: null,
                      updated_at: '2026-10-28',
                    },
                    {
                      id: 'org-synthetic',
                      slug: 'organization',
                      name: 'Organización sintética',
                      entity_type: 'organization',
                      lifecycle_status: null,
                      visibility: 'search_only',
                      audience: 'public',
                      portrait_path: null,
                      summary: '',
                      description: '',
                      x: null,
                      y: null,
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
                        id: CAMPAIGN_A,
                        slug: 'castigo-divino',
                        name: 'Castigo Divino',
                        status: 'active',
                        display_order: 0,
                        archived_at: null,
                        updated_at: '2026-10-28',
                      },
                      {
                        id: CAMPAIGN,
                        slug: 'un-aliento-menos',
                        name: 'Un aliento menos',
                        status: 'active',
                        display_order: 1,
                        archived_at: null,
                        updated_at: '2026-10-28',
                      },
                    ]
                  : [];
    if (method === 'GET') {
      // Public catalog mocks must preserve the empty-but-valid baseline. Local
      // administrative geography/entities are returned only with an admin JWT.
      await route.fulfill(answer(!admin && table !== 'campaigns' ? [] : rows));
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
        (b) =>
          b.geographic_name_id === u.searchParams.get('geographic_name_id')?.slice(3) &&
          b.campaign_id === u.searchParams.get('campaign_id')?.slice(3) &&
          b.map_context_id === u.searchParams.get('map_context_id')?.slice(3),
      );
      const row = idx >= 0 ? bindings.splice(idx, 1) : [];
      await route.fulfill(answer(Array.isArray(row) ? row : []));
      return;
    }
    if (table === 'entity_map_placements' && method === 'PATCH') {
      writes++;
      const row = placements.find((p) => p.entity_id === u.searchParams.get('entity_id')?.slice(3));
      if (row) Object.assign(row, req.postDataJSON(), { updated_at: '2026-10-28T12:04:00.000Z' });
      await route.fulfill(answer(row ? [row] : []));
      return;
    }
    if (table === 'entity_map_placements' && method === 'DELETE') {
      writes++;
      const index = placements.findIndex(
        (p) => p.entity_id === u.searchParams.get('entity_id')?.slice(3),
      );
      await route.fulfill(answer(index >= 0 ? placements.splice(index, 1) : []));
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
  await page.locator('#local-context-width').fill('1024');
  await page.locator('#local-context-height').fill('768');
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
  await page.locator('#local-context-width').fill('1024');
  await page.locator('#local-context-height').fill('768');
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
  await page.locator('.admin-campaign-roster__select').selectOption(CAMPAIGN);
  await expect(page.locator('#local-binding-list')).toContainText('Neverwinter');
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

test('MAP-078 can associate and disassociate a synthetic campaign binding without deleting Neverwinter', async ({
  page,
}) => {
  const backend = await setup(page);
  await login(page);
  await page.getByRole('button', { name: 'Bindings de campaña' }).click();
  await expect(page.locator('#local-binding-list')).not.toContainText('Neverwinter');
  await page.locator('#local-binding-geography').selectOption('geo-neverwinter');
  await page.locator('#local-binding-context').selectOption('map-neverwinter');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Asociar geografía' }).click();
  await expect(page.locator('#local-binding-list')).toContainText('Neverwinter');
  expect(backend.bindings).toHaveLength(2);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Desasociar binding' }).click();
  await expect(page.locator('#local-binding-list')).not.toContainText('Neverwinter');
  expect(backend.contexts).toHaveLength(1);
  expect(backend.contexts[0]).toEqual(NEVERWINTER);
});
test('MAP-078 keyboard point placement saves and deletes synthetic data', async ({ page }) => {
  const backend = await setup(page);
  await login(page);
  await page.getByRole('button', { name: 'Placements de campaña' }).click();
  await page.getByRole('button', { name: 'Crear placement' }).click();
  await page.locator('#local-placement-x').fill('101');
  await page.locator('#local-placement-y').fill('202');
  await page.getByRole('button', { name: 'Situar punto o añadir vértice' }).click();
  await expect(page.locator('#local-placement-coordinate')).toContainText('101.00');
  await page.getByRole('button', { name: 'Guardar placement' }).click();
  await expect(page.locator('#local-placement-list')).toContainText('Entidad sintética');
  expect(backend.placements).toHaveLength(1);
  expect(backend.placements[0]?.geometry).toEqual({
    kind: 'point',
    coordinates: { x: 101, y: 202 },
  });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Borrar placement' }).click();
  await expect(page.locator('#local-placement-list')).not.toContainText('Entidad sintética');
  expect(backend.placements).toHaveLength(0);
});
test('MAP-078 keyboard polygon is only available to locations', async ({ page }) => {
  const backend = await setup(page);
  await login(page);
  await page.getByRole('button', { name: 'Placements de campaña' }).click();
  await page.getByRole('button', { name: 'Crear placement' }).click();
  await expect(page.locator('#local-placement-kind option[value="polygon"]')).toBeDisabled();
  await page.locator('#local-placement-entity').selectOption('place-synthetic');
  await expect(page.locator('#local-placement-kind option[value="polygon"]')).toBeEnabled();
  await page.locator('#local-placement-kind').selectOption('polygon');
  for (const [x, y] of [
    [100, 100],
    [220, 100],
    [150, 200],
  ]) {
    await page.locator('#local-placement-x').fill(String(x));
    await page.locator('#local-placement-y').fill(String(y));
    await page.getByRole('button', { name: 'Situar punto o añadir vértice' }).click();
  }
  await expect(page.locator('#local-placement-coordinate')).toContainText('3 vértices');
  await page.getByRole('button', { name: 'Guardar placement' }).click();
  await expect(page.locator('#local-placement-list')).toContainText('polygon');
  expect(backend.placements).toHaveLength(1);
});
test('MAP078-REV-01 purges hidden private values, options and headings on logout', async ({
  page,
}) => {
  const backend = await setup(page);
  backend.contexts.push({
    ...NEVERWINTER,
    id: 'map-private',
    slug: 'private',
    name: 'PRIVATE CONTEXT',
    license_notes: 'PRIVATE LICENSE',
    publication_status: 'draft',
  });
  await login(page);
  const row = page.locator('#local-context-list li').filter({ hasText: 'PRIVATE CONTEXT' });
  await row.getByRole('button', { name: 'Editar contexto' }).click();
  await expect(page.locator('#local-context-license')).toHaveValue('PRIVATE LICENSE');
  await page.locator('.admin-auth__logout').click();
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  const leaked = await page.locator('.admin-local-maps').evaluate((root) => {
    const controls = Array.from(root.querySelectorAll('input,textarea,select')).map(
      (control) => (control as HTMLInputElement).value,
    );
    return [root.textContent ?? '', ...controls].join('|');
  });
  expect(leaked).not.toContain('PRIVATE CONTEXT');
  expect(leaked).not.toContain('PRIVATE LICENSE');
  expect(leaked).not.toContain('map-private');
  await expect(page.locator('#local-context-parent option')).toHaveCount(0);
  expect(backend.getWrites()).toBe(0);
});

test('MAP078-REV-02 detects cross-campaign dependencies and refreshes them', async ({ page }) => {
  const backend = await setup(page);
  backend.contexts.push({
    ...NEVERWINTER,
    id: 'map-shared',
    slug: 'shared',
    name: 'Shared draft',
    publication_status: 'draft',
  });
  backend.placements.push({
    campaign_id: CAMPAIGN,
    map_context_id: 'map-shared',
    entity_id: 'place-foreign',
    geometry: { kind: 'point', coordinates: { x: 10, y: 15 } },
    publication_status: 'draft',
    updated_at: '2026-10-28T12:00:00.000Z',
  });
  backend.bindings.push({
    campaign_id: CAMPAIGN,
    geographic_name_id: 'geo-other',
    map_context_id: 'map-shared',
  });
  await login(page);
  const row = page.locator('#local-context-list li').filter({ hasText: 'Shared draft' });
  await expect(row.getByRole('button', { name: 'Eliminar contexto' })).toHaveCount(0);
  await row.getByRole('button', { name: 'Editar contexto' }).click();
  await expect(page.locator('#local-context-width')).toHaveJSProperty('readOnly', true);
  await page.getByRole('button', { name: 'Cancelar edición' }).click();
  backend.placements.splice(0);
  const bindingIndex = backend.bindings.findIndex((b) => b.map_context_id === 'map-shared');
  backend.bindings.splice(bindingIndex, 1);
  await page.locator('#local-context-reload').click();
  await expect(row.getByRole('button', { name: 'Eliminar contexto' })).toBeVisible();
  await row.getByRole('button', { name: 'Editar contexto' }).click();
  await expect(page.locator('#local-context-width')).toHaveJSProperty('readOnly', false);
  expect(backend.getWrites()).toBe(0);
});

test('MAP078-REV-03 recovers confirmed campaign after a failed switch', async ({ page }) => {
  const backend = await setup(page);
  backend.bindings.push({
    campaign_id: CAMPAIGN_A,
    geographic_name_id: 'geo-neverwinter',
    map_context_id: 'map-neverwinter',
  });
  await login(page);
  await page.getByRole('button', { name: 'Bindings de campaña' }).click();
  await expect(page.locator('#local-binding-list')).toContainText('Neverwinter');
  await page.route('**/rest/v1/players**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('campaign_id') === 'eq.' + CAMPAIGN) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    } else await route.fallback();
  });
  await page.locator('.admin-campaign-roster__select').selectOption(CAMPAIGN);
  await expect(page.locator('#local-binding-list')).toContainText('Neverwinter');
  await page.getByRole('button', { name: 'Placements de campaña' }).click();
  await expect(page.getByRole('button', { name: 'Crear placement' })).toBeEnabled();
  expect(backend.getWrites()).toBe(0);
});

for (const shape of ['point', 'polygon'] as const) {
  test('MAP078-REV-04 retains editor on canceled context switch: ' + shape, async ({ page }) => {
    const backend = await setup(page);
    backend.contexts.push({
      ...NEVERWINTER,
      id: 'map-alternate',
      slug: 'alternate',
      name: 'Alternate',
    });
    await login(page);
    await page.getByRole('button', { name: 'Placements de campaña' }).click();
    await page.getByRole('button', { name: 'Crear placement' }).click();
    if (shape === 'polygon') {
      await page.locator('#local-placement-entity').selectOption('place-synthetic');
      await page.locator('#local-placement-kind').selectOption('polygon');
    }
    await page.locator('#local-placement-x').fill('20');
    await page.locator('#local-placement-y').fill('30');
    await page.getByRole('button', { name: 'Situar punto o añadir vértice' }).click();
    const initialContext = await page.locator('#local-placement-context').inputValue();
    const originalGeometry = await page.locator('#local-placement-coordinate').textContent();
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('#local-placement-context').selectOption('map-alternate');
    await expect(page.locator('#local-placement-context')).toHaveValue(initialContext);
    await expect(page.locator('#local-placement-coordinate')).toHaveText(originalGeometry ?? '');
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#local-placement-context').selectOption('map-alternate');
    await expect(page.locator('#local-placement-context')).toHaveValue('map-alternate');
    const expectedText = shape === 'polygon' ? '0 vértices' : 'Sin geometría';
    await expect(page.locator('#local-placement-coordinate')).toContainText(expectedText);
    expect(backend.getWrites()).toBe(0);
  });
}

test('MAP078-REV-05 confirms binding navigation impact before any write', async ({ page }) => {
  const backend = await setup(page);
  await login(page);
  await page.getByRole('button', { name: 'Bindings de campaña' }).click();
  await page.locator('#local-binding-geography').selectOption('geo-neverwinter');
  await page.locator('#local-binding-context').selectOption('map-neverwinter');
  let message = '';
  page.once('dialog', async (dialog) => {
    message = dialog.message();
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Asociar geografía' }).click();
  expect(message).toContain('Neverwinter');
  expect(message).toContain('navegación pública');
  expect(backend.getWrites()).toBe(0);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Asociar geografía' }).click();
  await expect(page.locator('#local-binding-list')).toContainText('Neverwinter');
  expect(backend.getWrites()).toBe(1);
});

test('MAP-078 refuses out-of-bounds keyboard geometry without sending a write', async ({
  page,
}) => {
  const backend = await setup(page);
  await login(page);
  await page.getByRole('button', { name: 'Placements de campaña' }).click();
  await page.getByRole('button', { name: 'Crear placement' }).click();
  await page.locator('#local-placement-x').fill('9999');
  await page.locator('#local-placement-y').fill('100');
  await page.getByRole('button', { name: 'Situar punto o añadir vértice' }).click();
  await expect(page.locator('#local-placement-error')).toContainText('dimensiones');
  expect(backend.getWrites()).toBe(0);
});
