import { expect, test, type Locator, type Page, type Request } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const RPC_URL = 'http://127.0.0.1:54321/rest/v1/rpc/submit_public_request';
const TEST_PUBLISHABLE_KEY = 'sb_publishable_map026_e2e_key';
const NEUTRAL_TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
    <path d="M0 1164.5h3600M1800 0v2329" stroke="#8a887f" stroke-width="12" />
  </svg>
`;

async function configureRequestRuntime(page: Page, cooldownMs = 60_000): Promise<void> {
  await page.addInitScript(
    ({ publishableKey, cooldown }) => {
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
        cooldownMs: cooldown,
      };
    },
    { publishableKey: TEST_PUBLISHABLE_KEY, cooldown: cooldownMs },
  );
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
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
}

async function openRequestForm(page: Page): Promise<Locator> {
  const openButton = page.getByRole('button', { name: 'Proponer un pin' });
  await openButton.click();
  const form = page.locator('[data-public-pin-request-form]');
  await expect(form).toBeVisible();
  return form;
}

async function fillValidRequest(form: Locator): Promise<void> {
  await form.getByLabel('Nombre o apodo').fill('Jugadora de prueba');
  await form.getByLabel('Nombre propuesto del pin').fill('Torre del Horizonte');
  await form.getByLabel('Tipo de pin').selectOption('location');
  await form.getByLabel('Descripción').fill('Un lugar descubierto durante la sesión de prueba.');
  await form.getByLabel('Motivo de la solicitud').fill('Ayuda a recordar la ruta del grupo.');
}

async function mockRpc(
  page: Page,
  requests: Request[],
  status = 200,
  body = 'true',
): Promise<void> {
  await page.route(RPC_URL, async (route) => {
    const request = route.request();

    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'apikey,content-type',
          'Access-Control-Allow-Methods': 'POST,OPTIONS',
        },
      });
      return;
    }

    requests.push(request);
    await route.fulfill({
      status,
      body,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'apikey,content-type',
      },
    });
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const width = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(width.scrollWidth).toBeLessThanOrEqual(width.clientWidth);
}

async function expectTouchTarget(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

test('submits a valid anonymous request through the closed RPC without publishing a pin', async ({
  page,
}) => {
  const rpcRequests: Request[] = [];
  await configureRequestRuntime(page);
  await mockOfficialMap(page);
  await mockRpc(page, rpcRequests);
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');

  const initialUrl = page.url();
  const initialPinCount = await page.getByTestId('place-marker').count();
  const form = await openRequestForm(page);
  await fillValidRequest(form);

  const typeOptions = await form.getByLabel('Tipo de pin').locator('option').evaluateAll((options) =>
    options.map((option) => ({ value: (option as HTMLOptionElement).value, text: option.textContent })),
  );
  expect(typeOptions).toEqual([
    { value: '', text: 'Elige un tipo' },
    { value: 'character', text: 'Personaje' },
    { value: 'location', text: 'Emplazamiento' },
  ]);
  await expect(form.getByLabel(/categor/i)).toHaveCount(0);
  await expect(form.getByLabel(/etiquet/i)).toHaveCount(0);
  await expect(form.getByLabel(/campañ/i)).toHaveCount(0);

  await form.getByRole('button', { name: 'Elegir posición en el mapa' }).click();
  await expect(page.locator('[data-map-canvas]')).toHaveAttribute(
    'data-public-request-selecting',
    'true',
  );
  const mapCanvas = page.locator('[data-map-canvas]');
  const box = await mapCanvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await mapCanvas.click({ position: { x: Math.floor(box.width * 0.55), y: Math.floor(box.height * 0.45) } });

  await expect(form.locator('[data-public-pin-request-position]')).toContainText(
    'Posición seleccionada',
  );
  await expect(page.locator('.public-request-position-marker')).toBeVisible();
  await form.getByRole('button', { name: 'Enviar solicitud para revisión' }).click();

  await expect(form.locator('[data-public-pin-request-status]')).toContainText(
    'No se publicará automáticamente',
  );
  expect(rpcRequests).toHaveLength(1);
  expect(rpcRequests[0]?.headers()['apikey']).toBe(TEST_PUBLISHABLE_KEY);
  expect(rpcRequests[0]?.headers()['authorization']).toBeUndefined();
  expect(rpcRequests[0]?.postDataJSON()).toEqual({
    p_sender_name: 'Jugadora de prueba',
    p_proposed_name: 'Torre del Horizonte',
    p_entity_type: 'location',
    p_x: expect.any(Number),
    p_y: expect.any(Number),
    p_description: 'Un lugar descubierto durante la sesión de prueba.',
    p_reason: 'Ayuda a recordar la ruta del grupo.',
    p_honeypot: '',
  });
  await expect(page.getByTestId('place-marker')).toHaveCount(initialPinCount);
  await expect(page.locator('[data-testid="entity-pin"]')).toHaveCount(0);
  expect(page.url()).toBe(initialUrl);
});

test('associates validation errors with fields and preserves the navigable map state', async ({
  page,
}) => {
  await openReadyMap(page);
  const initialUrl = page.url();
  const form = await openRequestForm(page);

  await form.getByRole('button', { name: 'Enviar solicitud para revisión' }).click();

  const sender = form.getByLabel('Nombre o apodo');
  await expect(sender).toBeFocused();
  await expect(sender).toHaveAttribute('aria-invalid', 'true');
  await expect(sender).toHaveAttribute(
    'aria-errormessage',
    'public-pin-request-sender-error',
  );
  await expect(form.locator('[data-public-pin-request-error="position"]')).toContainText(
    'Selecciona una posición válida',
  );
  await expect(form.locator('[data-public-pin-request-status]')).toContainText(
    'Revisa los campos',
  );
  await expect(page.getByTestId('place-marker')).toHaveCount(2);
  expect(page.url()).toBe(initialUrl);
});

test('keeps entered data and position after a server failure so the request can be retried safely', async ({
  page,
}) => {
  const rpcRequests: Request[] = [];
  await configureRequestRuntime(page);
  await mockOfficialMap(page);
  await mockRpc(page, rpcRequests, 503, '{"message":"unavailable"}');
  await page.goto('/');
  const form = await openRequestForm(page);
  await fillValidRequest(form);
  await form.getByRole('button', { name: 'Usar el centro visible' }).click();
  const position = form.locator('[data-public-pin-request-position]');
  const xBefore = await position.getAttribute('data-x');
  const yBefore = await position.getAttribute('data-y');

  await form.getByRole('button', { name: 'Enviar solicitud para revisión' }).click();

  await expect(form.locator('[data-public-pin-request-status]')).toContainText(
    'Los datos siguen en el formulario',
  );
  await expect(form.getByLabel('Nombre o apodo')).toHaveValue('Jugadora de prueba');
  await expect(form.getByLabel('Nombre propuesto del pin')).toHaveValue('Torre del Horizonte');
  await expect(form.getByLabel('Tipo de pin')).toHaveValue('location');
  await expect(form.getByLabel('Descripción')).toHaveValue(
    'Un lugar descubierto durante la sesión de prueba.',
  );
  await expect(form.getByLabel('Motivo de la solicitud')).toHaveValue(
    'Ayuda a recordar la ruta del grupo.',
  );
  await expect(position).toHaveAttribute('data-x', xBefore ?? '');
  await expect(position).toHaveAttribute('data-y', yBefore ?? '');
  expect(rpcRequests).toHaveLength(1);
});

test('applies a local post-success cooldown without storing form content', async ({ page }) => {
  const rpcRequests: Request[] = [];
  await configureRequestRuntime(page, 120_000);
  await mockOfficialMap(page);
  await mockRpc(page, rpcRequests);
  await page.goto('/');
  const form = await openRequestForm(page);
  await fillValidRequest(form);
  await form.getByRole('button', { name: 'Usar el centro visible' }).click();
  await form.getByRole('button', { name: 'Enviar solicitud para revisión' }).click();
  await expect(form.locator('[data-public-pin-request-status]')).toContainText('Solicitud enviada');

  await fillValidRequest(form);
  await form.getByRole('button', { name: 'Usar el centro visible' }).click();
  await form.getByRole('button', { name: 'Enviar solicitud para revisión' }).click();

  await expect(form.locator('[data-public-pin-request-status]')).toContainText('Espera');
  expect(rpcRequests).toHaveLength(1);
  const storage = await page.evaluate(() => ({ ...window.sessionStorage }));
  expect(Object.values(storage)).not.toContain('Jugadora de prueba');
  expect(Object.values(storage)).not.toContain('Torre del Horizonte');
});

test('keeps the request flow accessible and overflow-free at 320 px with keyboard positioning', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openReadyMap(page);
  const openButton = page.getByRole('button', { name: 'Proponer un pin' });
  await expectTouchTarget(openButton);
  await openButton.focus();
  await page.keyboard.press('Enter');

  const form = page.locator('[data-public-pin-request-form]');
  const heading = page.getByRole('heading', { name: 'Proponer un nuevo pin' });
  await expect(heading).toBeFocused();
  await expect(form).toBeVisible();
  await expect(form).toContainText('Otros visitantes no pueden leer estos datos');
  await expectNoHorizontalOverflow(page);

  const closeButton = page.getByRole('button', { name: 'Cerrar el formulario de solicitud' });
  const choosePosition = form.getByRole('button', { name: 'Elegir posición en el mapa' });
  const useCenter = form.getByRole('button', { name: 'Usar el centro visible' });
  const submit = form.getByRole('button', { name: 'Enviar solicitud para revisión' });
  await expectTouchTarget(closeButton);
  await expectTouchTarget(choosePosition);
  await expectTouchTarget(useCenter);
  await expectTouchTarget(submit);

  await useCenter.focus();
  await page.keyboard.press('Enter');
  await expect(form.locator('[data-public-pin-request-position]')).toContainText(
    'Posición seleccionada',
  );
  await expect(page.locator('.public-request-position-marker')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await closeButton.focus();
  await page.keyboard.press('Enter');
  await expect(form).toBeHidden();
  await expect(openButton).toBeFocused();
});
