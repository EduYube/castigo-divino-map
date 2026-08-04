import { expect, test } from '@playwright/test';

test('shows the technical foundation without loading the map', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('El Atlas de los Nuevos Dioses');
  await expect(
    page.getByRole('heading', { level: 1, name: 'El Atlas de los Nuevos Dioses' }),
  ).toBeVisible();
  await expect(page.getByLabel('Estado técnico')).toContainText('Leaflet');
  await expect(page.getByText('Esta entrega no descarga, almacena ni representa')).toBeVisible();
});
