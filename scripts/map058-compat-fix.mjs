import { readFile, writeFile } from 'node:fs/promises';

async function edit(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after !== before) await writeFile(path, after);
}

function replaceOnce(text, before, after, label) {
  if (text.includes(after)) return text;
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one target, found ${count}`);
  return text.replace(before, after);
}

await edit('src/data/pinMarkers.ts', (text) =>
  replaceOnce(
    text,
    '  return catalog.associations\n    .filter((association) => association.entityId === entityId)',
    '  return (catalog.associations ?? [])\n    .filter((association) => association.entityId === entityId)',
    'pin marker association fallback',
  ),
);

await edit('src/data/publicEntityPresentation.ts', (text) =>
  replaceOnce(
    text,
    '  const associatedPlayers = catalog.associations\n    .filter(({ entityId }) => entityId === entity.id)',
    '  const associatedPlayers = (catalog.associations ?? [])\n    .filter(({ entityId }) => entityId === entity.id)',
    'public entity association fallback',
  ),
);

await edit('src/domain/adminMapEntities.ts', (text) => {
  text = replaceOnce(
    text,
    '  readonly associations: readonly AdminEntityAssociation[];',
    '  /** Missing only in legacy fixtures/responses that predate MAP-058. */\n  readonly associations?: readonly AdminEntityAssociation[];',
    'optional legacy admin associations',
  );
  return replaceOnce(
    text,
    '    playerAssociationIds: detail.associations\n      .filter(({ publicationStatus }) => publicationStatus !== \'archived\')',
    '    playerAssociationIds: (detail.associations ?? [])\n      .filter(({ publicationStatus }) => publicationStatus !== \'archived\')',
    'admin draft association fallback',
  );
});

await edit('src/infrastructure/supabase/adminMapEntityRepository.ts', (text) => {
  text = replaceOnce(
    text,
    "    playerAssociations: numberValue(value, 'player_associations'),",
    "    playerAssociations:\n      value.player_associations === undefined ? 0 : numberValue(value, 'player_associations'),",
    'legacy delete blocker fallback',
  );
  text = replaceOnce(
    text,
    `  if (\n    !Array.isArray(payload.tag_links) ||\n    !Array.isArray(payload.dispositions) ||\n    !Array.isArray(payload.associations)\n  ) {`,
    `  const associations = payload.associations ?? [];\n  if (\n    !Array.isArray(payload.tag_links) ||\n    !Array.isArray(payload.dispositions) ||\n    !Array.isArray(associations)\n  ) {`,
    'legacy admin relation decoder',
  );
  return replaceOnce(
    text,
    '    associations: payload.associations.map(mapAssociation),',
    '    associations: associations.map(mapAssociation),',
    'admin relation mapping',
  );
});

await edit('src/infrastructure/snapshot/multicampaignSnapshotCodec.ts', (text) => {
  text = replaceOnce(
    text,
    "const CHECKSUM_PATTERN = /^sha256:[0-9a-f]{64}$/;",
    "const CHECKSUM_PATTERN = /^sha256:[0-9a-f]{64}$/;\nconst HISTORIC_PLAYER_ACCENT = '#475569';",
    'historic accent constant',
  );

  text = replaceOnce(
    text,
    `function parseCampaignCatalog(value: unknown, index: number): PublicCampaignCatalogV3 {`,
    `function normalizeSnapshotPlayer(\n  value: unknown,\n  index: number,\n  catalogPath: string,\n): PublicCampaignCatalogV3['players'][number] {\n  const path = \`${'${catalogPath}'}.players[${'${index}'}]\`;\n  const item = record(value, path);\n  assertAllowed(item, ['id', 'slug', 'displayName', 'nameLanguage', 'accentColor'], path);\n  return {\n    ...item,\n    accentColor: item.accentColor === undefined ? HISTORIC_PLAYER_ACCENT : item.accentColor,\n  } as unknown as PublicCampaignCatalogV3['players'][number];\n}\n\nfunction parseCampaignCatalog(value: unknown, index: number): PublicCampaignCatalogV3 {`,
    'snapshot player normalizer',
  );

  text = replaceOnce(
    text,
    `    players: array(item.players, \`${'${path}'}.players\`) as PublicCampaignCatalogV3['players'],`,
    `    players: array(item.players, \`${'${path}'}.players\`).map((player, playerIndex) =>\n      normalizeSnapshotPlayer(player, playerIndex, path),\n    ),`,
    'snapshot player projection',
  );

  text = replaceOnce(
    text,
    `    associations: array(\n      item.associations,\n      \`${'${path}'}.associations\`,\n    ) as PublicCampaignCatalogV3['associations'],`,
    `    associations:\n      item.associations === undefined\n        ? []\n        : (array(\n            item.associations,\n            \`${'${path}'}.associations\`,\n          ) as PublicCampaignCatalogV3['associations']),`,
    'historic associations fallback',
  );

  const oldParse = `  const campaigns = array(snapshotRecord.campaigns, 'snapshot.campaigns').map(parseCampaign);\n  const campaignCatalogs = array(snapshotRecord.campaignCatalogs, 'snapshot.campaignCatalogs').map(\n    parseCampaignCatalog,\n  );\n  const geographicNames = array(snapshotRecord.geographicNames, 'snapshot.geographicNames').map(\n    (name, index) =>\n      record(name, \`snapshot.geographicNames[${'${index}'}]\`) as unknown as PublicGlobalGeographicNameV3,\n  );`;
  const newParse = `  const rawCampaigns = array(snapshotRecord.campaigns, 'snapshot.campaigns');\n  const rawCampaignCatalogs = array(snapshotRecord.campaignCatalogs, 'snapshot.campaignCatalogs');\n  const rawGeographicNames = array(snapshotRecord.geographicNames, 'snapshot.geographicNames');\n  const rawContent = {\n    schemaVersion: 3 as const,\n    campaigns: rawCampaigns,\n    campaignCatalogs: rawCampaignCatalogs,\n    geographicNames: rawGeographicNames,\n  };\n  const calculatedChecksum = await createSha256Checksum(rawContent);\n  if (calculatedChecksum !== checksum || sourceRevision !== calculatedChecksum) {\n    throw new PublicDataRepositoryError(\n      'checksum-mismatch',\n      'El snapshot multicampaña no coincide con su checksum/sourceRevision.',\n      { source: 'snapshot' },\n    );\n  }\n\n  const campaigns = rawCampaigns.map(parseCampaign);\n  const campaignCatalogs = rawCampaignCatalogs.map(parseCampaignCatalog);\n  const geographicNames = rawGeographicNames.map(\n    (name, index) =>\n      record(name, \`snapshot.geographicNames[${'${index}'}]\`) as unknown as PublicGlobalGeographicNameV3,\n  );`;
  text = replaceOnce(text, oldParse, newParse, 'raw v3 checksum before normalization');

  text = replaceOnce(
    text,
    `  const content = { schemaVersion: 3 as const, campaigns, campaignCatalogs, geographicNames };\n  const calculatedChecksum = await createSha256Checksum(content);\n  if (calculatedChecksum !== checksum || sourceRevision !== calculatedChecksum) {\n    throw new PublicDataRepositoryError(\n      'checksum-mismatch',\n      'El snapshot multicampaña no coincide con su checksum/sourceRevision.',\n      { source: 'snapshot' },\n    );\n  }`,
    `  const content = { schemaVersion: 3 as const, campaigns, campaignCatalogs, geographicNames };`,
    'remove normalized checksum comparison',
  );
  return text;
});

await edit('supabase/migrations/20260829150000_add_entity_player_associations.sql', (text) => {
  text = replaceOnce(
    text,
    `using (public.current_user_is_admin())\nwith check (public.current_user_is_admin());`,
    `using ((select private.is_admin()))\nwith check ((select private.is_admin()));`,
    'association admin policy allowlist',
  );
  return replaceOnce(
    text,
    `    perform 1\n    from public.entity_player_associations as association\n    where association.entity_id = p_id\n      and association.campaign_id = p_campaign_id\n    for update;`,
    `    -- Serialize relation saves on the parent entity. Locking the association table\n    -- would require an unnecessary UPDATE grant on a relation that is insert/delete only.\n    perform 1\n    from public.map_entities as entity\n    where entity.id = p_id\n      and entity.campaign_id = p_campaign_id\n    for update;`,
    'association concurrency lock',
  );
});

await edit('supabase/tests/database/030_entity_player_associations.test.sql', (text) => {
  text = replaceOnce(
    text,
    "update public.players set publication_status = 'published' where id = 'player-map058-a';",
    "update public.players set publication_status = 'draft' where id = 'player-map058-a';\nupdate public.players set publication_status = 'published' where id = 'player-map058-a';",
    'player lifecycle recovery',
  );
  return replaceOnce(
    text,
    "update public.map_entities set publication_status = 'published' where id = 'entity-map058-public-a';",
    "update public.map_entities set publication_status = 'draft' where id = 'entity-map058-public-a';\nupdate public.map_entities set publication_status = 'published' where id = 'entity-map058-public-a';",
    'entity lifecycle recovery',
  );
});

await edit('src/app/adminCampaignScope.test.ts', (text) =>
  text
    .replace("/rpc/admin_get_map_entity_editor_v4')).toBe(true)", "/rpc/admin_get_map_entity_editor_v5')).toBe(true)")
    .replace("/rpc/admin_save_map_entity_v4')).toBe(true)", "/rpc/admin_save_map_entity_v5')).toBe(true)"),
);

await edit('src/infrastructure/supabase/masterCatalogRepository.test.ts', (text) => {
  text = replaceOnce(
    text,
    "  players: [{ id: 'player-master-test', display_name: 'Private player' }],",
    "  players: [\n    { id: 'player-master-test', display_name: 'Private player', accent_color: '#475569' },\n  ],\n  associations: [],",
    'master fixture v4 player metadata',
  );
  text = text.replaceAll('campaign-scoped v3 RPC', 'campaign-scoped v4 RPC');
  text = text.replaceAll('/rest/v1/rpc/admin_get_master_catalog_v3', '/rest/v1/rpc/admin_get_master_catalog_v4');
  return text;
});

await edit('src/infrastructure/supabase/publicCatalogCodec.test.ts', (text) => {
  text = replaceOnce(
    text,
    `        display_name: 'Player One',\n        name_language: 'en',`,
    `        display_name: 'Player One',\n        name_language: 'en',\n        accent_color: '#475569',`,
    'v2 codec live player accent fixture',
  );
  return replaceOnce(
    text,
    `    dispositions: [\n      {\n        entity_id: 'entity-hero',\n        player_id: 'player-one',\n        disposition: 'ally',\n      },\n    ],\n    characterLocationRelations:`,
    `    dispositions: [\n      {\n        entity_id: 'entity-hero',\n        player_id: 'player-one',\n        disposition: 'ally',\n      },\n    ],\n    associations: [],\n    characterLocationRelations:`,
    'v2 codec association fixture',
  );
});

await edit('src/infrastructure/supabase/publicCatalogRepository.test.ts', (text) => {
  text = replaceOnce(text, '    expect(requests).toHaveLength(15);', '    expect(requests).toHaveLength(16);', 'single campaign request count');
  text = replaceOnce(text, "      'entity_player_dispositions',\n      'character_location_relations',", "      'entity_player_dispositions',\n      'entity_player_associations',\n      'character_location_relations',", 'association RLS-only query');
  text = replaceOnce(text, '    expect(urls).toHaveLength(29);', '    expect(urls).toHaveLength(31);', 'two campaign request count');
  text = replaceOnce(
    text,
    `      display_name: \`Player ${'${index + 1}'}\`,\n      name_language: 'en',`,
    `      display_name: \`Player ${'${index + 1}'}\`,\n      name_language: 'en',\n      accent_color: '#475569',`,
    'pagination player accents',
  );
  text = replaceOnce(text, '    expect(pendingRequests).toBe(13);', '    expect(pendingRequests).toBe(14);', 'pending request count');
  text = replaceOnce(text, '    expect(abortedRequests).toBe(13);', '    expect(abortedRequests).toBe(14);', 'aborted request count');
  return text;
});
