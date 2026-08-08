import { readFileSync } from 'node:fs';

import { expect, test, type Page, type Route } from '@playwright/test';

const bundledSnapshot = JSON.parse(
  readFileSync(
    new URL('../../public/data/public-catalog.snapshot.json', import.meta.url),
    'utf8',
  ),
) as Record<string, unknown>;
const beta01Fixture = JSON.parse(
  readFileSync(new URL('../../scripts/fixtures/beta01-public-rows.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;
const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

type PublicRow = Record<string, unknown>;

interface PublicRows {
  [table: string]: PublicRow[];
  categories: PublicRow[];
  tags: PublicRow[];
  players: PublicRow[];
  map_entities: PublicRow[];
  entity_aliases: PublicRow[];
  entity_tags: PublicRow[];
  entity_player_dispositions: PublicRow[];
  character_location_relations: PublicRow[];
  public_notes: PublicRow[];
  public_note_tags: PublicRow[];
  geographic_names: PublicRow[];
  geographic_name_aliases: PublicRow[];
  character_location_events: PublicRow[];
}

function projectRows(value: unknown, fields: readonly string[]): PublicRow[] {
  if (!Array.isArray(value)) {
    throw new Error('Expected fixture rows.');
  }

  return value.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error('Expected fixture row object.');
    }

    const row = entry as PublicRow;
    return Object.fromEntries(fields.map((field) => [field, row[field]]));
  });
}

function createFixtureRemoteRows(): PublicRows {
  const fixture = beta01Fixture;

  return {
    categories: projectRows(fixture.categories, ['id', 'slug', 'name', 'description']),
    tags: projectRows(fixture.tags, ['id', 'name', 'description']),
    players: projectRows(fixture.players, ['id', 'slug', 'display_name', 'name_language']),
    map_entities: projectRows(fixture.entities, [
      'id',
      'slug',
      'entity_type',
      'visibility',
      'name',
      'name_language',
      'summary',
      'description',
      'x',
      'y',
      'category_id',
    ]),
    entity_aliases: projectRows(fixture.entityAliases, ['id', 'entity_id', 'language', 'value']),
    entity_tags: projectRows(fixture.entityTags, ['entity_id', 'tag_id']),
    entity_player_dispositions: projectRows(fixture.dispositions, [
      'entity_id',
      'player_id',
      'disposition',
    ]),
    character_location_relations: projectRows(fixture.characterLocationRelations, [
      'character_id',
      'location_id',
      'relation_status',
    ]),
    public_notes: projectRows(fixture.notes, [
      'id',
      'slug',
      'entity_id',
      'title',
      'body',
      'sort_order',
    ]),
    public_note_tags: projectRows(fixture.noteTags, ['note_id', 'tag_id']),
    geographic_names: projectRows(fixture.geographicNames, [
      'id',
      'slug',
      'name',
      'language',
      'x',
      'y',
      'recommended_zoom',
      'entity_id',
    ]),
    geographic_name_aliases: projectRows(fixture.geographicAliases, [
      'id',
      'geographic_name_id',
      'language',
      'value',
    ]),
    character_location_events: projectRows(fixture.locationEvents, [
      'id',
      'character_id',
      'event_type',
      'location_entity_id',
      'geographic_name_id',
      'x',
      'y',
      'location_label',
      'summary',
      'language',
      'observed_at',
      'related_sighting_id',
    ]),
  };
}

function createRemoteRevisionB(): PublicRows {
  const rows = createFixtureRemoteRows();

  rows.tags.push({
    id: 'remote-revision',
    name: 'Revisión remota',
    description: 'Etiqueta exclusiva de la revisión remota B.',
  });
  rows.map_entities = rows.map_entities.map((row) =>
    row.id === 'place-demo-harbor'
      ? {
          ...row,
          name: 'Puerto remoto B',
          x: 1180.5,
          y: 870,
        }
      : row,
  );
  rows.entity_aliases = rows.entity_aliases.map((row) =>
    row.entity_id === 'place-demo-harbor' ? { ...row, value: 'Alias remoto B' } : row,
  );
  rows.entity_tags = rows.entity_tags.filter((row) => row.entity_id !== 'place-demo-harbor');
  rows.entity_tags.push(
    { entity_id: 'place-demo-harbor', tag_id: 'remote-revision' },
    { entity_id: 'place-demo-harbor', tag_id: 'demo-data' },
  );
  rows.public_notes = rows.public_notes.map((row) =>
    row.entity_id === 'place-demo-harbor'
      ? {
          ...row,
          title: 'Nota remota B',
          body: 'Contenido publicado únicamente por la revisión remota B.',
        }
      : row,
  );
  rows.public_note_tags = rows.public_note_tags.filter(
    (row) => row.note_id !== 'note-demo-harbor-overview',
  );
  rows.public_note_tags.push({
    note_id: 'note-demo-harbor-overview',
    tag_id: 'remote-revision',
  });

  return rows;
}

function createArchivedRemoteRevision(): PublicRows {
  const rows = createRemoteRevisionB();

  rows.map_entities = rows.map_entities.filter((row) => row.id !== 'place-demo-harbor');
  rows.entity_aliases = rows.entity_aliases.filter((row) => row.entity_id !== 'place-demo-harbor');
  rows.entity_tags = rows.entity_tags.filter((row) => row.entity_id !== 'place-demo-harbor');
  rows.public_notes = rows.public_notes.filter((row) => row.entity_id !== 'place-demo-harbor');
  rows.public_note_tags = rows.public_note_tags.filter(
    (row) => row.note_id !== 'note-demo-harbor-overview',
  );

  return rows;
}

