import 'leaflet/dist/leaflet.css';

import { bootstrapAdminAuthRuntime, type AdminAuthRuntime } from './app/adminAuthRuntime';
import { mountAdminPinVisualSync } from './app/adminPinVisualSync';
import { mountCollapsibleMapControls } from './app/collapsibleControls';
import { mountCompactPinDetails } from './app/compactPinDetails';
import { INITIAL_PUBLIC_CAMPAIGN_SLUG } from './app/campaignSelection';
import { mountFullEntityDetails, renderFullEntityDetailsShell } from './app/fullEntityDetails';
import { createFullEntityUrl, parseFullEntityUrlRequest } from './app/fullEntityUrl';
import { mountMasterDetailActions } from './app/masterDetailActions';
import { mountMasterPinVisuals } from './app/masterPinVisuals';
import { bootstrapMasterModeRuntime, type MasterModeRuntime } from './app/masterModeRuntime';
import { mountMasterSearchVisuals } from './app/masterSearchVisuals';
import { mountPlaceFilters } from './app/placeFilters';
import {
  bootstrapPublicDataRuntime,
  type PublicCatalogState,
  type PublicDataRuntime,
} from './app/publicDataRuntime';
import { mountPublicPinRequest } from './app/publicPinRequestEntry';
import { mountPlaceSearch } from './app/placeSearch';
import { createPlaceSelectionController } from './app/placeSelection';
import { renderApp } from './app/renderApp';
import {
  createCanonicalPublicAppUrl,
  parsePublicAppUrlState,
  type PublicAppUrlState,
} from './app/urlState';
import type { EntityId, GeographicNameId, PublicGeographicName } from './data/beta02-model';
import { campaignCatalog } from './data/catalog';
import { buildCompactPinDetailModel } from './data/compactPinDetails';
import {
  deriveMatchingPublicEntityIds,
  deriveMatchingPublicPlaceIds,
  derivePublicFilterFacets,
} from './data/filters';
import { resolveFullEntityDetail } from './data/fullEntityDetails';
import { createAuthorizedMasterCatalogView } from './data/masterCatalogView';
import type { CampaignCatalog, PlaceId } from './data/model';
import { createAtlasPinMarkerModels, type AtlasPinMarkerModel } from './data/pinMarkers';
import type { AtlasSearchResult } from './data/search';
import type { MapEntityAudience, MapEntityPublicationStatus } from './domain/adminMapEntities';
import { getPinTypeVisual } from './domain/pinVisualSystem';
import {
  SupabaseCharacterPortraitResources,
  type CharacterPortraitResources,
} from './infrastructure/supabase/characterPortraitResources';
import { mountFaerunMap } from './map/leaflet';
import './styles/main.css';
import './styles/pin-visual-system.css';
import './styles/compact-pin-details.css';
import './styles/full-entity-details.css';
import './styles/search.css';
import './styles/filters.css';
import './styles/collapsible-controls.css';
import './styles/backend-status.css';
import './styles/admin-auth.css';
import './styles/accessibility.css';

const MOBILE_COMPACT_DETAILS_QUERY = '(max-width: 48rem)';
const appElement = document.querySelector<HTMLDivElement>('#app');

if (!appElement) {
  throw new Error('No se encontró el elemento raíz de la aplicación.');
}

const app = appElement;

interface PortraitRuntimeTestConfig {
  readonly projectUrl?: string;
  readonly publishableKey?: string;
  readonly timeoutMs?: number;
}

interface AdminEntityProjectionRevision {
  readonly audience: MapEntityAudience;
  readonly publicationStatus: MapEntityPublicationStatus;
  readonly updatedAt: string;
}

function createPortraitResources(): CharacterPortraitResources | null {
  const testWindow = window as Window & {
    __MAP016_PUBLIC_DATA_TEST_CONFIG__?: PortraitRuntimeTestConfig;
    __MAP017_AUTH_TEST_CONFIG__?: PortraitRuntimeTestConfig;
  };
  const testConfig = import.meta.env.DEV
    ? (testWindow.__MAP016_PUBLIC_DATA_TEST_CONFIG__ ?? testWindow.__MAP017_AUTH_TEST_CONFIG__)
    : undefined;
  try {
    return new SupabaseCharacterPortraitResources({
      projectUrl: testConfig?.projectUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '',
      publishableKey:
        testConfig?.publishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
      timeoutMs: testConfig?.timeoutMs,
      allowLocalProject: import.meta.env.DEV,
    });
  } catch {
    return null;
  }
}

