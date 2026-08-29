import { readFile, writeFile } from 'node:fs/promises';

const targets = [
  'tests/e2e/full-entity-details.spec.ts',
  'tests/e2e/compact-pin-details.spec.ts',
  'tests/e2e/map037-mobile-details.spec.ts',
  'tests/e2e/pin-density.spec.ts',
];

const accents = new Map([
  ['player-a', '#2563eb'],
  ['player-b', '#b45309'],
  ['player-density', '#047857'],
]);

for (const path of targets) {
  let source = await readFile(path, 'utf8');
  let changed = false;

  for (const [playerId, accent] of accents) {
    const pattern = new RegExp(`\\{\\s*id: '${playerId}',[\\s\\S]*?name_language: 'en',?\\s*\\}`, 'g');
    source = source.replace(pattern, (record) => {
      if (record.includes('accent_color:')) return record;
      changed = true;
      if (record.includes("name_language: 'en',")) {
        return record.replace(
          "name_language: 'en',",
          `name_language: 'en',\n      accent_color: '${accent}',`,
        );
      }
      return record.replace(
        "name_language: 'en'",
        `name_language: 'en', accent_color: '${accent}'`,
      );
    });
  }

  if (!changed) {
    console.log(`${path}: already aligned`);
    continue;
  }

  await writeFile(path, source);
  console.log(`${path}: added persisted player accent fixtures`);
}
