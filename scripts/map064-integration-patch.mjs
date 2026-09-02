import fs from 'node:fs';

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`No change produced for ${path}`);
  fs.writeFileSync(path, after);
}

function replace(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing ${label}`);
  return text.replace(from, to);
}

patch('src/domain/mapGeometry.ts', (text) =>
  replace(text, "if (entityType !== 'location') throw new Error('Characters must use point geometry.');", "if (entityType !== 'location') throw new Error('Only locations may use polygon geometry.');", 'map geometry class guard'),
);

patch('src/data-access/publicCatalogQueryContract.js', (text) =>
  replace(text, 'id,slug,entity_type,visibility,name,name_language,summary,description,portrait_path,x,y,geometry,category_id', 'id,slug,entity_type,lifecycle_status,visibility,name,name_language,summary,description,portrait_path,x,y,geometry,category_id', 'public entity projection'),
);

patch('src/infrastructure/supabase/publicCatalogRows.ts', (text) => {
  text = replace(text, "      'entity_type',\n      'visibility',", "      'entity_type',\n      'lifecycle_status',\n      'visibility',", 'public lifecycle property');
  text = replace(text, "    'character',\n    'location',\n  ] as const);", "    'character',\n    'location',\n    'mission',\n    'hazard',\n  ] as const);", 'public entity type parser');
  text = replace(text, "  const hasPortraitPath = Object.prototype.hasOwnProperty.call(row, 'portrait_path');", `  const parsedLifecycle =\n    row.lifecycle_status == null\n      ? null\n      : expectEnum(row.lifecycle_status, \`\${path}.lifecycle_status\`, [\n          'active',\n          'completed',\n          'failed',\n          'resolved',\n        ] as const);\n  if ((parsedEntityType === 'character' || parsedEntityType === 'location') && parsedLifecycle !== null) {\n    invalidResponse(\`\${path}.lifecycle_status no corresponde a esta clase funcional.\`);\n  }\n  if (parsedEntityType === 'mission' && !['active', 'completed', 'failed'].includes(parsedLifecycle ?? '')) {\n    invalidResponse(\`\${path}.lifecycle_status no es válido para una misión.\`);\n  }\n  if (parsedEntityType === 'hazard' && !['active', 'resolved'].includes(parsedLifecycle ?? '')) {\n    invalidResponse(\`\${path}.lifecycle_status no es válido para un peligro.\`);\n  }\n  const hasPortraitPath = Object.prototype.hasOwnProperty.call(row, 'portrait_path');`, 'public lifecycle parser');
  text = replace(text, '    entityType: parsedEntityType,\n    visibility:', '    entityType: parsedEntityType,\n    lifecycleStatus: parsedLifecycle,\n    visibility:', 'public lifecycle mapping');
  return text;
});

patch('src/app/adminCampaignScope.ts', (text) =>
  text.replace("'/admin_get_map_entity_editor_v6'", "'/admin_get_map_entity_editor_v7'").replace("'/admin_save_map_entity_v6'", "'/admin_save_map_entity_v7'"),
);

patch('src/infrastructure/supabase/adminMapEntityRepository.ts', (text) => {
  text = replace(text, "  type MapEntityPublicationStatus,\n  type MapEntityType,", "  type MapEntityLifecycleStatus,\n  type MapEntityPublicationStatus,\n  type MapEntityType,", 'admin lifecycle import');
  text = replace(text, "  if (value === 'character' || value === 'location') return value;", "  if (value === 'character' || value === 'location' || value === 'mission' || value === 'hazard') return value;", 'admin entity type parser');
  text = replace(text, "function visibility(value: unknown): MapVisibility {", `function lifecycleStatus(value: unknown, recordEntityType: MapEntityType): MapEntityLifecycleStatus | null {\n  if (value === null || value === undefined) {\n    if (recordEntityType === 'mission' || recordEntityType === 'hazard') {\n      throw new AdminMapEntityRepositoryError('invalid-response', 'Supabase omitió el lifecycle funcional.');\n    }\n    return null;\n  }\n  if (value !== 'active' && value !== 'completed' && value !== 'failed' && value !== 'resolved') {\n    throw new AdminMapEntityRepositoryError('invalid-response', 'Supabase devolvió un lifecycle funcional no válido.');\n  }\n  if (recordEntityType === 'mission' && !['active', 'completed', 'failed'].includes(value)) {\n    throw new AdminMapEntityRepositoryError('invalid-response', 'Supabase devolvió un lifecycle de misión no válido.');\n  }\n  if (recordEntityType === 'hazard' && !['active', 'resolved'].includes(value)) {\n    throw new AdminMapEntityRepositoryError('invalid-response', 'Supabase devolvió un lifecycle de peligro no válido.');\n  }\n  if (recordEntityType === 'character' || recordEntityType === 'location') {\n    throw new AdminMapEntityRepositoryError('invalid-response', 'Supabase mezcló lifecycle funcional con una entidad legacy.');\n  }\n  return value;\n}\n\nfunction visibility(value: unknown): MapVisibility {`, 'admin lifecycle parser');
  text = replace(text, '    entityType: recordEntityType,\n    visibility:', '    entityType: recordEntityType,\n    lifecycleStatus: lifecycleStatus(row.lifecycleStatus ?? row.lifecycle_status, recordEntityType),\n    visibility:', 'admin lifecycle mapping');
  text = replace(text, "'id,slug,entity_type,visibility,audience,portrait_path,name,summary,description,x,y,geometry,category_id,publication_status,published_at,archived_at,updated_at'", "'id,slug,entity_type,lifecycle_status,visibility,audience,portrait_path,name,summary,description,x,y,geometry,category_id,publication_status,published_at,archived_at,updated_at'", 'admin list projection');
  text = replace(text, '          p_player_association_ids: [...(draft.playerAssociationIds ?? [])],\n', '          p_player_association_ids: [...(draft.playerAssociationIds ?? [])],\n          p_lifecycle_status: draft.lifecycleStatus ?? null,\n', 'admin save lifecycle');
  return text;
});