function describeSearchTarget(result: AtlasSearchResult): string {
  switch (result.type) {
    case 'geographic':
      return `${result.name}, lugar geográfico`;
    case 'character':
      return `${result.name}, personaje`;
    case 'location':
      return `${result.name}, emplazamiento de campaña`;
  }
}

function describeGeographicNameTarget(geographicName: PublicGeographicName): string {
  return `${geographicName.name}, lugar geográfico`;
}

function isSameCatalogState(left: PublicCatalogState, right: PublicCatalogState): boolean {
  return (
    left.availability === right.availability &&
    left.checksum === right.checksum &&
    (left.beta02 === null) === (right.beta02 === null)
  );
}

function mountPublicExperience(
  initialCatalogState: PublicCatalogState,
  publicDataRuntime?: PublicDataRuntime,
  adminRuntime?: AdminAuthRuntime,
): void {
  let isRestoringFromHistory = false;
  let pendingInitialFilterUrl: URL | null = null;
  let initialPublicRefreshSettled = publicDataRuntime === undefined;
  let catalogState = initialCatalogState;
  let catalog = initialCatalogState.compatibility;
  let publicBeta02Catalog = initialCatalogState.beta02;
  let beta02Catalog = initialCatalogState.beta02;
  let renderedMarkers = createAtlasPinMarkerModels(catalog, beta02Catalog);
  let activeSupplementalPin: AtlasPinMarkerModel | null = null;
  let geographicNameId: GeographicNameId | null = null;
  let masterEntityIds: ReadonlySet<EntityId> = new Set();
  let masterModeRuntime: MasterModeRuntime | null = null;
  let deferredSelectionAnnouncementGeneration = 0;
  const invalidateDeferredSelectionAnnouncement = (): void => {
    deferredSelectionAnnouncementGeneration += 1;
  };
  const portraitResources = createPortraitResources();
  const selection = createPlaceSelectionController();
  const mapSearchStatus = app.querySelector<HTMLElement>('[data-map-search-status]');

  const focusPinControl = (pin: AtlasPinMarkerModel): void => {
    const region = Array.from(
      app.querySelectorAll<HTMLElement>('.campaign-region[data-region-id]'),
    ).find((candidate) => candidate.dataset.regionId === pin.id);
    if (region) {
      region.focus({ preventScroll: true });
      return;
    }

    const [lat, lng] = pin.coordinate;
    const element = Array.from(
      app.querySelectorAll<HTMLElement>('.campaign-marker-icon[data-marker-lat][data-marker-lng]'),
    ).find(
      (candidate) =>
        Number(candidate.dataset.markerLat) === lat && Number(candidate.dataset.markerLng) === lng,
    );

    element?.focus({ preventScroll: true });
  };

  const mapController = mountFaerunMap(app, {
    markers: renderedMarkers,
    loadPortrait(pin, signal) {
      if (!portraitResources || !pin.portraitPath) return Promise.resolve(null);
      return portraitResources.load(pin.portraitPath, {
        access: pin.entityId && masterEntityIds.has(pin.entityId) ? 'master' : 'public',
        variant: 'marker',
        signal,
      });
    },
    onPinActivate(pin): void {
      const announcementGeneration = ++deferredSelectionAnnouncementGeneration;
      const wasMaster = Boolean(pin.entityId && masterEntityIds.has(pin.entityId));
      mapController.clearSearchFocus();

      if (pin.legacyPlaceId) {
        activeSupplementalPin = null;
        selection.select(pin.legacyPlaceId);
        return;
      }

      activeSupplementalPin = pin;
      selection.clear();
      updateMatchingPlaces();
      writePublicStateToHistory('push');

      if (!showCompactDetails(pin, true)) {
        activeSupplementalPin = null;
        return;
      }

      window.requestAnimationFrame(() => {
        if (
          announcementGeneration !== deferredSelectionAnnouncementGeneration ||
          activeSupplementalPin?.id !== pin.id ||
          !renderedMarkers.some(({ id }) => id === pin.id) ||
          (wasMaster && (!pin.entityId || !masterEntityIds.has(pin.entityId)))
        ) {
          return;
        }
        if (!mapSearchStatus) return;
        const type = getPinTypeVisual(pin.entityType).label.toLocaleLowerCase('es');
        const audience =
          pin.entityId && masterEntityIds.has(pin.entityId) ? ' Contenido del Máster.' : '';
        mapSearchStatus.textContent = `${pin.name}, ${type}, seleccionado en el mapa. Ficha compacta abierta.${audience}`;
      });
    },
  });
  const masterPinVisuals = mountMasterPinVisuals(app);
  masterPinVisuals.refresh(renderedMarkers, masterEntityIds);
  mountPublicPinRequest(app, mapController.map);

  const compactDetailsPanel = app.querySelector<HTMLElement>('[data-place-details]');
  const mobileCompactDetailsMedia = window.matchMedia(MOBILE_COMPACT_DETAILS_QUERY);
  const keepPinVisibleWithCompactDetails = (): void => {
    if (!mobileCompactDetailsMedia.matches) {
      return;
    }

    const adjustActiveMarker = (attemptsRemaining: number): void => {
      window.requestAnimationFrame(() => {
        if (
          !mobileCompactDetailsMedia.matches ||
          !compactDetailsPanel ||
          compactDetailsPanel.hidden
        ) {
          return;
        }

        const activeMarker = app.querySelector<HTMLElement>(
          '.campaign-marker-icon[aria-pressed="true"]',
        );
        if (!activeMarker) {
          return;
        }

        const edgePadding = 20;
        mapController.map.invalidateSize({ animate: false, pan: false });
        const mapRect = mapController.map.getContainer().getBoundingClientRect();
        const panelRect = compactDetailsPanel.getBoundingClientRect();
        const markerRect = activeMarker.getBoundingClientRect();
        const markerCenterX = markerRect.left + markerRect.width / 2;
        const markerCenterY = markerRect.top + markerRect.height / 2;
        const visibleLeft = mapRect.left + edgePadding;
        const visibleRight = mapRect.right - edgePadding;
        const visibleTop = mapRect.top + edgePadding;
        const visibleBottom = Math.min(mapRect.bottom - edgePadding, panelRect.top - edgePadding);
        let offsetX = 0;
        let offsetY = 0;

        if (markerCenterX < visibleLeft) {
          offsetX = markerCenterX - visibleLeft;
        } else if (markerCenterX > visibleRight) {
          offsetX = markerCenterX - visibleRight;
        }

        if (markerCenterY < visibleTop) {
          offsetY = markerCenterY - visibleTop;
        } else if (markerCenterY > visibleBottom) {
          offsetY = markerCenterY - visibleBottom;
        }

        if (offsetX !== 0 || offsetY !== 0) {
          const roundAwayFromZero = (value: number): number =>
            value > 0 ? Math.ceil(value) : Math.floor(value);
          mapController.map.panBy([roundAwayFromZero(offsetX), roundAwayFromZero(offsetY)], {
            animate: false,
          });
        }

        if (attemptsRemaining > 1) {
          adjustActiveMarker(attemptsRemaining - 1);
        }
      });
    };

    adjustActiveMarker(4);
  };

  const clearSupplementalMapSelection = (): void => {
    mapController.clearSupplementalPinSelection();
  };

  const compactDetailsController = mountCompactPinDetails(app, {
    onClose(): void {
      invalidateDeferredSelectionAnnouncement();
      const previouslyActivePlaceId = selection.getActivePlaceId();

      if (previouslyActivePlaceId) {
        selection.clear();
        window.requestAnimationFrame(() => mapController.focusMarker(previouslyActivePlaceId));
        return;
      }

      const supplementalPin = activeSupplementalPin;
      compactDetailsController.hide();

      if (!supplementalPin) {
        return;
      }

      activeSupplementalPin = null;
      clearSupplementalMapSelection();
      window.requestAnimationFrame(() => focusPinControl(supplementalPin));
    },
    loadPortrait(details, signal) {
      if (!portraitResources || !details.portraitPath) return Promise.resolve(null);
      return portraitResources.load(details.portraitPath, {
        access: details.entityId && masterEntityIds.has(details.entityId) ? 'master' : 'public',
        variant: 'detail',
        signal,
      });
    },
    createFullDetailsUrl(details): string | null {
      if (!details.entitySlug || (details.entityId && masterEntityIds.has(details.entityId))) {
        return null;
      }

      return createFullEntityUrl(new URL(window.location.href), details.entitySlug).href;
    },
  });

  function showCompactDetails(pin: AtlasPinMarkerModel, focus: boolean): boolean {
    const details = buildCompactPinDetailModel(catalog, beta02Catalog, pin);

    if (!details) {
      return false;
    }

    compactDetailsController.show(details, { focus });
    keepPinVisibleWithCompactDetails();
    return true;
  }

  const showLegacyPlaceDetails = (placeId: PlaceId, focus: boolean): boolean => {
    const marker = renderedMarkers.find(({ legacyPlaceId }) => legacyPlaceId === placeId);

    return marker ? showCompactDetails(marker, focus) : false;
  };

  const resolveGeographicName = (id: GeographicNameId | null): PublicGeographicName | null => {
    if (!id || !beta02Catalog) return null;
    return beta02Catalog.geographicNames.find((geographicName) => geographicName.id === id) ?? null;
  };

  const hasUnknownPublicFilterParameters = (sourceUrl: URL): boolean => {
    const facets = publicBeta02Catalog ? derivePublicFilterFacets(publicBeta02Catalog) : null;
    const categories = facets?.categories ?? catalog.categories;
    const tags = facets?.tags ?? catalog.tags;
    const requestedCategories = sourceUrl.searchParams
      .getAll('category')
      .map((value) => value.trim())
      .filter(Boolean);
    const requestedTags = sourceUrl.searchParams
      .getAll('tag')
      .map((value) => value.trim())
      .filter(Boolean);

    return (
      requestedCategories.some(
        (value) => !categories.some(({ id, slug }) => id === value || slug === value),
      ) || requestedTags.some((value) => !tags.some(({ id }) => id === value))
    );
  };

  const locateGeographicName = (geographicName: PublicGeographicName): void => {
    mapController.locateSearchTarget({
      coordinates: geographicName.coordinates,
      searchExtent: geographicName.searchExtent ?? null,
      recommendedZoom: geographicName.recommendedZoom,
      label: describeGeographicNameTarget(geographicName),
    });
  };

  const placeFiltersController = mountPlaceFilters(app, {
    catalog,
    beta02Catalog: publicBeta02Catalog,
    onChange(): void {
      updateMatchingPlaces();
      writePublicStateToHistory('push');
    },
  });

  const openLegacyPlace = (placeId: PlaceId): void => {
    invalidateDeferredSelectionAnnouncement();
    const wasAlreadyActive = selection.getActivePlaceId() === placeId;

    activeSupplementalPin = null;
    mapController.locatePlace(placeId);
    selection.select(placeId);

    if (wasAlreadyActive && !showLegacyPlaceDetails(placeId, true)) {
      selection.clear();
    }
  };

  const placeSearchController = mountPlaceSearch(app, {
    catalog,
    onQueryChange(): void {
      invalidateDeferredSelectionAnnouncement();
      if (geographicNameId !== null) {
        geographicNameId = null;
        mapController.clearSearchFocus();
      }
      updateMatchingPlaces();
      writePublicStateToHistory('replace');
    },
    onSelect(result): void {
      invalidateDeferredSelectionAnnouncement();
      if (result.type === 'location' && result.legacyPlaceId) {
        geographicNameId = null;
        mapController.clearSearchFocus();
        openLegacyPlace(result.legacyPlaceId);
        return;
      }

      if (activeSupplementalPin) {
        activeSupplementalPin = null;
        compactDetailsController.hide();
        clearSupplementalMapSelection();
      }

      geographicNameId = result.type === 'geographic' ? (result.id as GeographicNameId) : null;
      selection.clear();
      updateMatchingPlaces();
      mapController.locateSearchTarget({
        coordinates: result.coordinates,
        searchExtent: result.searchExtent,
        recommendedZoom: result.recommendedZoom,
        label:
          result.linkedEntityId && masterEntityIds.has(result.linkedEntityId)
            ? `${describeSearchTarget(result)}, contenido del Máster`
            : describeSearchTarget(result),
      });

      if (result.linkedEntityId && masterEntityIds.has(result.linkedEntityId)) {
        const masterPin = renderedMarkers.find(
          ({ entityId }) => entityId === result.linkedEntityId,
        );
        if (masterPin) {
          activeSupplementalPin = masterPin;
          showCompactDetails(masterPin, true);
        }
      }
      writePublicStateToHistory('push');
    },
    onOpenPlace(placeId): void {
      openLegacyPlace(placeId);
    },
  });
  placeSearchController.setCatalogState(catalog, beta02Catalog);
  const masterSearchVisuals = mountMasterSearchVisuals(app);
  masterSearchVisuals.refresh(masterEntityIds);

  function getCurrentPublicState(): PublicAppUrlState {
    const filters = placeFiltersController.getState();

    return {
      activePlaceId: selection.getActivePlaceId(),
      // Never serialize an admin-only search term while private data is in memory.
      query: masterEntityIds.size > 0 ? '' : placeSearchController.getQuery(),
      geographicNameId,
      selectedCategoryIds: filters.selectedCategoryIds,
      selectedTagIds: filters.selectedTagIds,
    };
  }

  function writePublicStateToHistory(mode: 'push' | 'replace'): void {
    if (isRestoringFromHistory) return;

    const currentUrl = new URL(window.location.href);
    const nextUrl = createCanonicalPublicAppUrl(
      catalog,
      currentUrl,
      getCurrentPublicState(),
      publicBeta02Catalog,
    );

    if (nextUrl.href === currentUrl.href) return;

    if (mode === 'push') {
      window.history.pushState(window.history.state, '', nextUrl);
    } else {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }

  function updateMatchingPlaces(): void {
    const isGeographicNavigation = geographicNameId !== null;
    const query = placeSearchController.getQuery();
    const filters = placeFiltersController.getState();
    const matchingOptions = {
      searchIntent: isGeographicNavigation
        ? ('geographic-navigation' as const)
        : ('entity-search' as const),
    };
    const matchingPlaceIds = deriveMatchingPublicPlaceIds(catalog, query, filters, matchingOptions);
    const matchingPlaceIdSet = new Set(matchingPlaceIds);
    const activePlaceId = selection.getActivePlaceId();

    if (publicBeta02Catalog) {
      const matchingEntityIds = deriveMatchingPublicEntityIds(
        catalog,
        publicBeta02Catalog,
        query,
        filters,
        matchingOptions,
      );
      const matchingEntityIdSet = new Set(matchingEntityIds);
      const matchingPinIds = new Set(
        renderedMarkers
          .filter((pin) => {
            if (pin.entityId) {
              // Private pins are outside the public facet universe. When authorized they remain
              // operable and are never allowed to influence public counts or URL state.
              return masterEntityIds.has(pin.entityId) || matchingEntityIdSet.has(pin.entityId);
            }

            return Boolean(pin.legacyPlaceId && matchingPlaceIdSet.has(pin.legacyPlaceId));
          })
          .map(({ id }) => id),
      );
      const activePin =
        activeSupplementalPin ??
        (activePlaceId
          ? (renderedMarkers.find(({ legacyPlaceId }) => legacyPlaceId === activePlaceId) ?? null)
          : null);

      mapController.setMatchingPins(
        matchingPinIds,
        isGeographicNavigation ? 'filters-only' : 'search-and-filters',
      );
      placeFiltersController.setMatchSummary(
        matchingEntityIds.length,
        activePin ? matchingPinIds.has(activePin.id) : null,
      );
      return;
    }

    const matchingPinIds = new Set(
      renderedMarkers
        .filter((pin) => pin.legacyPlaceId !== null && matchingPlaceIdSet.has(pin.legacyPlaceId))
        .map(({ id }) => id),
    );
    const activePin = activePlaceId
      ? (renderedMarkers.find(({ legacyPlaceId }) => legacyPlaceId === activePlaceId) ?? null)
      : null;

    mapController.setMatchingPins(
      matchingPinIds,
      isGeographicNavigation ? 'filters-only' : 'search-and-filters',
    );
    placeFiltersController.setMatchSummary(
      matchingPlaceIds.length,
      activePin ? matchingPinIds.has(activePin.id) : null,
    );
  }

  function restorePendingInitialFilters(): void {
    const pendingUrl = pendingInitialFilterUrl;
    if (!pendingUrl) return;

    pendingInitialFilterUrl = null;
    const parsed = parsePublicAppUrlState(catalog, pendingUrl, publicBeta02Catalog);
    placeFiltersController.setState(
      {
        selectedCategoryIds: parsed.state.selectedCategoryIds,
        selectedTagIds: parsed.state.selectedTagIds,
      },
      { notify: false },
    );
  }

  function renderActivePlace(
    activePlaceId: PlaceId | null,
    options: { readonly focusDetails: boolean; readonly locate: boolean },
  ): void {
    mapController.setActivePlace(activePlaceId);
    updateMatchingPlaces();

    if (!activePlaceId) {
      if (!activeSupplementalPin) compactDetailsController.hide();
      return;
    }

    activeSupplementalPin = null;

    if (options.locate) mapController.locatePlace(activePlaceId);

    if (!showLegacyPlaceDetails(activePlaceId, options.focusDetails)) selection.clear();
  }

  function applyCatalogState(nextCatalogState: PublicCatalogState, force = false): void {
    if (!force && isSameCatalogState(catalogState, nextCatalogState)) return;

    invalidateDeferredSelectionAnnouncement();
    catalogState = nextCatalogState;
    const previousActivePlaceId = selection.getActivePlaceId();
    const previousGeographicNameId = geographicNameId;
    const previousMasterEntityIds = masterEntityIds;
    const validPlaceIds = new Set(nextCatalogState.compatibility.places.map(({ id }) => id));
    let effectiveBeta02 = nextCatalogState.beta02;
    let nextMasterEntityIds: ReadonlySet<EntityId> = new Set();
    const modeState = masterModeRuntime?.controller.getState();

    if (modeState?.phase === 'on' && modeState.catalog && nextCatalogState.beta02) {
      try {
        const view = createAuthorizedMasterCatalogView(nextCatalogState.beta02, modeState.catalog);
        effectiveBeta02 = view.catalog;
        nextMasterEntityIds = view.masterEntityIds;
      } catch {
        // A contradictory public/private projection is a security invariant failure.
        // Fail closed by dropping private state instead of trying to reconcile it client-side.
        void masterModeRuntime?.controller.setEnabled(false);
        effectiveBeta02 = nextCatalogState.beta02;
        nextMasterEntityIds = new Set();
      }
    }

    const removedMasterEntityIds = new Set(
      [...previousMasterEntityIds].filter((entityId) => !nextMasterEntityIds.has(entityId)),
    );
    if (removedMasterEntityIds.size > 0) {
      if (
        activeSupplementalPin?.entityId &&
        removedMasterEntityIds.has(activeSupplementalPin.entityId)
      ) {
        activeSupplementalPin = null;
        compactDetailsController.hide();
        clearSupplementalMapSelection();
      }
      if (placeSearchController.getQuery()) {
        placeSearchController.setQuery('', { notify: false });
      }
    }

    masterEntityIds = nextMasterEntityIds;
    const publicPortraitPaths = new Set(
      (nextCatalogState.beta02?.entities ?? [])
        .map(({ portraitPath }) => portraitPath ?? null)
        .filter((path): path is string => path !== null),
    );
    const masterPortraitPaths = new Set(
      (effectiveBeta02?.entities ?? [])
        .filter(({ id }) => nextMasterEntityIds.has(id))
        .map(({ portraitPath }) => portraitPath ?? null)
        .filter((path): path is string => path !== null),
    );
    portraitResources?.retainPublicPaths(publicPortraitPaths);
    portraitResources?.retainMasterPaths(masterPortraitPaths);
    isRestoringFromHistory = true;

    try {
      catalog = nextCatalogState.compatibility;
      publicBeta02Catalog = nextCatalogState.beta02;
      beta02Catalog = effectiveBeta02;
      placeFiltersController.setCatalogState(catalog, publicBeta02Catalog);
      placeSearchController.setCatalogState(catalog, beta02Catalog);
      const previousMarkersById = new Map(renderedMarkers.map((pin) => [pin.id, pin]));
      const nextRenderedMarkers = createAtlasPinMarkerModels(catalog, beta02Catalog);
      const eagerPortraitPinIds = new Set<string>();
      for (const pin of nextRenderedMarkers) {
        if (!pin.portraitPath) continue;
        const previousPin = previousMarkersById.get(pin.id);
        const previousAccess =
          previousPin?.entityId && previousMasterEntityIds.has(previousPin.entityId)
            ? 'master'
            : 'public';
        const nextAccess =
          pin.entityId && nextMasterEntityIds.has(pin.entityId) ? 'master' : 'public';
        const moved =
          Boolean(previousPin) &&
          (previousPin!.coordinate[0] !== pin.coordinate[0] ||
            previousPin!.coordinate[1] !== pin.coordinate[1]);
        if (
          (!previousPin && nextAccess === 'master') ||
          (previousPin &&
            (previousPin.portraitPath !== pin.portraitPath ||
              previousAccess !== nextAccess ||
              moved))
        ) {
          eagerPortraitPinIds.add(pin.id);
        }
      }
      renderedMarkers = nextRenderedMarkers;
      mapController.setMarkers(renderedMarkers, { eagerPortraitPinIds });
      masterPinVisuals.refresh(renderedMarkers, masterEntityIds);
      masterSearchVisuals.refresh(masterEntityIds);
      if (initialPublicRefreshSettled) {
        restorePendingInitialFilters();
      }
      geographicNameId = resolveGeographicName(previousGeographicNameId)?.id ?? null;
      if (previousGeographicNameId && !geographicNameId) {
        mapController.clearSearchFocus();
      }

      const nextActivePlaceId =
        previousActivePlaceId && validPlaceIds.has(previousActivePlaceId)
          ? previousActivePlaceId
          : null;

      if (nextActivePlaceId) {
        renderActivePlace(nextActivePlaceId, { focusDetails: false, locate: false });
      } else {
        selection.clear();
        renderActivePlace(null, { focusDetails: false, locate: false });

        if (activeSupplementalPin) {
          const updatedPin = renderedMarkers.find(({ id }) => id === activeSupplementalPin?.id);
          if (updatedPin && showCompactDetails(updatedPin, false)) {
            activeSupplementalPin = updatedPin;
          } else {
            activeSupplementalPin = null;
            compactDetailsController.hide();
          }
        }
      }
    } finally {
      isRestoringFromHistory = false;
    }

    writePublicStateToHistory('replace');
  }

  publicDataRuntime?.subscribeCatalogState((state) => {
    initialPublicRefreshSettled = true;
    applyCatalogState(state, true);
  });

  if (publicDataRuntime) {
    window.addEventListener(
      'atlas:public-data-status',
      () => {
        queueMicrotask(() => {
          if (initialPublicRefreshSettled) return;

          initialPublicRefreshSettled = true;
          if (!pendingInitialFilterUrl) return;

          isRestoringFromHistory = true;
          try {
            restorePendingInitialFilters();
            updateMatchingPlaces();
          } finally {
            isRestoringFromHistory = false;
          }
          writePublicStateToHistory('replace');
        });
      },
      { once: true },
    );
  }

  const refreshAfterAudienceChange = async (audience: MapEntityAudience): Promise<void> => {
    if (!publicDataRuntime) return;
    const masterEnabled = masterModeRuntime?.controller.getState().enabled === true;

    if (audience === 'master') {
      // Remove the entity from the public projection first so a stale private catalog
      // can never create a public/private duplicate in memory.
      await publicDataRuntime.refresh();
      if (masterEnabled) await masterModeRuntime?.controller.reload();
    } else {
      // Remove it from private memory first, then let the public projection expose it.
      if (masterEnabled) await masterModeRuntime?.controller.reload();
      await publicDataRuntime.refresh();
    }
  };

  if (adminRuntime && publicDataRuntime) {
    adminRuntime.authController.subscribe((authState) => {
      if (authState.phase !== 'authorized') portraitResources?.clearPrivate();
    });
    masterModeRuntime = bootstrapMasterModeRuntime(app, adminRuntime);
    masterModeRuntime.controller.subscribe(() => applyCatalogState(catalogState, true));

    mountMasterDetailActions(app, adminRuntime.mapEntityController, {
      getMasterEntityIds: () => masterEntityIds,
      onAudienceChanged: async (_entityId, audience) => refreshAfterAudienceChange(audience),
    });

    let previousEntityRevisions: ReadonlyMap<string, AdminEntityProjectionRevision> | null = null;
    adminRuntime.mapEntityController.subscribe((state) => {
      if (state.phase !== 'ready') return;
      const nextEntityRevisions = new Map<string, AdminEntityProjectionRevision>(
        state.records.map((record) => [
          record.id,
          {
            audience: record.audience ?? 'public',
            publicationStatus: record.publicationStatus,
            updatedAt: record.updatedAt,
          },
        ]),
      );
      if (previousEntityRevisions) {
        for (const [entityId, revision] of nextEntityRevisions) {
          const previous = previousEntityRevisions.get(entityId);
          if (
            previous &&
            previous.updatedAt === revision.updatedAt &&
            previous.audience === revision.audience &&
            previous.publicationStatus === revision.publicationStatus
          ) {
            continue;
          }

          const wasPublic =
            previous?.publicationStatus === 'published' && previous.audience === 'public';
          const isPublic =
            revision.publicationStatus === 'published' && revision.audience === 'public';
          const wasMaster =
            previous?.publicationStatus === 'published' && previous.audience === 'master';
          const isMaster =
            revision.publicationStatus === 'published' && revision.audience === 'master';
          if (!wasPublic && !isPublic && !wasMaster && !isMaster) continue;

          if (previous && previous.audience !== revision.audience) {
            void refreshAfterAudienceChange(revision.audience);
          } else if (wasMaster || isMaster) {
            if (masterModeRuntime?.controller.getState().enabled === true) {
              void masterModeRuntime.controller.reload();
            }
          } else if (wasPublic || isPublic) {
            void publicDataRuntime.refresh();
          }
          break;
        }
      }
      previousEntityRevisions = nextEntityRevisions;
    });
  }

  function restorePublicStateFromUrl(sourceUrl: URL): void {
    invalidateDeferredSelectionAnnouncement();
    const shouldPreserveUnknownFilters =
      !initialPublicRefreshSettled &&
      publicDataRuntime !== undefined &&
      hasUnknownPublicFilterParameters(sourceUrl);
    const parsed = parsePublicAppUrlState(catalog, sourceUrl, publicBeta02Catalog);
    const requestedGeographicName = resolveGeographicName(parsed.state.geographicNameId);

    pendingInitialFilterUrl = shouldPreserveUnknownFilters ? new URL(sourceUrl) : null;

    isRestoringFromHistory = true;

    try {
      if (activeSupplementalPin) {
        activeSupplementalPin = null;
        compactDetailsController.hide();
        clearSupplementalMapSelection();
      }

      placeSearchController.setQuery(parsed.state.query, { notify: false });
      placeFiltersController.setState(
        {
          selectedCategoryIds: parsed.state.selectedCategoryIds,
          selectedTagIds: parsed.state.selectedTagIds,
        },
        { notify: false },
      );

      geographicNameId = requestedGeographicName?.id ?? null;

      if (parsed.state.activePlaceId) {
        selection.select(parsed.state.activePlaceId);
      } else {
        selection.clear();
      }

      renderActivePlace(parsed.state.activePlaceId, {
        focusDetails: false,
        locate: Boolean(parsed.state.activePlaceId) && !requestedGeographicName,
      });

      if (requestedGeographicName) {
        locateGeographicName(requestedGeographicName);
      } else if (!parsed.state.activePlaceId) {
        mapController.clearSearchFocus();
      }
    } finally {
      isRestoringFromHistory = false;
    }

    writePublicStateToHistory('replace');
  }

  selection.subscribe((activePlaceId) => {
    if (isRestoringFromHistory) return;

    renderActivePlace(activePlaceId, {
      focusDetails: true,
      locate: false,
    });
    writePublicStateToHistory('push');
  });

  window.addEventListener('popstate', () => {
    restorePublicStateFromUrl(new URL(window.location.href));
  });

  restorePublicStateFromUrl(new URL(window.location.href));
}

function unavailableCatalogState(catalog: CampaignCatalog): PublicCatalogState {
  return {
    availability: 'unavailable',
    checksum: null,
    beta02: null,
    compatibility: catalog,
    campaigns: [],
    selectedCampaign: null,
  };
}

function startMapExperience(): void {
  app.innerHTML = renderApp();
  mountCollapsibleMapControls(app);
  const adminRuntime = bootstrapAdminAuthRuntime(app);
  mountAdminPinVisualSync(app);

  void bootstrapPublicDataRuntime(app, campaignCatalog)
    .then((publicDataRuntime) =>
      mountPublicExperience(publicDataRuntime.getCatalogState(), publicDataRuntime, adminRuntime),
    )
    .catch(() =>
      mountPublicExperience(unavailableCatalogState(campaignCatalog), undefined, adminRuntime),
    );
}

function startFullEntityExperience(sourceUrl: URL): void {
  const request = parseFullEntityUrlRequest(sourceUrl);

  if (!request) {
    startMapExperience();
    return;
  }

  app.innerHTML = renderFullEntityDetailsShell();
  const mapUrl = new URL(sourceUrl);
  const campaignSlug = mapUrl.searchParams.get('campaign')?.trim() || INITIAL_PUBLIC_CAMPAIGN_SLUG;
  mapUrl.search = '';
  mapUrl.searchParams.set('campaign', campaignSlug);
  mapUrl.hash = '';
  const portraitResources = createPortraitResources();
  const detailsController = mountFullEntityDetails(app, mapUrl, {
    loadPortrait(details, signal) {
      if (!portraitResources || !details.portraitPath) return Promise.resolve(null);
      return portraitResources.load(details.portraitPath, {
        access: 'public',
        variant: 'detail',
        signal,
      });
    },
  });

  if (!request.slug) {
    detailsController.showUnavailable();
    void bootstrapPublicDataRuntime(app, campaignCatalog).catch(() => undefined);
    return;
  }

  if (!request.isCanonical && request.canonicalUrl) {
    window.history.replaceState(window.history.state, '', request.canonicalUrl);
  }

  void bootstrapPublicDataRuntime(app, campaignCatalog)
    .then((runtime) => {
      const renderCatalogState = ({ beta02 }: PublicCatalogState): void => {
        if (!beta02) {
          detailsController.showUnavailable();
          return;
        }

        const details = resolveFullEntityDetail(beta02, request.slug!);
        if (details) {
          detailsController.show(details);
        } else {
          detailsController.showUnavailable();
        }
      };

      renderCatalogState(runtime.getCatalogState());
      runtime.subscribeCatalogState(renderCatalogState);
    })
    .catch(() => detailsController.showUnavailable());
}

startFullEntityExperience(new URL(window.location.href));
