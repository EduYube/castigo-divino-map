import { expect, test } from '@playwright/test';
import {
  configureMap065Backend,
  MAP065_IDS,
  map065Layer,
  map065Pin,
  openMap065,
  openMap065Layers,
} from './map065-fixture';

test.beforeEach(async ({ page }) => {
  await configureMap065Backend(page);
});

test('all five layers default on and toggle independently', async ({ page }) => {
  await openMap065(page);
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await openMap065Layers(page);

  await expect(page.locator('[data-map-layers-summary]')).toHaveText('Capas · 5/5');
  for (const name of [
    'Personajes',
    'Emplazamientos puntuales',
    'Regiones',
    'Misiones',
    'Peligros/Alertas',
  ]) {
    await expect(map065Layer(page, name)).toBeChecked();
  }

  await expect(map065Pin(page, MAP065_IDS.character)).toHaveCount(1);
  await expect(map065Pin(page, MAP065_IDS.location)).toHaveCount(1);
  await expect(page.locator(`[data-region-id="${MAP065_IDS.region}"]`)).toHaveCount(1);
  await expect(map065Pin(page, MAP065_IDS.mission)).toHaveCount(1);
  await expect(map065Pin(page, MAP065_IDS.hazard)).toHaveCount(1);

  await map065Layer(page, 'Personajes').uncheck();
  await expect(map065Pin(page, MAP065_IDS.character)).toHaveCount(0);
  await expect(map065Pin(page, MAP065_IDS.location)).toHaveCount(1);

  await map065Layer(page, 'Personajes').check();
  await map065Layer(page, 'Emplazamientos puntuales').uncheck();
  await expect(map065Pin(page, MAP065_IDS.location)).toHaveCount(0);
  await expect(page.locator(`[data-region-id="${MAP065_IDS.region}"]`)).toHaveCount(1);

  await map065Layer(page, 'Emplazamientos puntuales').check();
  await map065Layer(page, 'Regiones').uncheck();
  await expect(page.locator(`[data-region-id="${MAP065_IDS.region}"]`)).toHaveCount(0);
  await expect(map065Pin(page, MAP065_IDS.location)).toHaveCount(1);

  await map065Layer(page, 'Regiones').check();
  await map065Layer(page, 'Misiones').uncheck();
  await expect(map065Pin(page, MAP065_IDS.mission)).toHaveCount(0);
  await expect(map065Pin(page, MAP065_IDS.hazard)).toHaveCount(1);

  await map065Layer(page, 'Misiones').check();
  await map065Layer(page, 'Peligros/Alertas').uncheck();
  await expect(map065Pin(page, MAP065_IDS.hazard)).toHaveCount(0);
  await expect(map065Pin(page, MAP065_IDS.mission)).toHaveCount(1);

  await page.getByRole('button', { name: 'Mostrar todas' }).click();
  await expect(page.locator('[data-map-layers-summary]')).toHaveText('Capas · 5/5');
  await expect(map065Pin(page, MAP065_IDS.hazard)).toHaveCount(1);
});

test('reclusters a character plus mission pair before rendering and restores it exactly', async ({
  page,
}) => {
  await openMap065(page);
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await openMap065Layers(page);

  const cluster = page.getByTestId('coincident-pin');
  await expect(cluster).toHaveCount(1);
  await expect(cluster).toHaveAttribute('data-pin-count', '2');

  await map065Layer(page, 'Misiones').uncheck();
  await expect(cluster).toHaveCount(0);
  await expect(map065Pin(page, MAP065_IDS.clusterCharacter)).toHaveCount(1);
  await expect(map065Pin(page, MAP065_IDS.clusterMission)).toHaveCount(0);

  await map065Layer(page, 'Misiones').check();
  await expect(cluster).toHaveCount(1);
  await expect(cluster).toHaveAttribute('data-pin-count', '2');
});

test('keeps filters and search while a layer temporarily yields zero results', async ({ page }) => {
  await openMap065(page);
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await openMap065Layers(page);

  const missionTag = page.getByRole('checkbox', { name: /Misión exclusiva MAP065/ });
  await missionTag.check();
  await expect(page.locator('[data-place-filters-status]')).toContainText('1 resultado');

  const search = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await search.fill('Misión completada MAP065');
  await expect(page.locator(`[data-search-result-id="${MAP065_IDS.mission}"]`)).toHaveCount(1);

  await map065Layer(page, 'Misiones').uncheck();
  await expect(missionTag).toBeChecked();
  await expect(search).toHaveValue('Misión completada MAP065');
  await expect(page.locator('[data-place-filters-status]')).toContainText('Ningún resultado');
  await expect(page.locator(`[data-search-result-id="${MAP065_IDS.mission}"]`)).toHaveCount(0);
  await expect(page.locator('[data-place-search-status]')).toContainText(
    'No hay resultados visibles',
  );

  await map065Layer(page, 'Misiones').check();
  await expect(missionTag).toBeChecked();
  await expect(search).toHaveValue('Misión completada MAP065');
  await expect(page.locator('[data-place-filters-status]')).toContainText('1 resultado');
  await expect(page.locator(`[data-search-result-id="${MAP065_IDS.mission}"]`)).toHaveCount(1);
});
