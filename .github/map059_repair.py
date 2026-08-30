from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f"missing expected block: {label}")
    return source.replace(old, new, 1)


leaflet = Path("src/map/leaflet.ts")
source = leaflet.read_text()
source = replace_once(
    source,
    """      memberMarker.on('add', () => {\n        const element = memberMarker.getElement();\n        element?.classList.add('campaign-marker-icon--spiderfied');\n        if (element) element.dataset.spiderfied = 'true';\n        decoratePinMarker(memberMarker, pin);\n      });\n""",
    """      memberMarker.on('add', () => {\n        const element = memberMarker.getElement();\n        element?.classList.add('campaign-marker-icon--spiderfied');\n        if (element) element.dataset.spiderfied = 'true';\n        decoratePinMarker(memberMarker, pin);\n        element?.setAttribute('data-testid', 'coincident-pin-option');\n      });\n""",
    "spiderfy legacy option hook",
)
source = replace_once(
    source,
    """      const firstPin = pins[0];\n      const markerLatLng = singleton\n        ? L.latLng(firstPin.coordinate[0], firstPin.coordinate[1])\n        : map.layerPointToLatLng(L.point(proximityGroup.center.x, proximityGroup.center.y));\n""",
    """      const firstPin = pins[0];\n      const exactCoordinateGroup =\n        !singleton &&\n        pins.every(\n          ({ coordinate }) =>\n            coordinate[0] === firstPin.coordinate[0] && coordinate[1] === firstPin.coordinate[1],\n        );\n      const markerLatLng =\n        singleton || exactCoordinateGroup\n          ? L.latLng(firstPin.coordinate[0], firstPin.coordinate[1])\n          : map.layerPointToLatLng(L.point(proximityGroup.center.x, proximityGroup.center.y));\n""",
    "canonical exact-coordinate cluster center",
)
source = replace_once(
    source,
    """    if (focusIndex >= 0) {\n      window.requestAnimationFrame(() => {\n        memberMarkers[focusIndex]?.getElement()?.focus({ preventScroll: true });\n      });\n    }\n""",
    """    if (focusIndex >= 0) {\n      memberMarkers[focusIndex]?.getElement()?.focus({ preventScroll: true });\n      window.requestAnimationFrame(() => {\n        memberMarkers[focusIndex]?.getElement()?.focus({ preventScroll: true });\n      });\n    }\n""",
    "synchronous spiderfy keyboard focus",
)
leaflet.write_text(source)

proximity = Path("tests/e2e/map059-proximity-spiderfy.spec.ts")
source = proximity.read_text()
source = replace_once(
    source,
    """  await expect(page.locator('[data-backend-status]')).toHaveAttribute(\n    'data-backend-state',\n    'connected',\n  );\n  await expect(cluster(page, 4)).toBeVisible();\n}\n""",
    """  await expect(page.locator('[data-backend-status]')).toHaveAttribute(\n    'data-backend-state',\n    'connected',\n  );\n}\n""",
    "viewport-neutral openMap helper",
)
source = replace_once(
    source,
    """  await expect(cluster(page, 2)).toHaveCount(0);\n  await expect(page.locator(`[data-pin-id=\"${ZOOM_A_ID}\"]`)).toBeVisible();\n""",
    """  await expect(page.locator(`[data-pin-id=\"${ZOOM_A_ID}\"]`)).toBeVisible();\n""",
    "zoom pair separation assertion",
)
source = replace_once(
    source,
    """  await expect(group.locator('.pin-visual')).toHaveCSS('transition-duration', '0s');\n""",
    """  const transitionDuration = await group\n    .locator('.pin-visual')\n    .evaluate((element) => getComputedStyle(element).transitionDuration);\n  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.00001);\n""",
    "reduced motion chromium normalization",
)
mobile_start = "for (const width of [320, 390, 430]) {\n  test(`keeps 52px spiderfied targets operable inside the map at ${width}px`, async ({ page }) => {"
mobile_index = source.find(mobile_start)
if mobile_index < 0:
    raise SystemExit("missing MAP-059 mobile loop")
