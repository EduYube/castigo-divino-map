import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map054_e2e_access_token';
const REFRESH_TOKEN = 'map054_e2e_refresh_token';
const PUBLISHABLE_KEY = 'sb_publishable_map054_e2e_key';
const INITIAL_CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B_ID = '00000000-0000-4000-8000-000000000540';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

const campaigns = [
  {
    id: INITIAL_CAMPAIGN_ID,
    slug: 'castigo-divino',
    name: 'Castigo Divino',
    status: 'active',
    display_order: 0,
    archived_at: null,
    updated_at: '2026-08-26T10:00:00.000Z',
  },
  {
    id: CAMPAIGN_B_ID,
    slug: 'campana-b',
    name: 'Campaña B',
    status: 'active',
    display_order: 1,
    archived_at: null,
    updated_at: '2026-08-26T10:01:00.000Z',
  },
];

const rosters = new Map<string, readonly Record<string, unknown>[]>([
  [
    INITIAL_CAMPAIGN_ID,
    [
      {
        id: 'player-skade',
        campaign_id: INITIAL_CAMPAIGN_ID,
        slug: 'skade',
        display_name: 'Skade',
        publication_status: 'published',
        published_at: '2026-08-26T10:00:00.000Z',
        display_order: 0,
        accent_color: '#c2410c',
        archived_at: null,
        updated_at: '2026-08-26T10:00:00.000Z',
      },
    ],
  ],
  [
    CAMPAIGN_B_ID,
    [
      {
        id: 'player-b',
        campaign_id: CAMPAIGN_B_ID,
        slug: 'jugadora-b',
        display_name: 'Jugadora B',
        publication_status: 'published',
        published_at: '2026-08-26T10:01:00.000Z',
        display_order: 0,
        accent_color: '#1e3a8a',
        archived_at: null,
        updated_at: '2026-08-26T10:01:00.000Z',
      },
    ],
  ],
]);

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

function collectionHeaders(count: number): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Content-Range': count === 0 ? '*/0' : `0-${count - 1}/${count}`,
  };
}

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
          id: '00000000-0000-4000-8000-000000000054',
          email: 'admin-map054@example.invalid',
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
      await route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
      return;
    }

    if (table === 'campaigns') {
      await route.fulfill({
        status: 200,
        headers: collectionHeaders(campaigns.length),
        body: JSON.stringify(campaigns),
      });
      return;
    }

    if (table === 'players') {
      const filter = url.searchParams.get('campaign_id') ?? '';
      const campaignId = filter.startsWith('eq.') ? filter.slice(3) : '';
      const players = rosters.get(campaignId) ?? [];
      await route.fulfill({
        status: 200,
        headers: collectionHeaders(players.length),
        body: JSON.stringify(players),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: collectionHeaders(0),
      body: '[]',
    });
  });
}

async function login(page: Page): Promise<void> {
  await expect(page.locator('.backend-status')).toHaveAttribute('data-backend-state', 'connected');
  await page.getByRole('button', { name: 'Administrar' }).click();
  await page.getByLabel('Correo').fill('admin-map054@example.invalid');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Campañas y personajes jugadores' })).toBeVisible();
  await expect(page.getByLabel('Campaña administrativa')).toHaveValue(INITIAL_CAMPAIGN_ID);
  await expect(page.getByText('Skade', { exact: true })).toBeVisible();
}

function expectNoRuntimeErrors(errors: RuntimeErrors): void {
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
}

test('dirty roster edits cannot silently cross campaigns and focus is restored on cancel', async ({
  page,
}) => {
  const errors = collectRuntimeErrors(page);
  await configureBackend(page);
  await page.goto('/');
  await login(page);

  const newPlayer = page.getByRole('button', { name: 'Crear jugador' });
  await newPlayer.click();
  const name = page.getByLabel('Nombre visible');
  await expect(name).toBeFocused();
  await name.fill('Borrador sin guardar');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('cambios administrativos sin guardar');
    await dialog.dismiss();
  });
  await page.getByLabel('Campaña administrativa').selectOption(CAMPAIGN_B_ID);
  await expect(page.getByLabel('Campaña administrativa')).toHaveValue(INITIAL_CAMPAIGN_ID);
  await expect(name).toHaveValue('Borrador sin guardar');
  await expect(page.getByLabel('Campaña administrativa')).toBeFocused();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('cambios administrativos sin guardar');
    await dialog.accept();
  });
  await page.getByLabel('Campaña administrativa').selectOption(CAMPAIGN_B_ID);
  await expect(page.getByLabel('Campaña administrativa')).toHaveValue(CAMPAIGN_B_ID);
  await expect(page.getByText('Jugadora B', { exact: true })).toBeVisible();
  await expect(page.getByText('Skade', { exact: true })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Crear jugador' })).toBeHidden();

  await newPlayer.click();
  await expect(name).toBeFocused();
  await name.fill('   ');
  await page.getByLabel('Acento de color').fill('#ffffff');
  await page.getByRole('button', { name: 'Guardar jugador' }).click();
  await expect(page.getByText('El nombre visible debe tener entre 1 y 120 caracteres.')).toBeVisible();
  await expect(page.getByText('El acento necesita al menos contraste 3:1 sobre blanco.')).toBeVisible();
  await expect(name).toBeFocused();

  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(newPlayer).toBeFocused();
  expectNoRuntimeErrors(errors);
});

test('campaign roster workspace stays usable without horizontal overflow from 320 to 430 px', async ({
  page,
}) => {
  const errors = collectRuntimeErrors(page);
  await configureBackend(page);
  await page.goto('/');
  await login(page);

  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 900 });
    const roster = page.locator('.admin-campaign-roster');
    await expect(roster).toBeVisible();
    expect(
      await roster.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      `MAP-054 roster should not overflow at ${width}px`,
    ).toBe(true);

    const campaignSelect = page.getByLabel('Campaña administrativa');
    const bounds = await campaignSelect.boundingBox();
    expect(bounds).not.toBeNull();
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width + 1);
  }

  await page.getByRole('button', { name: 'Crear jugador' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Nombre visible')).toBeFocused();
  expectNoRuntimeErrors(errors);
});
