import L, { type LatLngBounds, type Map as LeafletMap } from 'leaflet';

import '../styles/expanded-map-layout.css';
import { bindExpandedMapToggle, type ExpandToggleBinding } from './expandToggle';
import { synchronizeMapAfterLayoutChange, synchronizeMapAfterLayoutRestore } from './layoutSync';

export interface ExpandedMapLayoutController {
  isResizeSynchronizationPending(): boolean;
  destroy(): void;
}

class ExpandedMapLeafletControl extends L.Control {
  private binding: ExpandToggleBinding | null = null;

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

    this.binding = bindExpandedMapToggle(button, this.onToggle);
    return container;
  }

  override onRemove(): void {
    this.binding?.destroy();
    this.binding = null;
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
  let layoutFrame: number | undefined;
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

    if (layoutFrame !== undefined) window.cancelAnimationFrame(layoutFrame);
    if (synchronizeFrame !== undefined) window.cancelAnimationFrame(synchronizeFrame);
    if (releaseFrame !== undefined) window.cancelAnimationFrame(releaseFrame);

    // Give the browser one full paint opportunity to settle the CSS grid width before Leaflet
    // reads its container size. At wide viewports the normal and expanded layouts can straddle a
    // 0.25 zoomSnap boundary, so measuring one frame too early preserves the expanded zoom.
    layoutFrame = window.requestAnimationFrame(() => {
      layoutFrame = undefined;
      if (destroyed) return;

      synchronizeFrame = window.requestAnimationFrame(() => {
        synchronizeFrame = undefined;
        if (destroyed) return;

        if (expanded) {
          synchronizeMapAfterLayoutChange(map, bounds, center, zoom, maxZoom);
        } else {
          synchronizeMapAfterLayoutRestore(map, bounds, maxZoom);
        }
        releaseFrame = window.requestAnimationFrame(() => {
          releaseFrame = undefined;
          suppressObservedResize = false;
        });
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
      if (layoutFrame !== undefined) window.cancelAnimationFrame(layoutFrame);
      if (synchronizeFrame !== undefined) window.cancelAnimationFrame(synchronizeFrame);
      if (releaseFrame !== undefined) window.cancelAnimationFrame(releaseFrame);
      experience.dataset.mapExpanded = 'false';
      control.remove();
    },
  };
}
