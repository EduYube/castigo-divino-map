import { expect, test, type Page, type Route } from '@playwright/test';

declare global {
  interface Window {
    __qa213Gate?: {
      advance(): number;
      sample(stage: string): void;
      getTimeline(): readonly Record<string, unknown>[];
    };
    __qa224Gate?: {
      pending(): number;
      advance(): number;
      restore(): void;
    };
  }
}

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:4173';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

const PUBLIC_ROWS: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  campaigns: [
    {
      id: '00000000-0000-4000-8000-000000000053',
      slug: 'castigo-divino',
      name: 'Castigo Divino',
      status: 'active',
      display_order: 0,
    },
  ],
  categories: [
    {
      id: 'category-settlement',
      slug: 'asentamientos',
      name: 'Asentamiento',
      description: '',
    },
    {
      id: 'category-landmark',
      slug: 'lugares-destacados',
      name: 'Lugar destacado',
      description: '',
    },
  ],
  tags: [],
  players: [
    {
      id: 'player-a',
      slug: 'player-a',
      display_name: 'Alicia',
      name_language: 'en',
      accent_color: '#c2410c',
    },
    {
      id: 'player-b',
      slug: 'player-b',
      display_name: 'Borin',
      name_language: 'en',
      accent_color: '#1e3a8a',
    },
  ],
  map_entities: [
    {
      id: 'place-demo-harbor',
      slug: 'puerto-de-demostracion',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Demonstration Harbor',
      name_language: 'en',
      summary: '',
      description: '',
      x: 1080.5,
      y: 820,
      category_id: 'category-settlement',
    },
    {
      id: 'place-demo-pass',
      slug: 'paso-de-demostracion',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Paso de demostración',
      name_language: 'en',
      summary: '',
      description: '',
      x: 2240,
      y: 1240.25,
      category_id: 'category-landmark',
    },
    {
      id: 'entity-harbor-guard',
      slug: 'harbor-guard',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Harbor Guard',
      name_language: 'en',
      summary: '',
      description: '',
      x: 1080.5,
      y: 820,
      category_id: 'category-settlement',
    },
    {
      id: 'entity-scout',
      slug: 'scout',
      entity_type: 'character',
      visibility: 'pin',
      name: 'Scout',
      name_language: 'en',
      summary: '',
      description: '',
      x: 1500,
      y: 1000,
      category_id: 'category-settlement',
    },
    {
      id: 'entity-watchtower',
      slug: 'watchtower',
      entity_type: 'location',
      visibility: 'pin',
      name: 'Watchtower',
      name_language: 'en',
      summary: '',
      description: '',
      x: 1850,
      y: 950,
      category_id: 'category-landmark',
    },
    {
      id: 'entity-search-only',
      slug: 'search-only',
      entity_type: 'character',
      visibility: 'search_only',
      name: 'Search Only Character',
      name_language: 'en',
      summary: '',
      description: '',
      x: 1900,
      y: 970,
      category_id: 'category-landmark',
    },
  ],
  entity_aliases: [],
  entity_tags: [],
  entity_player_dispositions: [
    { entity_id: 'place-demo-harbor', player_id: 'player-a', disposition: 'ally' },
    { entity_id: 'place-demo-harbor', player_id: 'player-b', disposition: 'neutral' },
    { entity_id: 'entity-harbor-guard', player_id: 'player-a', disposition: 'enemy' },
    { entity_id: 'entity-scout', player_id: 'player-a', disposition: 'enemy' },
    { entity_id: 'entity-scout', player_id: 'player-b', disposition: 'neutral' },
    { entity_id: 'entity-watchtower', player_id: 'player-a', disposition: 'ally' },
    { entity_id: 'entity-watchtower', player_id: 'player-b', disposition: 'enemy' },
  ],
  character_location_relations: [],
  public_notes: [],
  public_note_tags: [],
  geographic_names: [],
  geographic_name_aliases: [],
  character_location_events: [],
};

