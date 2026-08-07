import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map017_e2e_access_token';
const REFRESH_TOKEN = 'map017_e2e_refresh_token';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

type LoginMode = 'admin' | 'non-admin' | 'invalid' | 'network-error';
type AuthorizationMode = 'admin' | 'non-admin' | 'expired';

interface AuthTestBackend {
  setLoginMode(mode: LoginMode): void;
  setAuthorizationMode(mode: AuthorizationMode): void;
}

async function configureAuthTest(page: Page): Promise<AuthTestBackend> {
  let loginMode: LoginMode = 'admin';
  let authorizationMode: AuthorizationMode = 'admin';

  await page.addInitScript((projectUrl) => {
    window.__MAP017_AUTH_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map017_e2e_key',
      timeoutMs: 500,
    };
  }, PROJECT_URL);

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  await page.route('**/auth/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith('/logout')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.searchParams.get('grant_type') === 'refresh_token') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: ACCESS_TOKEN,
          refresh_token: REFRESH_TOKEN,
          expires_in: 3600,
          user: {
            id: '00000000-0000-4000-8000-000000000001',
            email: 'admin@example.invalid',
          },
        }),
      });
      return;
    }

    if (loginMode === 'network-error') {
      await route.abort('failed');
      return;
    }

    if (loginMode === 'invalid') {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'invalid_credentials',
          message: 'No account details should reach the UI.',
        }),
      });
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
          id:
            loginMode === 'admin'
              ? '00000000-0000-4000-8000-000000000001'
              : '00000000-0000-4000-8000-000000000002',
          email: loginMode === 'admin' ? 'admin@example.invalid' : 'other@example.invalid',
        },
      }),
    });
  });

  await page.route('**/rest/v1/rpc/current_user_is_admin', async (route: Route) => {
    if (authorizationMode === 'expired') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'expired' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(authorizationMode === 'admin'),
    });
  });

  return {
    setLoginMode(mode): void {
      loginMode = mode;
      authorizationMode = mode === 'non-admin' ? 'non-admin' : authorizationMode;
    },
    setAuthorizationMode(mode): void {
      authorizationMode = mode;
    },
  };
}

async function openAdminDialog(page: Page): Promise<void> {
  const entry = page.getByRole('button', { name: /Administrar|Administración/ });
  await entry.click();
  await expect(page.getByRole('dialog', { name: 'Acceso administrativo' })).toBeVisible();
}

async function login(page: Page, email = 'admin@example.invalid'): Promise<void> {
  await openAdminDialog(page);
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

test('visitor keeps the public atlas while the accessible login opens and restores focus', async ({
  page,
}) => {
  await configureAuthTest(page);
  await page.goto('/');

  const entry = page.getByRole('button', { name: 'Administrar' });
  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await expect(searchbox).toBeVisible();
  await expect(page.getByTestId('map-shell')).toBeVisible();

  await entry.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Correo')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(entry).toBeFocused();
  await expect(searchbox).toBeVisible();
});

test('invalid credentials show only the generic safe message', async ({ page }) => {
  const backend = await configureAuthTest(page);
  backend.setLoginMode('invalid');
  await page.goto('/');

  await login(page, 'unknown@example.invalid');

  const status = page.locator('#admin-auth-status');
  await expect(status).toContainText('No se pudo iniciar sesión');
  await expect(status).not.toContainText('No account details');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toBeVisible();
});

test('administrator can login, reload the same tab and logout locally', async ({ page }) => {
  await configureAuthTest(page);
  await page.goto('/');

  await login(page);
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();
  await expect(page.getByText(/Sesión autorizada: admin@example\.invalid/)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Administración' })).toBeVisible();
  await openAdminDialog(page);
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Administrar' })).toBeVisible();

  const storedSession = await page.evaluate(() =>
    window.sessionStorage.getItem('castigo-divino-map:auth:v1'),
  );
  expect(storedSession).toBeNull();
});

test('authenticated non-admin never receives administrative mode', async ({ page }) => {
  const backend = await configureAuthTest(page);
  backend.setLoginMode('non-admin');
  backend.setAuthorizationMode('non-admin');
  await page.goto('/');

  await login(page, 'other@example.invalid');

  await expect(page.locator('#admin-auth-status')).toContainText(
    'La cuenta autenticada no tiene acceso administrativo.',
  );
  await expect(page.getByText('Modo administrativo activo.')).toBeHidden();
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toBeVisible();
});

test('authorization 401 after reload expires the admin session without removing the map', async ({
  page,
}) => {
  const backend = await configureAuthTest(page);
  await page.goto('/');
  await login(page);
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();

  backend.setAuthorizationMode('expired');
  await page.reload();
  await openAdminDialog(page);

  await expect(page.locator('#admin-auth-status')).toContainText('ha caducado');
  await expect(page.getByText('Modo administrativo activo.')).toBeHidden();
  await expect(page.getByTestId('map-shell')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Buscar lugares' })).toBeVisible();
});

test('Auth network failure does not change the public atlas availability', async ({ page }) => {
  const backend = await configureAuthTest(page);
  backend.setLoginMode('network-error');
  await page.goto('/');

  await login(page);

  await expect(page.locator('#admin-auth-status')).toContainText(
    'El atlas público sigue disponible.',
  );
  const mapShell = page.getByTestId('map-shell');
  await expect(mapShell).toBeVisible();
  await expect(mapShell).toHaveAttribute('data-map-state', 'ready');
  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await searchbox.fill('paso');
  await expect(searchbox).toHaveValue('paso');
});

test('admin login remains usable at 320px without horizontal overflow or token exposure', async ({
  page,
}) => {
  await configureAuthTest(page);
  await page.setViewportSize({ width: 320, height: 720 });
  const consoleMessages: string[] = [];
  page.on('console', (message) => consoleMessages.push(message.text()));
  await page.goto('/');

  await openAdminDialog(page);
  await expect(page.getByLabel('Correo')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByLabel('Correo').fill('admin@example.invalid');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();

  expect(page.url()).not.toContain(ACCESS_TOKEN);
  expect(await page.locator('body').innerText()).not.toContain(ACCESS_TOKEN);
  expect(await page.locator('body').innerText()).not.toContain(REFRESH_TOKEN);
  expect(consoleMessages.join('\n')).not.toContain(ACCESS_TOKEN);
  expect(consoleMessages.join('\n')).not.toContain(REFRESH_TOKEN);
});
