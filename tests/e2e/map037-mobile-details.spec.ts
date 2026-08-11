import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

const PUBLIC_ROWS: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  categories: [
    {
      id: 'category-settlement',
      slug: 'asentamientos',
      name: 'Asentamiento',
      description: 'Categoría de prueba.',
    },
    {
      id: 'category-landmark',
      slug: 'lugares-destacados',
      name: 'Lugar destacado',
      description: 'Categoría secundaria de prueba.',
    },
  ],
  tags: [
    { id: 'coastal', name: 'Costero', description: 'Etiqueta costera.' },
    { id: 'watch', name: 'Vigilancia', description: 'Etiqueta de vigilancia.' },
  ],
  players: [
    {
      id: 'player-a',
      slug: 'player-a',
      display_name: 'Alicia',
      name_language: 'en',
    },
    {
      id: 'player-b',
      slug: 'player-b',
      display_name: 'Borin',
      name_language: 'en',
    },
  ],
  map_entities: [
    {
      id: 'place-demo-harbor',
      slug: 'puerto-de-demostracion',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Demonstration Harbor',
      name_language: 'en',
      summary: 'Resumen del puerto.',
      description: 'Descripción del puerto.',
      x: 1500,
      y: 1300,
      category_id: 'category-settlement',
    },
    {
      id: 'entity-harbor-guard',
      slug: 'harbor-guard',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Harbor Guard',
      name_language: 'en',
      summary: 'Resumen del guardia.',
      description: 'Descripción del guardia.',
      x: 1500,
      y: 1300,
      category_id: 'category-settlement',
    },
    {
      id: 'entity-scout',
      slug: 'scout',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Scout',
      name_language: 'en',
      summary: 'Resumen del explorador.',
      description: 'Descripción del explorador.',
      x: 1500,
      y: 1000,
      category_id: 'category-landmark',
    },
  ],
  entity_aliases: [],
  entity_tags: [
    { entity_id: 'place-demo-harbor', tag_id: 'coastal' },
    { entity_id: 'place-demo-harbor', tag_id: 'watch' },
    { entity_id: 'entity-harbor-guard', tag_id: 'watch' },
    { entity_id: 'entity-scout', tag_id: 'watch' },
  ],
  entity_player_dispositions: [
    { entity_id: 'place-demo-harbor', player_id: 'player-a', disposition: 'ally' },
    { entity_id: 'place-demo-harbor', player_id: 'player-b', disposition: 'neutral' },
    { entity_id: 'entity-harbor-guard', player_id: 'player-a', disposition: 'enemy' },
    { entity_id: 'entity-harbor-guard', player_id: 'player-b', disposition: 'neutral' },
    { entity_id: 'entity-scout', player_id: 'player-a', disposition: 'enemy' },
    { entity_id: 'entity-scout', player_id: 'player-b', disposition: 'ally' },
  ],
  character_location_relations: [
    {
      character_id: 'entity-harbor-guard',
      location_id: 'place-demo-harbor',
      relation_status: 'present',
    },
  ],
  public_notes: [],
  public_note_tags: [],
  geographic_names: [],
  geographic_name_aliases: [],
  character_location_events: [],
};

const MOBILE_VIEWPORTS = [
  { width: 320, height: 740, label: '320x740' },
  { width: 430, height: 932, label: '430x932' },
  { width: 667, height: 375, label: '667x375-landscape' },
] as const;

async function mockOfficialMap(page: Page): Promise<void> {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });
}

async function configureBackend(page: Page): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map037_test_key',
      timeoutMs: 400,
      retryDelaysMs: [0, 0, 0],
    };
  }, LOCAL_SUPABASE_URL);

  await page.route('**/rest/v1/**', async (route: Route) => {
    const match = /\/rest\/v1\/([^?]+)/.exec(route.request().url());
    const table = match?.[1] ?? '';
    const rows = PUBLIC_ROWS[table] ?? [];
    const contentRange = rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange },
      body: JSON.stringify(rows),
    });
  });
}

async function openReadyMap(page: Page): Promise<void> {
  await mockOfficialMap(page);
  await configureBackend(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'connected',
  );
}

