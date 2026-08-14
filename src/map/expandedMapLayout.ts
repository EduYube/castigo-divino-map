import L, { type LatLngBounds, type Map as LeafletMap } from 'leaflet';

import '../styles/expanded-map-layout.css';
import { synchronizeMapAfterLayoutChange } from './layoutSync';

const EXPAND_LABEL = 'Expandir mapa';
const RESTORE_LABEL = 'Restaurar tamaño del mapa';

export interface ExpandedMapLayoutController {
  isResizeSynchronizationPending(): boolean;
  destroy(): void;
}

interface ExpandToggleBinding {
  setExpanded(expanded: boolean): void;
  destroy(): void;
}

export function bindExpandedMapToggle(
  button: HTMLButtonElement,
  onToggle: (expanded: boolean) => void,
): ExpandToggleBinding {
  let expanded = false;

  const render = (): void => {
    const label = expanded ? RESTORE_LABEL : EXPAND_LABEL;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', expanded ? 'true' : 'false');
    button.title = label;

    const icon = button.querySelector<HTMLElement>('[data-map-expand-icon]');
    if (icon) icon.textContent = expanded ? '↙' : '⛶';
  };

  const handleClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    onToggle(!expanded);
  };

  button.addEventListener('click', handleClick);
  render();

  return {
    setExpanded(nextExpanded): void {
      if (expanded === nextExpanded) return;
      expanded = nextExpanded;
      render();
    },
    destroy(): void {
      button.removeEventListener('click', handleClick);
    },
  };
}

class ExpandedMapLeafletControl extends L.Control {
  private binding: ExpandToggleBinding | null = null;
  private button: HTMLButtonElement | null = null;

  constructor(private readonly onToggle: (expanded: boolean) => void) {
    super({ position: 'topright' });
  }

  override onAdd(): HTMLElement {
    const container = L.DomUtil.create('div', 'leaflet-control map-expand-control leaflet-bar');
    const button = document.createElement('button');
    const icon = document.createElement('span');

    button.type = 'button';
    button.className = 'map-expand-control__button';
    button.setAttribute('data-map-expand-control', '');
    icon.className = 'map-expand-control__icon';
    icon.setAttribute('data-map-expand-icon', '');
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    container.append(button);

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    this.button = button;
    this.binding = bindExpandedMapToggle(button, this.onToggle);
    return container;
  }

  override onRemove(): void {
    this.binding?.destroy();
    this.binding = null;
    this.button = null;
  }

  setExpanded(expanded: boolean): void {
    this.binding?.setExpanded(expanded);
  }
}

function getMapExperience(root: ParentNode): HTMLElement {
  const experience = root.querySelector<HTMLElement>('.map-experience');
  if (!experience) throw new Error('Missing required map layout element: .map-experience');
  return experience;
}

export function mountExpandedMapLayout(
  root: ParentNode,
  map: LeafletMap,
  bounds: LatLngBounds,
  maxZoom: number,
): ExpandedMapLayoutController {
  const experience = getMapExperience(root);
  let expanded = false;
  let destroyed = false;
  let synchronizeFrame: number | undefined;
  let releaseFrame: number | undefined;
  let suppressObservedResize = false;

  experience.dataset.mapExpanded = 'false';

  const control = new ExpandedMapLeafletControl((nextExpanded) => {
    if (destroyed || nextExpanded === expanded) return;

    const center = map.getCenter();
    const zoom = map.getZoom();
    expanded = nextExpanded;
    suppressObservedResize = true;
    experience.dataset.mapExpanded = expanded ? 'true' : 'false';
    control.setExpanded(expanded);

    if (synchronizeFrame !== undefined) window.cancelAnimationFrame(synchronizeFrame);
    if (releaseFrame !== undefined) window.cancelAnimationFrame(releaseFrame);

    synchronizeFrame = window.requestAnimationFrame(() => {
      synchronizeFrame = undefined;
      if (destroyed) return;

      synchronizeMapAfterLayoutChange(map, bounds, center, zoom, maxZoom);
      releaseFrame = window.requestAnimationFrame(() => {
        releaseFrame = undefined;
        suppressObservedResize = false;
      });
    });
  });

  control.addTo(map);

  return {
    isResizeSynchronizationPending(): boolean {
      return suppressObservedResize;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      suppressObservedResize = false;
      if (synchronizeFrame !== undefined) window.cancelAnimationFrame(synchronizeFrame);
      if (releaseFrame !== undefined) window.cancelAnimationFrame(releaseFrame);
      experience.dataset.mapExpanded = 'false';
      control.remove();
    },
  };
}