source = source[:mobile_index] + """for (const width of [320, 390, 430]) {
  test(`keeps 52px spiderfied targets operable inside the map at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openMap(page);

    const group = page.locator('[data-proximity-cluster="true"]').first();
    await expect(group).toBeVisible();
    const memberCount = Number(await group.getAttribute('data-pin-count'));
    expect(memberCount).toBeGreaterThan(1);
    await group.click();

    const spiderfied = page.locator('[data-spiderfied="true"]');
    await expect(spiderfied).toHaveCount(memberCount);
    const mapBox = await page.locator('[data-map-canvas]').boundingBox();
    expect(mapBox).not.toBeNull();
    const boxes = await spiderfied.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      }),
    );

    expect(boxes).toHaveLength(memberCount);
    for (const box of boxes) {
      expect(box.width).toBe(52);
      expect(box.height).toBe(52);
      if (mapBox) {
        expect(box.left).toBeGreaterThanOrEqual(mapBox.x - 1);
        expect(box.right).toBeLessThanOrEqual(mapBox.x + mapBox.width + 1);
        expect(box.top).toBeGreaterThanOrEqual(mapBox.y - 1);
        expect(box.bottom).toBeLessThanOrEqual(mapBox.y + mapBox.height + 1);
      }
    }
  });
}
"""
proximity.write_text(source)

geographic = Path("tests/e2e/map042-geographic-navigation-pins.spec.ts")
source = geographic.read_text()
source = replace_once(
    source,
    """  const shell = page.getByTestId('map-shell');\n  const exactPin = page.locator('[data-place-id=\"place-demo-harbor\"]');\n  const nearbyPin = page.locator('[data-place-id=\"place-demo-pass\"]');\n  const group = page.getByTestId('coincident-pin');\n\n  await expect(shell).toHaveAttribute('data-search-highlight-kind', 'area');\n  await expect(shell).toHaveAttribute('data-search-highlight-bounds', '1380,1710,750,1500');\n  await expect(page.locator('.geographic-search-area-highlight')).toBeVisible();\n  await expectPinNotTextDimmed(exactPin);\n  await expectPinNotTextDimmed(nearbyPin);\n  await expect(group).toBeVisible();\n""",
    """  const shell = page.getByTestId('map-shell');\n  const group = page.locator(\n    '[data-proximity-cluster=\"true\"][data-marker-lat=\"1000\"][data-marker-lng=\"1500\"]',\n  );\n\n  await expect(shell).toHaveAttribute('data-search-highlight-kind', 'area');\n  await expect(shell).toHaveAttribute('data-search-highlight-bounds', '1380,1710,750,1500');\n  await expect(page.locator('.geographic-search-area-highlight')).toBeVisible();\n  await expect(group).toBeVisible();\n""",
    "MAP-042 grouped regional pins",
)
source = replace_once(
    source,
    """  await group.click();\n  const option = page.getByTestId('coincident-pin-option').filter({ hasText: 'Sword Coast Scout' });\n  await expect(option).toBeVisible();\n""",
    """  await group.click();\n  const option = page.locator(\n    '[data-spiderfied=\"true\"][data-pin-id=\"entity-sword-coast-scout\"]',\n  );\n  await expect(option).toBeVisible();\n""",
    "MAP-042 spiderfied scout",
)
geographic.write_text(source)

portraits = Path("tests/e2e/map045-character-portraits.spec.ts")
source = portraits.read_text()
source = replace_once(
    source,
    """function standardCharacterMarker(page: Page) {\n  return page.locator(`.campaign-marker-icon[data-entity-id=\"${STANDARD_CHARACTER_ID}\"]`);\n}\n\n""",
    """function standardCharacterMarker(page: Page) {\n  return page.locator(`.campaign-marker-icon[data-entity-id=\"${STANDARD_CHARACTER_ID}\"]`);\n}\n\nasync function revealCharacterMarker(page: Page, id: string, name: string): Promise<Locator> {\n  const direct = page.locator(`.campaign-marker-icon[data-entity-id=\"${id}\"]`);\n  if ((await direct.count()) > 0) return direct;\n\n  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });\n  await searchbox.fill(name);\n  const result = page.locator(`[data-search-result-id=\"${id}\"]`);\n  await expect(result).toBeVisible();\n  await result.click();\n\n  const revealed = page.locator(`.campaign-marker-icon[data-entity-id=\"${id}\"]`);\n  await expect(revealed).toBeVisible();\n  return revealed;\n}\n\n""",
    "MAP-045 grouped marker reveal helper",
)
portraits_start = "for (const viewport of [\n  { width: 1280, height: 800, label: 'desktop' },"
portraits_index = source.find(portraits_start)
if portraits_index < 0:
    raise SystemExit("missing MAP-045 responsive loop")
source = source[:portraits_index] + """for (const viewport of [
  { width: 1280, height: 800, label: 'desktop' },
  { width: 320, height: 740, label: '320×740' },
  { width: 390, height: 844, label: '390×844' },
  { width: 430, height: 932, label: '430×932' },
] as const) {
  test(`portrait remains discoverable and marker/details stay compact at ${viewport.label}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const backend = await configureBackend(page, PORTRAIT_PATH);
    await page.goto('/');

    const marker = await revealCharacterMarker(page, CHARACTER_ID, 'MAP045 Portrait Character');
    await expect(marker).toHaveAttribute('data-portrait-marker', 'true');
    await expect.poll(() => backend.markerRequests().length).toBeGreaterThanOrEqual(1);
    const portraitGeometry = await markerGeometry(marker);
    expect(portraitGeometry.markerWidth).toBeCloseTo(52, 1);
    expect(portraitGeometry.markerHeight).toBeCloseTo(52, 1);
    await marker.click();
    await expect(page.getByTestId('compact-character-portrait')).toBeVisible();
    await expect(page.getByTestId('map-shell')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}
"""
portraits.write_text(source)

