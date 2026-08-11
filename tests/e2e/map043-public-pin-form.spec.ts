import { expect, test, type Locator, type Page } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const TEST_PUBLISHABLE_KEY = 'sb_publishable_map043_e2e_key';
const NEUTRAL_TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
    <path d="M0 1164.5h3600M1800 0v2329" stroke="#8a887f" stroke-width="12" />
  </svg>
`;

interface ScrollCall {
  readonly id: string;
  readonly behavior: ScrollBehavior | null;
  readonly block: ScrollLogicalPosition | null;
}

async function configureRequestRuntime(page: Page): Promise<void> {
  await page.addInitScript((publishableKey) => {
    (
      window as unknown as {
        __MAP026_PUBLIC_REQUEST_TEST_CONFIG__: {
          projectUrl: string;
          publishableKey: string;
          cooldownMs: number;
        };
      }
    ).__MAP026_PUBLIC_REQUEST_TEST_CONFIG__ = {
      projectUrl: 'http://127.0.0.1:54321',
      publishableKey,
      cooldownMs: 60_000,
    };
  }, TEST_PUBLISHABLE_KEY);
}

async function recordScrollIntoView(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const calls: Array<{
      id: string;
      behavior: ScrollBehavior | null;
      block: ScrollLogicalPosition | null;
    }> = [];
    (
      window as unknown as {
        __MAP043_SCROLL_CALLS__: typeof calls;
      }
    ).__MAP043_SCROLL_CALLS__ = calls;

    Element.prototype.scrollIntoView = function scrollIntoView(
      options?: boolean | ScrollIntoViewOptions,
    ): void {
      const normalized = typeof options === 'object' && options !== null ? options : null;
      calls.push({
        id: (this as HTMLElement).id,
        behavior: normalized?.behavior ?? null,
        block: normalized?.block ?? null,
      });
      originalScrollIntoView.call(this, options);
    };
  });
}

async function mockOfficialMap(page: Page): Promise<void> {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: NEUTRAL_TEST_MAP,
    });
  });
}

async function openReadyMap(page: Page): Promise<void> {
  await configureRequestRuntime(page);
  await mockOfficialMap(page);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
}

async function openPanel(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Proponer un pin' }).click();
  const panel = page.locator('[data-public-pin-request-panel]');
  await expect(panel).toBeVisible();
  return panel;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
}

async function expectTouchTarget(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

async function getScrollCalls(page: Page): Promise<ScrollCall[]> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __MAP043_SCROLL_CALLS__: ScrollCall[];
        }
      ).__MAP043_SCROLL_CALLS__,
  );
}

test('mounts once, scrolls to the heading, keeps privacy outside the form and restores focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await recordScrollIntoView(page);
  await openReadyMap(page);

  const openButton = page.getByRole('button', { name: 'Proponer un pin' });
  await expect(openButton).toHaveAttribute('aria-expanded', 'false');
  await expect(openButton).toHaveAttribute('aria-controls', 'public-pin-request-panel');
  await expect(page.locator('[data-public-pin-request-panel]')).toHaveCount(0);
  const beforeOpenY = await page.evaluate(() => window.scrollY);

  const panel = await openPanel(page);
  const heading = page.getByRole('heading', { name: 'Proponer un nuevo pin' });
  const form = page.locator('[data-public-pin-request-form]');
  const privacy = page.locator('#public-pin-request-privacy');

  await expect(openButton).toHaveAttribute('aria-expanded', 'true');
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  await expect(privacy).toBeVisible();
  await expect(panel.locator('#public-pin-request-privacy')).toHaveCount(1);
  await expect(form.locator('#public-pin-request-privacy')).toHaveCount(0);
  await expect(form).toHaveAttribute(
    'aria-describedby',
    'public-pin-request-privacy public-pin-request-status',
  );
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeOpenY);

  let scrollCalls = await getScrollCalls(page);
  expect(scrollCalls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'public-pin-request-heading',
        behavior: 'smooth',
        block: 'start',
      }),
    ]),
  );

  await page.getByRole('button', { name: 'Cerrar el formulario de solicitud' }).click();
  await expect(panel).toBeHidden();
  await expect(openButton).toHaveAttribute('aria-expanded', 'false');
  await expect(openButton).toBeFocused();

  await openButton.click();
  await expect(panel).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  await expect(page.locator('[data-public-pin-request-panel]')).toHaveCount(1);
  await expect(page.locator('[data-public-pin-request-open]')).toHaveCount(1);

  scrollCalls = await getScrollCalls(page);
  expect(scrollCalls.filter(({ id }) => id === 'public-pin-request-heading')).toHaveLength(2);
});

test('uses immediate scrolling when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await recordScrollIntoView(page);
  await openReadyMap(page);
  await openPanel(page);

  const heading = page.getByRole('heading', { name: 'Proponer un nuevo pin' });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();

  const scrollCalls = await getScrollCalls(page);
  expect(scrollCalls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'public-pin-request-heading',
        behavior: 'auto',
        block: 'start',
      }),
    ]),
  );
});

test('uses the full map-experience width on desktop without compressing the form', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openReadyMap(page);
  const panel = await openPanel(page);
  const experience = page.locator('.map-experience');
  const form = page.locator('[data-public-pin-request-form]');
  const privacy = page.locator('#public-pin-request-privacy');
  const sender = form.getByLabel('Nombre o apodo');
  const proposedName = form.getByLabel('Nombre propuesto del pin');
  const type = form.getByLabel('Tipo de pin');

  const [experienceBox, panelBox, formBox, privacyBox, senderBox, proposedBox, typeBox] =
    await Promise.all([
      experience.boundingBox(),
      panel.boundingBox(),
      form.boundingBox(),
      privacy.boundingBox(),
      sender.boundingBox(),
      proposedName.boundingBox(),
      type.boundingBox(),
    ]);

  expect(experienceBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(formBox).not.toBeNull();
  expect(privacyBox).not.toBeNull();
  expect(senderBox).not.toBeNull();
  expect(proposedBox).not.toBeNull();
  expect(typeBox).not.toBeNull();
  if (
    !experienceBox ||
    !panelBox ||
    !formBox ||
    !privacyBox ||
    !senderBox ||
    !proposedBox ||
    !typeBox
  ) {
    return;
  }

  expect(panelBox.x).toBeGreaterThanOrEqual(experienceBox.x - 1);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(
    experienceBox.x + experienceBox.width + 1,
  );
  expect(panelBox.width).toBeGreaterThan(experienceBox.width * 0.97);
  expect(privacyBox.width).toBeGreaterThan(formBox.width * 0.95);
  expect(senderBox.width).toBeGreaterThan(formBox.width * 0.4);
  expect(proposedBox.width).toBeGreaterThan(formBox.width * 0.4);
  const verticalOverlap =
    Math.min(senderBox.y + senderBox.height, proposedBox.y + proposedBox.height) -
    Math.max(senderBox.y, proposedBox.y);
  expect(verticalOverlap).toBeGreaterThan(Math.min(senderBox.height, proposedBox.height) * 0.8);
  expect(typeBox.width).toBeGreaterThan(formBox.width * 0.95);
  await expectNoHorizontalOverflow(page);
});

const responsiveViewports = [
  { width: 320, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
] as const;

for (const viewport of responsiveViewports) {
  test(`keeps a one-column usable form at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openReadyMap(page);
    const panel = await openPanel(page);
    const form = page.locator('[data-public-pin-request-form]');
    const heading = page.getByRole('heading', { name: 'Proponer un nuevo pin' });
    const privacy = page.locator('#public-pin-request-privacy');
    const sender = form.getByLabel('Nombre o apodo');
    const close = page.getByRole('button', { name: 'Cerrar el formulario de solicitud' });
    const submit = form.getByRole('button', { name: 'Enviar solicitud para revisión' });

    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    await expect(panel).toBeVisible();
    await expect(privacy).toBeVisible();
    await expectTouchTarget(close);
    await expectTouchTarget(submit);

    const columns = await form.evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean),
    );
    expect(columns).toHaveLength(1);

    const [formBox, senderBox, privacyBox] = await Promise.all([
      form.boundingBox(),
      sender.boundingBox(),
      privacy.boundingBox(),
    ]);
    expect(formBox).not.toBeNull();
    expect(senderBox).not.toBeNull();
    expect(privacyBox).not.toBeNull();
    if (!formBox || !senderBox || !privacyBox) return;
    expect(senderBox.width).toBeGreaterThan(formBox.width * 0.95);
    expect(privacyBox.width).toBeGreaterThan(formBox.width * 0.95);
    await expectNoHorizontalOverflow(page);
  });
}

