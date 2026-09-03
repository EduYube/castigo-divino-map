import { expect, test } from '@playwright/test';
import {
  configureMap065Backend,
  MAP065_IDS,
  map065Layer,
  map065Pin,
  openMap065,
  openMap065Layers,
} from './map065-fixture';

test('canonical URL round-trips partial state and supports Back, Forward, reload and invalid values', async ({ page }) => {
  await configureMap065Backend(page);
  await openMap065(page);
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await openMap065Layers(page);
  expect(new URL(page.url()).searchParams.has('layers')).toBe(false);

  await map065Layer(page, 'Peligros/Alertas').uncheck();
  await expect.poll(() => new URL(page.url()).searchParams.get('layers')).toBe(
    'character,location,region,mission',
  );
  await map065Layer(page, 'Regiones').uncheck();
  await expect.poll(() => new URL(page.url()).searchParams.get('layers')).toBe(
    'character,location,mission',
  );

  await page.goBack();
  await expect(map065Layer(page, 'Regiones')).toBeChecked();
  await expect(map065Layer(page, 'Peligros/Alertas')).not.toBeChecked();

  await page.goForward();
  await expect(map065Layer(page, 'Regiones')).not.toBeChecked();
  await expect(map065Layer(page, 'Peligros/Alertas')).not.toBeChecked();

  await page.reload();
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect(map065Layer(page, 'Regiones')).not.toBeChecked();
  await expect(map065Layer(page, 'Peligros/Alertas')).not.toBeChecked();

  await page.goto('/?layers=hazard,unknown,character,hazard');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect.poll(() => new URL(page.url()).searchParams.get('layers')).toBe('character,hazard');
  await expect(map065Layer(page, 'Personajes')).toBeChecked();
  await expect(map065Layer(page, 'Peligros/Alertas')).toBeChecked();
  await expect(map065Layer(page, 'Misiones')).not.toBeChecked();

  await page.goto('/?layers=unknown,future');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expect.poll(() => new URL(page.url()).searchParams.has('layers')).toBe(false);
  await expect(page.locator('[data-map-layers-summary]')).toHaveText('Capas · 5/5');
});

test('keeps layer state through degraded snapshot mode and recovery without duplicate remote entities', async ({ page }) => {
  const backend = await configureMap065Backend(page, 'offline');
  await openMap065(page, '/?layers=character');
  await expect(page.locator('[data-backend-status]')).toHaveAttribute('data-backend-state', 'degraded');
  await expect(map065Layer(page, 'Personajes')).toBeChecked();
  await expect(map065Layer(page, 'Emplazamientos puntuales')).not.toBeChecked();

  backend.setMode('success');
  await page.locator('[data-backend-status]').getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.locator('[data-backend-status]')).toHaveAttribute('data-backend-state', 'connected');
  await expect(map065Layer(page, 'Personajes')).toBeChecked();
  await expect(map065Layer(page, 'Emplazamientos puntuales')).not.toBeChecked();
  await expect(map065Pin(page, MAP065_IDS.character)).toHaveCount(1);
  await expect(map065Pin(page, MAP065_IDS.location)).toHaveCount(0);
  await expect(page.locator(`[data-region-id="${MAP065_IDS.region}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-pin-id="${MAP065_IDS.character}"]`)).toHaveCount(1);
});

for (const width of [320, 390, 430]) {
  test(`layer panel stays keyboard-usable without horizontal overflow at ${width}px`, async ({ page }) => {
    await configureMap065Backend(page);
    await page.setViewportSize({ width, height: 844 });
    await openMap065(page);
    await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
    await openMap065Layers(page);

    const mission = map065Layer(page, 'Misiones');
    await mission.focus();
    await page.keyboard.press('Space');
    await expect(mission).not.toBeChecked();
    await expect(mission).toBeFocused();
    await expect(page.locator('[data-map-layers]')).toHaveAttribute('open', '');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('layer controls remain perceivable and operable in forced-colors mode', async ({ page }) => {
  await configureMap065Backend(page);
  await page.emulateMedia({ forcedColors: 'active' });
  await openMap065(page);
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await openMap065Layers(page);

  const region = map065Layer(page, 'Regiones');
  await region.focus();
  await expect(region).toBeFocused();
  await page.keyboard.press('Space');
  await expect(region).not.toBeChecked();
  await expect(page.locator('[data-map-layers-status]')).toContainText('Regiones');
});