master = Path("tests/e2e/master-mode.spec.ts")
source = master.read_text()
source = replace_once(
    source,
    """  await expect(coincident).toHaveCount(1);\n  await expect(coincident).toHaveAttribute('data-pin-count', '2');\n  await expect(coincident).toHaveAttribute('data-audience', 'mixed');\n  await expect(coincident).toHaveAttribute('aria-label', /1 de contenido del Máster/i);\n""",
    """  await expect(coincident).toHaveCount(1);\n  await expect(coincident).toHaveAttribute('data-pin-count', '2');\n  await expect(coincident).toHaveAttribute('aria-label', '2 pines agrupados');\n  await expect(coincident).not.toHaveAttribute('data-audience', /.+/);\n  await expect(coincident).not.toHaveAttribute('aria-description', /Máster/i);\n""",
    "neutral master cluster semantics",
)
source = replace_once(
    source,
    """  const toggle = page.locator('[data-master-mode-toggle]');\n  const marker = page.locator('.campaign-marker-icon[data-audience=\"master\"]');\n  await expect(toggle).toBeVisible();\n  await expect(marker).toHaveCount(1);\n  await expect(marker).toHaveAttribute('aria-label', /Contenido del Máster/);\n  await expect(marker.locator('.pin-visual--master')).toHaveCount(1);\n""",
    """  const toggle = page.locator('[data-master-mode-toggle]');\n  await expect(toggle).toBeVisible();\n  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });\n  await searchbox.fill(MASTER_NAME);\n  await page.locator(`[data-search-result-id=\"${MASTER_ID}\"]`).click();\n  const marker = page.locator(\n    `[data-spiderfied=\"true\"][data-entity-id=\"${MASTER_ID}\"][data-audience=\"master\"]`,\n  );\n  await expect(marker).toHaveCount(1);\n  await expect(marker).toHaveAttribute('aria-label', /Contenido del Máster/);\n  await expect(marker.locator('.pin-visual--master')).toHaveCount(1);\n""",
    "mobile grouped master pin",
)
master.write_text(source)

density = Path("tests/e2e/pin-density.spec.ts")
source = density.read_text()
first_start = "test('keeps 16 nearby markers visually compact while preserving their full Leaflet hit area'"
second_start = "test('keeps type, disposition, keyboard focus and selection usable inside the dense marker set'"
first_index = source.find(first_start)
second_index = source.find(second_start, first_index)
if first_index < 0 or second_index < 0:
    raise SystemExit("missing density tests")
first_test = """test('keeps dense marker clusters compact while preserving their full Leaflet hit area', async ({
  page,
}) => {
  await openDensityMap(page);

  const clusters = page.locator('[data-proximity-cluster="true"]');
  await expect(clusters.first()).toBeVisible();
  const representedPins = await clusters.evaluateAll((elements) =>
    elements.reduce((total, element) => total + Number((element as HTMLElement).dataset.pinCount ?? 0), 0),
  );
  expect(representedPins).toBe(16);

  const metrics = await clusters.evaluateAll((elements) =>
    elements.map((element) => {
      const hitRect = element.getBoundingClientRect();
      const visual = element.querySelector<HTMLElement>('.pin-visual');
      if (!visual) throw new Error('Density cluster is missing its visual marker');
      const visualRect = visual.getBoundingClientRect();
      const hitCenterX = hitRect.left + hitRect.width / 2;
      const hitCenterY = hitRect.top + hitRect.height / 2;
      const visualCenterX = visualRect.left + visualRect.width / 2;
      const visualCenterY = visualRect.top + visualRect.height / 2;
      return {
        hitWidth: hitRect.width,
        hitHeight: hitRect.height,
        footprintWidth: visualRect.width,
        footprintHeight: visualRect.height,
        centerDeltaX: Math.abs(visualCenterX - hitCenterX),
        centerDeltaY: Math.abs(visualCenterY - hitCenterY),
      };
    }),
  );

  for (const metric of metrics) {
    expect(metric.hitWidth).toBeGreaterThanOrEqual(44);
    expect(metric.hitHeight).toBeGreaterThanOrEqual(44);
    expect(metric.footprintWidth).toBeLessThanOrEqual(44);
    expect(metric.footprintHeight).toBeLessThanOrEqual(44);
    expect(metric.centerDeltaX).toBeLessThanOrEqual(0.5);
    expect(metric.centerDeltaY).toBeLessThanOrEqual(0.5);
  }

  const group = clusters.first();
  const groupCount = Number(await group.getAttribute('data-pin-count'));
  await group.click();
  await expect(page.locator('[data-spiderfied="true"]')).toHaveCount(groupCount);
});

"""
source = source[:first_index] + first_test + source[second_index:]
second_index = source.find(second_start)
if second_index < 0:
    raise SystemExit("missing second density test after first replacement")
