import type { AtlasPinMarkerModel } from '../data/pinMarkers';
import type { EntityId } from '../data/beta02-model';

export interface MasterPinVisualController {
  refresh(markers: readonly AtlasPinMarkerModel[], masterEntityIds: ReadonlySet<EntityId>): void;
  destroy(): void;
}

function coordinateKey(marker: AtlasPinMarkerModel): string {
  return `${marker.coordinate[0]}\u0000${marker.coordinate[1]}`;
}

function synchronizePopupBadge(button: HTMLButtonElement, master: boolean): void {
  const existing = button.querySelector<HTMLElement>('[data-master-pin-badge]');
  if (!master) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const badge = document.createElement('span');
  badge.className = 'place-search__result-audience';
  badge.dataset.masterPinBadge = '';
  badge.textContent = 'Máster';
  button.append(badge);
}

export function mountMasterPinVisuals(root: ParentNode): MasterPinVisualController {
  let markers: readonly AtlasPinMarkerModel[] = [];
  let masterEntityIds: ReadonlySet<EntityId> = new Set();
  let frame: number | null = null;
  let destroyed = false;

  const isMaster = (marker: AtlasPinMarkerModel): boolean =>
    marker.entityId !== null && masterEntityIds.has(marker.entityId);

  const decorate = (): void => {
    frame = null;
    if (destroyed) return;
    const byId = new Map(markers.map((marker) => [marker.id, marker] as const));
    const byCoordinate = new Map<string, AtlasPinMarkerModel[]>();
    for (const marker of markers) {
      const key = coordinateKey(marker);
      const group = byCoordinate.get(key) ?? [];
      group.push(marker);
      byCoordinate.set(key, group);
    }

    root.querySelectorAll<HTMLElement>('.campaign-marker-icon').forEach((element) => {
      const pinId = element.dataset.pinId;
      const inner = element.querySelector<HTMLElement>('.pin-visual');
      if (pinId) {
        const marker = byId.get(pinId);
        const master = Boolean(marker && isMaster(marker));
        if (element.dataset.audience !== (master ? 'master' : 'public')) {
          element.dataset.audience = master ? 'master' : 'public';
        }
        inner?.classList.toggle('pin-visual--master', master);
        if (master && marker) {
          const type = marker.entityType === 'character' ? 'Personaje' : 'Emplazamiento de campaña';
          element.setAttribute(
            'aria-label',
            `${marker.name}. ${type}. Contenido del Máster. Categoría: ${marker.categoryName}.`,
          );
          const description = element.getAttribute('aria-description') ?? '';
          if (!description.includes('Contenido del Máster.')) {
            element.setAttribute('aria-description', `Contenido del Máster. ${description}`.trim());
          }
        }
        return;
      }

      const lat = Number(element.dataset.markerLat);
      const lng = Number(element.dataset.markerLng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const group = byCoordinate.get(`${lat}\u0000${lng}`) ?? [];
      const masters = group.filter(isMaster);
      if (masters.length === 0) {
        if (element.dataset.audience !== 'public') element.dataset.audience = 'public';
        inner?.classList.remove('pin-visual--master');
        return;
      }
      const audience = masters.length === group.length ? 'master' : 'mixed';
      if (element.dataset.audience !== audience) element.dataset.audience = audience;
      inner?.classList.add('pin-visual--master');
      element.setAttribute(
        'aria-label',
        `${group.length} pines coincidentes. ${masters.length} de contenido del Máster. ${group
          .map((marker) => `${marker.name}${isMaster(marker) ? ', Máster' : ''}.`)
          .join(' ')}`,
      );
    });

    root.querySelectorAll<HTMLButtonElement>('.pin-coincident-list__button[data-pin-id]').forEach(
      (button) => {
        const marker = byId.get(button.dataset.pinId ?? '');
        const master = Boolean(marker && isMaster(marker));
        if (button.dataset.audience !== (master ? 'master' : 'public')) {
          button.dataset.audience = master ? 'master' : 'public';
        }
        synchronizePopupBadge(button, master);
        if (!master || !marker) return;
        const existing = button.getAttribute('aria-label') ?? marker.name;
        if (!existing.includes('Contenido del Máster')) {
          button.setAttribute('aria-label', `${existing} Contenido del Máster.`);
        }
      },
    );
  };

  const schedule = (): void => {
    if (destroyed || frame !== null) return;
    frame = window.requestAnimationFrame(decorate);
  };

  const observer = new MutationObserver(schedule);
  const observed = root instanceof Node ? root : document.body;
  observer.observe(observed, { childList: true, subtree: true });

  return {
    refresh(nextMarkers, nextMasterEntityIds): void {
      markers = nextMarkers;
      masterEntityIds = nextMasterEntityIds;
      schedule();
    },
    destroy(): void {
      destroyed = true;
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      root.querySelectorAll<HTMLElement>('.campaign-marker-icon').forEach((element) => {
        delete element.dataset.audience;
        element.querySelector<HTMLElement>('.pin-visual')?.classList.remove('pin-visual--master');
      });
      root.querySelectorAll<HTMLElement>('[data-master-pin-badge]').forEach((badge) => badge.remove());
    },
  };
}
