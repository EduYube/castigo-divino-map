from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f"missing expected block: {label}")
    return source.replace(old, new, 1)


master = Path("tests/e2e/master-mode.spec.ts")
source = master.read_text()
source = replace_once(
    source,
    """  const marker = page.locator(\n    `[data-spiderfied=\"true\"][data-entity-id=\"${MASTER_ID}\"][data-audience=\"master\"]`,\n  );\n""",
    """  const marker = page.locator(\n    `.campaign-marker-icon[data-entity-id=\"${MASTER_ID}\"][data-audience=\"master\"]`,\n  );\n""",
    "master marker may become singleton after search navigation",
)
master.write_text(source)

pin_visual = Path("tests/e2e/pin-visual-system.spec.ts")
source = pin_visual.read_text()
source = replace_once(
    source,
    """  const restoredHarbor = page\n    .getByTestId('coincident-pin-option')\n    .filter({ has: page.locator('[data-place-id=\"place-demo-harbor\"]') });\n  await expect(restoredHarbor).toBeFocused();\n""",
    """  const restoredHarbor = page.locator(\n    '[data-testid=\"coincident-pin-option\"][data-place-id=\"place-demo-harbor\"]',\n  );\n  await expect(restoredHarbor).toBeFocused();\n""",
    "exact-coordinate focused option locator",
)
source = replace_once(
    source,
    """  const styles = await character.locator('.pin-visual').evaluate((element) => {\n    const style = getComputedStyle(element);\n    return {\n      transitionDuration: style.transitionDuration,\n      outlineStyle: style.outlineStyle,\n    };\n  });\n  expect(Number.parseFloat(styles.transitionDuration)).toBeLessThanOrEqual(0.00001);\n  expect(styles.outlineStyle).not.toBe('none');\n""",
    """  const transitionDuration = await character\n    .locator('.pin-visual')\n    .evaluate((element) => getComputedStyle(element).transitionDuration);\n  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.00001);\n  await expect(character).toHaveCSS('outline-style', 'solid');\n""",
    "forced-colors focus outline belongs to marker control",
)
pin_visual.write_text(source)
