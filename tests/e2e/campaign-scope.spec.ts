import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const CAMPAIGN_A_ID = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B_ID = '00000000-0000-4000-8000-000000000054';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

function contentRange(rows: readonly unknown[]): string {
  return rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;
}

function campaignIdFromUrl(url: URL): string {
  return url.searchParams.get('campaign_id')?.replace(/^eq\./, '') ?? CAMPAIGN_A_ID;
}

function campaignRows(table: string, campaignId: string): readonly Record<string, unknown>[] {
  const isB = campaignId === CAMPAIGN_B_ID;
  const suffix = isB ? 'b' : 'a';

  switch (table) {
    case 'categories':
      return [
        {
          id: `category-shared-${suffix}`,
          slug: `shared-${suffix}`,
          name: 'Categoría Compartida',
          description: `Mismo nombre, identidad exclusiva de ${suffix.toUpperCase()}.`,
        },
        {
          id: `category-only-${suffix}`,
          slug: `only-${suffix}`,
          name: `Categoría Solo ${suffix.toUpperCase()}`,
          description: `Categoría exclusiva de ${suffix.toUpperCase()}.`,
        },
      ];
    case 'tags':
      return [
        {
          id: `tag-shared-${suffix}`,
          name: 'Etiqueta Compartida',
          description: `Mismo nombre, tag exclusivo de ${suffix.toUpperCase()}.`,
        },
        {
          id: `tag-only-${suffix}`,
          name: `Etiqueta Solo ${suffix.toUpperCase()}`,
          description: `Tag exclusivo de ${suffix.toUpperCase()}.`,
        },
      ];
    case 'map_entities':
      return [
        {
          id: `place-shared-${suffix}`,
          slug: `shared-place-${suffix}`,
          entity_type: 'location',
          visibility: 'pin',
          name: `Lugar Compartido ${suffix.toUpperCase()}`,
          name_language: 'en',
          summary: `Entidad de categoría con nombre compartido ${suffix.toUpperCase()}.`,
          description: `Fixture compartida ${suffix.toUpperCase()}.`,
          portrait_path: null,
          x: isB ? 2450 : 850,
          y: isB ? 1450 : 650,
          category_id: `category-shared-${suffix}`,
        },
        {
          id: `place-only-${suffix}`,
          slug: `only-place-${suffix}`,
          entity_type: 'location',
          visibility: 'pin',
          name: `Lugar Solo ${suffix.toUpperCase()}`,
          name_language: 'en',
          summary: `Entidad exclusiva ${suffix.toUpperCase()}.`,
          description: `Fixture exclusiva ${suffix.toUpperCase()}.`,
          portrait_path: null,
          x: isB ? 2200 : 1100,
          y: isB ? 1200 : 900,
          category_id: `category-only-${suffix}`,
        },
      ];
    case 'entity_tags':
      return [
        { entity_id: `place-shared-${suffix}`, tag_id: `tag-shared-${suffix}` },
        { entity_id: `place-only-${suffix}`, tag_id: `tag-only-${suffix}` },
      ];
    default:
      return [];
  }
}

const GLOBAL_GEOGRAPHIC_NAMES = [
  {
    id: 'geo-global-map055',
    slug: 'costa-global-map055',
    name: 'Costa Global MAP055',
    language: 'en',
    x: 1600,
    y: 1100,
    recommended_zoom: 0.75,
    entity_id: null,
    search_min_x: null,
    search_max_x: null,
    search_min_y: null,
    search_max_y: null,
  },
];

const GLOBAL_GEOGRAPHIC_ALIASES = [
  {
    id: 'geo-alias-global-map055-es',
    geographic_name_id: 'geo-global-map055',
    language: 'es',
    value: 'Geografía Compartida MAP055',
  },
];

async function configureBackend(page: Page): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map055_scope_key',
      timeoutMs: 2000,
      retryDelaysMs: [0, 0, 0],
    };
  }, LOCAL_SUPABASE_URL);

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await page.route('**/rest/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const resource = url.pathname.split('/rest/v1/')[1] ?? '';
    const table = resource.split('?')[0] ?? '';
    const rows =
      table === 'campaigns'
        ? [
            {
              id: CAMPAIGN_A_ID,
              slug: 'castigo-divino',
              name: 'Castigo Divino',
              status: 'active',
              display_order: 0,
            },
            {
              id: CAMPAIGN_B_ID,
              slug: 'campaign-b',
              name: 'Campaña B',
              status: 'active',
              display_order: 1,
            },
          ]
        : table === 'geographic_names'
          ? GLOBAL_GEOGRAPHIC_NAMES
          : table === 'geographic_name_aliases'
            ? GLOBAL_GEOGRAPHIC_ALIASES
            : campaignRows(table, campaignIdFromUrl(url));

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange(rows) },
      body: JSON.stringify(rows),
    });
  });
}