async function mockOfficialMap(page: Page): Promise<void> {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });
}

async function configureBackend(page: Page, getRows: () => PublicRows | null): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map028_revision_test_key',
      timeoutMs: 250,
      retryDelaysMs: [0],
    };
  }, LOCAL_SUPABASE_URL);

  await page.route('**/rest/v1/**', async (route: Route) => {
    const availableRows = getRows();

    if (!availableRows) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '[]' });
      return;
    }

    const match = /\/rest\/v1\/([^?]+)/.exec(route.request().url());
    const table = match?.[1] ?? '';
    const rows = availableRows[table] ?? [];
    const contentRange = rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange },
      body: JSON.stringify(rows),
    });
  });
}

function currentSearchParams(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}

test('switches marker, search, filters and URL atomically from snapshot A to Supabase B and removes archived legacy places', async ({
  page,
}) => {
  let remoteRows: PublicRows | null = null;

  await mockOfficialMap(page);
  await configureBackend(page, () => remoteRows);
  await page.goto('/');

  const backendStatus = page.locator('[data-backend-status]');
  await expect(backendStatus).toHaveAttribute('data-backend-state', 'degraded');
  await expect(backendStatus).toHaveAttribute('data-data-source', 'bundled-snapshot');
  await expect(
    page.getByRole('button', { name: 'Puerto de demostración. Categoría: Asentamiento.' }),
  ).toBeVisible();

  remoteRows = createRemoteRevisionB();
  await backendStatus.getByRole('button', { name: 'Reintentar' }).click();

  await expect(backendStatus).toHaveAttribute('data-backend-state', 'connected');
  await expect(
    page.getByRole('button', { name: 'Puerto remoto B. Categoría: Asentamiento.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Puerto de demostración. Categoría: Asentamiento.' }),
  ).toHaveCount(0);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  const results = page.getByRole('list', { name: 'Resultados de búsqueda de lugares' });

  await searchbox.fill('nota remota b');
  await expect(
    results.getByRole('button', {
      name: /Puerto remoto B.*Coincidencia por nota pública: Nota remota B/i,
    }),
  ).toBeVisible();

  await searchbox.fill('alias remoto b');
  const aliasResult = results.getByRole('button', {
    name: /Puerto remoto B.*Coincidencia por alias: Alias remoto B/i,
  });
  await expect(aliasResult).toBeVisible();

  const remoteTag = page.getByRole('checkbox', { name: /Revisión remota/ });
  await expect(remoteTag).toBeVisible();
  await remoteTag.check();
  expect(currentSearchParams(page).getAll('tag')).toEqual(['remote-revision']);
  expect(currentSearchParams(page).get('q')).toBe('alias remoto b');

  await aliasResult.click();
  await expect(page.getByTestId('place-details')).toContainText('Puerto remoto B');
  expect(currentSearchParams(page).get('place')).toBe('puerto-de-demostracion');

  remoteRows = createArchivedRemoteRevision();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await expect(backendStatus).toHaveAttribute('data-backend-state', 'connected');
  await expect(page.getByRole('button', { name: /Puerto remoto B\. Categoría:/ })).toHaveCount(0);
  await expect(page.getByTestId('place-marker')).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: /Revisión remota/ })).toHaveCount(0);
  await expect(page.locator('[data-place-search-status]')).toContainText('No hay lugares');
  await expect(page.getByTestId('place-details')).toBeHidden();
  expect(currentSearchParams(page).get('place')).toBeNull();
  expect(currentSearchParams(page).getAll('tag')).toEqual([]);
  expect(currentSearchParams(page).get('q')).toBe('alias remoto b');
});

const invalidSnapshotCases = [
  {
    name: '404',
    fulfill: async (route: Route): Promise<void> => {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    },
  },
  {
    name: 'JSON corrupto',
    fulfill: async (route: Route): Promise<void> => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{' });
    },
  },
  {
    name: 'checksum incorrecto',
    fulfill: async (route: Route): Promise<void> => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...bundledSnapshot,
          checksum: `sha256:${'0'.repeat(64)}`,
        }),
      });
    },
  },
] as const;

for (const invalidSnapshot of invalidSnapshotCases) {
  test(`keeps a recoverable shell for snapshot ${invalidSnapshot.name} and recovers from Supabase on retry`, async ({
    page,
  }) => {
    let remoteAvailable = false;
    const remoteRows = createFixtureRemoteRows();

    await mockOfficialMap(page);
    await page.route('**/data/public-catalog.snapshot.json', invalidSnapshot.fulfill);
    await configureBackend(page, () => (remoteAvailable ? remoteRows : null));
    await page.goto('/');

    await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
    await expect(page.getByTestId('place-marker')).toHaveCount(0);

    const backendStatus = page.locator('[data-backend-status]');
    await expect(backendStatus).toHaveAttribute('role', 'alert');
    await expect(backendStatus).toHaveAttribute('data-backend-state', 'degraded');
    await expect(backendStatus).toHaveAttribute('data-data-source', 'none');
    await expect(backendStatus).toContainText('No se pudo cargar el contenido público');

    const retry = backendStatus.getByRole('button', { name: 'Reintentar' });
    await expect(retry).toBeVisible();

    remoteAvailable = true;
    await retry.click();

    await expect(backendStatus).toHaveAttribute('data-backend-state', 'connected');
    await expect(backendStatus).toHaveAttribute('data-data-source', 'supabase');
    await expect(page.getByTestId('place-marker')).toHaveCount(2);
    await expect(
      page.getByRole('button', { name: 'Puerto de demostración. Categoría: Asentamiento.' }),
    ).toBeVisible();
  });
}
