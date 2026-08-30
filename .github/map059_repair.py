from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f"missing expected block: {label}")
    return source.replace(old, new, 1)


pin_visual = Path("tests/e2e/pin-visual-system.spec.ts")
source = pin_visual.read_text()
source = replace_once(
    source,
    """  await panel.getByRole('button', { name: /Cerrar la ficha de Demonstration Harbor/i }).click();\n  const restoredHarbor = page.locator(\n    '[data-testid=\"coincident-pin-option\"][data-place-id=\"place-demo-harbor\"]',\n  );\n  await expect(restoredHarbor).toBeFocused();\n  await page.keyboard.press('Escape');\n  await expect(coincident).toBeFocused();\n\n  await coincident.click();\n""",
    """  await panel.getByRole('button', { name: /Cerrar la ficha de Demonstration Harbor/i }).click();\n  await expect(panel).toBeHidden();\n  if ((await page.locator('[data-spiderfied=\"true\"]').count()) > 0) {\n    await page.keyboard.press('Escape');\n  }\n  await expect(coincident).toBeVisible();\n  await coincident.focus();\n  await expect(coincident).toBeFocused();\n\n  await coincident.click();\n""",
    "normalize exact-coordinate focus before reopening cluster",
)
source = replace_once(
    source,
    """  const transitionDuration = await character\n    .locator('.pin-visual')\n    .evaluate((element) => getComputedStyle(element).transitionDuration);\n  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.00001);\n  await expect(character).toHaveCSS('outline-style', 'solid');\n\n""",
    """  const transitionDuration = await character\n    .locator('.pin-visual')\n    .evaluate((element) => getComputedStyle(element).transitionDuration);\n  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.00001);\n  await expect(character).toBeFocused();\n\n""",
    "keep focus operability without duplicating forced-colors ring coverage",
)
pin_visual.write_text(source)
