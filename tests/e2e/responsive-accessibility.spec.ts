import { expect, test, type Locator, type Page } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const COMPLETE_STATE_URL =
  '/?place=paso-de-demostracion&q=paso&category=lugares-destacados&tag=mountain-pass';

const NEUTRAL_TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
    <path d="M0 1164.5h3600M1800 0v2329" stroke="#8a887f" stroke-width="12" />
  </svg>
`;

async function mockOfficialMap(page: Page): Promise<void> {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: NEUTRAL_TEST_MAP,
    });
  });
}

async function openReadyMap(page: Page, path = '/'): Promise<void> {
  await mockOfficialMap(page);
  await page.goto(path);
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
}

async function ensureControlsExpanded(page: Page): Promise<void> {
  const searchToggle = page.locator('[data-place-search-toggle]');
  const filtersToggle = page.locator('[data-place-filters-toggle]');

  if ((await searchToggle.getAttribute('aria-expanded')) === 'false') {
    await searchToggle.click();
  }
  if ((await filtersToggle.getAttribute('aria-expanded')) === 'false') {
    await filtersToggle.click();
  }
}

function marker(page: Page, placeId: string): Locator {
  return page.locator(`[data-testid="place-marker"][data-place-id="${placeId}"]`);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
}

async function expectWithinViewportWidth(page: Page, locator: Locator): Promise<void> {
  const viewport = page.viewportSize();
  const box = await locator.boundingBox();

  expect(viewport).not.toBeNull();
  expect(box).not.toBeNull();

  if (!viewport || !box) {
    return;
  }

  expect(box.x).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
}

async function expectTouchTarget(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();

  if (!box) {
    return;
  }

  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

test('keeps semantic regions, names, focus and touch targets usable from 320 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openReadyMap(page);

  const searchToggle = page.locator('[data-place-search-toggle]');
  const filtersToggle = page.locator('[data-place-filters-toggle]');
  await expect(searchToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(filtersToggle).toHaveAttribute('aria-expanded', 'false');
  await expectTouchTarget(searchToggle);
  await expectTouchTarget(filtersToggle);
  await searchToggle.click();
  await filtersToggle.click();

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  const categoryGroup = page.getByRole('group', { name: 'Categorías' });
  const tagGroup = page.getByRole('group', { name: 'Etiquetas' });
  const mapRegion = page.getByRole('region', {
    name: 'Mapa navegable de la Costa de la Espada y el noroeste de Faerûn',
  });
  const zoomIn = page.getByTitle('Acercar');
  const zoomOut = page.getByTitle('Alejar');

  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await expect(page.getByRole('search', { name: 'Buscar lugares' })).toBeVisible();
  await expect(categoryGroup).toBeVisible();
  await expect(tagGroup).toBeVisible();
  await expect(mapRegion).toBeVisible();
  await expect(zoomIn).toHaveAttribute('aria-label', 'Acercar');
  await expect(zoomOut).toHaveAttribute('aria-label', 'Alejar');

  await expectNoHorizontalOverflow(page);
  await expectWithinViewportWidth(page, page.locator('.site-header'));
  await expectWithinViewportWidth(page, page.locator('[data-place-search]'));
  await expectWithinViewportWidth(page, page.locator('[data-place-filters]'));
  await expectWithinViewportWidth(page, page.getByTestId('map-shell'));
  await expectTouchTarget(page.getByRole('button', { name: 'Limpiar búsqueda' }));
  await expectTouchTarget(page.getByRole('button', { name: 'Limpiar filtros' }));
  await expectTouchTarget(zoomIn);
  await expectTouchTarget(zoomOut);
  await expectTouchTarget(marker(page, 'place-demo-harbor'));

  await searchbox.focus();
  const focusStyle = await searchbox.evaluate((element) => {
    const style = getComputedStyle(element);

    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });

  expect(focusStyle.outlineStyle).not.toBe('none');
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
});

test('preserves a logical keyboard flow for search and filters', async ({ page }) => {
  await openReadyMap(page);
  await ensureControlsExpanded(page);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  const clearSearch = page.getByRole('button', { name: 'Limpiar búsqueda' });
  const results = page.getByRole('list', { name: 'Resultados de búsqueda de lugares' });
  const category = page.getByRole('checkbox', { name: /Lugar destacado/ });
  const clearFilters = page.getByRole('button', { name: 'Limpiar filtros' });

  await searchbox.fill('demostracion');
  await searchbox.focus();
  await page.keyboard.press('Tab');
  await expect(clearSearch).toBeFocused();
  await page.keyboard.press('Tab');

  const resultButtons = results.getByRole('button');

  await expect(resultButtons.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(resultButtons.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(resultButtons.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(searchbox).toBeFocused();

  await category.focus();
  await page.keyboard.press('Space');
  await expect(category).toBeChecked();
  await expect(category).toBeFocused();

  await clearFilters.focus();
  await page.keyboard.press('Enter');
  await expect(category).not.toBeChecked();
  await expect(clearFilters).toBeFocused();

  await clearSearch.focus();
  await page.keyboard.press('Enter');
  await expect(searchbox).toHaveValue('');
  await expect(searchbox).toBeFocused();
});

test('activates matching and dimmed markers with Enter and Space and restores focus', async ({
  page,
}) => {
  await openReadyMap(page);
  await ensureControlsExpanded(page);

  await page.getByRole('checkbox', { name: /Lugar destacado/ }).check();

  const harbor = marker(page, 'place-demo-harbor');
  const pass = marker(page, 'place-demo-pass');
  const panel = page.getByTestId('place-details');

  await expect(harbor).toHaveClass(/campaign-marker-icon--dimmed/);
  await expect(harbor).toHaveAttribute('data-filter-match', 'false');
  await harbor.focus();
  await page.keyboard.press('Enter');

  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-harbor');
  await expect(
    panel.getByRole('heading', { level: 3, name: 'Puerto de demostración' }),
  ).toBeFocused();
  await expect(harbor).toHaveAttribute('aria-pressed', 'true');
  await expect(harbor).toHaveAttribute('data-accessible-state', /No coincide/);
  await expect(harbor).toHaveClass(/campaign-marker-icon--active/);
  await expect(harbor).toHaveClass(/campaign-marker-icon--dimmed/);

  const closeButton = panel.getByRole('button', {
    name: 'Cerrar la ficha de Puerto de demostración',
  });

  await closeButton.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeHidden();
  await expect(harbor).toBeFocused();

  await pass.focus();
  await page.keyboard.press('Space');
  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-pass');
  await expect(pass).toHaveAttribute('aria-pressed', 'true');
  await expect(pass).toHaveAttribute('data-accessible-state', /Lugar activo.*Coincide/);
});

test('restores a complete mobile URL and history without stealing focus', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openReadyMap(page, COMPLETE_STATE_URL);

  await expect(page.locator('[data-place-search-toggle]')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.locator('[data-place-filters-toggle]')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await ensureControlsExpanded(page);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  const landmark = page.getByRole('checkbox', { name: /Lugar destacado/ });
  const settlement = page.getByRole('checkbox', { name: /Asentamiento/ });
  const passTag = page.getByRole('checkbox', { name: /Paso de montaña/ });
  const panel = page.getByTestId('place-details');
  const title = panel.getByRole('heading', { level: 3, name: 'Paso de demostración' });

  await expect(searchbox).toHaveValue('paso');
  await expect(landmark).toBeChecked();
  await expect(passTag).toBeChecked();
  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-pass');
  await expect(title).not.toBeFocused();
  await expectNoHorizontalOverflow(page);

  await settlement.check();
  await searchbox.focus();
  await page.goBack();
  await expect(settlement).not.toBeChecked();
  await expect(searchbox).toBeFocused();

  await page.goForward();
  await expect(settlement).toBeChecked();
  await expect(searchbox).toBeFocused();
  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-pass');
});

test('keeps a useful landscape surface and restored state when the remote map fails', async ({
  page,
}) => {
  await page.setViewportSize({ width: 667, height: 375 });
  const requestedMapResources: string[] = [];

  page.on('request', (request) => {
    if (request.url().includes('Sword-Coast-Map')) {
      requestedMapResources.push(request.url());
    }
  });
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable' });
  });
  await page.goto(COMPLETE_STATE_URL);
  await ensureControlsExpanded(page);

  const shell = page.getByTestId('map-shell');
  const map = page.locator('[data-map-canvas]');
  const panel = page.getByTestId('place-details');
  const mapBox = await map.boundingBox();

  await expect(shell).toHaveAttribute('data-map-state', 'error');
  await expect(page.getByRole('alert')).toContainText('No se ha podido cargar');
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('paso');
  await expect(page.getByRole('checkbox', { name: /Lugar destacado/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Paso de montaña/ })).toBeChecked();
  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-pass');
  await expect(marker(page, 'place-demo-pass')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTitle('Acercar')).toBeVisible();
  await expect(page.getByTitle('Alejar')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectWithinViewportWidth(page, shell);
  await expectWithinViewportWidth(page, panel);

  expect(mapBox).not.toBeNull();
  expect(mapBox?.height).toBeGreaterThanOrEqual(180);
  expect(requestedMapResources).toEqual([OFFICIAL_MAP_URL]);
});
