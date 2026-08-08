import { expect, test, type Page } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PLACE_COUNT = 2;

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

async function openReadyMap(page: Page): Promise<void> {
  await mockOfficialMap(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.getByTestId('place-marker')).toHaveCount(PLACE_COUNT);
}

test('loads only the official URL through a neutral test response without console errors', async ({
  page,
}) => {
  const applicationErrors: string[] = [];
  const requestedMapResources: string[] = [];

  page.on('pageerror', (error) => applicationErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      applicationErrors.push(message.text());
    }
  });
  page.on('request', (request) => {
    if (request.url().includes('Sword-Coast-Map')) {
      requestedMapResources.push(request.url());
    }
  });

  await openReadyMap(page);

  await expect(page).toHaveTitle('El Atlas de los Nuevos Dioses');
  await expect(
    page.getByRole('heading', { level: 1, name: 'El Atlas de los Nuevos Dioses' }),
  ).toBeVisible();
  await expect(page.locator('.leaflet-image-layer')).toHaveAttribute('src', OFFICIAL_MAP_URL);
  await expect(page.getByText('Contenido de fans no oficial', { exact: true })).toBeVisible();
  expect(requestedMapResources).toEqual([OFFICIAL_MAP_URL]);
  expect(applicationErrors).toEqual([]);
});

test('renders one accessible marker per place at valid converted positions', async ({ page }) => {
  await openReadyMap(page);

  const markerPositions = await page.getByTestId('place-marker').evaluateAll((markers) =>
    markers.map((marker) => ({
      lat: Number((marker as HTMLElement).dataset.markerLat),
      lng: Number((marker as HTMLElement).dataset.markerLng),
      categoryId: (marker as HTMLElement).dataset.categoryId,
      label: marker.getAttribute('aria-label'),
    })),
  );

  expect(markerPositions).toHaveLength(PLACE_COUNT);
  expect(markerPositions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ lat: 820, lng: 1080.5, categoryId: 'category-settlement' }),
      expect.objectContaining({ lat: 1240.25, lng: 2240, categoryId: 'category-landmark' }),
    ]),
  );

  markerPositions.forEach(({ lat, lng, label, categoryId }) => {
    expect(lat).toBeGreaterThanOrEqual(0);
    expect(lat).toBeLessThanOrEqual(2329);
    expect(lng).toBeGreaterThanOrEqual(0);
    expect(lng).toBeLessThanOrEqual(3600);
    expect(label).toContain('Categoría:');
    expect(categoryId).toBeTruthy();
  });
});

test('provides a visibly labelled search that ignores accents and case', async ({ page }) => {
  await openReadyMap(page);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  const clearButton = page.getByRole('button', { name: 'Limpiar búsqueda' });

  await expect(page.getByText('Buscar lugares', { exact: true })).toBeVisible();
  await expect(searchbox).toBeVisible();
  await expect(clearButton).toBeDisabled();

  await searchbox.fill('PUERTO DE DEMOSTRACION');

  await expect(page.locator('[data-place-search-status]')).toHaveText('1 lugar encontrado.');
  await expect(
    page.getByRole('list', { name: 'Resultados de búsqueda de lugares' }).getByRole('button', {
      name: /Puerto de demostración.*Coincidencia por nombre principal/i,
    }),
  ).toBeVisible();
});

test('selects an alias result, locates the map and opens the existing active place details', async ({
  page,
}) => {
  await openReadyMap(page);

  const shell = page.getByTestId('map-shell');
  const initialCenter = await shell.getAttribute('data-map-center');
  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });

  await searchbox.fill('PUERTO DE EJEMPLO');

  const result = page
    .getByRole('list', { name: 'Resultados de búsqueda de lugares' })
    .getByRole('button', {
      name: /Puerto de demostración.*Coincidencia por alias: Puerto de ejemplo/i,
    });

  await result.click();

  const panel = page.getByTestId('place-details');
  const marker = page.getByRole('button', {
    name: 'Puerto de demostración. Categoría: Asentamiento.',
  });

  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-harbor');
  await expect(
    panel.getByRole('heading', { level: 3, name: 'Puerto de demostración' }),
  ).toBeFocused();
  await expect(panel).not.toContainText('Puerto de ejemplo');
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  await expect(marker).toHaveClass(/campaign-marker-icon--active/);
  await expect.poll(async () => shell.getAttribute('data-map-center')).not.toBe(initialCenter);

  await panel.getByRole('button', { name: 'Cerrar la ficha de Puerto de demostración' }).click();

  await expect(panel).toBeHidden();
  await expect(marker).toBeFocused();
});

