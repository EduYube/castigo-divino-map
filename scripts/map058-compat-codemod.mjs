import { readFile, writeFile } from 'node:fs/promises';

async function replaceInFile(path, replacements) {
  let text = await readFile(path, 'utf8');
  let changed = false;

  for (const [from, to, label] of replacements) {
    if (text.includes(to)) continue;
    if (!text.includes(from)) {
      throw new Error(`${path}: no se encontró el objetivo ${label}`);
    }
    text = text.replace(from, to);
    changed = true;
  }

  if (changed) await writeFile(path, text);
}

await replaceInFile('src/data/beta02-model.ts', [
  [
    "  /** MAP-054 persisted roster accent used by MAP-058 association visuals. */\n  readonly accentColor: string;",
    "  /** MAP-054 persisted roster accent. Historic Beta 0.2 snapshots may omit it. */\n  readonly accentColor?: string;",
    'PublicPlayer.accentColor legacy compatibility',
  ],
  [
    "  readonly associations: readonly PublicEntityPlayerAssociation[];",
    "  /** Historic Beta 0.2 snapshots predate MAP-058 and may omit associations. */\n  readonly associations?: readonly PublicEntityPlayerAssociation[];",
    'PublicCatalogSnapshotV2.associations legacy compatibility',
  ],
]);

await replaceInFile('src/infrastructure/supabase/publicCatalogCodec.ts', [
  [
    "type PublicCatalogContentV2 = Omit<\n  PublicCatalogSnapshotV2,\n  'generatedAt' | 'sourceRevision' | 'checksum'\n>;",
    "const HISTORIC_PLAYER_ACCENT = '#475569';\n\ntype NormalizedPublicPlayer = PublicCatalogSnapshotV2['players'][number] & {\n  readonly accentColor: string;\n};\n\ntype PublicCatalogContentV2 = Omit<\n  PublicCatalogSnapshotV2,\n  'generatedAt' | 'sourceRevision' | 'checksum' | 'players' | 'associations'\n> & {\n  readonly players: readonly NormalizedPublicPlayer[];\n  readonly associations: NonNullable<PublicCatalogSnapshotV2['associations']>;\n};",
    'normalized Beta 0.2 content type',
  ],
  [
    "      accent_color: player.accentColor,",
    "      accent_color: player.accentColor ?? HISTORIC_PLAYER_ACCENT,",
    'historic player accent fallback',
  ],
  [
    "  const associations = expectRecords(record.associations, 'snapshot.associations').map(\n    (association, index) => {\n      const path = `snapshot.associations[${index}]`;\n      assertAllowedProperties(association, ['entityId', 'playerId'], path);\n      return {\n        entity_id: association.entityId,\n        player_id: association.playerId,\n      };\n    },\n  );",
    "  const associations =\n    record.associations === undefined\n      ? []\n      : expectRecords(record.associations, 'snapshot.associations').map((association, index) => {\n          const path = `snapshot.associations[${index}]`;\n          assertAllowedProperties(association, ['entityId', 'playerId'], path);\n          return {\n            entity_id: association.entityId,\n            player_id: association.playerId,\n          };\n        });",
    'optional historic associations payload',
  ],
  [
    "    content = buildPublicCatalogContentV2(snapshotPayloads(record));\n  } catch (error) {\n    rethrowAsCacheError(error);\n  }\n\n  if (!Number.isFinite(Date.parse(generatedAt))) {",
    "    const checksumContent = Object.fromEntries(\n      [\n        'schemaVersion',\n        'categories',\n        'tags',\n        'players',\n        'entities',\n        'dispositions',\n        'associations',\n        'characterLocationRelations',\n        'notes',\n        'geographicNames',\n        'characterLocationEvents',\n      ]\n        .filter((key) => Object.prototype.hasOwnProperty.call(record, key))\n        .map((key) => [key, record[key]]),\n    );\n    const calculatedChecksum = await createSha256Checksum(checksumContent);\n    if (checksum !== calculatedChecksum) {\n      throw new PublicDataRepositoryError(\n        'checksum-mismatch',\n        'La caché pública no coincide con su checksum.',\n        { source: 'cache' },\n      );\n    }\n    content = buildPublicCatalogContentV2(snapshotPayloads(record));\n  } catch (error) {\n    rethrowAsCacheError(error);\n  }\n\n  if (!Number.isFinite(Date.parse(generatedAt))) {",
    'verify historical checksum before normalization',
  ],
  [
    "  const calculatedChecksum = await createSha256Checksum(content);\n\n  if (checksum !== calculatedChecksum) {\n    throw new PublicDataRepositoryError(\n      'checksum-mismatch',\n      'La caché pública no coincide con su checksum.',\n      { source: 'cache' },\n    );\n  }\n\n  const snapshot: PublicCatalogSnapshotV2 = {",
    "  const snapshot: PublicCatalogSnapshotV2 = {",
    'remove post-normalization checksum comparison',
  ],
]);

