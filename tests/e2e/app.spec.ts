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

test('loads the official URL through a neutral test response without console errors', async ({
  page,
}) => {
  const applicationErrors: string[] = [];

  page.on('pageerror', (error) => applicationErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      applicationErrors.push(message.text());
    }
  });

  await openReadyMap(page);

  await expect(page).toHaveTitle('El Atlas de los Nuevos Dioses');
  await expect(
    page.getByRole('heading', { level: 1, name: 'El Atlas de los Nuevos Dioses' }),
  ).toBeVisible();
  await expect(page.locator('.leaflet-image-layer')).toHaveAttribute('src', OFFICIAL_MAP_URL);
  await expect(page.getByText('Contenido de fans no oficial', { exact: true })).toBeVisible();
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

test('opens the correct public place details and closes back to its marker', async ({ page }) => {
  await openReadyMap(page);

  const marker = page.getByRole('button', {
    name: 'Puerto de demostración. Categoría: Asentamiento.',
  });

  await marker.click();

  const panel = page.getByTestId('place-details');

  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-harbor');
  await expect(page.getByRole('heading', { level: 3, name: 'Puerto de demostración' })).toBeFocused();
  await expect(panel.getByText('Puerto de ejemplo', { exact: true })).toBeVisible();
  await expect(panel.getByText('Asentamiento', { exact: true })).toBeVisible();
  await expect(panel.getByText('Costero', { exact: true })).toBeVisible();
  await expect(panel.getByText('Dato de demostración', { exact: true })).toBeVisible();
  await expect(panel.getByText('Ruta comercial', { exact: true })).toBeVisible();
  await expect(
    panel.getByRole('heading', { level: 5, name: 'Información pública de demostración' }),
  ).toBeVisible();
  await expect(panel).toContainText('Este puerto ficticio sirve para comprobar fichas');
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  await expect(marker).toHaveClass(/campaign-marker-icon--active/);

  await panel.getByRole('button', { name: 'Cerrar la ficha del lugar' }).click();

  await expect(panel).toBeHidden();
  await expect(marker).toHaveAttribute('aria-pressed', 'false');
  await expect(marker).toBeFocused();
});

test('supports keyboard marker activation and keyboard close without a focus trap', async ({ page }) => {
  await openReadyMap(page);

  const marker = page.getByRole('button', {
    name: 'Paso de demostración. Categoría: Lugar destacado.',
  });

  await marker.focus();
  await page.keyboard.press('Space');

  const panel = page.getByTestId('place-details');
  const title = panel.getByRole('heading', { level: 3, name: 'Paso de demostración' });
  const closeButton = panel.getByRole('button', { name: 'Cerrar la ficha del lugar' });

  await expect(panel).toBeVisible();
  await expect(title).toBeFocused();
  await expect(panel.getByText('Lugar destacado', { exact: true })).toBeVisible();
  await expect(panel.getByText('Desfiladero de ejemplo', { exact: true })).toBeVisible();
  await expect(panel).toContainText('Referencia pública de viaje');

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

test('keeps a useful map and an in-viewport details layout on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyMap(page);

  const map = page.locator('[data-map-canvas]');
  const mapBox = await map.boundingBox();

  expect(mapBox).not.toBeNull();
  expect(mapBox?.width).toBeLessThanOrEqual(390);
  expect(mapBox?.width).toBeGreaterThan(340);
  expect(mapBox?.height).toBeGreaterThan(360);

  await page
    .getByRole('button', { name: 'Puerto de demostración. Categoría: Asentamiento.' })
    .click();

  const panel = page.getByTestId('place-details');

  await panel.scrollIntoViewIfNeeded();
  const panelBox = await panel.boundingBox();

  expect(panelBox).not.toBeNull();
  expect(panelBox?.x).toBeGreaterThanOrEqual(0);
  expect((panelBox?.x ?? 0) + (panelBox?.width ?? 0)).toBeLessThanOrEqual(390);
  await expect(panel.getByRole('button', { name: 'Cerrar la ficha del lugar' })).toBeVisible();
  await expect(panel).toContainText('Información pública de demostración');
});

test('keeps markers and details available when the remote image fails', async ({ page }) => {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable' });
  });

  await page.goto('/');

  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'error');
  await expect(page.getByRole('alert')).toContainText('No se ha podido cargar');
  await expect(page.locator('.leaflet-image-layer')).toHaveCount(0);
  await expect(page.getByTestId('place-marker')).toHaveCount(PLACE_COUNT);

  await page
    .getByRole('button', {
      name: 'Paso de demostración. Categoría: Lugar destacado.',
    })
    .click();

  await expect(page.getByTestId('place-details')).toContainText('Paso de demostración');
});