test('selects a note-title result without rendering note content', async ({ page }) => {
  await openReadyMap(page);

  await page.getByRole('searchbox', { name: 'Buscar lugares' }).fill('referencia publica de viaje');
  await page
    .getByRole('list', { name: 'Resultados de búsqueda de lugares' })
    .getByRole('button', {
      name: /Paso de demostración.*Coincidencia por nota pública: Referencia pública de viaje/i,
    })
    .click();

  const panel = page.getByTestId('place-details');

  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-pass');
  await expect(panel).toContainText('Paso de demostración');
  await expect(panel).toContainText('Lugar destacado');
  await expect(panel).not.toContainText('Referencia pública de viaje');
  await expect(panel).not.toContainText('Este paso ficticio');
});

test('shows an accessible empty state and clears the query predictably', async ({ page }) => {
  await openReadyMap(page);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  const clearButton = page.getByRole('button', { name: 'Limpiar búsqueda' });
  const status = page.locator('[data-place-search-status]');
  const results = page.getByRole('list', { name: 'Resultados de búsqueda de lugares' });

  await searchbox.fill('puerto ficticio');

  await expect(status).toContainText('No hay lugares');
  await expect(results).toBeHidden();
  await expect(page.getByTestId('place-marker')).toHaveCount(PLACE_COUNT);
  await expect(clearButton).toBeEnabled();

  await clearButton.click();

  await expect(searchbox).toHaveValue('');
  await expect(searchbox).toBeFocused();
  await expect(status).toHaveText('Escribe un nombre, alias o título de nota pública.');
  await expect(clearButton).toBeDisabled();
});

test('operates search results with the keyboard and preserves close focus behavior', async ({
  page,
}) => {
  await openReadyMap(page);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });

  await searchbox.fill('DESFILADERO DE EJEMPLO');
  await searchbox.press('ArrowDown');

  const result = page
    .getByRole('list', { name: 'Resultados de búsqueda de lugares' })
    .getByRole('button', {
      name: /Paso de demostración.*Coincidencia por alias: Desfiladero de ejemplo/i,
    });

  await expect(result).toBeFocused();
  await page.keyboard.press('Enter');

  const panel = page.getByTestId('place-details');
  const title = panel.getByRole('heading', { level: 3, name: 'Paso de demostración' });
  const closeButton = panel.getByRole('button', {
    name: 'Cerrar la ficha de Paso de demostración',
  });
  const marker = page.getByRole('button', {
    name: 'Paso de demostración. Categoría: Lugar destacado.',
  });

  await expect(title).toBeFocused();
  await closeButton.focus();
  await page.keyboard.press('Enter');

  await expect(panel).toBeHidden();
  await expect(marker).toBeFocused();
});

test('opens compact public details and closes back to its marker', async ({ page }) => {
  await openReadyMap(page);

  const marker = page.getByRole('button', {
    name: 'Puerto de demostración. Categoría: Asentamiento.',
  });

  await marker.click();

  const panel = page.getByTestId('place-details');

  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-harbor');
  await expect(panel).toHaveAttribute('data-detail-source', 'beta02');
  await expect(
    page.getByRole('heading', { level: 3, name: 'Puerto de demostración' }),
  ).toBeFocused();
  await expect(panel.getByText('Emplazamiento', { exact: true })).toBeVisible();
  await expect(panel.getByText('Asentamiento', { exact: true })).toBeVisible();
  await expect(panel.getByText('Costero', { exact: true })).toBeVisible();
  await expect(panel.getByText('Dato de demostración', { exact: true })).toBeVisible();
  await expect(panel.getByText('Ruta comercial', { exact: true })).toBeVisible();
  await expect(panel).toContainText('Perspectiva no disponible');
  await expect(panel).toContainText('Sin disposición disponible');
  await expect(panel).not.toContainText('Puerto de ejemplo');
  await expect(panel).not.toContainText('Información pública de demostración');
  await expect(panel).not.toContainText('Este puerto ficticio sirve para comprobar fichas');
  const fullAction = panel.getByRole('link', {
    name: 'Abrir ficha completa de Puerto de demostración en una pestaña nueva',
  });
  await expect(fullAction).toBeVisible();
  await expect(fullAction).toHaveAttribute('href', /\?entity=puerto-de-demostracion$/);
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  await expect(marker).toHaveClass(/campaign-marker-icon--active/);

  await panel.getByRole('button', { name: 'Cerrar la ficha de Puerto de demostración' }).click();

  await expect(panel).toBeHidden();
  await expect(marker).toHaveAttribute('aria-pressed', 'false');
  await expect(marker).toBeFocused();
});

