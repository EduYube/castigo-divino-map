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

async function openReadyMap(page: Page): Promise<void> {
  await mockOfficialMap(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
}

function marker(page: Page, placeId: string) {
  return page.locator(`[data-testid="place-marker"][data-place-id="${placeId}"]`);
}

test('renders accessible category and tag groups from the public catalog', async ({ page }) => {
  await openReadyMap(page);

  const categories = page.getByRole('group', { name: 'Categorías' });
  const tags = page.getByRole('group', { name: 'Etiquetas' });

  await expect(categories).toBeVisible();
  await expect(tags).toBeVisible();
  await expect(categories.getByRole('checkbox')).toHaveCount(2);
  await expect(tags.getByRole('checkbox')).toHaveCount(4);
  await expect(categories.getByRole('checkbox', { name: /Asentamiento/ })).toBeVisible();
  await expect(tags.getByRole('checkbox', { name: /Costero/ })).toBeVisible();
  await expect(page.locator('[data-place-filters-status]')).toHaveText(
    '2 lugares coinciden con la búsqueda y los filtros actuales.',
  );
});

test('updates counts and marker states for category and tag filters', async ({ page }) => {
  await openReadyMap(page);

  const settlement = page.getByRole('checkbox', { name: /Asentamiento/ });
  const coastal = page.getByRole('checkbox', { name: /Costero/ });
  const harbor = marker(page, 'place-demo-harbor');
  const pass = marker(page, 'place-demo-pass');

  await settlement.check();

  await expect(page.locator('[data-place-filters-status]')).toHaveText(
    '1 lugar coincide con la búsqueda y los filtros actuales.',
  );
  await expect(harbor).toHaveAttribute('data-filter-match', 'true');
  await expect(harbor).toHaveClass(/campaign-marker-icon--matching/);
  await expect(pass).toHaveAttribute('data-filter-match', 'false');
  await expect(pass).toHaveClass(/campaign-marker-icon--dimmed/);

  await settlement.uncheck();
  await coastal.check();

  await expect(page.locator('[data-place-filters-status]')).toHaveText(
    '1 lugar coincide con la búsqueda y los filtros actuales.',
  );
  await expect(harbor).toHaveAttribute('data-filter-match', 'true');
  await expect(pass).toHaveAttribute('data-filter-match', 'false');
});

test('combines search, categories and tags with AND without hiding search results', async ({
  page,
}) => {
  await openReadyMap(page);

  await page.getByRole('checkbox', { name: /Asentamiento/ }).check();
  await page.getByRole('searchbox', { name: 'Buscar lugares' }).fill('paso');

  await expect(page.locator('[data-place-filters-status]')).toContainText('Ningún lugar coincide');
  await expect(marker(page, 'place-demo-harbor')).toHaveAttribute('data-filter-match', 'false');
  await expect(marker(page, 'place-demo-pass')).toHaveAttribute('data-filter-match', 'false');

  const result = page
    .getByRole('list', { name: 'Resultados de búsqueda de lugares' })
    .getByRole('button', { name: /Paso de demostración/ });

  await expect(result).toBeVisible();
  await result.click();

  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    'place-demo-pass',
  );
  await expect(marker(page, 'place-demo-pass')).toHaveClass(/campaign-marker-icon--active/);
  await expect(marker(page, 'place-demo-pass')).toHaveClass(/campaign-marker-icon--dimmed/);
  await expect(marker(page, 'place-demo-pass')).toHaveAttribute(
    'aria-description',
    /Lugar activo\. No coincide/,
  );
  await expect(page.locator('[data-place-filters-status]')).toContainText(
    'El lugar activo no coincide',
  );
});

test('keeps a dimmed marker operable and preserves the single active place', async ({ page }) => {
  await openReadyMap(page);

  await page.getByRole('checkbox', { name: /Asentamiento/ }).check();
  const dimmedPass = marker(page, 'place-demo-pass');

  await expect(dimmedPass).toHaveClass(/campaign-marker-icon--dimmed/);
  await dimmedPass.click();

  const panel = page.getByTestId('place-details');

  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-pass');
  await expect(panel).toContainText('Paso de demostración');
  await expect(dimmedPass).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid="place-marker"][aria-pressed="true"]')).toHaveCount(1);
});

test('supports keyboard filters without moving focus unexpectedly', async ({ page }) => {
  await openReadyMap(page);

  const tag = page.getByRole('checkbox', { name: /Paso de montaña/ });

  await tag.focus();
  await page.keyboard.press('Space');

  await expect(tag).toBeChecked();
  await expect(tag).toBeFocused();
  await expect(page.locator('[data-place-filters-status]')).toHaveText(
    '1 lugar coincide con la búsqueda y los filtros actuales.',
  );
});

test('clears filters predictably and restores all marker matches', async ({ page }) => {
  await openReadyMap(page);

  await page.getByRole('checkbox', { name: /Lugar destacado/ }).check();
  const clearButton = page.getByRole('button', { name: 'Limpiar filtros' });

  await clearButton.click();

  await expect(clearButton).toBeFocused();
  await expect(page.getByRole('checkbox', { name: /Lugar destacado/ })).not.toBeChecked();
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect(page.locator('[data-testid="place-marker"][data-filter-match="true"]')).toHaveCount(
    2,
  );
  await expect(page.locator('[data-place-filters-status]')).toHaveText(
    '2 lugares coinciden con la búsqueda y los filtros actuales.',
  );
});

test('keeps filters, map and details usable in a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyMap(page);

  const filters = page.locator('[data-place-filters]');
  const map = page.locator('[data-map-canvas]');

  await expect(filters).toBeVisible();
  await expect(page.getByRole('button', { name: 'Limpiar filtros' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Ruta comercial/ }).check();

  const filterBox = await filters.boundingBox();
  const mapBox = await map.boundingBox();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);

  expect(filterBox).not.toBeNull();
  expect(filterBox?.width).toBeLessThanOrEqual(390);
  expect(mapBox).not.toBeNull();
  expect(mapBox?.width).toBeGreaterThan(340);
  expect(scrollWidth).toBeLessThanOrEqual(390);
});

test('preserves filters and markers on the neutral surface when the remote map fails', async ({
  page,
}) => {
  const requestedMapResources: string[] = [];

  page.on('request', (request) => {
    if (request.url().includes('Sword-Coast-Map')) {
      requestedMapResources.push(request.url());
    }
  });
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable' });
  });
  await page.goto('/');

  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'error');
  await expect(page.getByRole('group', { name: 'Categorías' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Lugar destacado/ }).check();
  await expect(marker(page, 'place-demo-pass')).toHaveAttribute('data-filter-match', 'true');
  await expect(marker(page, 'place-demo-harbor')).toHaveAttribute('data-filter-match', 'false');
  await marker(page, 'place-demo-pass').click();
  await expect(page.getByTestId('place-details')).toContainText('Paso de demostración');
  expect(requestedMapResources).toEqual([OFFICIAL_MAP_URL]);
});