await replaceInFile('src/infrastructure/snapshot/multicampaignSnapshotCodec.ts', [
  [
    "  return {\n    ...item,\n    accentColor: item.accentColor === undefined ? HISTORIC_PLAYER_ACCENT : item.accentColor,\n  } as unknown as PublicCampaignCatalogV3['players'][number];",
    "  const accentColor =\n    item.accentColor === undefined\n      ? HISTORIC_PLAYER_ACCENT\n      : string(item.accentColor, `${path}.accentColor`);\n  if (!/^#[0-9a-f]{6}$/.test(accentColor)) {\n    invalid(`${path}.accentColor no tiene el formato de color persistido esperado.`);\n  }\n  return { ...item, accentColor } as unknown as PublicCampaignCatalogV3['players'][number];",
    'validate normalized v3 player accents',
  ],
]);

await replaceInFile('src/data/pinMarkers.ts', [
  [
    "      return {\n        playerId: player.id,\n        playerName: player.displayName,\n        accentColor: player.accentColor,\n      };",
    "      const accentColor = player.accentColor;\n      if (!accentColor) {\n        throw new Error(\n          `Missing persisted accent for player \"${player.id}\" associated with \"${entityId}\".`,\n        );\n      }\n      return {\n        playerId: player.id,\n        playerName: player.displayName,\n        accentColor,\n      };",
    'association accent fail-closed guard',
  ],
]);

await replaceInFile('src/data/publicEntityPresentation.ts', [
  [
    "    .map((player) => ({\n      id: player.id,\n      name: player.displayName,\n      accentColor: player.accentColor,\n    }));",
    "    .map((player) => {\n      const accentColor = player.accentColor;\n      if (!accentColor) {\n        throw new Error(`Missing persisted accent for associated player \"${player.id}\".`);\n      }\n      return {\n        id: player.id,\n        name: player.displayName,\n        accentColor,\n      };\n    });",
    'presentation association accent fail-closed guard',
  ],
]);

await replaceInFile('src/application/adminMapEntityController.test.ts', [
  [
    "  players: [{ id: 'player-one', displayName: 'One', publicationStatus: 'published' }],",
    "  players: [\n    {\n      id: 'player-one',\n      displayName: 'One',\n      publicationStatus: 'published',\n      accentColor: '#475569',\n    },\n  ],",
    'admin controller player accent fixture',
  ],
]);

await replaceInFile('src/domain/adminMapEntityValidation.test.ts', [
  [
    "    { id: 'player-one', displayName: 'One', publicationStatus: 'published' },\n    { id: 'player-two', displayName: 'Two', publicationStatus: 'published' },",
    "    {\n      id: 'player-one',\n      displayName: 'One',\n      publicationStatus: 'published',\n      accentColor: '#475569',\n    },\n    {\n      id: 'player-two',\n      displayName: 'Two',\n      publicationStatus: 'published',\n      accentColor: '#64748b',\n    },",
    'admin validation player accent fixtures',
  ],
]);

for (const path of [
  'src/application/masterModeController.test.ts',
  'src/application/masterModeController.race.test.ts',
]) {
  await replaceInFile(path, [
    [
      "  dispositions: [],\n  relations: [],",
      "  dispositions: [],\n  associations: [],\n  relations: [],",
      'empty Master catalog associations',
    ],
  ]);
}

for (const path of [
  'tests/e2e/campaign-switcher.spec.ts',
  'tests/e2e/map056-public-request-campaign-flow.spec.ts',
]) {
  await replaceInFile(path, [
    [
      "    dispositions: [],\n    characterLocationRelations: [],",
      "    dispositions: [],\n    associations: [],\n    characterLocationRelations: [],",
      'v3 E2E catalog associations',
    ],
  ]);
}

await replaceInFile('tests/e2e/pin-visual-system.spec.ts', [
  [
    "      display_name: 'Alicia',\n      name_language: 'en',",
    "      display_name: 'Alicia',\n      name_language: 'en',\n      accent_color: '#c2410c',",
    'pin visual player A accent',
  ],
  [
    "      display_name: 'Borin',\n      name_language: 'en',",
    "      display_name: 'Borin',\n      name_language: 'en',\n      accent_color: '#1e3a8a',",
    'pin visual player B accent',
  ],
]);

console.log('MAP-058 compatibility codemod applied.');
