import { expect, test, type Page } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';

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
  await expect(page.getByText('Contenido de fans no oficial')).toBeVisible();
  expect(applicationErrors).toEqual([]);
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

  for (let index = 0; index < 12; index += 1) {
    if ((await zoomOutControl.getAttribute('aria-disabled')) === 'true') {
      break;
    }

    await zoomOutControl.click();
  }

  await expect(zoomOutControl).toHaveClass(/leaflet-disabled/);
});

test('adapts the map to a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyMap(page);

  const mapBox = await page.locator('[data-map-canvas]').boundingBox();

  expect(mapBox).not.toBeNull();
  expect(mapBox?.width).toBeLessThanOrEqual(390);
  expect(mapBox?.width).toBeGreaterThan(340);
  expect(mapBox?.height).toBeGreaterThan(380);
});

test('shows an accessible neutral fallback when the remote image fails', async ({ page }) => {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable' });
  });

  await page.goto('/');

  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'error');
  await expect(page.getByRole('alert')).toContainText('No se ha podido cargar');
  await expect(page.locator('.leaflet-image-layer')).toHaveCount(0);
});
