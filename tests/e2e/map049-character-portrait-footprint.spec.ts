import { readFileSync } from 'node:fs';

import { expect, test, type Locator, type Page, type Route, type TestInfo } from '@playwright/test';

import { PUBLIC_CATALOG_TABLE_QUERIES } from '../../src/data-access/publicCatalogQueryContract.js';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const PUBLIC_KEY = 'sb_publishable_map049_portrait_footprint_key';
const STANDARD_CHARACTER_ID = 'entity-map049-standard-character';
const PORTRAIT_CHARACTER_ID = 'entity-map049-portrait-character';
const PLAYER_ID = 'player-map049';
const PORTRAIT_PATH = 'portraits/49e4567-e89b-42d3-a456-426614174049.png';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;
const FIXTURE = JSON.parse(
  readFileSync(new URL('../../scripts/fixtures/beta01-public-rows.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;
const FIXTURE_KEYS_BY_TABLE: Readonly<Record<string, string>> = {
  categories: 'categories',
  tags: 'tags',
  players: 'players',
  map_entities: 'entities',
  entity_aliases: 'entityAliases',
  entity_tags: 'entityTags',
  entity_player_dispositions: 'dispositions',
  character_location_relations: 'characterLocationRelations',
  public_notes: 'notes',
  public_note_tags: 'noteTags',
  geographic_names: 'geographicNames',
  geographic_name_aliases: 'geographicAliases',
  character_location_events: 'locationEvents',
};

interface PortraitSource {
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

interface RectSnapshot {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
}

interface MarkerGeometry {
  readonly marker: RectSnapshot;
  readonly visual: RectSnapshot;
  readonly image: RectSnapshot | null;
  readonly dispositions: RectSnapshot | null;
  readonly visualWidth: string;
  readonly visualHeight: string;
  readonly visualOverflow: string;
  readonly visualTransform: string;
  readonly imageObjectFit: string | null;
  readonly imageClipPath: string | null;
  readonly imageNaturalWidth: number | null;
  readonly imageNaturalHeight: number | null;
}

function contentRange(rows: readonly unknown[]): string {
  return rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;
}

function portraitSvg({ width, height, label }: PortraitSource): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#c5ad78" />
    <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 3}" fill="#283b33" />
    <title>${label}</title>
  </svg>`;
}

async function configureBackend(page: Page, source: PortraitSource): Promise<void> {
  const standardCharacter = {
    id: STANDARD_CHARACTER_ID,
    slug: 'map049-standard-character',
    entity_type: 'character',
    visibility: 'pin',
    name: 'MAP049 Standard Character',
    name_language: 'en',
    summary: 'Standard character used as geometric control.',
    description: '',
    portrait_path: null,
    x: 1700,
    y: 1100,
    category_id: 'category-landmark',
    publication_status: 'published',
  };
  const portraitCharacter = {
    ...standardCharacter,
    id: PORTRAIT_CHARACTER_ID,
    slug: 'map049-portrait-character',
    name: 'MAP049 Portrait Character',
    portrait_path: PORTRAIT_PATH,
    x: 1800,
  };
  const player = {
    id: PLAYER_ID,
    slug: 'map049-player',
    display_name: 'MAP049 Player',
    name_language: 'en',
    publication_status: 'published',
  };
  const dispositions = [
    { entity_id: STANDARD_CHARACTER_ID, player_id: PLAYER_ID, disposition: 'ally' },
    { entity_id: PORTRAIT_CHARACTER_ID, player_id: PLAYER_ID, disposition: 'ally' },
  ];

  await page.addInitScript(
    ({ projectUrl, publishableKey }) => {
      window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        timeoutMs: 2_000,
        retryDelaysMs: [0, 0, 0],
      };
    },
    { projectUrl: PROJECT_URL, publishableKey: PUBLIC_KEY },
  );

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await page.route('**/rest/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const resource = url.pathname.split('/rest/v1/')[1] ?? '';
    if (resource.startsWith('rpc/')) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      return;
    }

    const table = resource.split('?')[0] ?? '';
    const query = Object.values(PUBLIC_CATALOG_TABLE_QUERIES).find(({ name }) => name === table);
    const fixtureKey = FIXTURE_KEYS_BY_TABLE[table];
    const raw =
      fixtureKey && Array.isArray(FIXTURE[fixtureKey])
        ? [...(FIXTURE[fixtureKey] as Record<string, unknown>[])]
        : [];

    if (table === 'map_entities') raw.push(standardCharacter, portraitCharacter);
    if (table === 'players') raw.push(player);
    if (table === 'entity_player_dispositions') raw.push(...dispositions);

    const rows = query
      ? raw.map((entry) =>
          Object.fromEntries(query.select.split(',').map((field) => [field, entry[field]])),
        )
      : [];

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange(rows) },
      body: JSON.stringify(rows),
    });
  });

  await page.route('**/storage/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const authorized = request.headers()['authorization'] === `Bearer ${PUBLIC_KEY}`;
    const requestedPortrait = url.pathname.endsWith(`/character-portraits/${PORTRAIT_PATH}`);

    if (!authorized || !requestedPortrait) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: portraitSvg(source),
    });
  });
}

function marker(page: Page, entityId: string): Locator {
  return page.locator(`.campaign-marker-icon[data-entity-id="${entityId}"]`);
}

async function geometry(target: Locator): Promise<MarkerGeometry> {
  return target.evaluate((element) => {
    const visual = element.querySelector<HTMLElement>('.pin-visual');
    if (!visual) throw new Error('Missing .pin-visual');
    const image = visual.querySelector<HTMLImageElement>('.pin-visual__portrait');
    const dispositions = visual.querySelector<HTMLElement>('.pin-visual__dispositions');
    const visualStyle = getComputedStyle(visual);
    const imageStyle = image ? getComputedStyle(image) : null;
    const rect = (value: DOMRect): RectSnapshot => ({
      x: value.x,
      y: value.y,
      width: value.width,
      height: value.height,
      right: value.right,
      bottom: value.bottom,
    });

    return {
      marker: rect(element.getBoundingClientRect()),
      visual: rect(visual.getBoundingClientRect()),
      image: image ? rect(image.getBoundingClientRect()) : null,
      dispositions: dispositions ? rect(dispositions.getBoundingClientRect()) : null,
      visualWidth: visualStyle.width,
      visualHeight: visualStyle.height,
      visualOverflow: visualStyle.overflow,
      visualTransform: visualStyle.transform,
      imageObjectFit: imageStyle?.objectFit ?? null,
      imageClipPath: imageStyle?.clipPath ?? null,
      imageNaturalWidth: image?.naturalWidth ?? null,
      imageNaturalHeight: image?.naturalHeight ?? null,
    };
  });
}

function expectNearlyEqual(actual: number, expected: number, tolerance = 0.5): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function expectSameFootprint(actual: MarkerGeometry, expected: MarkerGeometry): void {
  expectNearlyEqual(actual.visual.width, expected.visual.width);
  expectNearlyEqual(actual.visual.height, expected.visual.height);
  expect(actual.visualWidth).toBe(expected.visualWidth);
  expect(actual.visualHeight).toBe(expected.visualHeight);
  expectNearlyEqual(actual.marker.width, 52);
  expectNearlyEqual(actual.marker.height, 52);
  expectNearlyEqual(expected.marker.width, 52);
  expectNearlyEqual(expected.marker.height, 52);
}

function expectCentered(geometrySnapshot: MarkerGeometry): void {
  const markerCenterX = geometrySnapshot.marker.x + geometrySnapshot.marker.width / 2;
  const markerCenterY = geometrySnapshot.marker.y + geometrySnapshot.marker.height / 2;
  const visualCenterX = geometrySnapshot.visual.x + geometrySnapshot.visual.width / 2;
  const visualCenterY = geometrySnapshot.visual.y + geometrySnapshot.visual.height / 2;
  expectNearlyEqual(visualCenterX, markerCenterX, 0.75);
  expectNearlyEqual(visualCenterY, markerCenterY, 0.75);
}

async function loadVisiblePortrait(page: Page): Promise<void> {
  const portraitMarker = marker(page, PORTRAIT_CHARACTER_ID);
  await expect(portraitMarker).not.toHaveAttribute('data-portrait-marker', 'true');
  await page.getByRole('link', { name: 'Acercar' }).click();
  await expect(portraitMarker).toHaveAttribute('data-portrait-marker', 'true');
  await expect(portraitMarker.locator('.pin-visual__portrait')).toBeVisible();
}

async function attachMapReference(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  await testInfo.attach(`MAP-049-${label}`, {
    body: await page.getByTestId('map-shell').screenshot(),
    contentType: 'image/png',
  });
}

const SQUARE_SOURCE: PortraitSource = { width: 96, height: 96, label: 'square' };

test('portrait lazy-load keeps the standard character footprint, target and center', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await configureBackend(page, SQUARE_SOURCE);
  await page.goto('/');

  const standardMarker = marker(page, STANDARD_CHARACTER_ID);
  const portraitMarker = marker(page, PORTRAIT_CHARACTER_ID);
  await expect(standardMarker).toHaveCount(1);
  await expect(portraitMarker).toHaveCount(1);

  const before = await geometry(portraitMarker);
  const standardBefore = await geometry(standardMarker);
  expectSameFootprint(before, standardBefore);
  expectCentered(before);

  await loadVisiblePortrait(page);

  const after = await geometry(portraitMarker);
  const standardAfter = await geometry(standardMarker);
  expectSameFootprint(after, standardAfter);
  expectSameFootprint(after, before);
  expectCentered(after);
  expect(after.visualOverflow).toBe('visible');
  expect(after.imageObjectFit).toBe('cover');
  expect(after.imageClipPath).not.toBe('none');
  expect(after.image).not.toBeNull();
  expect(after.dispositions).not.toBeNull();

  const image = after.image!;
  expect(image.left ?? image.x).toBeGreaterThanOrEqual(after.visual.x - 0.5);
  expect(image.right).toBeLessThanOrEqual(after.visual.right + 0.5);
  expect(image.y).toBeGreaterThanOrEqual(after.visual.y - 0.5);
  expect(image.bottom).toBeLessThanOrEqual(after.visual.bottom + 0.5);

  await attachMapReference(page, testInfo, 'desktop-footprint');
});

for (const source of [
  { width: 96, height: 160, label: 'vertical' },
  { width: 160, height: 96, label: 'horizontal' },
  SQUARE_SOURCE,
] as const) {
  test(`portrait ${source.label} is covered and clipped without changing marker geometry`, async ({ page }) => {
    await configureBackend(page, source);
    await page.goto('/');
    await loadVisiblePortrait(page);

    const portraitGeometry = await geometry(marker(page, PORTRAIT_CHARACTER_ID));
    const standardGeometry = await geometry(marker(page, STANDARD_CHARACTER_ID));
    expectSameFootprint(portraitGeometry, standardGeometry);
    expect(portraitGeometry.imageObjectFit).toBe('cover');
    expect(portraitGeometry.imageClipPath).not.toBe('none');
    expect(portraitGeometry.imageNaturalWidth).toBe(source.width);
    expect(portraitGeometry.imageNaturalHeight).toBe(source.height);
    expectNearlyEqual(portraitGeometry.image!.width, portraitGeometry.image!.height);
  });
}

test('portrait footprint remains stable through responsive reflow and interactive states', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await configureBackend(page, SQUARE_SOURCE);
  await page.goto('/');
  await loadVisiblePortrait(page);

  const portraitMarker = marker(page, PORTRAIT_CHARACTER_ID);
  const standardMarker = marker(page, STANDARD_CHARACTER_ID);

  for (const viewport of [
    { width: 1280, height: 800, label: 'desktop' },
    { width: 320, height: 740, label: '320x740' },
    { width: 390, height: 844, label: '390x844' },
    { width: 430, height: 932, label: '430x932' },
  ] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect.poll(async () => (await geometry(portraitMarker)).marker.width).toBeCloseTo(52, 0);
    expectSameFootprint(await geometry(portraitMarker), await geometry(standardMarker));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await attachMapReference(page, testInfo, viewport.label);
  }

  await portraitMarker.hover();
  const portraitHover = await geometry(portraitMarker);
  await standardMarker.hover();
  const standardHover = await geometry(standardMarker);
  expectSameFootprint(portraitHover, standardHover);

  await portraitMarker.focus();
  const portraitFocus = await geometry(portraitMarker);
  await standardMarker.focus();
  const standardFocus = await geometry(standardMarker);
  expectSameFootprint(portraitFocus, standardFocus);

  await portraitMarker.click();
  const portraitActive = await geometry(portraitMarker);
  await standardMarker.click();
  const standardActive = await geometry(standardMarker);
  expectSameFootprint(portraitActive, standardActive);
});

test('forced-colors keeps portrait and standard character on the same outer footprint', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await configureBackend(page, SQUARE_SOURCE);
  await page.goto('/');
  await loadVisiblePortrait(page);

  const portraitGeometry = await geometry(marker(page, PORTRAIT_CHARACTER_ID));
  const standardGeometry = await geometry(marker(page, STANDARD_CHARACTER_ID));
  expectSameFootprint(portraitGeometry, standardGeometry);
  expect(portraitGeometry.imageClipPath).not.toBe('none');
});
