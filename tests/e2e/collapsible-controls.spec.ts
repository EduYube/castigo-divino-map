import { expect, test, type Page } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';

const NEUTRAL_TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
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

function searchToggle(page: Page) {
  return page.locator('[data-place-search-toggle]');
}

function filtersToggle(page: Page) {
  return page.locator('[data-place-filters-toggle]');
}

function searchRegion(page: Page) {
  return page.locator('[data-place-search-region]');
}

function filtersRegion(page: Page) {
  return page.locator('[data-place-filters-region]');
}

test('starts expanded on desktop with valid independent ARIA relationships', async ({ page }) => {
  await openReadyMap(page);

  await expect(searchToggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(searchToggle(page)).toHaveAttribute('aria-controls', 'place-search-region');
  await expect(filtersToggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(filtersToggle(page)).toHaveAttribute('aria-controls', 'place-filters-region');
  await expect(searchRegion(page)).toHaveAttribute('id', 'place-search-region');
  await expect(filtersRegion(page)).toHaveAttribute('id', 'place-filters-region');
  await expect(searchRegion(page)).toHaveAttribute('role', 'region');
  await expect(filtersRegion(page)).toHaveAttribute('role', 'region');
  await expect(searchRegion(page)).toBeVisible();
  await expect(filtersRegion(page)).toBeVisible();
});

test('collapses search without changing query, URL or history and reports zero results', async ({
  page,
}) => {
  await openReadyMap(page);

  const query = 'Un lugar que no existe';
  const input = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await input.fill(query);
  const urlBeforeCollapse = page.url();
  const historyBeforeCollapse = await page.evaluate(() => window.history.length);

  await searchToggle(page).click();

  await expect(searchToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(searchToggle(page)).toBeFocused();
  await expect(searchRegion(page)).toBeHidden();
  await expect(page.locator('[data-place-search-summary]')).toHaveText(
    `Consulta: “${query}” · 0 resultados.`,
  );
  expect(page.url()).toBe(urlBeforeCollapse);
  expect(await page.evaluate(() => window.history.length)).toBe(historyBeforeCollapse);

  await searchToggle(page).click();
  await expect(input).toHaveValue(query);
  await expect(page.locator('[data-place-search-status]')).toContainText('No hay lugares');
});

test('collapses filters without changing selections, URL or history', async ({ page }) => {
  await openReadyMap(page);

  const landmark = page.getByRole('checkbox', { name: /Lugar destacado/ });
  const mountainPass = page.getByRole('checkbox', { name: /Paso de montaña/ });
  await landmark.check();
  await mountainPass.check();
  const urlBeforeCollapse = page.url();
  const historyBeforeCollapse = await page.evaluate(() => window.history.length);

  await filtersToggle(page).click();

  await expect(filtersToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(filtersToggle(page)).toBeFocused();
  await expect(filtersRegion(page)).toBeHidden();
  await expect(page.locator('[data-place-filters-summary]')).toContainText('2 filtros activos');
  expect(page.url()).toBe(urlBeforeCollapse);
  expect(await page.evaluate(() => window.history.length)).toBe(historyBeforeCollapse);

  await filtersToggle(page).click();
  await expect(landmark).toBeChecked();
  await expect(mountainPass).toBeChecked();
});

test('restores search and filters from URL while both controls start collapsed on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyMap(page, '/?q=paso&category=lugares-destacados&tag=mountain-pass');

  await expect(searchToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(filtersToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(searchRegion(page)).toBeHidden();
  await expect(filtersRegion(page)).toBeHidden();
  await expect(page.locator('[data-place-search-summary]')).toContainText('Consulta: “paso”');
  await expect(page.locator('[data-place-filters-summary]')).toContainText('2 filtros activos');

  await searchToggle(page).click();
  await filtersToggle(page).click();
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('paso');
  await expect(page.getByRole('checkbox', { name: /Lugar destacado/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Paso de montaña/ })).toBeChecked();
});

test('manual presentation choices survive later viewport resizes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyMap(page);

  await expect(searchToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(filtersToggle(page)).toHaveAttribute('aria-expanded', 'false');

  await searchToggle(page).click();
  await filtersToggle(page).click();
  await filtersToggle(page).click();
  await expect(searchToggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(filtersToggle(page)).toHaveAttribute('aria-expanded', 'false');

  await page.setViewportSize({ width: 1280, height: 800 });

  await expect(searchToggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(filtersToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(searchRegion(page)).toBeVisible();
  await expect(filtersRegion(page)).toBeHidden();
});

test('320 px collapsed controls materially reduce vertical space without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openReadyMap(page);

  const collapsedMapTop = await page.locator('[data-map-canvas]').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top + window.scrollY;
  });

  await searchToggle(page).click();
  await filtersToggle(page).click();

  const expandedMapTop = await page.locator('[data-map-canvas]').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top + window.scrollY;
  });
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(expandedMapTop - collapsedMapTop).toBeGreaterThan(250);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test('keeps keyboard focus on toggles and skips hidden interactive content', async ({ page }) => {
  await openReadyMap(page);

  const search = searchToggle(page);
  const filters = filtersToggle(page);
  const input = page.getByRole('searchbox', { name: 'Buscar lugares' });

  await search.focus();
  await page.keyboard.press('Enter');
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await expect(input).toBeHidden();

  await page.keyboard.press('Tab');
  await expect(filters).toBeFocused();

  await filters.press('Enter');
  await expect(filters).toBeFocused();
  await expect(filters).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('checkbox', { name: /Asentamiento/ })).toBeHidden();

  await filters.press('Space');
  await expect(filters).toBeFocused();
  await expect(filters).toHaveAttribute('aria-expanded', 'true');
});

test('back and forward restore functional state without reopening collapsed controls', async ({ page }) => {
  await openReadyMap(page);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  const landmark = page.getByRole('checkbox', { name: /Lugar destacado/ });

  await searchbox.fill('paso');
  await landmark.check();
  await searchToggle(page).click();
  await filtersToggle(page).click();

  await page.goBack();
  await expect(searchToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(filtersToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(searchbox).toHaveValue('paso');
  await expect(landmark).not.toBeChecked();
  await expect(page.locator('[data-place-filters-summary]')).toContainText('Sin filtros activos');

  await page.goForward();
  await expect(searchToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(filtersToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(searchbox).toHaveValue('paso');
  await expect(landmark).toBeChecked();
  await expect(page.locator('[data-place-filters-summary]')).toContainText('1 filtro activo');
});

test('remains operable with reduced motion and forced colors', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await openReadyMap(page);

  const toggle = searchToggle(page);
  await toggle.focus();
  await toggle.press('Enter');

  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const computed = await toggle.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderStyle: style.borderStyle,
      transitionDuration: style.transitionDuration,
    };
  });

  expect(computed.borderStyle).not.toBe('none');
  expect(computed.transitionDuration).toBe('0.01ms');
});
