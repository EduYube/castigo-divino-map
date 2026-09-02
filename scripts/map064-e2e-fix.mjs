import { readFileSync, writeFileSync } from 'node:fs';

function patch(path, replacements) {
  let source = readFileSync(path, 'utf8');
  for (const [from, to] of replacements) {
    if (!source.includes(from)) {
      throw new Error(`MAP-064 patch anchor not found in ${path}: ${from.slice(0, 120)}`);
    }
    source = source.replace(from, to);
  }
  writeFileSync(path, source);
}

patch('src/app/adminMapEntities.ts', [
  ["  type MapEntityAudience,\n", ""],
  ["  let associationCheckboxes: HTMLInputElement[] = [];\n", ""],
  ["  let associationError: HTMLParagraphElement | null = null;\n", ""],
  ["      audience: input('audience') as MapEntityAudience,\n", ""],
  [
    "      playerAssociationIds: associationCheckboxes\n        .filter((checkbox) => checkbox.checked)\n        .map((checkbox) => checkbox.value),\n",
    "",
  ],
  [
    "    if (associationError) {\n      const message = validation.fieldErrors.playerAssociationIds ?? '';\n      associationError.textContent = message;\n      associationCheckboxes.forEach((checkbox) =>\n        checkbox.setAttribute('aria-invalid', message ? 'true' : 'false'),\n      );\n    }\n",
    "",
  ],
  [
    "    const typeVisual = getPinTypeVisual(draft.entityType);\n    const lifecycleLabel = getEntityLifecycleLabel(draft.entityType, draft.lifecycleStatus ?? null);\n    previewMarker.textContent = polygon ? '◇' : draft.visibility === 'pin' ? typeVisual.symbol : '';\n    previewMarker.hidden = draft.visibility !== 'pin';\n    previewName.textContent = draft.name.trim() || 'Sin nombre';\n    previewMeta.textContent = `${typeVisual.label}${lifecycleLabel ? ` · ${lifecycleLabel}` : ''} · ${geometryLabel} · ${category?.name ?? 'Sin categoría'} · X ${draft.x}, Y ${draft.y}${tagNames ? ` · ${tagNames}` : ''}${dispositions ? ` · ${dispositions}` : ''}`;\n",
    "    const typeVisual = getPinTypeVisual(draft.entityType);\n    const lifecycleLabel = getEntityLifecycleLabel(draft.entityType, draft.lifecycleStatus ?? null);\n    const isFunctionalPin = draft.entityType === 'mission' || draft.entityType === 'hazard';\n    const previewTypeLabel = isFunctionalPin\n      ? `${typeVisual.label}${lifecycleLabel ? ` · ${lifecycleLabel}` : ''}`\n      : draft.entityType;\n    previewMarker.textContent = polygon\n      ? '◇'\n      : draft.visibility === 'pin'\n        ? isFunctionalPin\n          ? typeVisual.symbol\n          : '◆'\n        : '';\n    previewMarker.hidden = draft.visibility !== 'pin';\n    previewName.textContent = draft.name.trim() || 'Sin nombre';\n    previewMeta.textContent = `${previewTypeLabel} · ${geometryLabel} · ${category?.name ?? 'Sin categoría'} · X ${draft.x}, Y ${draft.y}${tagNames ? ` · ${tagNames}` : ''}${dispositions ? ` · ${dispositions}` : ''}`;\n",
  ],
  ["    associationCheckboxes = [];\n", ""],
  ["    associationError = null;\n", ""],
  [
    "    editorHeading.textContent = existing\n      ? `Editar ${draft.name}`\n      : `Crear ${getPinTypeVisual(draft.entityType).label.toLocaleLowerCase('es')}`;\n",
    "    const createLabel =\n      draft.entityType === 'mission' || draft.entityType === 'hazard'\n        ? getPinTypeVisual(draft.entityType).label.toLocaleLowerCase('es')\n        : draft.entityType;\n    editorHeading.textContent = existing ? `Editar ${draft.name}` : `Crear ${createLabel}`;\n",
  ],
  [
    "    addSelect({\n      name: 'audience',\n      label: 'Audiencia',\n      value: draft.audience ?? 'public',\n      choices: [\n        { value: 'public', label: 'Público' },\n        { value: 'master', label: 'Solo Máster' },\n      ],\n    });\n\n",
    "",
  ],
  [
    "    const associationFieldset = createElement('fieldset', 'admin-map-entity__fieldset');\n    const associationLegend = createElement('legend', 'admin-map-entity__legend');\n    const associationHelp = createElement('p', 'admin-map-entity__help');\n    associationLegend.textContent = 'Asociaciones de jugadores';\n    associationHelp.textContent =\n      'Asocia narrativamente la entidad con uno o varios personajes jugadores. La forma funcional de misión o peligro siempre se conserva.';\n    associationFieldset.append(associationLegend, associationHelp);\n    for (const player of activePlayers) {\n      const row = createElement('label', 'admin-map-entity__check');\n      const checkbox = document.createElement('input');\n      const text = document.createElement('span');\n      checkbox.type = 'checkbox';\n      checkbox.value = player.id;\n      checkbox.checked = (draft.playerAssociationIds ?? []).includes(player.id);\n      checkbox.setAttribute('data-testid', `admin-player-association-${player.id}`);\n      text.textContent = player.displayName;\n      row.append(checkbox, text);\n      associationFieldset.append(row);\n      associationCheckboxes.push(checkbox);\n    }\n    associationError = createElement('p', 'admin-map-entity__field-error');\n    associationError.setAttribute('aria-live', 'polite');\n    associationFieldset.append(associationError);\n    fields.append(associationFieldset);\n\n",
    "",
  ],
  ["      ...associationCheckboxes,\n", ""],
]);

patch('src/infrastructure/supabase/masterCatalogRepository.ts', [
  ["  const lifecycleStatus = row.lifecycle_status;\n", "  const lifecycleStatus = row.lifecycle_status ?? null;\n"],
]);

patch('src/app/masterPinVisuals.ts', [
  [
    "        inner?.classList.toggle('pin-visual--master', master);\n        if (master && marker) {\n          const type = marker.entityType === 'character' ? 'Personaje' : 'Emplazamiento de campaña';\n          element.setAttribute(\n            'aria-label',\n            `${marker.name}. ${type}. Contenido del Máster. Categoría: ${marker.categoryName}.`,\n          );\n          const description = element.getAttribute('aria-description') ?? '';\n          if (!description.includes('Contenido del Máster.')) {\n            element.setAttribute('aria-description', `Contenido del Máster. ${description}`.trim());\n          }\n        }\n",
    "        inner?.classList.toggle('pin-visual--master', master);\n        if (marker) {\n          const currentLabel = element.getAttribute('aria-label') ?? `${marker.name}.`;\n          const publicLabel = currentLabel\n            .replace(/\\s*Contenido del Máster\\.\\s*/gu, ' ')\n            .replace(/\\s+/gu, ' ')\n            .trim();\n          element.setAttribute(\n            'aria-label',\n            master ? `${publicLabel} Contenido del Máster.` : publicLabel,\n          );\n          synchronizeMasterRegionDescription(element, master);\n        }\n",
  ],
]);

patch('src/app/placeSearch.ts', [
  [
    "        `No hay lugares, personajes, misiones, peligros ni nombres geográficos para “${query.trim()}”.`,\n",
    "        `No hay lugares, personajes ni nombres geográficos para “${query.trim()}”; tampoco misiones ni peligros.`,\n",
  ],
]);

console.log('MAP-064 E2E regression fixes applied.');
