import fs from 'node:fs';

function patch(path, replacements) {
  let text = fs.readFileSync(path, 'utf8');
  for (const [from, to, label] of replacements) {
    if (!text.includes(from)) throw new Error(`${path}: missing ${label}`);
    text = text.replaceAll(from, to);
  }
  fs.writeFileSync(path, text);
}

patch('src/infrastructure/supabase/publicCatalogCodec.ts', [
  ["        'entityType',\n        'visibility',", "        'entityType',\n        'lifecycleStatus',\n        'visibility',", 'snapshot lifecycle property'],
  ["      entity_type: entity.entityType,\n      visibility: entity.visibility,", "      entity_type: entity.entityType,\n      lifecycle_status: entity.lifecycleStatus ?? null,\n      visibility: entity.visibility,", 'snapshot lifecycle row'],
]);

patch('src/app/adminCampaignScope.test.ts', [
  ['/rpc/admin_get_map_entity_editor_v6', '/rpc/admin_get_map_entity_editor_v7', 'editor v7 expectation'],
  ['/rpc/admin_save_map_entity_v6', '/rpc/admin_save_map_entity_v7', 'save v7 expectation'],
  ['rewrites save through the geometry-aware RPC', 'rewrites save through the lifecycle-aware geometry RPC', 'save test title'],
]);

patch('src/infrastructure/supabase/masterCatalogRepository.test.ts', [
  ['admin_get_master_catalog_v5', 'admin_get_master_catalog_v6', 'master lifecycle RPC expectations'],
  ['geometry-aware v5 RPC', 'lifecycle-aware v6 RPC', 'master test title'],
]);

patch('src/app/adminMapEntities.ts', [
  [
    "  type MapEntityLifecycleStatus,\n  type MapEntityPublicationStatus,",
    "  type MapEntityAudience,\n  type MapEntityLifecycleStatus,\n  type MapEntityPublicationStatus,",
    'audience type import',
  ],
  [
    "  let tagCheckboxes: HTMLInputElement[] = [];\n  let dispositionSelects: HTMLSelectElement[] = [];",
    "  let tagCheckboxes: HTMLInputElement[] = [];\n  let associationCheckboxes: HTMLInputElement[] = [];\n  let dispositionSelects: HTMLSelectElement[] = [];",
    'association checkbox state',
  ],
  [
    "  let tagError: HTMLParagraphElement | null = null;\n  let dispositionError: HTMLParagraphElement | null = null;",
    "  let tagError: HTMLParagraphElement | null = null;\n  let associationError: HTMLParagraphElement | null = null;\n  let dispositionError: HTMLParagraphElement | null = null;",
    'association error state',
  ],
  [
    "      lifecycleStatus: (input('lifecycleStatus') || null) as MapEntityLifecycleStatus | null,\n      visibility: input('visibility') as MapVisibility,",
    "      lifecycleStatus: (input('lifecycleStatus') || null) as MapEntityLifecycleStatus | null,\n      visibility: input('visibility') as MapVisibility,\n      audience: input('audience') as MapEntityAudience,",
    'read audience',
  ],
  [
    "      dispositions: [\n        ...dispositionSelects.map((select) => ({",
    "      playerAssociationIds: associationCheckboxes\n        .filter((checkbox) => checkbox.checked)\n        .map((checkbox) => checkbox.value),\n      dispositions: [\n        ...dispositionSelects.map((select) => ({",
    'read associations',
  ],
  [
    "    if (tagError) tagError.textContent = validation.fieldErrors.tagIds ?? '';\n    if (dispositionError) {",
    "    if (tagError) tagError.textContent = validation.fieldErrors.tagIds ?? '';\n    if (associationError) {\n      const message = validation.fieldErrors.playerAssociationIds ?? '';\n      associationError.textContent = message;\n      associationCheckboxes.forEach((checkbox) =>\n        checkbox.setAttribute('aria-invalid', message ? 'true' : 'false'),\n      );\n    }\n    if (dispositionError) {",
    'association validation errors',
  ],
  [
    "    tagCheckboxes = [];\n    dispositionSelects = [];\n    preservedDispositions = [];\n    tagError = null;\n    dispositionError = null;",
    "    tagCheckboxes = [];\n    associationCheckboxes = [];\n    dispositionSelects = [];\n    preservedDispositions = [];\n    tagError = null;\n    associationError = null;\n    dispositionError = null;",
    'reset association controls',
  ],
  [
    "    addSelect({\n      name: 'visibility',\n      label: 'Visibilidad cartográfica',\n      value: draft.visibility,\n      choices: [\n        { value: 'pin', label: 'Visible en el mapa' },\n        { value: 'search_only', label: 'Solo búsqueda' },\n      ],\n    });",
    "    addSelect({\n      name: 'visibility',\n      label: 'Visibilidad cartográfica',\n      value: draft.visibility,\n      choices: [\n        { value: 'pin', label: 'Visible en el mapa' },\n        { value: 'search_only', label: 'Solo búsqueda' },\n      ],\n    });\n    addSelect({\n      name: 'audience',\n      label: 'Audiencia',\n      value: draft.audience ?? 'public',\n      choices: [\n        { value: 'public', label: 'Público' },\n        { value: 'master', label: 'Solo Máster' },\n      ],\n    });",
    'audience field',
  ],
  [
    "    tagFieldset.append(tagError);\n    fields.append(tagFieldset);\n\n    const dispositionFieldset",
    "    tagFieldset.append(tagError);\n    fields.append(tagFieldset);\n\n    const associationFieldset = createElement('fieldset', 'admin-map-entity__fieldset');\n    const associationLegend = createElement('legend', 'admin-map-entity__legend');\n    const associationHelp = createElement('p', 'admin-map-entity__help');\n    associationLegend.textContent = 'Asociaciones de jugadores';\n    associationHelp.textContent =\n      'Asocia narrativamente la entidad con uno o varios personajes jugadores. La forma funcional de misión o peligro siempre se conserva.';\n    associationFieldset.append(associationLegend, associationHelp);\n    for (const player of activePlayers) {\n      const row = createElement('label', 'admin-map-entity__check');\n      const checkbox = document.createElement('input');\n      const text = document.createElement('span');\n      checkbox.type = 'checkbox';\n      checkbox.value = player.id;\n      checkbox.checked = (draft.playerAssociationIds ?? []).includes(player.id);\n      checkbox.setAttribute('data-testid', `admin-player-association-${player.id}`);\n      text.textContent = player.displayName;\n      row.append(checkbox, text);\n      associationFieldset.append(row);\n      associationCheckboxes.push(checkbox);\n    }\n    associationError = createElement('p', 'admin-map-entity__field-error');\n    associationError.setAttribute('aria-live', 'polite');\n    associationFieldset.append(associationError);\n    fields.append(associationFieldset);\n\n    const dispositionFieldset",
    'association fieldset',
  ],
  [
    "      ...tagCheckboxes,\n      ...dispositionSelects,",
    "      ...tagCheckboxes,\n      ...associationCheckboxes,\n      ...dispositionSelects,",
    'association inputs validation',
  ],
]);

console.log('MAP-064 compatibility contract patch applied');