source = source[:second_index] + """test('keeps type, disposition, keyboard focus and selection usable inside the dense marker set', async ({
  page,
}) => {
  await openDensityMap(page);

  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });
  await searchbox.fill('Density pin 4');
  await page.locator('[data-search-result-id="entity-density-pin-4"]').click();
  const location = page.locator('[data-pin-id="entity-density-pin-4"]');
  await expect(location).toBeVisible();
  await expect(location.locator('.pin-visual')).toHaveClass(/pin-visual--location/);
  await expect(location.locator('.pin-disposition')).toBeVisible();

  await searchbox.fill('Density pin 5');
  await page.locator('[data-search-result-id="entity-density-pin-5"]').click();
  const character = page.locator('[data-pin-id="entity-density-pin-5"]');
  await expect(character).toBeVisible();
  await expect(character.locator('.pin-visual')).toHaveClass(/pin-visual--character/);
  await expect(character.locator('.pin-disposition')).toBeVisible();

  await character.focus();
  await expect(character).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('place-details')).toBeVisible();
  await expect(page.getByTestId('place-details')).toHaveAttribute(
    'data-entity-id',
    'entity-density-pin-5',
  );
});
"""
density.write_text(source)

pin_visual = Path("tests/e2e/pin-visual-system.spec.ts")
source = pin_visual.read_text()
source = replace_once(
    source,
    """  const character = page.locator('[data-testid=\"entity-pin\"][data-pin-id=\"entity-scout\"]');\n  const box = await character.boundingBox();\n  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);\n  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);\n  await character.focus();\n\n  const styles = await character.locator('.pin-visual').evaluate((element) => {\n    const style = getComputedStyle(element);\n    return {\n      transitionDuration: style.transitionDuration,\n      outlineStyle: style.outlineStyle,\n    };\n  });\n  expect(Number.parseFloat(styles.transitionDuration)).toBeLessThanOrEqual(0.00001);\n  expect(styles.outlineStyle).not.toBe('none');\n\n  await page.getByTestId('coincident-pin').click();\n  const optionBox = await page.getByTestId('coincident-pin-option').first().boundingBox();\n""",
    """  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });\n  await searchbox.fill('Scout');\n  await page.locator('[data-search-result-id=\"entity-scout\"]').click();\n  const character = page.locator('[data-pin-id=\"entity-scout\"]');\n  await expect(character).toBeVisible();\n  const box = await character.boundingBox();\n  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);\n  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);\n  await character.focus();\n\n  const styles = await character.locator('.pin-visual').evaluate((element) => {\n    const style = getComputedStyle(element);\n    return {\n      transitionDuration: style.transitionDuration,\n      outlineStyle: style.outlineStyle,\n    };\n  });\n  expect(Number.parseFloat(styles.transitionDuration)).toBeLessThanOrEqual(0.00001);\n  expect(styles.outlineStyle).not.toBe('none');\n\n  if ((await character.getAttribute('data-spiderfied')) === 'true') await page.keyboard.press('Escape');\n  const group = page.locator('[data-proximity-cluster=\"true\"]').first();\n  await expect(group).toBeVisible();\n  await group.click();\n  const optionBox = await page.getByTestId('coincident-pin-option').first().boundingBox();\n""",
    "pin visual mobile grouped marker",
)
pin_visual.write_text(source)

compact = Path("tests/e2e/compact-pin-details.spec.ts")
source = compact.read_text()
source = replace_once(
    source,
    """    const character = page.locator('[data-testid=\"entity-pin\"][data-pin-id=\"entity-scout\"]');\n    await character.click();\n\n    const panel = page.getByTestId('place-details');\n""",
    """    const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });\n    await searchbox.fill('Scout');\n    await page.locator('[data-search-result-id=\"entity-scout\"]').click();\n    const character = page.locator('[data-pin-id=\"entity-scout\"]');\n    await expect(character).toBeVisible();\n    await character.click();\n\n    const panel = page.getByTestId('place-details');\n""",
    "compact details mobile grouped character",
)
compact.write_text(source)
