from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f"missing expected block: {label}")
    return source.replace(old, new, 1)


compact = Path("tests/e2e/compact-pin-details.spec.ts")
source = compact.read_text()
source = replace_once(
    source,
    """    const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });\n    await searchbox.fill('Scout');\n""",
    """    const searchToggle = page.locator('[data-place-search-toggle]');\n    if ((await searchToggle.getAttribute('aria-expanded')) === 'false') await searchToggle.click();\n    const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });\n    await searchbox.fill('Scout');\n""",
    "compact mobile search expansion",
)
compact.write_text(source)

portraits = Path("tests/e2e/map045-character-portraits.spec.ts")
source = portraits.read_text()
source = replace_once(
    source,
    """  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });\n  await searchbox.fill(name);\n""",
    """  const searchToggle = page.locator('[data-place-search-toggle]');\n  if ((await searchToggle.getAttribute('aria-expanded')) === 'false') await searchToggle.click();\n  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });\n  await searchbox.fill(name);\n""",
    "portrait mobile search expansion",
)
portraits.write_text(source)

master = Path("tests/e2e/master-mode.spec.ts")
source = master.read_text()
source = replace_once(
    source,
    """  await expect(toggle).toBeVisible();\n  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });\n  await searchbox.fill(MASTER_NAME);\n""",
    """  await expect(toggle).toBeVisible();\n  const searchToggle = page.locator('[data-place-search-toggle]');\n  if ((await searchToggle.getAttribute('aria-expanded')) === 'false') await searchToggle.click();\n  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });\n  await searchbox.fill(MASTER_NAME);\n""",
    "master mobile search expansion",
)
master.write_text(source)

pin_visual = Path("tests/e2e/pin-visual-system.spec.ts")
source = pin_visual.read_text()
source = replace_once(
    source,
    """  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });\n  await searchbox.fill('Scout');\n""",
    """  const searchToggle = page.locator('[data-place-search-toggle]');\n  if ((await searchToggle.getAttribute('aria-expanded')) === 'false') await searchToggle.click();\n  const searchbox = page.getByRole('searchbox', { name: 'Buscar lugares' });\n  await searchbox.fill('Scout');\n""",
    "pin visual mobile search expansion",
)
source = replace_once(
    source,
    """  await panel.getByRole('button', { name: /Cerrar la ficha de Demonstration Harbor/i }).click();\n  await expect(coincident).toBeFocused();\n\n  await coincident.click();\n""",
    """  await panel.getByRole('button', { name: /Cerrar la ficha de Demonstration Harbor/i }).click();\n  const restoredHarbor = page\n    .getByTestId('coincident-pin-option')\n    .filter({ has: page.locator('[data-place-id=\"place-demo-harbor\"]') });\n  await expect(restoredHarbor).toBeFocused();\n  await page.keyboard.press('Escape');\n  await expect(coincident).toBeFocused();\n\n  await coincident.click();\n""",
    "exact-coordinate close focus follows selected member",
)
pin_visual.write_text(source)

proximity = Path("tests/e2e/map059-proximity-spiderfy.spec.ts")
source = proximity.read_text()
old = """  for (let attempt = 0; attempt < 8 && (await cluster(page, 2).count()) > 0; attempt += 1) {\n    const zoomIn = page.getByTitle('Acercar');\n    if (await zoomIn.isDisabled()) break;\n    await zoomIn.click();\n  }\n\n  await expect(page.locator(`[data-pin-id=\"${ZOOM_A_ID}\"]`)).toBeVisible();\n  await expect(page.locator(`[data-pin-id=\"${ZOOM_B_ID}\"]`)).toBeVisible();\n  await expect(cluster(page, 3)).toBeVisible();\n"""
new = """  const zoomPairIsGrouped = async (): Promise<boolean> =>\n    page.locator('[data-proximity-cluster=\"true\"]').evaluateAll((elements) =>\n      elements.some((element) => {\n        const marker = element as HTMLElement;\n        const lat = Number(marker.dataset.markerLat);\n        const lng = Number(marker.dataset.markerLng);\n        return Math.abs(lat - 1000) < 80 && Math.abs(lng - 1550) < 80;\n      }),\n    );\n  await expect.poll(zoomPairIsGrouped).toBe(true);\n\n  for (let attempt = 0; attempt < 8 && (await zoomPairIsGrouped()); attempt += 1) {\n    const zoomIn = page.getByTitle('Acercar');\n    if (await zoomIn.isDisabled()) break;\n    await zoomIn.click();\n  }\n\n  await expect.poll(zoomPairIsGrouped).toBe(false);\n  await expect(cluster(page, 3)).toBeVisible();\n"""
source = replace_once(source, old, new, "zoom-pair scoped E2E separation")
proximity.write_text(source)