patch('src/infrastructure/supabase/masterCatalogRepository.ts', (text) => {
  if (!text.includes('admin_get_master_catalog_v5')) throw new Error('Missing master catalog v5 endpoint');
  return text.replaceAll('admin_get_master_catalog_v5', 'admin_get_master_catalog_v6');
});

patch('src/data/pinMarkers.ts', (text) => {
  text = replace(text, '  readonly entityType: PinEntityType;\n', "  readonly entityType: PinEntityType;\n  readonly lifecycleStatus: PublicMapEntity['lifecycleStatus'];\n", 'marker lifecycle field');
  text = replace(text, '        entityType: beta02Entity?.entityType ?? \'location\',\n', "        entityType: beta02Entity?.entityType ?? 'location',\n        lifecycleStatus: beta02Entity?.lifecycleStatus ?? null,\n", 'legacy marker lifecycle');
  text = replace(text, '        entityType: entity.entityType,\n        coordinate:', '        entityType: entity.entityType,\n        lifecycleStatus: entity.lifecycleStatus ?? null,\n        coordinate:', 'supplemental marker lifecycle');
  return text;
});

patch('src/data/compactPinDetails.ts', (text) => {
  text = replace(text, '  readonly entityType: PinEntityType;\n  readonly name:', "  readonly entityType: PinEntityType;\n  readonly lifecycleStatus: PublicMapEntity['lifecycleStatus'];\n  readonly name:", 'compact lifecycle field');
  text = replace(text, '    entityType: entity.entityType,\n    name:', '    entityType: entity.entityType,\n    lifecycleStatus: entity.lifecycleStatus ?? null,\n    name:', 'compact beta lifecycle');
  text = replace(text, "    entityType: 'location',\n    name:", "    entityType: 'location',\n    lifecycleStatus: null,\n    name:", 'compact legacy lifecycle');
  return text;
});

patch('src/app/compactPinDetails.ts', (text) => {
  text = replace(text, "import { createPlayerDispositionVisuals, getPinTypeVisual } from '../domain/pinVisualSystem';", "import { createPlayerDispositionVisuals, getPinTypeVisual } from '../domain/pinVisualSystem';\nimport { getEntityLifecycleLabel } from '../domain/entityLifecycle';", 'compact lifecycle import');
  text = replace(text, '  parent.append(row);\n}\n\nfunction appendCategory', `  parent.append(row);\n  const lifecycle = getEntityLifecycleLabel(details.entityType, details.lifecycleStatus ?? null);\n  if (lifecycle) {\n    const lifecycleRow = document.createElement('p');\n    lifecycleRow.className = 'compact-details__lifecycle';\n    lifecycleRow.textContent = \`Estado: \${lifecycle}\`;\n    parent.append(lifecycleRow);\n  }\n}\n\nfunction appendCategory`, 'compact lifecycle rendering');
  text = replace(text, '    entitySlug: details.entitySlug,\n', '    entitySlug: details.entitySlug,\n    lifecycleStatus: details.lifecycleStatus,\n', 'compact lifecycle signature');
  return text;
});