test('preserves entered data and the provisional marker across map interaction and close/reopen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await openReadyMap(page);
  const panel = await openPanel(page);
  const form = page.locator('[data-public-pin-request-form]');

  await form.getByLabel('Nombre o apodo').fill('Cronista de prueba');
  await form.getByLabel('Nombre propuesto del pin').fill('Campamento del Alba');
  await form.getByLabel('Tipo de pin').selectOption('location');
  await form.getByLabel('Descripción').fill('Un campamento temporal junto al camino.');
  await form.getByLabel('Motivo de la solicitud').fill('Mantener el contexto de la sesión.');

  await form.getByRole('button', { name: 'Elegir posición en el mapa' }).click();
  const mapCanvas = page.locator('[data-map-canvas]');
  const mapBox = await mapCanvas.boundingBox();
  expect(mapBox).not.toBeNull();
  if (!mapBox) return;
  await mapCanvas.click({
    position: { x: Math.floor(mapBox.width * 0.52), y: Math.floor(mapBox.height * 0.48) },
  });

  const position = form.locator('[data-public-pin-request-position]');
  const x = await position.getAttribute('data-x');
  const y = await position.getAttribute('data-y');
  await expect(page.locator('.public-request-position-marker')).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar el formulario de solicitud' }).click();
  await expect(panel).toBeHidden();
  const openButton = page.getByRole('button', { name: 'Proponer un pin' });
  await expect(openButton).toBeFocused();
  await openButton.click();

  await expect(panel).toBeVisible();
  await expect(form.getByLabel('Nombre o apodo')).toHaveValue('Cronista de prueba');
  await expect(form.getByLabel('Nombre propuesto del pin')).toHaveValue('Campamento del Alba');
  await expect(form.getByLabel('Tipo de pin')).toHaveValue('location');
  await expect(form.getByLabel('Descripción')).toHaveValue(
    'Un campamento temporal junto al camino.',
  );
  await expect(form.getByLabel('Motivo de la solicitud')).toHaveValue(
    'Mantener el contexto de la sesión.',
  );
  await expect(position).toHaveAttribute('data-x', x ?? '');
  await expect(position).toHaveAttribute('data-y', y ?? '');
  await expect(page.locator('.public-request-position-marker')).toBeVisible();
  await expect(page.locator('[data-public-pin-request-panel]')).toHaveCount(1);

  const choosePosition = page.locator('[data-public-pin-request-choose-position]');
  await expect(choosePosition).toHaveCount(1);
  await choosePosition.click();
  await expect(mapCanvas).toHaveAttribute('data-public-request-selecting', 'true');
  await expectNoHorizontalOverflow(page);
});

test('preserves visible boundaries and focus treatment in forced colors', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Forced-colors emulation is validated in Chromium.');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.emulateMedia({ forcedColors: 'active' });
  await openReadyMap(page);
  const panel = await openPanel(page);
  const heading = page.getByRole('heading', { name: 'Proponer un nuevo pin' });

  await expect(heading).toBeFocused();
  const borderStyle = await panel.evaluate((element) => getComputedStyle(element).borderTopStyle);
  const borderWidth = await panel.evaluate((element) => getComputedStyle(element).borderTopWidth);
  expect(borderStyle).not.toBe('none');
  expect(Number.parseFloat(borderWidth)).toBeGreaterThan(0);
  await expectNoHorizontalOverflow(page);
});
