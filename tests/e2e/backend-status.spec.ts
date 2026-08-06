import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const SUPABASE_PATTERN = '**/rest/v1/**';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

type BackendMode = 'success' | 'failure';

async function configurePublicDataTest(page: Page): Promise<{ setMode(mode: BackendMode): void }> {
  let mode: BackendMode = 'success';

  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map016_test_key',
      timeoutMs: 2000,
      retryDelaysMs: [0, 0, 0],
    };
  }, LOCAL_SUPABASE_URL);
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });
  await page.route(SUPABASE_PATTERN, async (route: Route) => {
    if (mode === 'failure') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  return {
    setMode(nextMode: BackendMode): void {
      mode = nextMode;
    },
  };
}

test('falls back and recovers without changing search, filters, selection or URL', async ({
  page,
}) => {
  const backend = await configurePublicDataTest(page);
  await page.goto(
    '/?place=paso-de-demostracion&q=paso&category=lugares-destacados&tag=mountain-pass',
  );

  const status = page.locator('[data-backend-status]');
  const details = page.getByTestId('place-details');
  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  const category = page.getByRole('checkbox', { name: /Lugar destacado/ });
  const tag = page.getByRole('checkbox', { name: /Paso de montaña/ });
  const originalUrl = page.url();

  await expect(status).toHaveAttribute('data-backend-state', 'connected');
  await expect(status).toContainText('Servicio de datos conectado');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect(details).toHaveAttribute('data-active-place-id', 'place-demo-pass');
  await expect(searchbox).toHaveValue('paso');
  await expect(category).toBeChecked();
  await expect(tag).toBeChecked();

  backend.setMode('failure');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await expect(status).toHaveAttribute('data-backend-state', 'degraded');
  await expect(status).toContainText('Modo de respaldo');
  await expect(status.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect(details).toHaveAttribute('data-active-place-id', 'place-demo-pass');
  await expect(searchbox).toHaveValue('paso');
  await expect(category).toBeChecked();
  await expect(tag).toBeChecked();
  expect(page.url()).toBe(originalUrl);

  backend.setMode('success');
  await status.getByRole('button', { name: 'Reintentar' }).click();

  await expect(status).toHaveAttribute('data-backend-state', 'connected');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect(details).toHaveAttribute('data-active-place-id', 'place-demo-pass');
  expect(page.url()).toBe(originalUrl);
});

test('announces offline mode textually and keeps the snapshot usable', async ({
  page,
  context,
}) => {
  await configurePublicDataTest(page);
  await page.goto('/');

  const status = page.locator('[data-backend-status]');
  await expect(status).toHaveAttribute('data-backend-state', 'connected');

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));

  await expect(status).toHaveAttribute('data-backend-state', 'offline');
  await expect(status).toContainText('Sin conexión');
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  await expect(status.getByRole('button', { name: 'Reintentar' })).toBeVisible();

  await context.setOffline(false);
  await status.getByRole('button', { name: 'Reintentar' }).click();
  await expect(status).toHaveAttribute('data-backend-state', 'connected');
});
