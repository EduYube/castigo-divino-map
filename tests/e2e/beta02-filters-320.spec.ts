import { expect, test, type Page } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const NEUTRAL_TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

async function openReadyMap(page: Page): Promise<void> {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: NEUTRAL_TEST_MAP,
    });
  });
  await page.goto('/');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
}

test('keeps Beta 0.2 filters usable without horizontal overflow at 320px', async ({ page }) => {
  await openReadyMap(page);

  const toggle = page.locator('[data-place-filters-toggle]');
  await toggle.click();

  const characterFilter = page.getByRole('checkbox', { name: /Personaje/ });
  await expect(characterFilter).toBeVisible();
  await characterFilter.focus();
  await page.keyboard.press('Space');

  await expect(characterFilter).toBeChecked();
  await expect(characterFilter).toBeFocused();
  await expect(page.locator('[data-place-filters-status]')).toHaveText(
    '1 resultado coincide con la búsqueda y los filtros actuales.',
  );
  await expect(
    page.locator('[data-testid="entity-pin"][data-category-id="category-pj"]'),
  ).toHaveAttribute('data-filter-match', 'true');

  const viewportMetrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(viewportMetrics.clientWidth).toBe(320);
  expect(viewportMetrics.scrollWidth).toBeLessThanOrEqual(320);
});
