import fs from 'node:fs';

const path = 'tests/e2e/map063-public-player-notes.spec.ts';
let source = fs.readFileSync(path, 'utf8');

function replaceAllChecked(before, after, expected, label) {
  const count = source.split(before).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected}, found ${count}`);
  source = source.split(before).join(after);
}

replaceAllChecked(
  "      geometry: { kind: 'point', x: 700, y: 700 },\n",
  '',
  1,
  'campaign A point geometry',
);
replaceAllChecked(
  "      geometry: { kind: 'point', x: 800, y: 800 },\n",
  '',
  1,
  'campaign B point geometry',
);
replaceAllChecked(
  "      return PLAYERS[campaignId as keyof typeof PLAYERS].map(\n        ({ display_order: _order, ...player }) => player,\n      );",
  "      return PLAYERS[campaignId as keyof typeof PLAYERS].map((player) => ({\n        id: player.id,\n        slug: player.slug,\n        display_name: player.display_name,\n        name_language: player.name_language,\n        accent_color: player.accent_color,\n      }));",
  1,
  'public player projection',
);
replaceAllChecked(
  "  await expect(page.getByLabel('Autor declarado')).toHaveCount(0);",
  "  await expect(page.getByLabel('Autor declarado')).not.toBeVisible();",
  1,
  'master hidden author selector',
);

fs.writeFileSync(path, source);
