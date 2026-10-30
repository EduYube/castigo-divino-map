import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createSha256Checksum } from '../../src/data-access/publicCatalog';

const canonical = new URL('../../public/data/public-catalog.snapshot.json', import.meta.url);
const officialMap =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329"><rect width="3600" height="2329" fill="#ccc"/></svg>';

// Synthetic fixture mirrors JSON parsed at runtime, not a public schema boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

async function offlineV4(page: import('@playwright/test').Page, synthetic = false) {
  const snapshot = JSON.parse(await readFile(canonical, 'utf8')) as Loose;
  if (synthetic) {
    const local = (snapshot.campaignLocalMaps as Loose[]).find(
      (m) => m.geographicMapContextLinks.length > 0,
    )!;
    const world = (snapshot.campaignCatalogs as Loose[]).find(
      (m) => m.campaignId === local.campaignId,
    )!;
    const cat = world.categories[0].id;
    const makeEntity = (id: string, name: string, coordinates: Loose, geometry?: Loose) => ({
      id,
      slug: id.replace(/^(entity|place)-/, ''),
      entityType: geometry ? 'location' : 'character',
      lifecycleStatus: null,
      visibility: 'pin',
      name,
      nameLanguage: 'en',
      summary: 'Public synthetic local fixture',
      description: 'Synthetic local full details',
      portraitPath: null,
      categoryId: cat,
      aliases: [],
      tagIds: [],
      coordinates,
      ...(geometry ? { geometry } : {}),
    });
    const point = { kind: 'point', coordinates: { x: 250, y: 190 } };
    const vertices = [
      { x: 330, y: 330 },
      { x: 420, y: 330 },
      { x: 420, y: 420 },
      { x: 330, y: 420 },
    ];
    const polygon = { kind: 'polygon', vertices };
    local.placements = [
      {
        contextId: 'map-neverwinter',
        entityId: 'entity-map080-synthetic',
        geometry: point,
        coordinates: { x: 250, y: 190 },
      },
      {
        contextId: 'map-neverwinter',
        entityId: 'place-map080-polygon',
        geometry: polygon,
        coordinates: { x: 375, y: 375 },
      },
    ];
    local.localOnlyEntities = [
      makeEntity('entity-map080-synthetic', 'MAP080 Synthetic Local', { x: 250, y: 190 }),
      makeEntity('place-map080-polygon', 'MAP080 Synthetic Polygon', { x: 375, y: 375 }, polygon),
    ];
    const { generatedAt: _at, sourceRevision: _sr, checksum: _sha, ...content } = snapshot;
    void _at;
    void _sr;
    void _sha;
    const sum = await createSha256Checksum(content);
    snapshot.sourceRevision = sum;
    snapshot.checksum = sum;
  }
  await page.addInitScript(() => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl: 'http://127.0.0.1:4173',
      publishableKey: 'sb_publishable_map080_degraded_test_key',
      timeoutMs: 250,
      retryDelaysMs: [0],
    };
  });
  await page.route(officialMap, async (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG }),
  );
  await page.route('**/data/public-catalog.snapshot.json', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) }),
  );
  await page.route('**/rest/v1/**', async (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
}

test('MAP-080 degraded canonical V4 preserves Neverwinter and denies cross-campaign direct link', async ({
  page,
}) => {
  await offlineV4(page);
  await page.goto('/?campaign=un-aliento-menos&map=neverwinter');
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  await expect(page.locator('[data-local-map-status]')).toContainText('Cartografía pendiente');
  await page.getByRole('button', { name: 'Mapa general' }).click();
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await page.goBack();
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  await page.goto('/?campaign=castigo-divino&map=neverwinter');
  await expect(page.locator('[data-local-map-canvas]')).toBeHidden();
  await expect(page).not.toHaveURL(/map=neverwinter/);
});

test('MAP-080 degraded synthetic V4 searches local-only point and polygon without world leakage', async ({
  page,
}) => {
  await offlineV4(page, true);
  await page.goto('/?campaign=un-aliento-menos');
  const search = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await search.fill('MAP080 Synthetic Local');
  const result = page.locator('[data-search-result-id="entity-map080-synthetic"]');
  await expect(result).toBeVisible();
  await expect(result).toContainText('Mapa local: Neverwinter');
  await result.click();
  await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
  await expect(
    page.locator('[data-local-map-canvas] [data-entity-id="entity-map080-synthetic"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-local-map-canvas] [data-region-id="place-map080-polygon"]'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Mapa general' }).click();
  await expect(
    page.locator('[data-map-canvas] [data-entity-id="entity-map080-synthetic"]'),
  ).toHaveCount(0);
  await page.goto('/?campaign=un-aliento-menos&entity=map080-synthetic');
  await expect(page.locator('[data-full-entity-title]')).toHaveText('MAP080 Synthetic Local');
  await expect(page.locator('[data-full-entity-body]')).toContainText(
    'Synthetic local full details',
  );
});

for (const width of [320, 390, 430, 1280]) {
  test(`MAP-080 offline V4 responsive at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 820 });
    await offlineV4(page);
    await page.goto('/?campaign=un-aliento-menos&map=neverwinter');
    await expect(page.locator('[data-local-map-canvas]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}
