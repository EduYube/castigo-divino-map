import 'leaflet/dist/leaflet.css';

import { bootstrapAdminAuthRuntime } from './app/adminAuthRuntime';
import { mountAdminPinVisualSync } from './app/adminPinVisualSync';
import { mountCollapsibleMapControls } from './app/collapsibleControls';
import { mountCompactPinDetails } from './app/compactPinDetails';
import { mountFullEntityDetails, renderFullEntityDetailsShell } from './app/fullEntityDetails';
import { createFullEntityUrl, parseFullEntityUrlRequest } from './app/fullEntityUrl';
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
import { campaignCatalog } from './data/catalog';
import { buildCompactPinDetailModel } from './data/compactPinDetails';
import { deriveMatchingPublicPlaceIds } from './data/filters';
import { resolveFullEntityDetail } from './data/fullEntityDetails';
import type { CampaignCatalog, PlaceId } from './data/model';
import { createAtlasPinMarkerModels, type AtlasPinMarkerModel } from './data/pinMarkers';
import type { AtlasSearchResult } from './data/search';
import { getPinTypeVisual } from './domain/pinVisualSystem';
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
): void {
  let isRestoringFromHistory = false;
  let catalogState = initialCatalogState;
  let catalog = initialCatalogState.compatibility;
  let beta02Catalog = initialCatalogState.beta02;
  let renderedMarkers = createAtlasPinMarkerModels(catalog, beta02Catalog);
  let activeSupplementalPin: AtlasPinMarkerModel | null = null;
  const selection = createPlaceSelectionController();
  const mapSearchStatus = app.querySelector<HTMLElement>('[data-map-search-status]');

  const focusPinControl = (pin: AtlasPinMarkerModel): void => {
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
    onPinActivate(pin): void {
      if (pin.legacyPlaceId) {
        activeSupplementalPin = null;
        selection.select(pin.legacyPlaceId);
        return;
      }

      activeSupplementalPin = pin;
      selection.clear();

      if (!showCompactDetails(pin, true)) {
        activeSupplementalPin = null;
        return;
      }

      mapController.map.invalidateSize({ animate: false, pan: false });

      window.requestAnimationFrame(() => {
        if (!mapSearchStatus) return;
        const type = getPinTypeVisual(pin.entityType).label.toLocaleLowerCase('es');
        mapSearchStatus.textContent = `${pin.name}, ${type}, seleccionado en el mapa. Ficha compacta abierta.`;
      });
    },
  });
  mountPublicPinRequest(app, mapController.map);

  const compactDetailsPanel = app.querySelector<HTMLElement>('[data-place-details]');
  const mobileCompactDetailsMedia = window.matchMedia(MOBILE_COMPACT_DETAILS_QUERY);
  const keepPinVisibleWithCompactDetails = (pin: AtlasPinMarkerModel): void => {
    if (!mobileCompactDetailsMedia.matches) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (!mobileCompactDetailsMedia.matches || !compactDetailsPanel || compactDetailsPanel.hidden) {
        return;
      }

      const sheetHeight = compactDetailsPanel.getBoundingClientRect().height;
      const edgePadding = 20;
      mapController.map.invalidateSize({ animate: false, pan: false });
      mapController.map.panInside([pin.coordinate[0], pin.coordinate[1]], {
        animate: false,
        paddingTopLeft: [edgePadding, edgePadding],
        paddingBottomRight: [edgePadding, Math.ceil(sheetHeight + edgePadding)],
      });
    });
  };

  const clearSupplementalMapSelection = (pin: AtlasPinMarkerModel): void => {
    mapController.setMarkers(renderedMarkers.filter(({ id }) => id !== pin.id));
    mapController.setMarkers(renderedMarkers);
  };

  const compactDetailsController = mountCompactPinDetails(app, {
    onClose(): void {
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
      clearSupplementalMapSelection(supplementalPin);
      window.requestAnimationFrame(() => focusPinControl(supplementalPin));
    },
    createFullDetailsUrl(details): string | null {
      if (!details.entitySlug) {
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
    keepPinVisibleWithCompactDetails(pin);
    return true;
  }

  const showLegacyPlaceDetails = (placeId: PlaceId, focus: boolean): boolean => {
    const marker = renderedMarkers.find(({ legacyPlaceId }) => legacyPlaceId === placeId);

    return marker ? showCompactDetails(marker, focus) : false;
  };

  const placeFiltersController = mountPlaceFilters(app, {
    catalog,
    onChange(): void {
      updateMatchingPlaces();
      writePublicStateToHistory('push');
    },
  });

  const openLegacyPlace = (placeId: PlaceId): void => {
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
      updateMatchingPlaces();
      writePublicStateToHistory('replace');
    },
    onSelect(result): void {
      if (result.type === 'location' && result.legacyPlaceId) {
        openLegacyPlace(result.legacyPlaceId);
        return;
      }

      if (activeSupplementalPin) {
        const supplementalPin = activeSupplementalPin;
        activeSupplementalPin = null;
        compactDetailsController.hide();
        clearSupplementalMapSelection(supplementalPin);
      }
      selection.clear();
      mapController.locateSearchTarget({
        coordinates: result.coordinates,
        recommendedZoom: result.recommendedZoom,
        label: describeSearchTarget(result),
      });
    },
    onOpenPlace(placeId): void {
      openLegacyPlace(placeId);
    },
  });
  placeSearchController.setCatalogState(catalog, beta02Catalog);

  function getCurrentPublicState(): PublicAppUrlState {
    const filters = placeFiltersController.getState();

    return {
      activePlaceId: selection.getActivePlaceId(),
      query: placeSearchController.getQuery(),
      selectedCategoryIds: filters.selectedCategoryIds,
      selectedTagIds: filters.selectedTagIds,
    };
  }

  function writePublicStateToHistory(mode: 'push' | 'replace'): void {
    if (isRestoringFromHistory) {
      return;
    }

    const currentUrl = new URL(window.location.href);
    const nextUrl = createCanonicalPublicAppUrl(catalog, currentUrl, getCurrentPublicState());

    if (nextUrl.href === currentUrl.href) {
      return;
    }

    if (mode === 'push') {
      window.history.pushState(window.history.state, '', nextUrl);
    } else {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }

  function updateMatchingPlaces(): void {
    const matchingPlaceIds = deriveMatchingPublicPlaceIds(
      catalog,
      placeSearchController.getQuery(),
      placeFiltersController.getState(),
    );
    const matchingPlaceIdSet = new Set(matchingPlaceIds);
    const activePlaceId = selection.getActivePlaceId();

    mapController.setMatchingPlaces(matchingPlaceIdSet);
    placeFiltersController.setMatchSummary(
      matchingPlaceIds.length,
      activePlaceId ? matchingPlaceIdSet.has(activePlaceId) : null,
    );
  }

  function renderActivePlace(
    activePlaceId: PlaceId | null,
    options: { readonly focusDetails: boolean; readonly locate: boolean },
  ): void {
    mapController.setActivePlace(activePlaceId);
    updateMatchingPlaces();

    if (!activePlaceId) {
      if (!activeSupplementalPin) {
        compactDetailsController.hide();
      }
      return;
    }

    activeSupplementalPin = null;

    if (options.locate) {
      mapController.locatePlace(activePlaceId);
    }

    if (!showLegacyPlaceDetails(activePlaceId, options.focusDetails)) {
      selection.clear();
    }
  }

  function applyCatalogState(nextCatalogState: PublicCatalogState): void {
    if (isSameCatalogState(catalogState, nextCatalogState)) {
      return;
    }

    catalogState = nextCatalogState;
    const previousActivePlaceId = selection.getActivePlaceId();
    const validPlaceIds = new Set(nextCatalogState.compatibility.places.map(({ id }) => id));

    isRestoringFromHistory = true;

    try {
      catalog = nextCatalogState.compatibility;
      beta02Catalog = nextCatalogState.beta02;
      placeFiltersController.setCatalog(catalog);
      placeSearchController.setCatalogState(catalog, beta02Catalog);
      renderedMarkers = createAtlasPinMarkerModels(catalog, beta02Catalog);
      mapController.setMarkers(renderedMarkers);

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

  publicDataRuntime?.subscribeCatalogState(applyCatalogState);

  function restorePublicStateFromUrl(sourceUrl: URL): void {
    const parsed = parsePublicAppUrlState(catalog, sourceUrl);

    isRestoringFromHistory = true;

    try {
      if (activeSupplementalPin) {
        const supplementalPin = activeSupplementalPin;
        activeSupplementalPin = null;
        compactDetailsController.hide();
        clearSupplementalMapSelection(supplementalPin);
      }

      placeSearchController.setQuery(parsed.state.query, { notify: false });
      placeFiltersController.setState(
        {
          selectedCategoryIds: parsed.state.selectedCategoryIds,
          selectedTagIds: parsed.state.selectedTagIds,
        },
        { notify: false },
      );

      if (parsed.state.activePlaceId) {
        selection.select(parsed.state.activePlaceId);
      } else {
        selection.clear();
      }

      renderActivePlace(parsed.state.activePlaceId, {
        focusDetails: false,
        locate: Boolean(parsed.state.activePlaceId),
      });
    } finally {
      isRestoringFromHistory = false;
    }

    if (!parsed.isCanonical) {
      window.history.replaceState(window.history.state, '', parsed.canonicalUrl);
    }
  }

  selection.subscribe((activePlaceId) => {
    if (isRestoringFromHistory) {
      return;
    }

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
  };
}

function startMapExperience(): void {
  app.innerHTML = renderApp();
  mountCollapsibleMapControls(app);
  bootstrapAdminAuthRuntime(app);
  mountAdminPinVisualSync(app);

  void bootstrapPublicDataRuntime(app, campaignCatalog)
    .then((publicDataRuntime) =>
      mountPublicExperience(publicDataRuntime.getCatalogState(), publicDataRuntime),
    )
    .catch(() => mountPublicExperience(unavailableCatalogState(campaignCatalog)));
}

function startFullEntityExperience(sourceUrl: URL): void {
  const request = parseFullEntityUrlRequest(sourceUrl);

  if (!request) {
    startMapExperience();
    return;
  }

  app.innerHTML = renderFullEntityDetailsShell();
  const mapUrl = new URL(sourceUrl);
  mapUrl.search = '';
  mapUrl.hash = '';
  const detailsController = mountFullEntityDetails(app, mapUrl);

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
      runtime.subscribeCatalogState(({ beta02 }) => {
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
      });
    })
    .catch(() => detailsController.showUnavailable());
}

startFullEntityExperience(new URL(window.location.href));
