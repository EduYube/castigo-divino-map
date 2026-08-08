import { expect, test, type BrowserContext, type Page } from '@playwright/test';

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

function marker(page: Page, placeId: string) {
  return page.locator(`[data-testid="place-marker"][data-place-id="${placeId}"]`);
}

async function createSharedPage(context: BrowserContext, url: string): Promise<Page> {
  const sharedPage = await context.newPage();

  await mockOfficialMap(sharedPage);
  await sharedPage.goto(url);
  await expect(sharedPage.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');

  return sharedPage;
}

test('gives every marker a stable canonical place URL', async ({ page }) => {
  await openReadyMap(page);

  await marker(page, 'place-demo-harbor').click();
  await expect(page).toHaveURL(/\?place=puerto-de-demostracion$/);
  const harborUrl = page.url();

  await marker(page, 'place-demo-pass').click();
  await expect(page).toHaveURL(/\?place=paso-de-demostracion$/);
  const passUrl = page.url();

  expect(harborUrl).not.toBe(passUrl);
  expect(new URL(harborUrl).searchParams.get('place')).toBe('puerto-de-demostracion');
  expect(new URL(passUrl).searchParams.get('place')).toBe('paso-de-demostracion');
});

test('restores a complete shared state without stealing focus', async ({ page }) => {
  await openReadyMap(
    page,
    '/?place=paso-de-demostracion&q=paso&category=lugares-destacados&tag=mountain-pass',
  );

  const panel = page.getByTestId('place-details');
  const activeMarker = marker(page, 'place-demo-pass');

  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('paso');
  await expect(page.getByRole('checkbox', { name: /Lugar destacado/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Paso de montaña/ })).toBeChecked();
  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-pass');
  await expect(activeMarker).toHaveAttribute('aria-pressed', 'true');
  await expect(activeMarker).toHaveAttribute('data-filter-match', 'true');
  await expect(
    panel.getByRole('heading', { level: 3, name: 'Paso de demostración' }),
  ).not.toBeFocused();
  await expect(page.locator('[data-testid="place-marker"][aria-pressed="true"]')).toHaveCount(1);
});

test('preserves the same state after reload and in a new page', async ({ page, context }) => {
  await openReadyMap(
    page,
    '/?place=puerto-de-demostracion&q=puerto&category=asentamientos&tag=coastal',
  );
  const sharedUrl = page.url();

  await page.reload();
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    'place-demo-harbor',
  );
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('puerto');
  await expect(page.getByRole('checkbox', { name: /Asentamiento/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Costero/ })).toBeChecked();

  const sharedPage = await createSharedPage(context, sharedUrl);

  await expect(sharedPage.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    'place-demo-harbor',
  );
  await expect(sharedPage.getByRole('searchbox', { name: 'Buscar lugares' })).toHaveValue('puerto');
  await sharedPage.close();
});

test('updates query with replaceState and discrete actions with pushState', async ({ page }) => {
  await openReadyMap(page);

  const initialHistoryLength = await page.evaluate(() => window.history.length);
  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });

  await searchbox.pressSequentially('paso');

  await expect(page).toHaveURL(/\?q=paso$/);
  expect(await page.evaluate(() => window.history.length)).toBe(initialHistoryLength);

  await page.getByRole('checkbox', { name: /Lugar destacado/ }).check();
  await expect(page).toHaveURL(/\?q=paso&category=lugares-destacados$/);
  expect(await page.evaluate(() => window.history.length)).toBe(initialHistoryLength + 1);

  await marker(page, 'place-demo-pass').click();
  await expect(page).toHaveURL(/\?place=paso-de-demostracion&q=paso&category=lugares-destacados$/);
  expect(await page.evaluate(() => window.history.length)).toBe(initialHistoryLength + 2);
});

test('restores all dimensions with back and forward without creating entries', async ({ page }) => {
  await openReadyMap(page);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  const landmark = page.getByRole('checkbox', { name: /Lugar destacado/ });
  const panel = page.getByTestId('place-details');

  await searchbox.fill('paso');
  await landmark.check();
  await marker(page, 'place-demo-pass').click();
  await panel.getByRole('button', { name: 'Cerrar la ficha de Paso de demostración' }).click();

  const historyLength = await page.evaluate(() => window.history.length);

  await page.goBack();
  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-pass');
  await expect(searchbox).toHaveValue('paso');
  await expect(landmark).toBeChecked();
  await expect(
    panel.getByRole('heading', { level: 3, name: 'Paso de demostración' }),
  ).not.toBeFocused();
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);

  await page.goBack();
  await expect(panel).toBeHidden();
  await expect(searchbox).toHaveValue('paso');
  await expect(landmark).toBeChecked();

  await page.goBack();
  await expect(searchbox).toHaveValue('paso');
  await expect(landmark).not.toBeChecked();
  await expect(marker(page, 'place-demo-harbor')).toHaveAttribute('data-filter-match', 'false');
  await expect(marker(page, 'place-demo-pass')).toHaveAttribute('data-filter-match', 'true');

  await page.goForward();
  await expect(landmark).toBeChecked();
  await expect(panel).toBeHidden();

  await page.goForward();
  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-pass');
  await expect(page.locator('[data-testid="place-marker"][aria-pressed="true"]')).toHaveCount(1);
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
});

test('canonicalizes invalid and repeated values while preserving valid state', async ({ page }) => {
  await openReadyMap(
    page,
    '/?tag=unknown&place=desconocido&place=puerto-de-demostracion&category=invalid&category=asentamientos&tag=coastal&tag=coastal&external=value',
  );

  await expect(page).toHaveURL(
    /\?place=puerto-de-demostracion&category=asentamientos&tag=coastal$/,
  );
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    'place-demo-harbor',
  );
  await expect(page.getByRole('checkbox', { name: /Asentamiento/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Costero/ })).toBeChecked();
});

test('restores a valid no-match state and keeps the active marker operable', async ({ page }) => {
  await openReadyMap(
    page,
    '/?place=puerto-de-demostracion&q=puerto&category=lugares-destacados&tag=mountain-pass',
  );

  const harbor = marker(page, 'place-demo-harbor');

  await expect(page.locator('[data-place-filters-status]')).toContainText('Ningún lugar coincide');
  await expect(harbor).toHaveAttribute('aria-pressed', 'true');
  await expect(harbor).toHaveAttribute('data-filter-match', 'false');
  await expect(harbor).toHaveClass(/campaign-marker-icon--active/);
  await expect(harbor).toHaveClass(/campaign-marker-icon--dimmed/);
  await expect(page.locator('[data-testid="place-marker"][aria-pressed="true"]')).toHaveCount(1);
});

test('restores state on mobile and when the official map fails', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable' });
  });
  await page.goto(
    '/?place=paso-de-demostracion&q=paso&category=lugares-destacados&tag=mountain-pass',
  );

  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'error');
  await expect(
    page.getByRole('searchbox', { name: 'Buscar lugares', includeHidden: true }),
  ).toHaveValue('paso');
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
  await expect(marker(page, 'place-demo-pass')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('handles malformed encoding without an uncaught application error', async ({ page }) => {
  const applicationErrors: string[] = [];

  page.on('pageerror', (error) => applicationErrors.push(error.message));
  await openReadyMap(page, '/?q=%E0%A4%A&tag=coastal');

  await expect(page.getByRole('checkbox', { name: /Costero/ })).toBeChecked();
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  expect(applicationErrors).toEqual([]);
});