async function captureReference(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const screenshotPath = testInfo.outputPath(`map037-${label}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await testInfo.attach(`MAP-037 ${label}`, {
    path: screenshotPath,
    contentType: 'image/png',
  });
}

async function pageScrollY(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
}

async function expectTouchTarget(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(43.9);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.9);
}

async function expectSheetPreservesMapContext(page: Page): Promise<void> {
  const mapBox = await page.locator('[data-map-canvas]').boundingBox();
  const panelBox = await page.getByTestId('place-details').boundingBox();

  expect(mapBox).not.toBeNull();
  expect(panelBox).not.toBeNull();

  if (!mapBox || !panelBox) return;

  expect(panelBox.height).toBeLessThanOrEqual(mapBox.height * 0.49);
  expect(panelBox.y).toBeGreaterThanOrEqual(mapBox.y + mapBox.height * 0.5);

  await expect
    .poll(async () => {
      const currentPanelBox = await page.getByTestId('place-details').boundingBox();
      const activeMarkerBox = await page
        .locator('.campaign-marker-icon[aria-pressed="true"]')
        .boundingBox();

      if (!currentPanelBox || !activeMarkerBox) {
        return Number.POSITIVE_INFINITY;
      }

      return activeMarkerBox.y + activeMarkerBox.height / 2 - currentPanelBox.y;
    })
    .toBeLessThan(-4);
}

for (const viewport of MOBILE_VIEWPORTS) {
  test(`keeps map context, focus and scroll stable at ${viewport.label}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await openReadyMap(page);

    const marker = page.locator('[data-testid="entity-pin"][data-pin-id="entity-scout"]');
    await marker.scrollIntoViewIfNeeded();
    const scrollBeforeOpen = await pageScrollY(page);

    await marker.click();

    const panel = page.getByTestId('place-details');
    const title = panel.getByRole('heading', { level: 3, name: 'Scout' });
    const returnButton = panel.getByRole('button', { name: 'Volver al pin de Scout' });

    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('role', 'region');
    await expect(panel).not.toHaveAttribute('aria-modal', 'true');
    await expect(title).toBeFocused();
    await expect(returnButton).toBeVisible();
    expect(Math.abs((await pageScrollY(page)) - scrollBeforeOpen)).toBeLessThanOrEqual(1);
    await expectTouchTarget(page, '[data-place-details-return]');
    await expectTouchTarget(page, '[data-place-details-close]');
    await expectSheetPreservesMapContext(page);
    await expectNoHorizontalOverflow(page);
    expect(await panel.evaluate((element) => element.scrollTop)).toBe(0);
    await captureReference(page, testInfo, viewport.label);

    const fullAction = panel.getByRole('link', {
      name: 'Abrir ficha completa de Scout en una pestaña nueva',
    });
    await panel.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(fullAction).toBeVisible();
    expect(await panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(Math.abs((await pageScrollY(page)) - scrollBeforeOpen)).toBeLessThanOrEqual(1);

    await returnButton.click();
    await expect(marker).toBeFocused();
    await expect(panel).toBeVisible();
    expect(Math.abs((await pageScrollY(page)) - scrollBeforeOpen)).toBeLessThanOrEqual(1);

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(marker).toBeFocused();
    expect(Math.abs((await pageScrollY(page)) - scrollBeforeOpen)).toBeLessThanOrEqual(1);
  });
}

test('changes the active pin without leaving the mobile map workspace', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyMap(page);

  const scout = page.locator('[data-testid="entity-pin"][data-pin-id="entity-scout"]');
  await scout.click();

  const panel = page.getByTestId('place-details');
  await expect(panel.getByRole('heading', { level: 3, name: 'Scout' })).toBeFocused();

  const group = page.getByTestId('coincident-pin');
  await expect(group).toBeVisible();
  await group.click();
  const harborOption = page.locator(
    '[data-testid="coincident-pin-option"][data-pin-id="place-demo-harbor"]',
  );
  await expect(harborOption).toBeVisible();
  await harborOption.click();

  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole('heading', { level: 3, name: 'Demonstration Harbor' }),
  ).toBeFocused();
  await expect(panel).toHaveAttribute('data-entity-type', 'location');
  await expect(page.locator('.campaign-marker-icon[aria-pressed="true"]')).toHaveAttribute(
    'data-testid',
    'coincident-pin',
  );
  await expectSheetPreservesMapContext(page);

  const scrollBeforeClose = await pageScrollY(page);
  await panel.getByRole('button', { name: 'Cerrar la ficha de Demonstration Harbor' }).click();
  await expect(panel).toBeHidden();
  await expect(group).toBeFocused();
  expect(Math.abs((await pageScrollY(page)) - scrollBeforeClose)).toBeLessThanOrEqual(1);
});