async function configurePinVisualBackend(page: Page): Promise<void> {
  await page.addInitScript((projectUrl) => {
    window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ = {
      projectUrl,
      publishableKey: 'sb_publishable_map022_test_key',
      timeoutMs: 2000,
      retryDelaysMs: [0, 0, 0],
    };
  }, LOCAL_SUPABASE_URL);
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });
  await page.route('**/rest/v1/**', async (route: Route) => {
    const match = /\/rest\/v1\/([^?]+)/.exec(route.request().url());
    const table = match?.[1] ?? '';
    const rows = PUBLIC_ROWS[table] ?? [];
    const contentRange = rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${rows.length}`;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': contentRange },
      body: JSON.stringify(rows),
    });
  });
}

async function openPinVisualMap(page: Page): Promise<void> {
  await configurePinVisualBackend(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute(
    'data-backend-state',
    'connected',
  );
}

test('distinguishes pin types and exposes only non-neutral map dispositions', async ({ page }) => {
  await openPinVisualMap(page);

  const character = page.locator('[data-testid="entity-pin"][data-pin-id="entity-scout"]');
  const location = page.locator('[data-testid="entity-pin"][data-pin-id="entity-watchtower"]');

  await expect(character).toHaveAttribute('data-entity-type', 'character');
  await expect(character.locator('.pin-visual')).toHaveClass(/pin-visual--character/);
  await expect(character).toHaveAttribute(
    'aria-label',
    /Scout\. Personaje\. Relación con los personajes: Alicia: enemigo\. Categoría: Asentamiento\./i,
  );
  await expect(character).not.toHaveAttribute('aria-label', /Borin|neutral|sin configurar/i);
  await expect(location).toHaveAttribute('data-entity-type', 'location');
  await expect(location.locator('.pin-visual')).toHaveClass(/pin-visual--location/);
  await expect(location).toHaveAttribute(
    'aria-label',
    /Watchtower\. Emplazamiento\. Relación con los personajes: Alicia: aliado; Borin: enemigo\./i,
  );

  await expect(character.locator('.pin-disposition--enemy')).toHaveText('−');
  await expect(character.locator('.pin-disposition')).toHaveCount(1);
  await expect(character.locator('.pin-disposition--neutral')).toHaveCount(0);
  await expect(location.locator('.pin-disposition--ally')).toHaveText('+');
  await expect(page.locator('[data-pin-id="entity-search-only"]')).toHaveCount(0);

  const legend = page.locator('[data-pin-legend]');
  await expect(legend).toBeHidden();
  await page.locator('[data-map-help-summary]').click();
  await expect(legend).toBeVisible();
  await expect(legend).toContainText('Personaje');
  await expect(legend).toContainText('Emplazamiento');
  await expect(legend).toContainText('Aliado');
  await expect(legend).toContainText('Enemigo');
  await expect(legend).not.toContainText('Neutral');
  await expect(legend).not.toContainText('Sin dato visible');
});

test('keeps selection and keyboard focus independent from type and disposition styling', async ({
  page,
}) => {
  await openPinVisualMap(page);

  const character = page.locator('[data-testid="entity-pin"][data-pin-id="entity-scout"]');
  await character.focus();
  await expect(character).toBeFocused();
  await page.keyboard.press('Enter');

  const panel = page.getByTestId('place-details');
  await expect(character).toHaveClass(/campaign-marker-icon--active/);
  await expect(character.locator('.pin-visual')).toHaveClass(/pin-visual--character/);
  await expect(character.locator('.pin-disposition--enemy')).toBeVisible();
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-entity-type', 'character');
  await expect(panel.getByRole('heading', { level: 3, name: 'Scout' })).toBeFocused();
  await expect(panel).toContainText('Personaje');
  await expect(panel).toContainText('Alicia');
  await expect(panel).toContainText('Enemigo');
  await expect(panel).toContainText('Borin');
  await expect(panel).toContainText('Neutral');
  await expect(page.locator('[data-map-search-status]')).toContainText(
    'Scout, personaje, seleccionado en el mapa. Ficha compacta abierta.',
  );

  await panel.getByRole('button', { name: /Cerrar la ficha de Scout/i }).click();
  await expect(panel).toBeHidden();
  await expect(character).toBeFocused();
  await expect(character).toHaveAttribute('aria-pressed', 'false');
});

test('opens all coincident pins as keyboard-operable options without changing their canonical coordinate', async ({
  page,
}) => {
  await openPinVisualMap(page);

  const coincident = page.getByTestId('coincident-pin');
  await expect(coincident).toHaveAttribute('data-pin-count', '2');
  await expect(coincident).toHaveAttribute('data-marker-lat', '820');
  await expect(coincident).toHaveAttribute('data-marker-lng', '1080.5');
  await coincident.focus();
  await page.keyboard.press('Enter');

  const options = page.getByTestId('coincident-pin-option');
  await expect(options).toHaveCount(2);
  await expect(options.first()).toBeFocused();
  await expect(options.first()).toHaveAttribute('data-entity-type', 'location');
  await expect(options.nth(1)).toHaveAttribute('data-entity-type', 'character');
  await expect(options.nth(1)).toHaveAttribute(
    'aria-label',
    /Harbor Guard\. Personaje\. Relación con los personajes: Alicia: enemigo\. Categoría: Asentamiento\./i,
  );
  await expect(options.nth(1)).not.toHaveAttribute('aria-label', /Borin|neutral|sin configurar/i);
  await expect(options.nth(1).locator('.pin-disposition')).toHaveCount(1);

  await options.first().click();
  const panel = page.getByTestId('place-details');
  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-harbor');
  await panel.getByRole('button', { name: /Cerrar la ficha de Demonstration Harbor/i }).click();
  await expect(panel).toBeHidden();
  // Closing the details schedules a focus restore that reopens the coincident
  // group. Wait for that observable state instead of racing with its RAF.
  await expect(options).toHaveCount(2);
  await expect(options.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(options).toHaveCount(0);
  await expect(coincident).toHaveAttribute('aria-expanded', 'false');
  await expect(coincident).toBeVisible();
  await expect(coincident).toBeFocused();

  // A pointer click opens spiderfy and intentionally hides the cluster under
  // Playwright's mouse before the click action can settle. Reopen through the
  // keyboard contract, then exercise the member pin with a real pointer click.
  await coincident.focus();
  await page.keyboard.press('Enter');
  await expect(options).toHaveCount(2);
  await options.nth(1).click();
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-entity-id', 'entity-harbor-guard');
  await expect(panel).toHaveAttribute('data-entity-type', 'character');
  await expect(panel.getByRole('heading', { level: 3, name: 'Harbor Guard' })).toBeFocused();
  await expect(coincident).toHaveClass(/campaign-marker-icon--active/);
  await expect(coincident).toHaveAttribute('data-marker-lat', '820');
  await expect(coincident).toHaveAttribute('data-marker-lng', '1080.5');

  await panel.getByRole('button', { name: /Cerrar la ficha de Harbor Guard/i }).click();
  await expect(panel).toBeHidden();
  await expect(options).toHaveCount(0);
  await expect(coincident).toBeVisible();
  await expect(coincident).not.toHaveAttribute('aria-hidden', 'true');
  await expect(coincident).toHaveAttribute('aria-expanded', 'false');
  await expect(coincident).toBeFocused();
  await expect(coincident).toHaveAttribute('data-marker-lat', '820');
  await expect(coincident).toHaveAttribute('data-marker-lng', '1080.5');
});

test('preserves legacy filter dimming while keeping type semantics and pins operable', async ({
  page,
}) => {
  await openPinVisualMap(page);

  await page.getByRole('checkbox', { name: /Asentamiento/ }).check();
  const pass = page.locator('[data-testid="place-marker"][data-place-id="place-demo-pass"]');

  await expect(pass).toHaveClass(/campaign-marker-icon--dimmed/);
  await expect(pass).toHaveAttribute('data-filter-match', 'false');
  await expect(pass).toHaveAttribute('data-entity-type', 'location');
  await expect(pass.locator('.pin-visual--location')).toBeVisible();
  await pass.focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-active-place-id',
    'place-demo-pass',
  );
});

test('remains usable at 320 px, keeps touch targets large and honors forced colors and reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await openPinVisualMap(page);

  await expect(page.locator('[data-pin-legend]')).toBeHidden();

  const searchToggle = page.locator('[data-place-search-toggle]');
  if ((await searchToggle.getAttribute('aria-expanded')) === 'false') await searchToggle.click();
  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await searchbox.fill('Scout');
  await page.locator('[data-search-result-id="entity-scout"]').click();
  const character = page.locator('[data-pin-id="entity-scout"]');
  await expect(character).toBeVisible();
  const box = await character.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await character.focus();

  const transitionDuration = await character
    .locator('.pin-visual')
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.00001);
  await expect(character).toBeFocused();

  if ((await character.getAttribute('data-spiderfied')) === 'true')
    await page.keyboard.press('Escape');
  const group = page.locator('[data-proximity-cluster="true"]').first();
  await expect(group).toBeVisible();
  await group.click();
  const optionBox = await page.getByTestId('coincident-pin-option').first().boundingBox();
  expect(optionBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBe(false);
});

test('QA-213 sensitivity: pending focus restore must not reopen spiderfy after Escape', async ({
  page,
}) => {
  await openPinVisualMap(page);
  const cluster = page.getByTestId('coincident-pin');
  await expect(cluster).toHaveAttribute('data-pin-count', '2');
  await cluster.focus();
  await page.keyboard.press('Enter');
  const options = page.getByTestId('coincident-pin-option');
  await expect(options).toHaveCount(2);
  await expect(options.first()).toBeFocused();
  await options.first().click();
  const panel = page.getByTestId('place-details');
  await expect(panel).toHaveAttribute('data-active-place-id', 'place-demo-harbor');

  await page.evaluate(() => {
    const close = document.querySelector<HTMLButtonElement>('[data-place-details-close]');
    if (!close) throw new Error('QA-213 missing close control');
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const queued = new Map<number, FrameRequestCallback>();
    const timeline: Array<Record<string, unknown>> = [];
    let gateOn = false;
    let nextId = -1;
    const record = (stage: string, extra: Record<string, unknown> = {}): void => {
      const focused = document.activeElement;
      timeline.push({
        stage,
        focus: focused instanceof HTMLElement ? (focused.dataset.testid ?? focused.tagName) : null,
        focusConnected: focused?.isConnected ?? false,
        options: document.querySelectorAll('[data-testid="coincident-pin-option"]').length,
        spiderNodes: document.querySelectorAll('[data-spiderfied="true"]').length,
        expanded: document
          .querySelector('[data-testid="coincident-pin"]')
          ?.getAttribute('aria-expanded'),
        detailsHidden: document.querySelector<HTMLElement>('[data-place-details]')?.hidden ?? null,
        queuedFrames: queued.size,
        ...extra,
      });
    };
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      if (!gateOn) return nativeRequest(callback);
      const id = nextId--;
      queued.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id: number): void => {
      if (!queued.delete(id)) nativeCancel(id);
    };
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape')
          record('document-keydown-capture', {
            target: (event.target as HTMLElement)?.dataset.testid ?? null,
            defaultPrevented: event.defaultPrevented,
          });
      },
      { capture: true },
    );
    document
      .querySelector<HTMLElement>('[data-map-canvas]')
      ?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape')
          record('canvas-keydown-bubble', {
            target: (event.target as HTMLElement)?.dataset.testid ?? null,
            currentTarget: (event.currentTarget as HTMLElement)?.dataset.testid ?? 'map-canvas',
            defaultPrevented: event.defaultPrevented,
          });
      });
    close.addEventListener(
      'click',
      () => {
        gateOn = true;
        record('close-click-capture');
      },
      { capture: true, once: true },
    );
    window.__qa213Gate = {
      advance: (): number => {
        const batch = [...queued.values()];
        queued.clear();
        for (const callback of batch) callback(performance.now());
        record('frame-advanced', { executed: batch.length });
        return batch.length;
      },
      sample: record,
      getTimeline: () => timeline,
    };
  });
  // Block the onClose RAF until after the original test's existence check.
  await panel.getByRole('button', { name: /Cerrar la ficha de Demonstration Harbor/i }).click();
  await expect(panel).toBeHidden();
  await expect(options).toHaveCount(0);
  const firstFrame = await page.evaluate(() => window.__qa213Gate?.advance() ?? (0 as number));
  expect(firstFrame).toBeGreaterThan(0);
  await expect(options).toHaveCount(2);
  await expect(options.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(options).toHaveCount(0);
  await page.evaluate(() => window.__qa213Gate?.sample('after-escape'));
  const secondFrame = await page.evaluate(() => window.__qa213Gate?.advance() ?? (0 as number));
  expect(secondFrame).toBeGreaterThan(0);
  const timeline = await page.evaluate(
    () => window.__qa213Gate?.getTimeline() ?? ([] as Record<string, unknown>[]),
  );
  if (process.env.QA213_TIMELINE === '1') console.log('QA213_TIMELINE', JSON.stringify(timeline));
  expect(timeline).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        stage: 'canvas-keydown-bubble',
        target: 'coincident-pin-option',
        defaultPrevented: true,
        options: 0,
      }),
    ]),
  );
  await expect(options).toHaveCount(0);
  await expect(cluster).toHaveAttribute('aria-expanded', 'false');
  await expect(cluster).toBeFocused();
});

async function gateQa224Frames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const queued = new Map<number, FrameRequestCallback>();
    let nextId = -1;
    window.requestAnimationFrame = (callback): number => {
      const id = nextId--;
      queued.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id): void => {
      if (!queued.delete(id)) cancel(id);
    };
    window.__qa224Gate = {
      pending: () => queued.size,
      advance: () => {
        const batch = [...queued.values()];
        queued.clear();
        for (const callback of batch) callback(performance.now());
        return batch.length;
      },
      restore: () => {
        window.requestAnimationFrame = request;
        window.cancelAnimationFrame = cancel;
      },
    };
  });
}

test('QA-224 sensitivity: collapse RAF respects newer focus after Escape', async ({ page }) => {
  await openPinVisualMap(page);
  const cluster = page.getByTestId('coincident-pin');
  const options = page.getByTestId('coincident-pin-option');
  const otherControl = page.locator('[data-map-help-summary]');
  await cluster.focus();
  await page.keyboard.press('Enter');
  await expect(options).toHaveCount(2);
  await expect(options.first()).toBeFocused();
  await gateQa224Frames(page);
  await page.keyboard.press('Escape');
  await expect(options).toHaveCount(0);
  await expect(cluster).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => window.__qa224Gate?.pending() ?? 0)).toBeGreaterThan(0);
  await otherControl.focus();
  await expect(otherControl).toBeFocused();
  expect(await page.evaluate(() => window.__qa224Gate?.advance() ?? 0)).toBeGreaterThan(0);
  await expect(otherControl).toBeFocused();
  await page.evaluate(() => window.__qa224Gate?.restore());
});

test('QA-224 sensitivity: open RAF respects newer focus after keyboard activation', async ({
  page,
}) => {
  await openPinVisualMap(page);
  const cluster = page.getByTestId('coincident-pin');
  const options = page.getByTestId('coincident-pin-option');
  const otherControl = page.locator('[data-map-help-summary]');
  await cluster.focus();
  await gateQa224Frames(page);
  await page.keyboard.press('Enter');
  await expect(options).toHaveCount(2);
  await expect(options.first()).toBeFocused();
  expect(await page.evaluate(() => window.__qa224Gate?.pending() ?? 0)).toBeGreaterThan(0);
  await otherControl.focus();
  await expect(otherControl).toBeFocused();
  expect(await page.evaluate(() => window.__qa224Gate?.advance() ?? 0)).toBeGreaterThan(0);
  await expect(otherControl).toBeFocused();
  await page.evaluate(() => window.__qa224Gate?.restore());
});

test('QA-224 normal restore: Escape returns focus to cluster', async ({ page }) => {
  await openPinVisualMap(page);
  const cluster = page.getByTestId('coincident-pin');
  const options = page.getByTestId('coincident-pin-option');
  await cluster.focus();
  await page.keyboard.press('Enter');
  await expect(options).toHaveCount(2);
  await expect(options.first()).toBeFocused();
  await gateQa224Frames(page);
  await page.keyboard.press('Escape');
  await expect(options).toHaveCount(0);
  await expect(cluster).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => window.__qa224Gate?.pending() ?? 0)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__qa224Gate?.advance() ?? 0)).toBeGreaterThan(0);
  await expect(cluster).toBeFocused();
  await page.evaluate(() => window.__qa224Gate?.restore());
});

test('QA-224 normal restore: keyboard opening retains member focus', async ({ page }) => {
  await openPinVisualMap(page);
  const cluster = page.getByTestId('coincident-pin');
  const options = page.getByTestId('coincident-pin-option');
  await cluster.focus();
  await gateQa224Frames(page);
  await page.keyboard.press('Space');
  await expect(options).toHaveCount(2);
  await expect(options.first()).toBeFocused();
  expect(await page.evaluate(() => window.__qa224Gate?.pending() ?? 0)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__qa224Gate?.advance() ?? 0)).toBeGreaterThan(0);
  await expect(options.first()).toBeFocused();
  await page.evaluate(() => window.__qa224Gate?.restore());
});

for (const key of ['Enter', 'Space'] as const) {
  test(`QA-224 keyboard: cluster and member ${key} activate and Escape restores focus`, async ({
    page,
  }) => {
    await openPinVisualMap(page);
    const cluster = page.getByTestId('coincident-pin');
    const options = page.getByTestId('coincident-pin-option');
    const canvas = page.locator('[data-map-canvas]');
    const panel = page.getByTestId('place-details');
    await cluster.evaluate((element) => {
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          (element as HTMLElement).dataset.qa224Prevented = String(event.defaultPrevented);
        }
      });
    });
    await canvas.evaluate((element) => {
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          (element as HTMLElement).dataset.qa224EscapePrevented = String(event.defaultPrevented);
        }
      });
    });

    await cluster.focus();
    const scrollBefore = await page.evaluate(() => [window.scrollX, window.scrollY]);
    await page.keyboard.press(key);
    await expect(cluster).toHaveAttribute('data-qa224-prevented', 'true');
    await expect(options).toHaveCount(2);
    await expect(options.first()).toBeFocused();
    await expect(options.nth(1)).toHaveAttribute('data-entity-type', 'character');
    await options.nth(1).focus();
    await expect(options.nth(1)).toBeFocused();
    await options.nth(1).evaluate((element) => {
      element.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        document.documentElement.dataset.qa224MemberPrevented = String(event.defaultPrevented);
        document.documentElement.dataset.qa224MemberEvents = String(
          Number(document.documentElement.dataset.qa224MemberEvents ?? 0) + 1,
        );
      });
    });

    const historyBefore = await page.evaluate(() => window.history.length);
    await page.keyboard.press(key);
    await expect(page.locator('html')).toHaveAttribute('data-qa224-member-prevented', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-qa224-member-events', '1');
    expect(await page.evaluate(() => window.history.length)).toBe(historyBefore + 1);
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual(scrollBefore);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-entity-id', 'entity-harbor-guard');
    await expect(panel).toHaveAttribute('data-entity-type', 'character');
    await expect(panel.getByRole('heading', { level: 3, name: 'Harbor Guard' })).toBeFocused();

    await panel.getByRole('button', { name: /Cerrar la ficha de Harbor Guard/i }).click();
    await expect(panel).toBeHidden();
    await expect(options).toHaveCount(0);
    await expect(cluster).toBeVisible();
    await expect(cluster).not.toHaveAttribute('aria-hidden', 'true');
    await expect(cluster).toHaveAttribute('aria-expanded', 'false');
    await expect(cluster).toBeFocused();
    await expect(cluster).toHaveAttribute('data-marker-lat', '820');
    await expect(cluster).toHaveAttribute('data-marker-lng', '1080.5');

    await cluster.focus();
    await page.keyboard.press('Enter');
    await expect(options).toHaveCount(2);
    await expect(options.first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(canvas).toHaveAttribute('data-qa224-escape-prevented', 'true');
    await expect(options).toHaveCount(0);
    await expect(cluster).toHaveAttribute('aria-expanded', 'false');
    await expect(cluster).toBeFocused();
  });
}
