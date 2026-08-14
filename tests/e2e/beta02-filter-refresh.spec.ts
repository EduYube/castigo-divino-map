import { readFileSync } from 'node:fs';

import { expect, test, type Page, type Route } from '@playwright/test';

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
  if (!Array.isArray(value)) throw new Error('Expected fixture rows.');

  return value.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error('Expected fixture row object.');
    }

    const row = entry as PublicRow;
    return Object.fromEntries(fields.map((field) => [field, row[field]]));
  });
}

function createBaseRemoteRows(): PublicRows {
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

function createMap050RemoteRows(): PublicRows {
  const rows = createBaseRemoteRows();

  rows.categories.push({
    id: 'category-map050-character',
    slug: 'personajes-map050',
    name: 'Personajes MAP-050',
    description: 'Categoría publicada después del arranque.',
  });
  rows.tags.push({
    id: 'map050-dynamic',
    name: 'Dinámico MAP-050',
    description: 'Etiqueta publicada después del arranque.',
  });
  rows.map_entities.push(
    {
      id: 'entity-map050-pin',
      slug: 'vigia-map050',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Vigía MAP-050',
      name_language: 'en',
      summary: 'Personaje público con pin.',
      description: 'Fixture MAP-050.',
      x: 1500,
      y: 1500,
      category_id: 'category-map050-character',
    },
    {
      id: 'entity-map050-search-only',
      slug: 'archivista-map050',
      entity_type: 'character',
      visibility: 'search_only',
      name: 'Archivista MAP-050',
      name_language: 'en',
      summary: 'Personaje público solo de búsqueda.',
      description: 'Fixture MAP-050 search_only.',
      x: 1560,
      y: 1500,
      category_id: 'category-map050-character',
    },
  );
  rows.entity_tags.push(
    { entity_id: 'entity-map050-pin', tag_id: 'map050-dynamic' },
    { entity_id: 'entity-map050-search-only', tag_id: 'map050-dynamic' },
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
      publishableKey: 'sb_publishable_map050_filter_refresh_key',
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

test('adds, restores and revokes Beta 0.2 facets dynamically without exposing stale URL state', async ({
  page,
}) => {
  let remoteRows: PublicRows | null = null;

  await mockOfficialMap(page);
  await configureBackend(page, () => remoteRows);
  await page.goto('/');

  const backendStatus = page.locator('[data-backend-status]');
  await expect(backendStatus).toHaveAttribute('data-backend-state', 'degraded');
  await expect(page.getByRole('checkbox', { name: /Personajes MAP-050/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Dinámico MAP-050/ })).toHaveCount(0);

  remoteRows = createMap050RemoteRows();
  await backendStatus.getByRole('button', { name: 'Reintentar' }).click();

  await expect(backendStatus).toHaveAttribute('data-backend-state', 'connected');
  const category = page.getByRole('checkbox', { name: /Personajes MAP-050/ });
  const tag = page.getByRole('checkbox', { name: /Dinámico MAP-050/ });
  await expect(category).toBeVisible();
  await expect(tag).toBeVisible();
  await expect(category).toHaveAttribute('aria-describedby', /place-filter-category/);
  await expect(tag).toHaveAttribute('aria-describedby', /place-filter-tag/);
  await expect(category.locator('xpath=..')).toContainText('2 resultados');
  await expect(tag.locator('xpath=..')).toContainText('2 resultados');

  await category.check();
  await tag.check();

  const pin = page.locator('[data-testid="entity-pin"][data-entity-id="entity-map050-pin"]');
  await expect(pin).toHaveAttribute('data-filter-match', 'true');
  await expect(page.locator('[data-place-filters-status]')).toHaveText(
    '2 resultados coinciden con la búsqueda y los filtros actuales.',
  );
  await expect
    .poll(() => new URL(page.url()).searchParams.get('category'))
    .toBe('personajes-map050');
  await expect.poll(() => new URL(page.url()).searchParams.get('tag')).toBe('map050-dynamic');

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await searchbox.fill('Archivista MAP-050');
  await expect(page.locator('[data-place-filters-status]')).toHaveText(
    '1 resultado coincide con la búsqueda y los filtros actuales.',
  );
  await expect(page.locator('[data-search-result-id="entity-map050-search-only"]')).toBeVisible();
  await expect(page.locator('[data-testid="entity-pin"][data-filter-match="true"]')).toHaveCount(0);

  await page.reload();
  await expect(backendStatus).toHaveAttribute('data-backend-state', 'connected');
  await expect(page.getByRole('checkbox', { name: /Personajes MAP-050/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Dinámico MAP-050/ })).toBeChecked();
  await expect(searchbox).toHaveValue('Archivista MAP-050');
  await expect(page.locator('[data-search-result-id="entity-map050-search-only"]')).toBeVisible();

  remoteRows = createBaseRemoteRows();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await expect(page.getByRole('checkbox', { name: /Personajes MAP-050/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Dinámico MAP-050/ })).toHaveCount(0);
  await expect(page.locator('[data-search-result-id="entity-map050-search-only"]')).toHaveCount(0);
  await expect(page.locator('[data-place-filters-status]')).toContainText(
    'Se han retirado 2 filtros que ya no están disponibles en el catálogo público.',
  );
  await expect.poll(() => new URL(page.url()).searchParams.get('category')).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.get('tag')).toBeNull();
});
