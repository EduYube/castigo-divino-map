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

patch('src/map/leafletBase.ts', (text) => {
  text = replace(
    text,
    "import { FAERUN_MAP_CONFIG, OFFICIAL_MAP_URL, createSimpleImageBounds } from './config';",
    "import { getEntityLifecycleLabel } from '../domain/entityLifecycle';\nimport { FAERUN_MAP_CONFIG, OFFICIAL_MAP_URL, createSimpleImageBounds } from './config';",
    'leaflet lifecycle import',
  );
  text = replace(
    text,
    '  return `<span class="pin-visual ${type.className}"><span class="pin-visual__type-symbol" aria-hidden="true">${type.symbol}</span><span class="pin-visual__dispositions" aria-hidden="true">${createDispositionMarkup(marker)}</span></span>`;',
    "  const lifecycleClass = marker.lifecycleStatus ? ` pin-visual--lifecycle-${marker.lifecycleStatus}` : '';\n  return `<span class=\"pin-visual ${type.className}${lifecycleClass}\"><span class=\"pin-visual__type-symbol\" aria-hidden=\"true\">${type.symbol}</span><span class=\"pin-visual__dispositions\" aria-hidden=\"true\">${createDispositionMarkup(marker)}</span></span>`;",
    'leaflet lifecycle class',
  );
  text = replace(
    text,
    '  return `${marker.name}. ${type.label}. Relación con los personajes: ${dispositions}. Categoría: ${marker.categoryName}.`;',
    "  const lifecycle = getEntityLifecycleLabel(marker.entityType, marker.lifecycleStatus ?? null);\n  return `${marker.name}. ${type.label}.${lifecycle ? ` Estado: ${lifecycle}.` : ''} Relación con los personajes: ${dispositions}. Categoría: ${marker.categoryName}.`;",
    'leaflet accessible lifecycle',
  );
  text = replace(
    text,
    '  return `${type.label}. Relación con los personajes: ${describePlayerDispositions(marker.dispositions)}.`;',
    "  const lifecycle = getEntityLifecycleLabel(marker.entityType, marker.lifecycleStatus ?? null);\n  return `${type.label}.${lifecycle ? ` Estado: ${lifecycle}.` : ''} Relación con los personajes: ${describePlayerDispositions(marker.dispositions)}.`;",
    'leaflet semantic lifecycle',
  );
  return text;
});

patch('src/styles/pin-visual-system.css', (text) => {
  text = replace(
    text,
    '.pin-visual--location {\n  width: 1.7rem;',
    `.pin-visual--mission {\n  width: 2rem;\n  height: 1.65rem;\n  color: #073a35;\n  background: #87d8ca;\n  border-radius: 0.2rem 0.55rem 0.55rem 0.2rem;\n}\n\n.pin-visual--mission::before {\n  position: absolute;\n  left: -0.2rem;\n  bottom: -0.35rem;\n  width: 0.18rem;\n  height: 2.2rem;\n  content: '';\n  background: currentColor;\n}\n\n.pin-visual--hazard {\n  width: 2.1rem;\n  height: 1.9rem;\n  color: #3b0710;\n  background: #e88b98;\n  border-radius: 0;\n  clip-path: polygon(50% 0, 100% 100%, 0 100%);\n}\n\n.pin-visual--hazard .pin-visual__type-symbol {\n  padding-top: 0.45rem;\n  font-size: 0.9rem;\n}\n\n.pin-visual--lifecycle-completed,\n.pin-visual--lifecycle-resolved {\n  opacity: 0.74;\n}\n\n.pin-visual--lifecycle-completed::after,\n.pin-visual--lifecycle-resolved::after {\n  position: absolute;\n  inset: 0.22rem;\n  content: '';\n  border: 2px solid currentColor;\n  border-radius: inherit;\n}\n\n.pin-visual--lifecycle-failed {\n  text-decoration: line-through;\n}\n\n.pin-visual--location {\n  width: 1.7rem;`,
    'mission hazard css',
  );
  text = replace(
    text,
    '.pin-coincident-list__mini--location {',
    `.pin-coincident-list__mini--mission {\n  border-radius: 0.2rem 0.5rem 0.5rem 0.2rem;\n}\n\n.pin-coincident-list__mini--hazard {\n  clip-path: polygon(50% 0, 100% 100%, 0 100%);\n}\n\n.pin-coincident-list__mini--location {`,
    'coincident mission hazard css',
  );
  text = replace(
    text,
    '.pin-legend__shape--location {',
    `.pin-legend__shape--mission {\n  border-radius: 0.15rem 0.45rem 0.45rem 0.15rem;\n}\n\n.pin-legend__shape--hazard {\n  clip-path: polygon(50% 0, 100% 100%, 0 100%);\n}\n\n.pin-legend__shape--location {`,
    'legend mission hazard css',
  );
  return text;
});

console.log('MAP-064 integration tail applied');
