import type { MapEntityType, PlayerDisposition } from '../domain/adminMapEntities';
import {
  createPlayerDispositionVisuals,
  describePlayerDispositions,
  getPinTypeVisual,
  type PinPlayerDispositionInput,
} from '../domain/pinVisualSystem';

export interface AdminPinVisualSyncController {
  destroy(): void;
}

function readEntityType(root: ParentNode): MapEntityType {
  const value = root.querySelector<HTMLSelectElement>('[name="entityType"]')?.value;
  return value === 'character' ? 'character' : 'location';
}

function readDispositions(root: ParentNode): readonly PinPlayerDispositionInput[] {
  return Array.from(root.querySelectorAll<HTMLSelectElement>('select[data-player-id]')).map(
    (select) => {
      const label = select.id
        ? root.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(select.id)}"]`)
        : null;
      const playerId = select.dataset.playerId ?? 'unknown';
      const playerName = label?.textContent?.split(' · ')[0]?.trim() || playerId;
      const value = select.value;
      const disposition: PlayerDisposition | null =
        value === 'ally' || value === 'enemy' || value === 'neutral' ? value : null;

      return { playerId, playerName, disposition };
    },
  );
}

function populatePinVisual(
  visual: HTMLElement,
  entityType: MapEntityType,
  dispositions: readonly PinPlayerDispositionInput[],
): void {
  const type = getPinTypeVisual(entityType);
  const signature = `${entityType}:${dispositions
    .map(({ playerId, disposition }) => `${playerId}=${disposition ?? 'unknown'}`)
    .join(',')}`;

  if (visual.dataset.pinVisualSignature === signature) return;
  visual.dataset.pinVisualSignature = signature;
  visual.className = `pin-visual ${type.className}`;

  const typeSymbol = document.createElement('span');
  typeSymbol.className = 'pin-visual__type-symbol';
  typeSymbol.setAttribute('aria-hidden', 'true');
  typeSymbol.textContent = type.symbol;

  const dispositionRow = document.createElement('span');
  dispositionRow.className = 'pin-visual__dispositions';
  dispositionRow.setAttribute('aria-hidden', 'true');
  for (const disposition of createPlayerDispositionVisuals(dispositions)) {
    const token = document.createElement('span');
    token.className = `pin-disposition ${disposition.className}`;
    token.textContent = disposition.symbol;
    dispositionRow.append(token);
  }

  visual.replaceChildren(typeSymbol, dispositionRow);
}

function synchronize(root: ParentNode): void {
  const section = root.querySelector<HTMLElement>('.admin-map-entity');
  if (!section) return;
  const form = section.querySelector<HTMLFormElement>('.admin-map-entity__form');
  if (!form) return;

  const entityType = readEntityType(form);
  const dispositions = readDispositions(form);
  const type = getPinTypeVisual(entityType);
  const dispositionDescription = describePlayerDispositions(dispositions);

  const coordinateMarker = section.querySelector<HTMLElement>('[data-testid="admin-coordinate-marker"]');
  const coordinateVisual = coordinateMarker?.querySelector<HTMLElement>('.pin-visual');
  if (coordinateMarker && coordinateVisual) {
    populatePinVisual(coordinateVisual, entityType, dispositions);
    coordinateMarker.dataset.entityType = entityType;
    coordinateMarker.setAttribute(
      'aria-label',
      `Coordenada seleccionada. ${type.label}. Disposición por jugador: ${dispositionDescription}. Puedes arrastrarla con un puntero o editar X e Y en el formulario.`,
    );
  }

  const preview = section.querySelector<HTMLElement>('.admin-map-entity__preview');
  const previewMarker = section.querySelector<HTMLElement>('.admin-map-entity__preview-marker');
  const visibility = form.querySelector<HTMLSelectElement>('[name="visibility"]')?.value;
  if (preview && previewMarker && !preview.hidden && visibility === 'pin') {
    let visual = previewMarker.querySelector<HTMLElement>('.pin-visual');
    if (!visual) {
      visual = document.createElement('span');
      previewMarker.replaceChildren(visual);
    }
    previewMarker.hidden = false;
    previewMarker.setAttribute('data-testid', 'admin-pin-preview');
    previewMarker.dataset.entityType = entityType;
    previewMarker.title = `${type.label}. Disposición por jugador: ${dispositionDescription}.`;
    populatePinVisual(visual, entityType, dispositions);
  }
}

export function mountAdminPinVisualSync(root: ParentNode): AdminPinVisualSyncController {
  let scheduled = false;
  const scheduleSync = (): void => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      synchronize(root);
    });
  };
  const observer = new MutationObserver(scheduleSync);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  root.addEventListener('input', scheduleSync);
  root.addEventListener('change', scheduleSync);
  scheduleSync();

  return {
    destroy(): void {
      observer.disconnect();
      root.removeEventListener('input', scheduleSync);
      root.removeEventListener('change', scheduleSync);
    },
  };
}
