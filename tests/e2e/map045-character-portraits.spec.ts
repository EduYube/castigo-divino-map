import { readFileSync } from 'node:fs';

import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

import { PUBLIC_CATALOG_TABLE_QUERIES } from '../../src/data-access/publicCatalogQueryContract.js';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const PUBLIC_KEY = 'sb_publishable_map045_public_portraits_key';
const CHARACTER_ID = 'entity-map045-portrait';
const STANDARD_CHARACTER_ID = 'entity-map049-standard-character';
const PORTRAIT_PATH = 'portraits/123e4567-e89b-42d3-a456-426614174000.png';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
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

interface PortraitBackend {
  setPortrait(path: string | null): void;
  failImages(value: boolean): void;
  markerRequests(): readonly string[];
  detailRequests(): readonly string[];
  authorizationHeaders(): readonly string[];
}

interface PortraitImageSource {
  readonly body: Buffer | string;
  readonly contentType: string;
}

interface MarkerGeometry {
  readonly markerWidth: number;
  readonly markerHeight: number;
  readonly visualWidth: number;
  readonly visualHeight: number;
  readonly visualCssWidth: string;
  readonly visualCssHeight: string;
  readonly centerOffsetX: number;
  readonly centerOffsetY: number;
  readonly imageObjectFit: string | null;
  readonly imageClipPath: string | null;
  readonly imageNaturalWidth: number | null;
  readonly imageNaturalHeight: number | null;
  readonly imageWithinVisual: boolean | null;
}

const DEFAULT_IMAGE_SOURCE: PortraitImageSource = {
  body: PNG,
  contentType: 'image/png',
};

function contentRange(rows: readonly unknown[]): string {
  return rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;
}

function portraitSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#c5ad78" />
  </svg>`;
}

async function configureBackend(
  page: Page,
  initialPortrait: string | null,
  imageSource: PortraitImageSource = DEFAULT_IMAGE_SOURCE,
): Promise<PortraitBackend> {
  let portraitPath = initialPortrait;
  let shouldFailImages = false;
  const markerRequestUrls: string[] = [];
  const detailRequestUrls: string[] = [];
  const authorizationHeaders: string[] = [];

  const character = (): Record<string, unknown> => ({
    id: CHARACTER_ID,
    slug: 'map045-portrait-character',
    entity_type: 'character',
    visibility: 'pin',
    name: 'MAP045 Portrait Character',
    name_language: 'en',
    summary: 'Portrait E2E summary',
    description: 'Portrait E2E description',
    portrait_path: portraitPath,
    x: 1700,
    y: 1100,
    category_id: 'category-landmark',
    publication_status: 'published',
  });
  const standardCharacter = (): Record<string, unknown> => ({
    ...character(),
    id: STANDARD_CHARACTER_ID,
    slug: 'map049-standard-character',
    name: 'MAP049 Standard Character',
    portrait_path: null,
    x: 1820,
  });

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
    const request = route.request();
    const url = new URL(request.url());
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
    if (table === 'map_entities') raw.push(character(), standardCharacter());
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
    authorizationHeaders.push(request.headers()['authorization'] ?? '');
    const marker = url.pathname.includes('/render/image/authenticated/');
    if (marker) markerRequestUrls.push(url.href);
    else detailRequestUrls.push(url.href);

    if (
      portraitPath !== PORTRAIT_PATH ||
      !url.pathname.endsWith(`/character-portraits/${PORTRAIT_PATH}`) ||
      (request.headers()['authorization'] ?? '') !== `Bearer ${PUBLIC_KEY}` ||
      shouldFailImages
    ) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: imageSource.contentType,
      body: imageSource.body,
    });
  });

  return {
    setPortrait(path): void {
      portraitPath = path;
    },
    failImages(value): void {
      shouldFailImages = value;
    },
    markerRequests: () => markerRequestUrls,
    detailRequests: () => detailRequestUrls,
    authorizationHeaders: () => authorizationHeaders,
  };
}

function characterMarker(page: Page) {
  return page.locator(`.campaign-marker-icon[data-entity-id="${CHARACTER_ID}"]`);
}

function standardCharacterMarker(page: Page) {
  return page.locator(`.campaign-marker-icon[data-entity-id="${STANDARD_CHARACTER_ID}"]`);
}

async function markerGeometry(marker: Locator): Promise<MarkerGeometry> {
  return marker.evaluate((element) => {
    const visual = element.querySelector<HTMLElement>('.pin-visual');
    if (!visual) throw new Error('Missing .pin-visual');
    const image = visual.querySelector<HTMLImageElement>('.pin-visual__portrait');
    const markerRect = element.getBoundingClientRect();
    const visualRect = visual.getBoundingClientRect();
    const visualStyle = getComputedStyle(visual);
    const imageStyle = image ? getComputedStyle(image) : null;
    const imageRect = image?.getBoundingClientRect() ?? null;
    const markerCenterX = markerRect.x + markerRect.width / 2;
    const markerCenterY = markerRect.y + markerRect.height / 2;
    const visualCenterX = visualRect.x + visualRect.width / 2;
    const visualCenterY = visualRect.y + visualRect.height / 2;

    return {
      markerWidth: markerRect.width,
      markerHeight: markerRect.height,
      visualWidth: visualRect.width,
      visualHeight: visualRect.height,
      visualCssWidth: visualStyle.width,
      visualCssHeight: visualStyle.height,
      centerOffsetX: visualCenterX - markerCenterX,
      centerOffsetY: visualCenterY - markerCenterY,
      imageObjectFit: imageStyle?.objectFit ?? null,
      imageClipPath: imageStyle?.clipPath ?? null,
      imageNaturalWidth: image?.naturalWidth ?? null,
      imageNaturalHeight: image?.naturalHeight ?? null,
      imageWithinVisual: imageRect
        ? imageRect.x >= visualRect.x - 0.5 &&
          imageRect.y >= visualRect.y - 0.5 &&
          imageRect.right <= visualRect.right + 0.5 &&
          imageRect.bottom <= visualRect.bottom + 0.5
        : null,
    };
  });
}

function expectSameGeometry(actual: MarkerGeometry, expected: MarkerGeometry): void {
  expect(actual.markerWidth).toBeCloseTo(expected.markerWidth, 1);
  expect(actual.markerHeight).toBeCloseTo(expected.markerHeight, 1);
  expect(actual.visualWidth).toBeCloseTo(expected.visualWidth, 1);
  expect(actual.visualHeight).toBeCloseTo(expected.visualHeight, 1);
  expect(actual.visualCssWidth).toBe(expected.visualCssWidth);
  expect(actual.visualCssHeight).toBe(expected.visualCssHeight);
  expect(actual.centerOffsetX).toBeCloseTo(expected.centerOffsetX, 1);
  expect(actual.centerOffsetY).toBeCloseTo(expected.centerOffsetY, 1);
}

test('NPC without portrait keeps the standard marker and details have no image gap', async ({
  page,
}) => {
  const backend = await configureBackend(page, null);
  await page.goto('/');

  const marker = characterMarker(page);
  await expect(marker).toHaveCount(1);
  await expect(marker).not.toHaveAttribute('data-portrait-marker', 'true');
  await marker.click();
  await expect(page.getByTestId('place-details')).toContainText('MAP045 Portrait Character');
  await expect(page.getByTestId('compact-character-portrait')).toHaveCount(0);
  expect(backend.markerRequests()).toHaveLength(0);
  expect(backend.detailRequests()).toHaveLength(0);
});

test('public portrait is lazy on initial map load, then becomes the selected circular marker and details image', async ({
  page,
}) => {
  const backend = await configureBackend(page, PORTRAIT_PATH);
  await page.goto('/');

  const marker = characterMarker(page);
  await expect(marker).toHaveCount(1);
  await expect(marker).not.toHaveAttribute('data-portrait-marker', 'true');
  expect(backend.markerRequests()).toHaveLength(0);
  expect(backend.detailRequests()).toHaveLength(0);

  await marker.focus();
  await expect(marker).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(marker).toHaveAttribute('data-portrait-marker', 'true');
  await expect(marker.locator('.pin-visual--portrait')).toHaveCount(1);
  expect(backend.markerRequests()).toHaveLength(1);
  expect(backend.markerRequests()[0]).toContain('width=96');
  expect(backend.markerRequests()[0]).toContain('height=96');
  expect(backend.authorizationHeaders()[0]).toBe(`Bearer ${PUBLIC_KEY}`);
  expect((await markerGeometry(marker)).markerWidth).toBeCloseTo(52, 1);

  const compact = page.getByTestId('compact-character-portrait');
  await expect(compact).toBeVisible();
  await expect(compact).toHaveAttribute('alt', 'Retrato de MAP045 Portrait Character');
  expect(backend.detailRequests()).toHaveLength(1);

  const fullHref = await page
    .getByRole('link', { name: /Abrir ficha completa/ })
    .getAttribute('href');
  expect(fullHref).toBeTruthy();
  await page.goto(fullHref!);
  await expect(page.getByTestId('full-character-portrait')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'MAP045 Portrait Character' })).toBeVisible();
});

test('portrait authorization/storage failure degrades to the standard pin and no detail placeholder', async ({
  page,
}) => {
  const backend = await configureBackend(page, PORTRAIT_PATH);
  backend.failImages(true);
  await page.goto('/');

  const marker = characterMarker(page);
  expect(backend.markerRequests()).toHaveLength(0);
  await marker.click();
  await expect.poll(() => backend.markerRequests().length).toBeGreaterThan(0);
  await expect(marker).not.toHaveAttribute('data-portrait-marker', 'true');
  await expect(marker.locator('.pin-visual--character:not(.pin-visual--portrait)')).toHaveCount(1);
  await expect.poll(() => backend.detailRequests().length).toBeGreaterThan(0);
  await expect(page.getByTestId('compact-character-portrait')).toHaveCount(0);
  await expect(page.getByTestId('map-shell')).toBeVisible();
});

for (const source of [
  { width: 96, height: 160, label: 'vertical' },
  { width: 160, height: 96, label: 'horizontal' },
  { width: 96, height: 96, label: 'square' },
] as const) {
  test(`portrait ${source.label} keeps the standard pin footprint`, async ({ page }, testInfo) => {
    const imageSource: PortraitImageSource = {
      body: portraitSvg(source.width, source.height),
      contentType: 'image/svg+xml',
    };
    await configureBackend(page, PORTRAIT_PATH, imageSource);
    await page.goto('/');

    const portraitMarker = characterMarker(page);
    const standardMarker = standardCharacterMarker(page);
    const before = await markerGeometry(portraitMarker);
    const standardBefore = await markerGeometry(standardMarker);
    expectSameGeometry(before, standardBefore);
    expect(before.markerWidth).toBeCloseTo(52, 1);
    expect(before.markerHeight).toBeCloseTo(52, 1);

    await page.getByRole('link', { name: 'Acercar' }).click();
    await expect(portraitMarker).toHaveAttribute('data-portrait-marker', 'true');

    const after = await markerGeometry(portraitMarker);
    const standardAfter = await markerGeometry(standardMarker);
    expectSameGeometry(after, before);
    expectSameGeometry(after, standardAfter);
    expect(after.imageObjectFit).toBe('cover');
    expect(after.imageClipPath).not.toBe('none');
    expect(after.imageNaturalWidth).toBe(source.width);
    expect(after.imageNaturalHeight).toBe(source.height);
    expect(after.imageWithinVisual).toBe(true);

    if (source.label === 'square') {
      await testInfo.attach('MAP-049-portrait-footprint', {
        body: await page.getByTestId('map-shell').screenshot(),
        contentType: 'image/png',
      });
    }
  });
}

test('forced-colors keeps portrait and standard character on the same footprint', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await configureBackend(page, PORTRAIT_PATH);
  await page.goto('/');
  const portraitMarker = characterMarker(page);
  const standardMarker = standardCharacterMarker(page);

  await page.getByRole('link', { name: 'Acercar' }).click();
  await expect(portraitMarker).toHaveAttribute('data-portrait-marker', 'true');
  expectSameGeometry(await markerGeometry(portraitMarker), await markerGeometry(standardMarker));
});

for (const viewport of [
  { width: 1280, height: 800, label: 'desktop' },
  { width: 320, height: 740, label: '320×740' },
  { width: 390, height: 844, label: '390×844' },
  { width: 430, height: 932, label: '430×932' },
] as const) {
  test(`portrait marker/details remain compact and map-first at ${viewport.label}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const backend = await configureBackend(page, PORTRAIT_PATH);
    await page.goto('/');

    const marker = characterMarker(page);
    const standardMarker = standardCharacterMarker(page);
    await expect(marker).not.toHaveAttribute('data-portrait-marker', 'true');
    expect(backend.markerRequests()).toHaveLength(0);
    await marker.click();
    await expect(marker).toHaveAttribute('data-portrait-marker', 'true');
    const portraitGeometry = await markerGeometry(marker);
    const standardGeometry = await markerGeometry(standardMarker);
    expect(portraitGeometry.markerWidth).toBeCloseTo(52, 1);
    expect(portraitGeometry.markerHeight).toBeCloseTo(52, 1);
    expect(portraitGeometry.visualCssWidth).toBe(standardGeometry.visualCssWidth);
    expect(portraitGeometry.visualCssHeight).toBe(standardGeometry.visualCssHeight);
    await expect(page.getByTestId('compact-character-portrait')).toBeVisible();
    await expect(page.getByTestId('map-shell')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}