patch('src/map/leafletBase.ts', (text) => {
  text = replace(text, "import { FAERUN_MAP_CONFIG, OFFICIAL_MAP_URL, createSimpleImageBounds } from './config';", "import { getEntityLifecycleLabel } from '../domain/entityLifecycle';\nimport { FAERUN_MAP_CONFIG, OFFICIAL_MAP_URL, createSimpleImageBounds } from './config';", 'leaflet lifecycle import');
  text = replace(text, '  return `<span class=\\"pin-visual ${type.className}\\"><span class=\\"pin-visual__type-symbol\\" aria-hidden=\\"true\\">${type.symbol}</span><span class=\\"pin-visual__dispositions\\" aria-hidden=\\"true\\">${createDispositionMarkup(marker)}</span></span>`;', '  const lifecycleClass = marker.lifecycleStatus ? ` pin-visual--lifecycle-${marker.lifecycleStatus}` : \'\';\n  return `<span class=\\"pin-visual ${type.className}${lifecycleClass}\\"><span class=\\"pin-visual__type-symbol\\" aria-hidden=\\"true\\">${type.symbol}</span><span class=\\"pin-visual__dispositions\\" aria-hidden=\\"true\\">${createDispositionMarkup(marker)}</span></span>`;', 'leaflet lifecycle class');
  text = replace(text, "  return `${marker.name}. ${type.label}. Relación con los personajes: ${dispositions}. Categoría: ${marker.categoryName}.`;", "  const lifecycle = getEntityLifecycleLabel(marker.entityType, marker.lifecycleStatus ?? null);\n  return `${marker.name}. ${type.label}.${lifecycle ? ` Estado: ${lifecycle}.` : ''} Relación con los personajes: ${dispositions}. Categoría: ${marker.categoryName}.`;", 'leaflet accessible lifecycle');
  text = replace(text, "  return `${type.label}. Relación con los personajes: ${describePlayerDispositions(marker.dispositions)}.`;", "  const lifecycle = getEntityLifecycleLabel(marker.entityType, marker.lifecycleStatus ?? null);\n  return `${type.label}.${lifecycle ? ` Estado: ${lifecycle}.` : ''} Relación con los personajes: ${describePlayerDispositions(marker.dispositions)}.`;", 'leaflet semantic lifecycle');
  return text;
});

patch('src/styles/pin-visual-system.css', (text) => {
  text = replace(text, '.pin-visual--location {\n  width: 1.7rem;', `.pin-visual--mission {\n  width: 2rem;\n  height: 1.65rem;\n  color: #073a35;\n  background: #87d8ca;\n  border-radius: 0.2rem 0.55rem 0.55rem 0.2rem;\n}\n\n.pin-visual--mission::before {\n  position: absolute;\n  left: -0.2rem;\n  bottom: -0.35rem;\n  width: 0.18rem;\n  height: 2.2rem;\n  content: '';\n  background: currentColor;\n}\n\n.pin-visual--hazard {\n  width: 2.1rem;\n  height: 1.9rem;\n  color: #3b0710;\n  background: #e88b98;\n  border-radius: 0;\n  clip-path: polygon(50% 0, 100% 100%, 0 100%);\n}\n\n.pin-visual--hazard .pin-visual__type-symbol {\n  padding-top: 0.45rem;\n  font-size: 0.9rem;\n}\n\n.pin-visual--lifecycle-completed,\n.pin-visual--lifecycle-resolved {\n  opacity: 0.74;\n}\n\n.pin-visual--lifecycle-completed::after,\n.pin-visual--lifecycle-resolved::after {\n  position: absolute;\n  inset: 0.22rem;\n  content: '';\n  border: 2px solid currentColor;\n  border-radius: inherit;\n}\n\n.pin-visual--lifecycle-failed {\n  text-decoration: line-through;\n}\n\n.pin-visual--location {\n  width: 1.7rem;`, 'mission hazard css');
  text = replace(text, '.pin-coincident-list__mini--location {', `.pin-coincident-list__mini--mission {\n  border-radius: 0.2rem 0.5rem 0.5rem 0.2rem;\n}\n\n.pin-coincident-list__mini--hazard {\n  clip-path: polygon(50% 0, 100% 100%, 0 100%);\n}\n\n.pin-coincident-list__mini--location {`, 'coincident mission hazard css');
  text = replace(text, '.pin-legend__shape--location {', `.pin-legend__shape--mission {\n  border-radius: 0.15rem 0.45rem 0.45rem 0.15rem;\n}\n\n.pin-legend__shape--hazard {\n  clip-path: polygon(50% 0, 100% 100%, 0 100%);\n}\n\n.pin-legend__shape--location {`, 'legend mission hazard css');
  return text;
});

console.log('MAP-064 integration patch applied');
