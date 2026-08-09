import { expect, test } from '@playwright/test';

const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';
const TEST_MAP = `
  <svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2329" viewBox="0 0 3600 2329">
    <rect width="3600" height="2329" fill="#d9d5ca" />
  </svg>
`;

test('publishes the MAP-021 Waterdeep geographic search contract', async ({ page }) => {
  await page.route(OFFICIAL_MAP_URL, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: TEST_MAP });
  });

  const response = await page.goto('?q=Waterdeep');
  expect(response?.ok()).toBe(true);

  const backendStatus = page.locator('[data-backend-status]');
  if (process.env.PAGES_URL) {
    await expect(backendStatus).toHaveAttribute('data-backend-state', 'connected');
  } else {
    await expect
      .poll(async () => {
        const state = await backendStatus.getAttribute('data-backend-state');
        const reason = await backendStatus.getAttribute('data-backend-reason');
        return state === 'connected' || (state === 'degraded' && reason === 'configuration-missing');
      })
      .toBe(true);
  }

  const result = page.getByRole('button', {
    name: /Waterdeep.*Lugar geográfico.*Coincidencia por nombre principal/i,
  });
  await expect(result).toBeVisible();
  await result.click();

  const shell = page.getByTestId('map-shell');
  await expect(shell).toHaveAttribute('data-map-center', '1465.00,1626.00');
  await expect(shell).toHaveAttribute('data-map-zoom', '0.75');
  await expect(shell).toHaveAttribute('data-search-highlight', 'true');
});
