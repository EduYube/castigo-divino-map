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

function beta02CharacterPin(page: Page) {
  return page.locator('[data-testid="entity-pin"][data-category-id="category-pj"]');
}

test('renders accessible category and tag groups from the usable Beta 0.2 public catalog', async ({
  page,
}) => {
  await openReadyMap(page);

  const categories = page.getByRole('group', { name: 'Categorías' });
  const tags = page.getByRole('group', { name: 'Etiquetas' });

  await expect(categories).toBeVisible();
  await expect(tags).toBeVisible();
  await expect(categories.getByRole('checkbox')).toHaveCount(3);
  await expect(tags.getByRole('checkbox')).toHaveCount(5);
  await expect(categories.getByRole('checkbox', { name: /Asentamiento/ })).toBeVisible();
  await expect(categories.getByRole('checkbox', { name: /Personaje/ })).toBeVisible();
  await expect(categories.getByRole('checkbox', { name: /NPC/ })).toHaveCount(0);
  await expect(tags.getByRole('checkbox', { name: /Costero/ })).toBeVisible();
  await expect(tags.getByRole('checkbox', { name: /Veyra/ })).toBeVisible();
  await expect(page.locator('[data-place-filters-status]')).toHaveText(
    '3 resultados coinciden con la búsqueda y los filtros actuales.',
  );
});

test('filters a supplemental Beta 0.2 character pin instead of treating it as always matching', async ({
  page,
}) => {
  await openReadyMap(page);

  const character = beta02CharacterPin(page);
  await expect(character).toHaveCount(1);
  await page.getByRole('checkbox', { name: /Personaje/ }).check();

  await expect(page.locator('[data-place-filters-status]')).toHaveText(
    '1 resultado coincide con la búsqueda y los filtros actuales.',
  );
  await expect(character).toHaveAttribute('data-filter-match', 'true');
  await expect(marker(page, 'place-demo-harbor')).toHaveAttribute('data-filter-match', 'false');
  await expect(marker(page, 'place-demo-pass')).toHaveAttribute('data-filter-match', 'false');

  await page.getByRole('checkbox', { name: /Personaje/ }).uncheck();
  await page.getByRole('checkbox', { name: /Lugar destacado/ }).check();

  await expect(character).toHaveAttribute('data-filter-match', 'false');
  await expect(character).toHaveClass(/campaign-marker-icon--dimmed/);
  await expect(marker(page, 'place-demo-pass')).toHaveAttribute('data-filter-match', 'true');
});

test('persists Beta 0.2-only category and tag selections in the canonical URL and reloads them', async ({
  page,
}) => {
  await openReadyMap(page);

  const category = page.getByRole('checkbox', { name: /Personaje/ });
  const tag = page.getByRole('checkbox', { name: /Veyra/ });
  await category.check();
  await tag.check();

  await expect.poll(() => new URL(page.url()).searchParams.get('category')).toBe('personaje');
  await expect.poll(() => new URL(page.url()).searchParams.get('tag')).toBe('category-veyra');
  await expect(beta02CharacterPin(page)).toHaveAttribute('data-filter-match', 'true');

  await page.reload();
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.getByRole('checkbox', { name: /Personaje/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Veyra/ })).toBeChecked();
  await expect(beta02CharacterPin(page)).toHaveAttribute('data-filter-match', 'true');
});

test('updates counts and marker states for category and tag filters', async ({ page }) => {
  await openReadyMap(page);

  const settlement = page.getByRole('checkbox', { name: /Asentamiento/ });
  const coastal = page.getByRole('checkbox', { name: /Costero/ });
  const harbor = marker(page, 'place-demo-harbor');
  const pass = marker(page, 'place-demo-pass');

  await settlement.check();

  await expect(page.locator('[data-place-filters-status]')).toHaveText(
    '1 resultado coincide con la búsqueda y los filtros actuales.',
  );
  await expect(harbor).toHaveAttribute('data-filter-match', 'true');
  await expect(harbor).toHaveClass(/campaign-marker-icon--matching/);
  await expect(pass).toHaveAttribute('data-filter-match', 'false');
  await expect(pass).toHaveClass(/campaign-marker-icon--dimmed/);

  await settlement.uncheck();
  await coastal.check();

  await expect(page.locator('[data-place-filters-status]')).toHaveText(
    '1 resultado coincide con la búsqueda y los filtros actuales.',
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

  await expect(page.locator('[data-place-filters-status]')).toContainText(
    'Ningún resultado coincide',
  );
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
    'El elemento activo no coincide',
  );
});

test('combines Beta 0.2 character search with its category and tag facets', async ({ page }) => {
  await openReadyMap(page);

  await page.getByRole('checkbox', { name: /Personaje/ }).check();
  await page.getByRole('checkbox', { name: /Veyra/ }).check();
  await page.getByRole('searchbox', { name: 'Buscar lugares' }).fill('Veyra');

  await expect(page.locator('[data-place-filters-status]')).toHaveText(
    '1 resultado coincide con la búsqueda y los filtros actuales.',
  );
  await expect(beta02CharacterPin(page)).toHaveAttribute('data-filter-match', 'true');
  await expect(
    page
      .getByRole('list', { name: 'Resultados de búsqueda de lugares' })
      .getByRole('button', { name: /Veyra/ }),
  ).toBeVisible();
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
    '1 resultado coincide con la búsqueda y los filtros actuales.',
  );
});

test('clears filters predictably and restores all public pin matches', async ({ page }) => {
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
  await expect(beta02CharacterPin(page)).toHaveAttribute('data-filter-match', 'true');
  await expect(page.locator('[data-place-filters-status]')).toHaveText(
    '3 resultados coinciden con la búsqueda y los filtros actuales.',
  );
});

test('keeps filters, map and details usable in a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyMap(page);

  const filters = page.locator('[data-place-filters]');
  const filtersToggle = page.locator('[data-place-filters-toggle]');
  const map = page.locator('[data-map-canvas]');

  await expect(filters).toBeVisible();
  await expect(filtersToggle).toHaveAttribute('aria-expanded', 'false');
  await filtersToggle.click();
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

test('wraps long category and tag names without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyMap(page);

  const filtersToggle = page.locator('[data-place-filters-toggle]');
  await expect(filtersToggle).toHaveAttribute('aria-expanded', 'false');
  await filtersToggle.click();

  await page.locator('.place-filters__option-name').evaluateAll((names) => {
    names.forEach((name, index) => {
      name.textContent =
        `Clasificación pública extraordinariamente extensa ${index + 1} ` +
        'con varias palabras que deben ajustarse dentro del control';
    });
  });

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const optionBoxes = await page.locator('.place-filters__option').evaluateAll((options) =>
    options.map((option) => {
      const box = option.getBoundingClientRect();

      return { left: box.left, right: box.right, width: box.width };
    }),
  );

  expect(scrollWidth).toBeLessThanOrEqual(390);
  optionBoxes.forEach(({ left, right, width }) => {
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(390);
    expect(width).toBeLessThanOrEqual(390);
  });
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
  await expect(beta02CharacterPin(page)).toHaveAttribute('data-filter-match', 'false');
  await marker(page, 'place-demo-pass').click();
  await expect(page.getByTestId('place-details')).toContainText('Paso de demostración');
  expect(requestedMapResources).toEqual([OFFICIAL_MAP_URL]);
});
