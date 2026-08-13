import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map048_e2e_access_token';
const REFRESH_TOKEN = 'map048_e2e_refresh_token';
const PUBLISHABLE_KEY = 'sb_publishable_map048_e2e_key';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

const DESKTOP_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
] as const;

const MOBILE_VIEWPORTS = [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

async function configureBackend(page: Page): Promise<void> {
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
        retryDelaysMs: [0],
      };
    },
    { projectUrl: PROJECT_URL, publishableKey: PUBLISHABLE_KEY },
  );

  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: TEST_MAP,
    });
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
          id: '00000000-0000-4000-8000-000000000048',
          email: 'admin-map048@example.invalid',
        },
      }),
    });
  });

  await page.route('**/rest/v1/rpc/current_user_is_admin', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'true',
    });
  });

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/rpc/current_user_is_admin')) {
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

async function openLogin(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Administrar' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Acceso administrativo' }),
  ).toBeVisible();
}

async function login(page: Page): Promise<void> {
  await openLogin(page);
  await page.getByLabel('Correo').fill('admin-map048@example.invalid');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Modo administrativo activo.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Crear personaje' }),
  ).toBeEnabled();
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    document:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    dialog: (() => {
      const dialog = document.querySelector<HTMLDialogElement>(
        '.admin-auth-dialog',
      );
      return dialog
        ? dialog.scrollWidth - dialog.clientWidth
        : Number.POSITIVE_INFINITY;
    })(),
  }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.dialog).toBeLessThanOrEqual(1);
}

async function openEntityEditor(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Crear personaje' }).click();
  await expect(
    page.getByRole('heading', { name: 'Crear character' }),
  ).toBeVisible();
  await expect(page.getByTestId('admin-coordinate-map')).toBeVisible();
}

for (const viewport of DESKTOP_VIEWPORTS) {
  test(`MAP-048 desktop ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await configureBackend(page);
    await page.goto('/');

    await openLogin(page);
    const dialog = page.locator('.admin-auth-dialog');
    const loginBox = await dialog.boundingBox();
    expect(loginBox).not.toBeNull();
    expect(loginBox!.width).toBeLessThanOrEqual(500);

    await page.getByLabel('Correo').fill('admin-map048@example.invalid');
    await page.getByLabel('Contraseña').fill('test-password');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByText('Modo administrativo activo.')).toBeVisible();

    const workspaceBox = await dialog.boundingBox();
    expect(workspaceBox).not.toBeNull();
    expect(workspaceBox!.width).toBeGreaterThan(loginBox!.width * 1.65);
    expect(workspaceBox!.width).toBeGreaterThan(viewport.width * 0.74);
    expect(workspaceBox!.x).toBeGreaterThanOrEqual(0);
    expect(workspaceBox!.x + workspaceBox!.width).toBeLessThanOrEqual(
      viewport.width + 1,
    );
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Crear', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Crear registro' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Etiquetas' }).click();
    await page.getByRole('button', { name: 'Crear', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Crear registro' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

    await openEntityEditor(page);
    const fields = page.locator(
      '.admin-map-entity__fields > .admin-map-entity__field',
    );
    const firstField = await fields.nth(0).boundingBox();
    const secondField = await fields.nth(1).boundingBox();
    expect(firstField).not.toBeNull();
    expect(secondField).not.toBeNull();
    expect(Math.abs(secondField!.y - firstField!.y)).toBeLessThan(4);
    expect(secondField!.x).toBeGreaterThan(
      firstField!.x + firstField!.width * 0.8,
    );

    const map = page.getByTestId('admin-coordinate-map');
    const mapBox = await map.boundingBox();
    expect(mapBox).not.toBeNull();
    expect(mapBox!.width).toBeGreaterThan(
      viewport.width === 1440 ? 900 : 650,
    );
    expect(mapBox!.height).toBeGreaterThan(300);
    await expect(map.locator('.leaflet-image-layer')).toBeVisible();

    await map.click({
      position: {
        x: mapBox!.width * 0.55,
        y: mapBox!.height * 0.45,
      },
    });
    await expect(page.getByTestId('admin-coordinate-marker')).toBeVisible();

    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(
      page.locator('.admin-map-entity__editor .admin-map-entity__status'),
    ).toContainText('No se ha publicado.');
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Cerrar editor' }).click();
    await expect(
      page.getByRole('heading', { name: 'Crear character' }),
    ).toBeHidden();
    await openEntityEditor(page);
    await expect(map.locator('.leaflet-image-layer')).toBeVisible();

    if (viewport.width === 1440) {
      const beforeResize = await map.boundingBox();
      await page.setViewportSize({ width: 1100, height: 780 });
      await expect
        .poll(async () => (await map.boundingBox())?.width ?? 0)
        .toBeLessThan(beforeResize!.width);
      await expect(map.locator('.leaflet-image-layer')).toBeVisible();
    }
  });
}

for (const viewport of MOBILE_VIEWPORTS) {
  test(`MAP-048 mobile ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await configureBackend(page);
    await page.goto('/');
    await login(page);

    const dialog = page.locator('.admin-auth-dialog');
    const workspaceBox = await dialog.boundingBox();
    expect(workspaceBox).not.toBeNull();
    expect(workspaceBox!.width).toBeGreaterThanOrEqual(viewport.width - 24);
    expect(workspaceBox!.x).toBeGreaterThanOrEqual(0);
    expect(workspaceBox!.x + workspaceBox!.width).toBeLessThanOrEqual(
      viewport.width + 1,
    );

    await openEntityEditor(page);
    const fields = page.locator(
      '.admin-map-entity__fields > .admin-map-entity__field',
    );
    const firstField = await fields.nth(0).boundingBox();
    const secondField = await fields.nth(1).boundingBox();
    expect(firstField).not.toBeNull();
    expect(secondField).not.toBeNull();
    expect(secondField!.y).toBeGreaterThan(
      firstField!.y + firstField!.height - 2,
    );

    const mapBox = await page.getByTestId('admin-coordinate-map').boundingBox();
    expect(mapBox).not.toBeNull();
    expect(mapBox!.width).toBeGreaterThan(viewport.width * 0.65);
    expect(mapBox!.width).toBeLessThanOrEqual(workspaceBox!.width);
    await expect(
      page.getByRole('button', { name: 'Cerrar editor' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Cerrar editor' }).click();
    const entry = page.getByRole('button', { name: 'Administración' });
    await page
      .getByRole('button', { name: 'Cerrar acceso administrativo' })
      .click();
    await expect(entry).toBeFocused();
    await entry.click();
    await expect(page.getByText('Modo administrativo activo.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(entry).toBeFocused();
  });
}
