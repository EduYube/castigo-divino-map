import L, { type Map as LeafletMap } from 'leaflet';
import type { PublicCatalogState } from './publicDataRuntime';
import '../styles/local-map-navigation.css';

export interface LocalMapContext {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly parentId: string | null;
  readonly imageUri: string | null;
}

interface LocalMapLink {
  readonly geographicNameId: string;
  readonly context: LocalMapContext;
}

export interface LocalMapNavigation {
  updateCatalog(state: PublicCatalogState): void;
  setGeographicSelection(id: string | null): void;
  restoreMapSlug(slug: string | null): void;
  getMapSlug(): string | null;
  navigateToMapSlug(slug: string): boolean;
  returnToWorld(): void;
}

interface LocalMapNavigationOptions {
  readonly initialBackendState: 'checking' | 'connected' | 'degraded' | 'offline';
  readonly onHistoryChange: (mode: 'push' | 'replace') => void;
  readonly onSurfaceChange?: (context: LocalMapContext | null, map: LeafletMap | null) => void;
  readonly onBindingsChange?: (contexts: readonly LocalMapContext[]) => void;
}

// Public local map links are an immutable part of the validated V4 envelope.
// There is intentionally no separate navigation REST query or permissive parser.
function requireElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing local map element: ${selector}`);
  return element;
}

export function mountLocalMapNavigation(
  root: ParentNode,
  options: LocalMapNavigationOptions,
): LocalMapNavigation {
  const entry = requireElement<HTMLElement>(root, '[data-local-map-entry]');
  const entryName = requireElement<HTMLElement>(root, '[data-local-map-entry-name]');
  const enter = requireElement<HTMLButtonElement>(root, '[data-local-map-enter]');
  const toolbar = requireElement<HTMLElement>(root, '[data-local-map-toolbar]');
  const crumb = requireElement<HTMLElement>(root, '[data-local-map-current]');
  const returnButton = requireElement<HTMLButtonElement>(root, '[data-local-map-return]');
  const localCanvas = requireElement<HTMLElement>(root, '[data-local-map-canvas]');
  const worldCanvas = requireElement<HTMLElement>(root, '[data-map-canvas]');
  const mapStatus = requireElement<HTMLElement>(root, '[data-local-map-status]');
  const announcer = requireElement<HTMLElement>(root, '[data-map-search-status]');
  let links: readonly LocalMapLink[] = [];
  let currentCampaignId: string | null = null;
  let selectedGeoId: string | null = null;
  let requestedSlug: string | null = null;
  let loaded = false;
  // Only already-validated V4 envelope bindings may authorize navigation.
  void options.initialBackendState;
  let localMap: LeafletMap | null = null;
  let activeContextId: string | null = null;
  let image: L.ImageOverlay | null = null;

  const closeSurface = (): void => {
    if (localMap) {
      localMap.remove();
      localMap = null;
    }
    activeContextId = null;
    image = null;
    options.onSurfaceChange?.(null, null);
    mapStatus.hidden = true;
    localCanvas.hidden = true;
    worldCanvas.hidden = false;
    toolbar.hidden = true;
    worldCanvas.setAttribute(
      'aria-label',
      'Mapa navegable de la Costa de la Espada y el noroeste de Faerûn',
    );
    // The main Leaflet controller retains world coordinates/filters.
    window.dispatchEvent(new Event('atlas:world-map-restored'));
  };

  const showSurface = (context: LocalMapContext): void => {
    if (activeContextId === context.id && localMap) return;
    closeSurface();
    worldCanvas.hidden = true;
    localCanvas.hidden = false;
    toolbar.hidden = false;
    mapStatus.hidden = false;
    crumb.textContent = context.name;
    localCanvas.setAttribute('aria-label', `Mapa local de ${context.name}`);
    mapStatus.textContent = context.imageUri
      ? `Mapa local de ${context.name}`
      : `Mapa local de ${context.name}. Cartografía pendiente de publicación.`;
    const bounds = L.latLngBounds([0, 0], [context.height, context.width]);
    const map = L.map(localCanvas, {
      crs: L.CRS.Simple,
      attributionControl: false,
      zoomControl: true,
      minZoom: -5,
      maxZoom: 2,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      maxBounds: bounds,
      maxBoundsViscosity: 1,
      keyboard: true,
      dragging: true,
      scrollWheelZoom: true,
    });
    L.rectangle(bounds, { color: '#a99666', weight: 2, fill: false, interactive: false }).addTo(
      map,
    );
    if (context.imageUri) {
      // Future rights-cleared contexts can supply their vetted published source.
      image = L.imageOverlay(context.imageUri, bounds, {
        alt: `Cartografía de ${context.name}`,
        interactive: false,
      });
      image.on('error', () => {
        image?.removeFrom(map);
        mapStatus.textContent = `Mapa local de ${context.name}. Cartografía no disponible.`;
      });
      image.addTo(map);
    }
    map.fitBounds(bounds, { animate: false });
    map.setMinZoom(map.getBoundsZoom(bounds));
    activeContextId = context.id;
    localMap = map;
    options.onSurfaceChange?.(context, map);
  };

  const redraw = (): void => {
    const entrance = links.find((link) => link.geographicNameId === selectedGeoId);
    entry.hidden = !loaded || requestedSlug !== null || !entrance;
    if (entrance && requestedSlug === null) {
      entryName.textContent = entrance.context.name;
      enter.textContent = `Entrar en ${entrance.context.name}`;
    }
    if (!requestedSlug) {
      closeSurface();
      return;
    }
    if (!loaded) return;
    const target = links.find((link) => link.context.slug === requestedSlug);
    if (!target) {
      requestedSlug = null;
      closeSurface();
      announcer.textContent =
        'El mapa local no está disponible para esta campaña. Mostrando mapa general.';
      options.onHistoryChange('replace');
      return;
    }
    showSurface(target.context);
  };

  const leave = (push: boolean): void => {
    if (!requestedSlug) return;
    requestedSlug = null;
    redraw();
    announcer.textContent = 'Mapa general. Contexto local cerrado.';
    if (push) options.onHistoryChange('push');
  };

  enter.addEventListener('click', () => {
    if (!loaded) return;
    const entrance = links.find((link) => link.geographicNameId === selectedGeoId);
    if (!entrance) return;
    requestedSlug = entrance.context.slug;
    redraw();
    announcer.textContent = `Mapa local de ${entrance.context.name} abierto.`;
    options.onHistoryChange('push');
  });
  returnButton.addEventListener('click', () => leave(true));
  window.addEventListener('atlas:campaign-will-change', () => {
    links = [];
    options.onBindingsChange?.([]);
    loaded = false;
    leave(false);
    closeSurface();
    selectedGeoId = null;
    entry.hidden = true;
  });
  entry.hidden = true;
  toolbar.hidden = true;
  localCanvas.hidden = true;

  return {
    updateCatalog(state): void {
      const nextCampaignId = state.selectedCampaign?.id ?? null;
      const campaignChanged = nextCampaignId !== currentCampaignId;
      currentCampaignId = nextCampaignId;
      // V1/V2/V3 history is intentionally world-only. V4 supplies the entire
      // campaign-scoped binding set from the same checksum as the world catalog.
      links = state.mapLinks ?? [];
      loaded = true;
      const contextById = new Map(links.map(({ context }) => [context.id, context] as const));
      options.onBindingsChange?.([...contextById.values()]);
      if (campaignChanged && requestedSlug) leave(false);
      redraw();
    },
    setGeographicSelection(id): void {
      selectedGeoId = id;
      redraw();
    },
    restoreMapSlug(slug): void {
      requestedSlug = slug;
      redraw();
    },
    getMapSlug(): string | null {
      return requestedSlug;
    },
    navigateToMapSlug(slug): boolean {
      if (!loaded || !links.some((link) => link.context.slug === slug)) return false;
      requestedSlug = slug;
      redraw();
      announcer.textContent = `Mapa local de ${slug} abierto.`;
      options.onHistoryChange('push');
      return true;
    },
    returnToWorld(): void {
      leave(true);
    },
  };
}
