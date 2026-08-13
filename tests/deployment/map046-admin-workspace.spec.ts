import { expect, test, type Route } from '@playwright/test';

const ACCESS_TOKEN = 'map046_pages_access_token';
const REFRESH_TOKEN = 'map046_pages_refresh_token';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, prefer, range, range-unit, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
} as const;

async function routeProductionBackend(route: Route): Promise<void> {
  const request = route.request();
  const url = new URL(request.url());

  if (request.method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' });
    return;
  }

  if (url.pathname.includes('/auth/v1/')) {
    if (url.pathname.endsWith('/logout')) {
      await route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        expires_in: 3600,
        user: {
          id: '00000000-0000-4000-8000-000000000046',
          email: 'admin-map046-pages@example.invalid',
        },
      }),
    });
    return;
  }

  if (url.pathname.endsWith('/rest/v1/rpc/current_user_is_admin')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: 'true',
    });
    return;
  }

  if (url.pathname.includes('/rest/v1/') && request.method() === 'GET') {
    await route.fulfill({
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Access-Control-Expose-Headers': 'Content-Range',
        'Content-Type': 'application/json',
        'Content-Range': '*/0',
      },
      body: '[]',
    });
    return;
  }

  await route.fulfill({
    status: 404,
    contentType: 'application/json',
    headers: CORS_HEADERS,
    body: '{}',
  });
}

test('production-equivalent Pages artifact opens an empty catalog as the first admin action', async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.route('**/auth/v1/**', routeProductionBackend);
  await page.route('**/rest/v1/**', routeProductionBackend);
  await page.goto('/');

  await expect(page.locator('.backend-status')).toHaveAttribute('data-backend-state', 'connected');
  await page.getByRole('button', { name: 'Administrar' }).click();
  await page.getByLabel('Correo').fill('admin-map046-pages@example.invalid');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();

  const create = page.getByRole('button', { name: 'Crear', exact: true });
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByRole('heading', { name: 'Crear registro' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await page.getByRole('button', { name: 'Etiquetas' }).click();
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByRole('heading', { name: 'Crear registro' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
    );
  });
  await expect(create).toBeEnabled();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
