import fs from 'node:fs';

function patch(path, replacements) {
  let text = fs.readFileSync(path, 'utf8');
  for (const [from, to, label] of replacements) {
    if (!text.includes(from)) throw new Error(`${path}: missing ${label}`);
    text = text.replace(from, to);
  }
  fs.writeFileSync(path, text);
}

patch('src/app/adminMapEntities.ts', [
  [
    "  type MapEntityPublicationStatus,\n  type MapEntityType,",
    "  type MapEntityLifecycleStatus,\n  type MapEntityPublicationStatus,\n  type MapEntityType,",
    'lifecycle type import',
  ],
  [
    "import { getPinDispositionVisual } from '../domain/pinVisualSystem';",
    "import { getEntityLifecycleLabel } from '../domain/entityLifecycle';\nimport { getPinDispositionVisual, getPinTypeVisual } from '../domain/pinVisualSystem';",
    'visual imports',
  ],
  [
    "  const createLocationButton = createElement('button', 'admin-map-entity__button');\n  const refreshButton",
    "  const createLocationButton = createElement('button', 'admin-map-entity__button');\n  const createMissionButton = createElement('button', 'admin-map-entity__button');\n  const createHazardButton = createElement('button', 'admin-map-entity__button');\n  const refreshButton",
    'create buttons declarations',
  ],
  [
    "  heading.textContent = 'Personajes y emplazamientos';",
    "  heading.textContent = 'Entidades del mapa';",
    'heading',
  ],
  [
    "  createLocationButton.type = 'button';\n  createLocationButton.textContent = 'Crear emplazamiento';\n  refreshButton.type = 'button';",
    "  createLocationButton.type = 'button';\n  createLocationButton.textContent = 'Crear emplazamiento';\n  createMissionButton.type = 'button';\n  createMissionButton.textContent = 'Crear misión';\n  createHazardButton.type = 'button';\n  createHazardButton.textContent = 'Crear peligro';\n  refreshButton.type = 'button';",
    'create button labels',
  ],
  [
    "  toolbar.append(searchLabel, search, createCharacterButton, createLocationButton, refreshButton);",
    "  toolbar.append(\n    searchLabel,\n    search,\n    createCharacterButton,\n    createLocationButton,\n    createMissionButton,\n    createHazardButton,\n    refreshButton,\n  );",
    'toolbar',
  ],
  [
    "      entityType: input('entityType') as MapEntityType,\n      visibility: input('visibility') as MapVisibility,",
    "      entityType: input('entityType') as MapEntityType,\n      lifecycleStatus: (input('lifecycleStatus') || null) as MapEntityLifecycleStatus | null,\n      visibility: input('visibility') as MapVisibility,",
    'read lifecycle',
  ],
  [
    "    previewMarker.textContent = polygon ? '◇' : draft.visibility === 'pin' ? '◆' : '';\n    previewMarker.hidden = draft.visibility !== 'pin';\n    previewName.textContent = draft.name.trim() || 'Sin nombre';\n    previewMeta.textContent = `${draft.entityType} · ${geometryLabel}",
    "    const typeVisual = getPinTypeVisual(draft.entityType);\n    const lifecycleLabel = getEntityLifecycleLabel(draft.entityType, draft.lifecycleStatus ?? null);\n    previewMarker.textContent = polygon ? '◇' : draft.visibility === 'pin' ? typeVisual.symbol : '';\n    previewMarker.hidden = draft.visibility !== 'pin';\n    previewName.textContent = draft.name.trim() || 'Sin nombre';\n    previewMeta.textContent = `${typeVisual.label}${lifecycleLabel ? ` · ${lifecycleLabel}` : ''} · ${geometryLabel}",
    'preview semantics',
  ],
  [
    "    editorHeading.textContent = existing ? `Editar ${draft.name}` : `Crear ${draft.entityType}`;",
    "    editorHeading.textContent = existing\n      ? `Editar ${draft.name}`\n      : `Crear ${getPinTypeVisual(draft.entityType).label.toLocaleLowerCase('es')}`;",
    'editor heading',
  ],
  [
    "        { value: 'character', label: 'Personaje' },\n        { value: 'location', label: 'Emplazamiento' },",
    "        { value: 'character', label: 'Personaje' },\n        { value: 'location', label: 'Emplazamiento' },\n        { value: 'mission', label: 'Misión' },\n        { value: 'hazard', label: 'Peligro' },",
    'type choices',
  ],
  [
    "    addField({ name: 'summary', label: 'Resumen', value: draft.summary, textarea: true });",
    "    if (draft.entityType === 'mission' || draft.entityType === 'hazard') {\n      addSelect({\n        name: 'lifecycleStatus',\n        label: 'Estado funcional',\n        value: draft.lifecycleStatus ?? 'active',\n        choices:\n          draft.entityType === 'mission'\n            ? [\n                { value: 'active', label: 'Activa' },\n                { value: 'completed', label: 'Completada' },\n                { value: 'failed', label: 'Fallida' },\n              ]\n            : [\n                { value: 'active', label: 'Activo' },\n                { value: 'resolved', label: 'Resuelto' },\n              ],\n      });\n    }\n    addField({ name: 'summary', label: 'Resumen', value: draft.summary, textarea: true });",
    'lifecycle select',
  ],
  [
    "    createLocationButton.disabled = createCharacterButton.disabled;\n    refreshButton.disabled",
    "    createLocationButton.disabled = createCharacterButton.disabled;\n    createMissionButton.disabled = createCharacterButton.disabled;\n    createHazardButton.disabled = createCharacterButton.disabled;\n    refreshButton.disabled",
    'button disabled state',
  ],
  [
    "  const handleCreateLocation = (): void => {\n    requestedEntityType = 'location';\n    restoreFocus = createLocationButton;\n    controller.openCreate();\n  };\n  const handleRefresh",
    "  const handleCreateLocation = (): void => {\n    requestedEntityType = 'location';\n    restoreFocus = createLocationButton;\n    controller.openCreate();\n  };\n  const handleCreateMission = (): void => {\n    requestedEntityType = 'mission';\n    restoreFocus = createMissionButton;\n    controller.openCreate();\n  };\n  const handleCreateHazard = (): void => {\n    requestedEntityType = 'hazard';\n    restoreFocus = createHazardButton;\n    controller.openCreate();\n  };\n  const handleRefresh",
    'create handlers',
  ],
  [
    "  createCharacterButton.addEventListener('click', handleCreateCharacter);\n  createLocationButton.addEventListener('click', handleCreateLocation);\n  refreshButton",
    "  createCharacterButton.addEventListener('click', handleCreateCharacter);\n  createLocationButton.addEventListener('click', handleCreateLocation);\n  createMissionButton.addEventListener('click', handleCreateMission);\n  createHazardButton.addEventListener('click', handleCreateHazard);\n  refreshButton",
    'create listeners',
  ],
  [
    "      createCharacterButton.removeEventListener('click', handleCreateCharacter);\n      createLocationButton.removeEventListener('click', handleCreateLocation);\n      refreshButton",
    "      createCharacterButton.removeEventListener('click', handleCreateCharacter);\n      createLocationButton.removeEventListener('click', handleCreateLocation);\n      createMissionButton.removeEventListener('click', handleCreateMission);\n      createHazardButton.removeEventListener('click', handleCreateHazard);\n      refreshButton",
    'remove listeners',
  ],
]);

patch('src/app/fullEntityDetails.ts', [
  [
    "import type { FullEntityDetailModel } from '../data/fullEntityDetails';",
    "import type { FullEntityDetailModel } from '../data/fullEntityDetails';\nimport { getEntityLifecycleLabel } from '../domain/entityLifecycle';",
    'details lifecycle import',
  ],
  [
    "  appendTextElement(elements.type, 'span', '', type.label);\n  elements.title.textContent = details.name;",
    "  appendTextElement(elements.type, 'span', '', type.label);\n  const lifecycleLabel = getEntityLifecycleLabel(details.entityType, details.lifecycleStatus);\n  if (lifecycleLabel) {\n    appendTextElement(elements.type, 'span', 'full-entity__lifecycle', ` · ${lifecycleLabel}`);\n    elements.type.setAttribute('aria-label', `${type.label}. Estado: ${lifecycleLabel}.`);\n  } else {\n    elements.type.removeAttribute('aria-label');\n  }\n  elements.title.textContent = details.name;",
    'details lifecycle render',
  ],
]);

console.log('MAP-064 admin/details patch applied');
