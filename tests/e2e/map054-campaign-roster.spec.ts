import { expect, test, type Page, type Route } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const PROJECT_URL = 'http://127.0.0.1:4173';
const ACCESS_TOKEN = 'map054_e2e_access_token';
const REFRESH_TOKEN = 'map054_e2e_refresh_token';
const PUBLISHABLE_KEY = 'sb_publishable_map054_e2e_key';
const INITIAL_CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B_ID = '00000000-0000-4000-8000-000000000068';
const PORTRAIT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
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
    slug: 'un-aliento-menos',
    name: 'Un aliento menos',
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
        name_language: 'en',
        publication_status: 'published',
        published_at: '2026-08-26T10:00:00.000Z',
        display_order: 0,
        accent_color: '#c2410c',
        archived_at: null,
        updated_at: '2026-08-26T10:00:00.000Z',
      },
      {
        id: 'player-ura',
        campaign_id: INITIAL_CAMPAIGN_ID,
        slug: 'ura',
        display_name: 'Ura',
        name_language: 'en',
        publication_status: 'published',
        published_at: '2026-08-26T10:00:00.000Z',
        display_order: 1,
        accent_color: '#1e3a8a',
        archived_at: null,
        updated_at: '2026-08-26T10:00:00.000Z',
      },
    ],
  ],
  [
    CAMPAIGN_B_ID,
    [
      {
        id: 'player-veyra',
        campaign_id: CAMPAIGN_B_ID,
        slug: 'veyra',
        display_name: 'Veyra',
        name_language: 'en',
        publication_status: 'published',
        published_at: '2026-08-26T10:01:00.000Z',
        display_order: 0,
        accent_color: '#9d174d',
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

interface BackendOptions {
  readonly campaignBPlayerDelayMs?: number;
  readonly campaignBPlayerFailure?: boolean;
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

async function configureBackend(page: Page, options: BackendOptions = {}): Promise<void> {
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

  await page.route('**/storage/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: PORTRAIT_PNG });
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
      const adminRosterSelect =
        'id,campaign_id,slug,display_name,publication_status,published_at,display_order,accent_color,archived_at,updated_at';
      if (
        campaignId === CAMPAIGN_B_ID &&
        options.campaignBPlayerFailure &&
        url.searchParams.get('select') === adminRosterSelect
      ) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'simulated campaign roster outage' }),
        });
        return;
      }
      if (campaignId === CAMPAIGN_B_ID && options.campaignBPlayerDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.campaignBPlayerDelayMs));
      }
      const players = rosters.get(campaignId) ?? [];
      const publicPlayerSelect = 'id,slug,display_name,name_language,accent_color';
      const responsePlayers =
        url.searchParams.get('select') === publicPlayerSelect
          ? players.map((player) => ({
              id: player.id,
              slug: player.slug,
              display_name: player.display_name,
              name_language: player.name_language,
              accent_color: player.accent_color,
            }))
          : players;
      await route.fulfill({
        status: 200,
        headers: collectionHeaders(responsePlayers.length),
        body: JSON.stringify(responsePlayers),
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
  await expect(
    page.getByRole('heading', { name: 'Campañas y personajes jugadores' }),
  ).toBeVisible();
  await expect(page.getByLabel('Campaña administrativa')).toHaveValue(INITIAL_CAMPAIGN_ID);
  await expect(page.getByText('Skade', { exact: true })).toBeVisible();
  await expect(page.getByText('Ura', { exact: true })).toBeVisible();
  const context = page.locator('[data-admin-campaign-session-context]');
  await expect(context).toContainText('Editando campaña: Castigo Divino');
  await expect(context).toContainText('Campaña pública visible: Castigo Divino');
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
  await expect(page.getByText('Veyra', { exact: true })).toBeVisible();
  await expect(page.getByText('Skade', { exact: true })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Crear jugador' })).toBeHidden();
  await expect(page.locator('[data-admin-campaign-session-context]')).toContainText(
    'Editando campaña: Un aliento menos',
  );
  await expect(page.locator('[data-admin-campaign-session-context]')).toContainText(
    'La edición sigue afectando solo a Un aliento menos',
  );

  await newPlayer.click();
  await expect(name).toBeFocused();
  await name.fill('   ');
  await page.getByLabel('Acento de color').fill('#ffffff');
  await page.getByRole('button', { name: 'Guardar jugador' }).click();
  await expect(
    page.getByText('El nombre visible debe tener entre 1 y 120 caracteres.'),
  ).toBeVisible();
  await expect(
    page.getByText('El acento necesita al menos contraste 3:1 sobre blanco.'),
  ).toBeVisible();
  await expect(name).toBeFocused();

  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(newPlayer).toBeFocused();
  expectNoRuntimeErrors(errors);
});

test('entity referents and organizations stay scoped to the active administrative campaign', async ({
  page,
}) => {
  const errors = collectRuntimeErrors(page);
  await configureBackend(page);
  await page.goto('/');
  await login(page);

  await page.getByRole('button', { name: 'Crear personaje' }).click();
  await expect(page.getByTestId('admin-player-disposition-player-skade')).toBeVisible();
  await expect(page.getByTestId('admin-player-disposition-player-ura')).toBeVisible();
  await expect(page.getByTestId('admin-player-disposition-player-veyra')).toHaveCount(0);
  await expect(page.getByTestId('admin-player-association-player-skade')).toBeVisible();
  await expect(page.getByTestId('admin-player-association-player-ura')).toBeVisible();
  await expect(page.getByTestId('admin-player-association-player-veyra')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar editor' }).click();

  await page.getByLabel('Campaña administrativa').selectOption(CAMPAIGN_B_ID);
  await expect(page.getByText('Veyra', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Crear personaje' }).click();
  await expect(page.getByTestId('admin-player-disposition-player-veyra')).toBeVisible();
  await expect(page.getByTestId('admin-player-disposition-player-skade')).toHaveCount(0);
  await expect(page.getByTestId('admin-player-disposition-player-ura')).toHaveCount(0);
  await expect(page.getByTestId('admin-player-association-player-veyra')).toBeVisible();
  await expect(page.getByTestId('admin-player-association-player-skade')).toHaveCount(0);
  await expect(page.getByTestId('admin-player-association-player-ura')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar editor' }).click();

  await page.getByRole('button', { name: 'Crear organización' }).click();
  await expect(page.locator('[data-nonspatial-organization]')).toContainText('No cartográfica');
  await expect(page.getByLabel('Descubrimiento')).toBeDisabled();
  await expect(page.getByLabel('Descubrimiento')).toHaveValue('search_only');
  await expect(page.getByLabel('Coordenada X')).toHaveCount(0);
  await expect(page.getByLabel('Coordenada Y')).toHaveCount(0);
  await expect(page.getByTestId('admin-coordinate-map')).toBeHidden();
  await expect(page.locator('[data-player-associations]')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Relación con los personajes' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Relaciones con otras entidades' })).toBeVisible();
  expectNoRuntimeErrors(errors);
});

test('campaign transition discards old editors and blocks writes while the target roster is slow', async ({
  page,
}) => {
  const errors = collectRuntimeErrors(page);
  await configureBackend(page, { campaignBPlayerDelayMs: 750 });
  await page.goto('/');
  await login(page);

  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  const catalogEditor = page.getByRole('heading', { name: 'Crear registro' });
  await expect(catalogEditor).toBeVisible();
  await page.getByLabel('ID estable').fill('category-stale-editor');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('cambios administrativos sin guardar');
    await dialog.accept();
  });
  await page.getByLabel('Campaña administrativa').selectOption(CAMPAIGN_B_ID);

  await expect(catalogEditor).toBeHidden();
  const mutationStatus = await page.evaluate(
    async ({ accessToken, projectUrl }) => {
      const response = await fetch(`${projectUrl}/rest/v1/categories?id=eq.category-stale-editor`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Must not be written' }),
      });
      return response.status;
    },
    { accessToken: ACCESS_TOKEN, projectUrl: PROJECT_URL },
  );
  expect(mutationStatus).toBe(409);

  await expect(page.getByLabel('Campaña administrativa')).toHaveValue(CAMPAIGN_B_ID);
  await expect(page.getByText('Veyra', { exact: true })).toBeVisible();
  expectNoRuntimeErrors(errors);
});

test('a failed campaign switch restores the original administrative scope and controllers', async ({
  page,
}) => {
  await configureBackend(page, { campaignBPlayerFailure: true });
  await page.goto('/');
  await login(page);

  const context = page.locator('[data-admin-campaign-session-context]');
  await page.getByLabel('Campaña administrativa').selectOption(CAMPAIGN_B_ID);
  await expect(context).toContainText('Sigues editando Castigo Divino');
  await expect(context).not.toHaveAttribute('data-transitioning', 'true');
  await expect(context).toContainText('Editando campaña: Castigo Divino');
  await expect(page.getByLabel('Campaña administrativa')).toHaveValue(INITIAL_CAMPAIGN_ID);
  await expect(page.getByText('Ura', { exact: true })).toBeVisible();
  await expect(page.getByText('Veyra', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Crear jugador' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Crear personaje' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Crear', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Recargar relaciones' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Recargar solicitudes' })).toBeEnabled();
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
    const context = page.locator('[data-admin-campaign-session-context]');
    await expect(roster).toBeVisible();
    await expect(context).toBeVisible();
    expect(
      await context.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      `MAP-070 campaign context should not overflow at ${width}px`,
    ).toBe(true);
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
