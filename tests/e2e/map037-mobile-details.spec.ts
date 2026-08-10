import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { expectMapAttribution } from './support/mapAttribution';
import { installSupabaseMock } from './support/supabaseMock';

const MOBILE_VIEWPORTS = [
  { width: 320, height: 740, label: '320x740' },
  { width: 430, height: 932, label: '430x932' },
  { width: 667, height: 375, label: '667x375-landscape' },
] as const;

async function openReadyMap(page: Page): Promise<void> {
  await installSupabaseMock(page);
  await page.goto('./');
  await expect(page.getByTestId('map-shell')).toHaveAttribute('data-map-state', 'ready');
  await expectMapAttribution(page);
}

async function pageScrollY(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

async function expectTouchTarget(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(43.9);
  expect(box!.height).toBeGreaterThanOrEqual(43.9);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(1);
}

async function captureReference(
  page: Page,
  testInfo: TestInfo,
  label: string,
): Promise<void> {
  const screenshot = await page.screenshot({ fullPage: false });
  await testInfo.attach(`MAP-037 ${label}`, {
    body: screenshot,
    contentType: 'image/png',
  });
}

async function expectSheetPreservesMapContext(page: Page): Promise<void> {
  const mapBox = await page.getByTestId('map-shell').boundingBox();
  const panelBox = await page.getByTestId('place-details').boundingBox();
  const markerBox = await page
    .locator('.campaign-marker-icon[aria-pressed="true"]')
    .boundingBox();

  expect(mapBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(markerBox).not.toBeNull();

  expect(panelBox!.height).toBeLessThanOrEqual(mapBox!.height * 0.49 + 1);
  expect(panelBox!.y).toBeGreaterThanOrEqual(mapBox!.y + mapBox!.height * 0.5);

  await expect
    .poll(async () => {
      const currentPanelBox = await page.getByTestId('place-details').boundingBox();
      const activeMarkerBox = await page
        .locator('.campaign-marker-icon[aria-pressed="true"]')
        .boundingBox();

      if (!currentPanelBox || !activeMarkerBox) {
        return Number.POSITIVE_INFINITY;
      }

      return activeMarkerBox.y + activeMarkerBox.height / 2 - currentPanelBox.y;
    })
    .toBeLessThan(-4);
}

for (const viewport of MOBILE_VIEWPORTS) {
  test(`keeps map context, focus and scroll stable at ${viewport.label}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await openReadyMap(page);

    const marker = page.locator('[data-testid="entity-pin"][data-pin-id="entity-scout"]');
    await marker.scrollIntoViewIfNeeded();
    const scrollBeforeOpen = await pageScrollY(page);

    await marker.click();

    const panel = page.getByTestId('place-details');
    const title = panel.getByRole('heading', { level: 3, name: 'Scout' });
    const returnButton = panel.getByRole('button', { name: 'Volver al pin de Scout' });

    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('role', 'region');
    await expect(panel).not.toHaveAttribute('aria-modal', 'true');
    await expect(title).toBeFocused();
    await expect(returnButton).toBeVisible();
    expect(Math.abs((await pageScrollY(page)) - scrollBeforeOpen)).toBeLessThanOrEqual(1);
    await expectTouchTarget(page, '[data-place-details-return]');
    await expectTouchTarget(page, '[data-place-details-close]');
    await expectSheetPreservesMapContext(page);
    await expectNoHorizontalOverflow(page);
    await captureReference(page, testInfo, viewport.label);

    const fullAction = panel.getByRole('link', {
      name: 'Abrir ficha completa de Scout en una pestaña nueva',
    });
    expect(await panel.evaluate((element) => element.scrollTop)).toBe(0);
    await panel.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(fullAction).toBeVisible();
    expect(await panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(Math.abs((await pageScrollY(page)) - scrollBeforeOpen)).toBeLessThanOrEqual(1);

    await returnButton.click();
    await expect(marker).toBeFocused();
    await expect(panel).toBeVisible();
    expect(Math.abs((await pageScrollY(page)) - scrollBeforeOpen)).toBeLessThanOrEqual(1);

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(marker).toBeFocused();
    expect(Math.abs((await pageScrollY(page)) - scrollBeforeOpen)).toBeLessThanOrEqual(1);
  });
}

test('changes the active pin without leaving the mobile map workspace', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyMap(page);

  const scout = page.locator('[data-testid="entity-pin"][data-pin-id="entity-scout"]');
  await scout.click();
  const panel = page.getByTestId('place-details');
  await expect(panel.getByRole('heading', { level: 3, name: 'Scout' })).toBeVisible();

  const coincidentPin = page.getByTestId('coincident-pin').first();
  await coincidentPin.click();
  const options = page.getByTestId('coincident-pin-option');
  await expect(options.first()).toBeVisible();
  const targetOption = options.filter({ hasText: 'Arannis' });
  await targetOption.click();

  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { level: 3, name: 'Arannis' })).toBeFocused();
  await expect(page.locator('.campaign-marker-icon[aria-pressed="true"]')).toHaveCount(1);
  await expectSheetPreservesMapContext(page);
  await expectNoHorizontalOverflow(page);
});
