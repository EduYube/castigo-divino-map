import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map046_e2e_access_token';
const REFRESH_TOKEN = 'map046_e2e_refresh_token';
const PUBLISHABLE_KEY = 'sb_publishable_map046_e2e_key';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

interface RuntimeErrors {
  readonly pageErrors: Error[];
  readonly consoleErrors: string[];
}

function collectRuntimeErrors(page: Page): RuntimeErrors {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

async function configureCleanBackend(page: Page): Promise<void> {
  await page.addInitScript(
    ({ projectUrl, publishableKey }) => {
      window.__MAP017_AUTH_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        timeoutMs: 2_000,
      };
      window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
        projectUrl,
        publishableKey,
        timeoutMs: 2_000,
        retryDelaysMs: [],
      };
    },
    { projectUrl: PROJECT_URL, publishableKey: PUBLISHABLE_KEY },
  );

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await page.route('**/auth/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/logout')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        expires_in: 3600,
        user: {
          id: '00000000-0000-4000-8000-000000000046',
          email: 'admin-map046@example.invalid',
        },
      }),
    });
  });

  await page.route('**/rest/v1/rpc/current_user_is_admin', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
  });

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1) ?? '';
    if (table === 'rpc' || table === 'current_user_is_admin') {
      await route.fallback();
      return;
    }

    if (request.method() !== 'GET') {
      await route.fulfill({ status: 405, body: '' });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Range': '*/0',
      },
      body: '[]',
    });
  });
}

async function login(page: Page): Promise<void> {
  await expect(page.locator('.backend-status')).toHaveAttribute('data-backend-state', 'connected');
  await page.getByRole('button', { name: 'Administrar' }).click();
  await page.getByLabel('Correo').fill('admin-map046@example.invalid');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Crear personaje' })).toBeEnabled();
}

async function openAndCancelCatalogEditor(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Crear registro' })).toBeVisible();
  await expect(page.getByLabel('ID estable')).toBeFocused();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Crear registro' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Crear', exact: true })).toBeFocused();
}

function expectNoRuntimeErrors(errors: RuntimeErrors): void {
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
}

test('clean admin session opens categories and tags before any entity editor and ignores duplicate connected emissions', async ({
  page,
}) => {
  const errors = collectRuntimeErrors(page);
  await configureCleanBackend(page);
  await page.goto('/');
  await login(page);

  await openAndCancelCatalogEditor(page);

  await page.getByRole('button', { name: 'Etiquetas' }).click();
  await expect(page.getByText('No hay registros de este tipo.')).toBeVisible();
  await openAndCancelCatalogEditor(page);

  await page.getByRole('button', { name: 'Categorías' }).click();
  await expect(page.getByRole('button', { name: 'Crear', exact: true })).toBeEnabled();

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('atlas:public-data-status', { detail: { backendState: 'connected' } }),
    );
  });

  await expect(page.getByRole('button', { name: 'Crear', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Crear personaje' })).toBeEnabled();
  await openAndCancelCatalogEditor(page);
  expectNoRuntimeErrors(errors);
});

test('opening and closing character creation does not initialize or change catalog availability', async ({
  page,
}) => {
  const errors = collectRuntimeErrors(page);
  await configureCleanBackend(page);
  await page.goto('/');
  await login(page);

  const createCatalog = page.getByRole('button', { name: 'Crear', exact: true });
  await expect(createCatalog).toBeEnabled();

  await page.getByRole('button', { name: 'Crear personaje' }).click();
  await expect(page.getByRole('heading', { name: 'Crear character' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar editor' }).click();
  await expect(page.getByRole('heading', { name: 'Crear character' })).toBeHidden();

  await expect(createCatalog).toBeEnabled();
  await openAndCancelCatalogEditor(page);
  await page.getByRole('button', { name: 'Etiquetas' }).click();
  await openAndCancelCatalogEditor(page);
  await page.getByRole('button', { name: 'Categorías' }).click();
  await openAndCancelCatalogEditor(page);

  expectNoRuntimeErrors(errors);
});
