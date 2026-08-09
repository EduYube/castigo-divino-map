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

test('loads the Beta 0.2 public experience from the repository subdirectory', async ({
  page,
  baseURL,
}) => {
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
  await expect(page.getByText('Beta 0.2', { exact: true })).toBeVisible();

  const backendStatus = page.locator('[data-backend-status]');
  if (process.env.PAGES_URL) {
    await expect(backendStatus).toHaveAttribute('data-backend-state', 'connected');
  } else {
    await expect
      .poll(async () => {
        const state = await backendStatus.getAttribute('data-backend-state');
        const reason = await backendStatus.getAttribute('data-backend-reason');
        return (
          state === 'connected' ||
          (state === 'degraded' && reason === 'configuration-missing')
        );
      })
      .toBe(true);
  }

  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('paso');
  await expect(page.getByRole('checkbox', { name: /Lugar destacado/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Paso de montaña/ })).toBeChecked();
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    'place-demo-pass',
  );
  await expect(page.getByText('Contenido de fans no oficial', { exact: true })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('Cartografía: Mike Schley');

  const detailsPanel = page.getByTestId('place-details');
  const popupPromise = page.waitForEvent('popup');
  await detailsPanel
    .getByRole('link', { name: /Abrir ficha completa de Paso de demostración/ })
    .click();
  const detailsPage = await popupPromise;
  await expect(
    detailsPage.getByRole('heading', { level: 1, name: 'Paso de demostración' }),
  ).toBeVisible();
  await expect(
    detailsPage.getByRole('heading', { level: 2, name: 'Notas públicas' }),
  ).toBeVisible();
  expect(new URL(detailsPage.url()).searchParams.get('entity')).toBe('paso-de-demostracion');
  await detailsPage.close();

  const requestOpen = page.getByRole('button', { name: 'Proponer un pin' });
  await expect(requestOpen).toBeVisible();
  await expect(requestOpen).toHaveAttribute('aria-expanded', 'false');
  await requestOpen.click();
  const requestForm = page.locator('[data-public-pin-request-form]');
  await expect(requestForm).toBeVisible();
  await expect(requestForm.getByLabel('Tipo de pin').locator('option')).toHaveCount(3);
  await expect(requestForm.getByLabel(/categor/i)).toHaveCount(0);
  await expect(requestForm.getByLabel(/etiquet/i)).toHaveCount(0);
  await expect(requestForm.getByLabel(/campañ/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar el formulario de solicitud' }).click();

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
  await expect(page.getByText('Beta 0.2', { exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('paso');
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    'place-demo-pass',
  );

  await page
    .getByTestId('place-details')
    .getByRole('button', { name: 'Cerrar la ficha de Paso de demostración' })
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

  const searchToggle = page.locator('[data-place-search-toggle]');
  const filtersToggle = page.locator('[data-place-filters-toggle]');
  const searchbox = page.getByRole('searchbox', {
    name: 'Buscar lugares',
    includeHidden: true,
  });

  await expect(page.getByText('Beta 0.2', { exact: true })).toBeVisible();
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'error');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect(searchToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(filtersToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(searchbox).toHaveValue('paso');
  await expect(
    page.getByRole('checkbox', { name: /Lugar destacado/, includeHidden: true }),
  ).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: /Paso de montaña/, includeHidden: true }),
  ).toBeChecked();
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    'place-demo-pass',
  );
  await expect(page.getByRole('button', { name: 'Proponer un pin' })).toBeVisible();
  await expect(page.getByText('La imagen no forma parte de la aplicación')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('Wizards of the Coast LLC');

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await searchToggle.click();
  await expect(searchToggle).toHaveAttribute('aria-expanded', 'true');
  await searchbox.focus();
  await expect(searchbox).toBeFocused();
  await searchbox.press('Tab');
  await expect(page.getByRole('button', { name: 'Limpiar búsqueda' })).toBeFocused();

  await page
    .getByTestId('place-details')
    .getByRole('button', { name: 'Cerrar la ficha de Paso de demostración' })
    .click();
  await expect(page.getByTestId('place-details')).toBeHidden();
  await expect(
    page.locator('[data-testid="place-marker"][data-place-id="place-demo-pass"]'),
  ).toBeFocused();
});

test('keeps Beta 0.2 usable from the public snapshot when Supabase returns 503', async ({
  page,
}) => {
  await mockOfficialMap(page);
  await page.route('**/rest/v1/**', async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });

  const response = await page.goto('?q=puerto');
  expect(response?.ok()).toBe(true);

  const backendStatus = page.locator('[data-backend-status]');
  await expect(backendStatus).toHaveAttribute('data-backend-state', 'degraded');
  await expect(backendStatus).toContainText('Modo de respaldo');
  await expect(backendStatus.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await expect(page.getByText('Beta 0.2', { exact: true })).toBeVisible();
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('puerto');
  await expect(page.getByRole('button', { name: 'Proponer un pin' })).toBeVisible();
});
