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
}

interface LocalMapNavigationOptions {
  readonly initialBackendState: 'checking' | 'connected' | 'degraded' | 'offline';
  readonly onHistoryChange: (mode: 'push' | 'replace') => void;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOSTED_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const LOCAL_URL = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/?$/i;

function projectConfig(): { url: string; key: string } | null {
  const test = import.meta.env.DEV ? window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ : undefined;
  const url = (test?.projectUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '').trim();
  const key = (test?.publishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  if (
    !(HOSTED_URL.test(url) || (import.meta.env.DEV && LOCAL_URL.test(url))) ||
    !key ||
    !(key.startsWith('sb_publishable_') || (import.meta.env.DEV && key.length > 20))
  ) {
    return null;
  }
  return { url: url.replace(/\/$/, ''), key };
}

function parseLink(value: unknown, campaignId: string): LocalMapLink | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const nested = row.map_contexts;
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return null;
  const context = nested as Record<string, unknown>;
  const width = context.width;
  const height = context.height;
  if (
    row.campaign_id !== campaignId ||
    typeof row.geographic_name_id !== 'string' ||
    !row.geographic_name_id.startsWith('geo-') ||
    typeof context.id !== 'string' ||
    !context.id.startsWith('map-') ||
    typeof context.slug !== 'string' ||
    !SLUG.test(context.slug) ||
    typeof context.name !== 'string' ||
    context.name.trim().length === 0 ||
    context.publication_status !== 'published' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return {
    geographicNameId: row.geographic_name_id,
    context: {
      id: context.id,
      slug: context.slug,
      name: context.name,
      width,
      height,
      parentId: typeof context.parent_id === 'string' ? context.parent_id : null,
      imageUri: typeof context.image_uri === 'string' ? context.image_uri : null,
    },
  };
}

export async function fetchPublicLocalMapLinks(
  campaignId: string,
  signal: AbortSignal,
): Promise<readonly LocalMapLink[]> {
  const config = projectConfig();
  if (!config) return [];
  const url = new URL(`${config.url}/rest/v1/campaign_geographic_map_context_links`);
  url.searchParams.set(
    'select',
    'campaign_id,geographic_name_id,map_contexts!inner(id,slug,name,width,height,parent_id,image_uri,publication_status)',
  );
  url.searchParams.set('campaign_id', `eq.${campaignId}`);
  const response = await fetch(url, {
    signal,
    headers: {
      apikey: config.key,
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error('MAP-077 public bindings unavailable');
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.length > 200) throw new Error('Invalid map links response');
  return rows
    .map((row) => parseLink(row, campaignId))
    .filter((link): link is LocalMapLink => link !== null);
}

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
  // The public catalog is the authority for local navigation, not the binding endpoint.
  let backendState = options.initialBackendState;
  // An empty successful response is valid; only failures trigger a retry on refresh.
  let bindingLoadFailed = false;
  let generation = 0;
  let request: AbortController | null = null;
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
  };

  const redraw = (): void => {
    const entrance = links.find((link) => link.geographicNameId === selectedGeoId);
    entry.hidden = backendState !== 'connected' || requestedSlug !== null || !entrance;
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

  const load = (): void => {
    request?.abort();
    const localGeneration = ++generation;
    const campaignId = currentCampaignId;
    links = [];
    bindingLoadFailed = false;
    if (!campaignId || backendState !== 'connected') {
      // The initial fallback is provisional: retain the deep-link intent
      // without displaying local data until the remote authority responds.
      // Confirmed degraded/offline states must normalize it to the world.
      loaded = backendState !== 'checking' || !campaignId;
      redraw();
      return;
    }
    loaded = false;
    request = new AbortController();
    void fetchPublicLocalMapLinks(campaignId, request.signal)
      .then((nextLinks) => {
        if (localGeneration !== generation || backendState !== 'connected') return;
        request = null;
        links = nextLinks;
        loaded = true;
        redraw();
      })
      .catch(() => {
        if (localGeneration !== generation || backendState !== 'connected') return;
        request = null;
        links = [];
        loaded = true;
        bindingLoadFailed = true;
        redraw();
      });
  };

  const leave = (push: boolean): void => {
    if (!requestedSlug) return;
    requestedSlug = null;
    redraw();
    announcer.textContent = 'Mapa general. Contexto local cerrado.';
    if (push) options.onHistoryChange('push');
  };

  enter.addEventListener('click', () => {
    if (backendState !== 'connected') return;
    const entrance = links.find((link) => link.geographicNameId === selectedGeoId);
    if (!entrance) return;
    requestedSlug = entrance.context.slug;
    redraw();
    announcer.textContent = `Mapa local de ${entrance.context.name} abierto.`;
    options.onHistoryChange('push');
  });
  returnButton.addEventListener('click', () => leave(true));
  // A previously loaded local surface must not outlive remote data authority.
  window.addEventListener('atlas:public-data-status', (event) => {
    const detail = (event as CustomEvent<{ backendState?: string }>).detail;
    if (detail?.backendState === 'connected') {
      const shouldReload = backendState !== 'connected' || bindingLoadFailed;
      backendState = 'connected';
      if (shouldReload && currentCampaignId) load();
      return;
    }
    if (detail?.backendState !== 'degraded' && detail?.backendState !== 'offline') return;
    backendState = detail.backendState;
    request?.abort();
    request = null;
    ++generation;
    links = [];
    loaded = true;
    bindingLoadFailed = false;
    redraw();
  });

  window.addEventListener('atlas:campaign-will-change', () => {
    request?.abort();
    ++generation;
    links = [];
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
      if (nextCampaignId === currentCampaignId) return;
      currentCampaignId = nextCampaignId;
      links = [];
      loaded = false;
      if (requestedSlug) leave(false);
      load();
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
  };
}
