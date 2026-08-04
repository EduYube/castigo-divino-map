import { expect, test, type Page, type Request } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const NEUTRAL_TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

async function mockOfficialMap(page: Page, status = 200): Promise<void> {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill(
      status === 200
        ? { status, contentType: 'image/svg+xml', body: NEUTRAL_TEST_MAP }
        : { status, contentType: 'text/plain', body: 'Unavailable' },
    );
  });
}

function generatedResourceRequests(requests: readonly Request[]): readonly Request[] {
  return requests.filter((request) => /\.(?:css|js)(?:\?|$)/.test(request.url()));
}

test('loads a complete shared URL from the repository subdirectory', async ({ page, baseURL }) => {
  const failedResponses: string[] = [];
  const requests: Request[] = [];

  page.on('request', (request) => requests.push(request));
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url() !== OFFICIAL_MAP_URL) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await mockOfficialMap(page);
  const response = await page.goto(
    '?place=paso-de-demostracion&q=paso&category=lugares-destacados&tag=mountain-pass',
  );

  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle(/Atlas de los Nuevos Dioses/i);
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('paso');
  await expect(page.getByRole('checkbox', { name: /Lugar destacado/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Paso de montaña/ })).toBeChecked();
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    'place-demo-pass',
  );
  await expect(page.getByText('Contenido de fans no oficial')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('Cartografía: Mike Schley');

  const expectedPathname = new URL(baseURL ?? page.url()).pathname;
  expect(new URL(page.url()).pathname).toBe(expectedPathname);
  expect(generatedResourceRequests(requests).length).toBeGreaterThanOrEqual(2);

  for (const request of generatedResourceRequests(requests)) {
    expect(new URL(request.url()).pathname.startsWith(`${expectedPathname}assets/`)).toBe(true);
  }

  const mapRequests = requests.filter((request) =>
    /Sword-Coast-Map|\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(request.url()),
  );
  expect(mapRequests.map((request) => request.url())).toEqual([OFFICIAL_MAP_URL]);
  expect(failedResponses).toEqual([]);

  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('paso');
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    'place-demo-pass',
  );

  await page
    .getByTestId('place-details')
    .getByRole('button', { name: 'Cerrar la ficha del lugar' })
    .click();
  await expect(page.getByTestId('place-details')).toBeHidden();
  await page.goBack();
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    'place-demo-pass',
  );
  await page.goForward();
  await expect(page.getByTestId('place-details')).toBeHidden();
});

test('keeps the 320 px experience usable when the remote map fails', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await mockOfficialMap(page, 503);

  await page.goto(
    '?place=paso-de-demostracion&q=paso&category=lugares-destacados&tag=mountain-pass',
  );

  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'error');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('paso');
  await expect(page.getByRole('checkbox', { name: /Lugar destacado/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Paso de montaña/ })).toBeChecked();
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    'place-demo-pass',
  );
  await expect(page.getByText('La imagen no forma parte de la aplicación')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('Wizards of the Coast LLC');

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await searchbox.focus();
  await expect(searchbox).toBeFocused();
  await searchbox.press('Tab');
  await expect(page.getByRole('button', { name: 'Limpiar búsqueda' })).toBeFocused();

  await page
    .getByTestId('place-details')
    .getByRole('button', { name: 'Cerrar la ficha del lugar' })
    .click();
  await expect(page.getByTestId('place-details')).toBeHidden();
  await expect(page.locator('[data-place-id="place-demo-pass"]')).toBeFocused();
});