function category(page: Page, id: string) {
  return page.locator(`input[data-place-filter-kind="category"][data-place-filter-id="${id}"]`);
}

function tag(page: Page, id: string) {
  return page.locator(`input[data-place-filter-kind="tag"][data-place-filter-id="${id}"]`);
}

test('campaign switch removes invalid category/tag selections and never mixes same-name facets', async ({
  page,
}) => {
  await configureBackend(page);
  await page.goto('/');

  const selector = page.getByLabel('Campaña', { exact: true });
  const onlyA = category(page, 'category-only-a');
  const tagOnlyA = tag(page, 'tag-only-a');
  await expect(category(page, 'category-shared-a').locator('xpath=..')).toContainText(
    '1 resultado',
  );
  await expect(tag(page, 'tag-shared-a').locator('xpath=..')).toContainText('1 resultado');
  await onlyA.check();
  await tagOnlyA.check();
  await expect.poll(() => new URL(page.url()).searchParams.get('category')).toBe('only-a');
  await expect.poll(() => new URL(page.url()).searchParams.get('tag')).toBe('tag-only-a');
  await expect(
    page.locator('[data-testid="entity-pin"][data-entity-id="place-only-a"]'),
  ).toHaveAttribute('data-filter-match', 'true');

  await selector.selectOption('campaign-b');

  await expect(selector).toHaveValue('campaign-b');
  await expect(category(page, 'category-only-a')).toHaveCount(0);
  await expect(tag(page, 'tag-only-a')).toHaveCount(0);
  await expect(category(page, 'category-shared-a')).toHaveCount(0);
  await expect(tag(page, 'tag-shared-a')).toHaveCount(0);
  await expect(category(page, 'category-shared-b').locator('xpath=..')).toContainText(
    '1 resultado',
  );
  await expect(tag(page, 'tag-shared-b').locator('xpath=..')).toContainText('1 resultado');
  await expect.poll(() => new URL(page.url()).searchParams.get('category')).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.get('tag')).toBeNull();
  await expect(page.locator('[data-place-filters-status]')).toContainText(
    'Se han retirado 2 filtros que ya no están disponibles',
  );
  await expect(page.locator('[data-testid="entity-pin"][data-entity-id$="-a"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="entity-pin"][data-entity-id$="-b"]')).toHaveCount(2);

  await category(page, 'category-shared-b').check();
  await tag(page, 'tag-shared-b').check();
  await expect(
    page.locator('[data-testid="entity-pin"][data-entity-id="place-shared-b"]'),
  ).toHaveAttribute('data-filter-match', 'true');
  await expect(
    page.locator('[data-testid="entity-pin"][data-entity-id="place-only-b"]'),
  ).toHaveAttribute('data-filter-match', 'false');
});

test('global geographic names and aliases remain searchable across A and B', async ({ page }) => {
  await configureBackend(page);
  await page.goto('/');

  const selector = page.getByLabel('Campaña', { exact: true });
  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await searchbox.fill('Geografía Compartida MAP055');
  await searchbox.press('Escape');
  const results = page.getByRole('list', { name: 'Resultados de búsqueda de lugares' });
  await expect(
    results.getByRole('button', { name: /Costa Global MAP055.*Lugar geográfico/i }),
  ).toBeVisible();

  await selector.selectOption('campaign-b');

  await expect(selector).toHaveValue('campaign-b');
  await expect(searchbox).toHaveValue('Geografía Compartida MAP055');
  await searchbox.fill('');
  await searchbox.fill('Geografía Compartida MAP055');
  await searchbox.press('Escape');
  const globalResult = results.getByRole('button', {
    name: /Costa Global MAP055.*Lugar geográfico/i,
  });
  await expect(globalResult).toBeVisible();
  await globalResult.click();
  await expect(page).toHaveURL(/campaign=campaign-b/);
  await expect(page).toHaveURL(/geo=geo-global-map055/);
  await expect(page.locator('[data-testid="entity-pin"][data-entity-id$="-a"]')).toHaveCount(0);
});