test('supports keyboard marker activation and keyboard close without a focus trap', async ({
  page,
}) => {
  await openReadyMap(page);

  const marker = page.getByRole('button', {
    name: 'Paso de demostración. Categoría: Lugar destacado.',
  });

  await marker.focus();
  await page.keyboard.press('Space');

  const panel = page.getByTestId('place-details');
  const title = panel.getByRole('heading', { level: 3, name: 'Paso de demostración' });
  const closeButton = panel.getByRole('button', {
    name: 'Cerrar la ficha de Paso de demostración',
  });

  await expect(panel).toBeVisible();
  await expect(title).toBeFocused();
  await expect(panel.getByText('Emplazamiento', { exact: true })).toBeVisible();
  await expect(panel.getByText('Lugar destacado', { exact: true })).toBeVisible();
  await expect(panel).not.toContainText('Desfiladero de ejemplo');
  await expect(panel).not.toContainText('Referencia pública de viaje');

  await closeButton.focus();
  await page.keyboard.press('Enter');

  await expect(panel).toBeHidden();
  await expect(marker).toBeFocused();
});

test('supports bounded zoom and drag navigation', async ({ page }) => {
  await openReadyMap(page);

  const shell = page.getByTestId('map-shell');
  const initialZoom = Number(await shell.getAttribute('data-map-zoom'));

  await page.getByTitle('Acercar').click();
  await expect
    .poll(async () => Number(await shell.getAttribute('data-map-zoom')))
    .toBeGreaterThan(initialZoom);

  const initialCenter = await shell.getAttribute('data-map-center');
  const mapBox = await page.locator('[data-map-canvas]').boundingBox();

  expect(mapBox).not.toBeNull();

  if (mapBox) {
    const startX = mapBox.x + mapBox.width / 2;
    const startY = mapBox.y + mapBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - Math.min(180, mapBox.width / 4), startY, { steps: 8 });
    await page.mouse.up();
  }

  await expect.poll(async () => shell.getAttribute('data-map-center')).not.toBe(initialCenter);

  const zoomOutControl = page.getByTitle('Alejar');

  await zoomOutControl.click();
  await expect(shell).toHaveAttribute('data-map-zoom', initialZoom.toFixed(2));
  await expect(zoomOutControl).toHaveClass(/leaflet-disabled/);
});

test('keeps search, map and compact details useful in a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyMap(page);

  const searchToggle = page.locator('[data-place-search-toggle]');
  await expect(searchToggle).toHaveAttribute('aria-expanded', 'false');
  await searchToggle.click();

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });

  await searchbox.fill('demostracion');

  const results = page.getByRole('list', { name: 'Resultados de búsqueda de lugares' });
  const resultsBox = await results.boundingBox();
  const map = page.locator('[data-map-canvas]');
  const mapBox = await map.boundingBox();

  expect(resultsBox).not.toBeNull();
  expect(resultsBox?.width).toBeLessThanOrEqual(390);
  expect(resultsBox?.height).toBeLessThanOrEqual(200);
  expect(mapBox).not.toBeNull();
  expect(mapBox?.width).toBeLessThanOrEqual(390);
  expect(mapBox?.width).toBeGreaterThan(340);
  expect(mapBox?.height).toBeGreaterThan(360);
  await expect(page.getByRole('button', { name: 'Limpiar búsqueda' })).toBeVisible();

  await results.getByRole('button', { name: /Puerto de demostración.*nombre principal/i }).click();

  const panel = page.getByTestId('place-details');
  const closeButton = panel.getByRole('button', {
    name: 'Cerrar la ficha de Puerto de demostración',
  });

  await panel.scrollIntoViewIfNeeded();
  const panelBox = await panel.boundingBox();

  expect(panelBox).not.toBeNull();
  expect(panelBox?.x).toBeGreaterThanOrEqual(0);
  expect((panelBox?.x ?? 0) + (panelBox?.width ?? 0)).toBeLessThanOrEqual(390);
  await expect(closeButton).toBeVisible();
  await expect(panel).toContainText('Costero');
  await expect(panel).not.toContainText('Información pública de demostración');
  await expect(
    panel.getByRole('link', {
      name: 'Abrir ficha completa de Puerto de demostración en una pestaña nueva',
    }),
  ).toBeVisible();
});

test('keeps search, markers and compact details available when the remote image fails', async ({
  page,
}) => {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable' });
  });

  await page.goto('/');

  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'error');
  await expect(page.getByRole('alert')).toContainText('No se ha podido cargar');
  await expect(page.locator('.leaflet-image-layer')).toHaveCount(0);
  await expect(page.getByTestId('place-marker')).toHaveCount(PLACE_COUNT);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });

  await searchbox.fill('desfiladero de ejemplo');
  await searchbox.press('ArrowDown');
  await page.keyboard.press('Enter');

  const panel = page.getByTestId('place-details');
  await expect(panel).toContainText('Paso de demostración');
  await expect(panel).not.toContainText('Referencia pública de viaje');
  await expect(
    page.getByRole('button', {
      name: 'Paso de demostración. Categoría: Lugar destacado.',
    }),
  ).toHaveAttribute('aria-pressed', 'true');
});
