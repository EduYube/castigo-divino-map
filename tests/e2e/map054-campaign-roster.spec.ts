import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

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

const mapEntities = new Map<string, readonly Record<string, unknown>[]>([
  [
    INITIAL_CAMPAIGN_ID,
    [
      {
        id: 'entity-skade',
        slug: 'skade',
        entity_type: 'character',
        lifecycle_status: null,
        visibility: 'pin',
        audience: 'public',
        portrait_path: null,
        name: 'Skade',
        summary: 'Entidad exclusiva de Castigo Divino.',
        description: 'Referent administrativo de Castigo Divino.',
        x: 1400,
        y: 950,
        geometry: null,
        category_id: null,
        publication_status: 'published',
        published_at: '2026-08-26T10:00:00.000Z',
        archived_at: null,
        updated_at: '2026-08-26T10:00:00.000Z',
      },
      {
        id: 'entity-ura',
        slug: 'ura',
        entity_type: 'character',
        lifecycle_status: null,
        visibility: 'pin',
        audience: 'public',
        portrait_path: null,
        name: 'Ura',
        summary: 'Entidad exclusiva de Castigo Divino.',
        description: 'Referent administrativo de Castigo Divino.',
        x: 1600,
        y: 1050,
        geometry: null,
        category_id: null,
        publication_status: 'published',
        published_at: '2026-08-26T10:00:00.000Z',
        archived_at: null,
        updated_at: '2026-08-26T10:00:00.000Z',
      },
    ],
  ],
  [
    CAMPAIGN_B_ID,
    [
      {
        id: 'entity-veyra',
        slug: 'veyra',
        entity_type: 'character',
        lifecycle_status: null,
        visibility: 'pin',
        audience: 'public',
        portrait_path: null,
        name: 'Veyra',
        summary: 'Entidad exclusiva de Un aliento menos.',
        description: 'Referent administrativo de Un aliento menos.',
        x: 2400,
        y: 1400,
        geometry: null,
        category_id: null,
        publication_status: 'published',
        published_at: '2026-08-26T10:01:00.000Z',
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

    if (table === 'map_entities') {
      const filter = url.searchParams.get('campaign_id') ?? '';
      const campaignId = filter.startsWith('eq.') ? filter.slice(3) : '';
      const adminMapEntitySelect =
        'id,slug,entity_type,lifecycle_status,visibility,audience,portrait_path,name,summary,description,x,y,geometry,category_id,publication_status,published_at,archived_at,updated_at';
      const entities =
        url.searchParams.get('select') === adminMapEntitySelect
          ? (mapEntities.get(campaignId) ?? [])
          : [];
      await route.fulfill({
        status: 200,
        headers: collectionHeaders(entities.length),
        body: JSON.stringify(entities),
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
  await expect(rosterPlayer(page, 'Skade')).toBeVisible();
  await expect(rosterPlayer(page, 'Ura')).toBeVisible();
  const context = page.locator('[data-admin-campaign-session-context]');
  await expect(context).toContainText('Editando campaña: Castigo Divino');
  await expect(context).toContainText('Campaña pública visible: Castigo Divino');
}

function expectNoRuntimeErrors(errors: RuntimeErrors): void {
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
}

function rosterPlayer(page: Page, name: string): Locator {
  const cards = page.locator('.admin-campaign-roster__player-card');
  return cards.getByText(name, { exact: true });
}

async function expectTextContrast(locator: Locator, minimum = 4.5): Promise<void> {
  await expect(locator).toBeVisible();
  const ratio = await locator.evaluate((element) => {
    interface Rgba {
      r: number;
      g: number;
      b: number;
      a: number;
    }

    const parseColor = (value: string): Rgba => {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
      if (channels.length < 3) {
        throw new Error(`Unable to parse computed color: ${value}`);
      }
      return {
        r: channels[0] ?? 0,
        g: channels[1] ?? 0,
        b: channels[2] ?? 0,
        a: channels[3] ?? 1,
      };
    };

    const composite = (foreground: Rgba, background: Rgba): Rgba => {
      const alpha = foreground.a + background.a * (1 - foreground.a);
      if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };

      const blendChannel = (foregroundChannel: number, backgroundChannel: number): number => {
        const foregroundContribution = foregroundChannel * foreground.a;
        const backgroundContribution = backgroundChannel * background.a * (1 - foreground.a);
        return (foregroundContribution + backgroundContribution) / alpha;
      };

      return {
        r: blendChannel(foreground.r, background.r),
        g: blendChannel(foreground.g, background.g),
        b: blendChannel(foreground.b, background.b),
        a: alpha,
      };
    };

    const ancestors: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      ancestors.unshift(node);
    }

    let background: Rgba = { r: 255, g: 255, b: 255, a: 1 };
    for (const node of ancestors) {
      background = composite(parseColor(getComputedStyle(node).backgroundColor), background);
    }

    const foreground = composite(parseColor(getComputedStyle(element).color), background);
    const luminance = ({ r, g, b }: Rgba): number => {
      const linear = [r, g, b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      const [red = 0, green = 0, blue = 0] = linear;
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };

    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    return (
      (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
      (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
    );
  });

  expect(ratio).toBeGreaterThanOrEqual(minimum);
}

test('admin campaign roster meets dark-theme readability requirements', async ({ page }) => {
  await configureBackend(page);
  await page.goto('/');
  await login(page);

  const context = page.locator('[data-admin-campaign-session-context]');
  const roster = page.locator('.admin-campaign-roster');
  const campaignSelect = page.getByLabel('Campaña administrativa');
  const selectedButton = roster.getByRole('button', { name: 'Seleccionada' });

  await expect(selectedButton).toBeDisabled();
  await expect(selectedButton).toHaveAttribute('aria-pressed', 'true');
  await expect(selectedButton).toHaveCSS('opacity', '1');

  for (const target of [
    context.getByRole('heading', { name: 'Contexto administrativo' }),
    context.locator('.admin-campaign-session-context__value'),
    context.locator('.admin-campaign-session-context__public'),
    page.getByText('Campaña administrativa', { exact: true }),
    campaignSelect,
    page.locator('#admin-campaign-context-hint'),
    roster.locator('.admin-campaign-roster__badge:visible').first(),
    rosterPlayer(page, 'Skade'),
    roster.locator('.admin-campaign-roster__metadata').first(),
    roster.getByRole('button', { name: 'Crear campaña' }),
    selectedButton,
  ]) {
    await expectTextContrast(target);
  }

  await campaignSelect.focus();
  const focusStyle = await campaignSelect.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusStyle.outlineStyle).not.toBe('none');
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(3);

  await page.emulateMedia({ forcedColors: 'active' });
  await campaignSelect.focus();
  await expect(campaignSelect).toBeFocused();
  await expect(selectedButton).toBeDisabled();
  await expect(selectedButton).toHaveAttribute('aria-pressed', 'true');
});

test('empty admin controls have non-text contrast without focus', async ({ page }) => {
  await configureBackend(page);
  await page.goto('/');
  await login(page);

  await page.getByRole('button', { name: 'Crear campaña' }).click();
  const fields = [
    page.getByLabel('Nombre', { exact: true }),
    page.getByLabel('Slug estable'),
  ];
  await page.getByRole('button', { name: 'Cancelar', exact: true }).focus();

  for (const field of fields) {
    await expect(field).toBeVisible();
    await expect(field).toHaveValue('');
    await expect(field).not.toBeFocused();

    const contrast = await field.evaluate((element) => {
      const parse = (value: string) => {
        const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
        if (channels.length < 3) throw new Error(`Unexpected CSS color: ${value}`);
        return [channels[0]!, channels[1]!, channels[2]!, channels[3] ?? 1] as const;
      };
      const blend = (front: readonly number[], back: readonly number[]) => {
        const alpha = front[3]! + back[3]! * (1 - front[3]!);
        return [
          (front[0]! * front[3]! + back[0]! * back[3]! * (1 - front[3]!)) / alpha,
          (front[1]! * front[3]! + back[1]! * back[3]! * (1 - front[3]!)) / alpha,
          (front[2]! * front[3]! + back[2]! * back[3]! * (1 - front[3]!)) / alpha,
          alpha,
        ];
      };
      const ancestors: Element[] = [];
      for (let node = element.parentElement; node; node = node.parentElement) {
        ancestors.unshift(node);
      }
      let backdrop: number[] = [255, 255, 255, 1];
      for (const node of ancestors) {
        backdrop = blend(parse(getComputedStyle(node).backgroundColor), backdrop);
      }
      const border = blend(parse(getComputedStyle(element).borderTopColor), backdrop);
      const luminance = (rgb: readonly number[]) => {
        const linear = rgb.slice(0, 3).map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
      };
      const a = luminance(border);
      const b = luminance(backdrop);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(3);
  }
});

test('public and admin campaign selectors remain independent and scoped', async ({ page }) => {
  await configureBackend(page);
  await page.goto('/?campaign=castigo-divino');
  await login(page);

  const context = page.locator('[data-admin-campaign-session-context]');
  const entitySearch = page.getByLabel('Buscar entidades');
  const entityTitles = page.locator('.admin-map-entity__item-title');

  await entitySearch.fill('Veyra');
  await expect(entityTitles).toHaveCount(0);
  await expect(page.locator('.admin-map-entity__empty')).toHaveText('No hay coincidencias.');

  await page.getByRole('button', { name: 'Cerrar acceso administrativo' }).click();
  await page.getByLabel('Campaña', { exact: true }).selectOption('un-aliento-menos');
  await page.getByRole('button', { name: 'Administración' }).click();

  await expect(page.getByLabel('Campaña administrativa')).toHaveValue(INITIAL_CAMPAIGN_ID);
  await expect(context).toContainText('Editando campaña: Castigo Divino');
  await expect(context).toContainText('Campaña pública visible: Un aliento menos');
  await expect(rosterPlayer(page, 'Skade')).toBeVisible();
  await expect(rosterPlayer(page, 'Ura')).toBeVisible();
  await expect(rosterPlayer(page, 'Veyra')).toHaveCount(0);

  await page.getByLabel('Campaña administrativa').selectOption(CAMPAIGN_B_ID);
  await expect(context).toContainText('Editando campaña: Un aliento menos');
  await expect(rosterPlayer(page, 'Veyra')).toBeVisible();
  await expect(rosterPlayer(page, 'Skade')).toHaveCount(0);
  await expect(rosterPlayer(page, 'Ura')).toHaveCount(0);

  await entitySearch.fill('Veyra');
  await expect(entityTitles).toHaveText(['Veyra']);
  await entitySearch.fill('Ura');
  await expect(entityTitles).toHaveCount(0);
  await entitySearch.fill('Skade');
  await expect(entityTitles).toHaveCount(0);
});

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
  await expect(rosterPlayer(page, 'Veyra')).toBeVisible();
  await expect(rosterPlayer(page, 'Skade')).toBeHidden();
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
  await expect(rosterPlayer(page, 'Veyra')).toBeVisible();
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
  await expect(rosterPlayer(page, 'Veyra')).toBeVisible();
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
  await expect(rosterPlayer(page, 'Ura')).toBeVisible();
  await expect(rosterPlayer(page, 'Veyra')).toHaveCount(0);
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

  for (const width of [320, 390, 430]) {
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
