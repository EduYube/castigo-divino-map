import 'leaflet/dist/leaflet.css';

import { bootstrapAdminAuthRuntime } from './app/adminAuthRuntime';
import { mountPlaceDetails } from './app/placeDetails';
import { mountPlaceFilters } from './app/placeFilters';
import {
  bootstrapPublicDataRuntime,
  type PublicDataRuntime,
} from './app/publicDataRuntime';
import { mountPlaceSearch } from './app/placeSearch';
import { createPlaceSelectionController } from './app/placeSelection';
import { renderApp } from './app/renderApp';
import {
  createCanonicalPublicAppUrl,
  parsePublicAppUrlState,
  type PublicAppUrlState,
} from './app/urlState';
import { campaignCatalog } from './data/catalog';
import { deriveMatchingPublicPlaceIds } from './data/filters';
import type { CampaignCatalog, PlaceId } from './data/model';
import {
  buildPlaceDetailModel,
  createPlaceMarkerModels,
} from './data/placeDetails';
import type { AtlasSearchResult } from './data/search';
import { mountFaerunMap } from './map/leaflet';
import './styles/main.css';
import './styles/search.css';
import './styles/filters.css';
import './styles/backend-status.css';
import './styles/admin-auth.css';
import './styles/accessibility.css';

const appElement = document.querySelector<HTMLDivElement>('#app');

if (!appElement) {
  throw new Error('No se encontró el elemento raíz de la aplicación.');
}

const app = appElement;
app.innerHTML = renderApp();
bootstrapAdminAuthRuntime(app);

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

function mountPublicExperience(
  catalog: CampaignCatalog,
  publicDataRuntime?: PublicDataRuntime,
): void {
  let isRestoringFromHistory = false;
  const selection = createPlaceSelectionController();
  const mapController = mountFaerunMap(app, {
    markers: createPlaceMarkerModels(catalog),
    onPlaceActivate(placeId): void {
      selection.select(placeId);
    },
  });

  const placeDetailsController = mountPlaceDetails(app, {
    onClose(): void {
      const previouslyActivePlaceId = selection.getActivePlaceId();

      selection.clear();

      if (previouslyActivePlaceId) {
        window.requestAnimationFrame(() =>
          mapController.focusMarker(previouslyActivePlaceId),
        );
      }
    },
  });

  const showPlaceDetails = (placeId: PlaceId, focus: boolean): boolean => {
    const details = buildPlaceDetailModel(catalog, placeId);

    if (!details) {
      return false;
    }

    placeDetailsController.show(details, { focus });
    return true;
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

    mapController.locatePlace(placeId);
    selection.select(placeId);

    if (wasAlreadyActive && !showPlaceDetails(placeId, true)) {
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

  publicDataRuntime?.subscribeBeta02Catalog((beta02Catalog) => {
    placeSearchController.setBeta02Catalog(beta02Catalog);
  });

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
    const nextUrl = createCanonicalPublicAppUrl(
      catalog,
      currentUrl,
      getCurrentPublicState(),
    );

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
      placeDetailsController.hide();
      return;
    }

    if (options.locate) {
      mapController.locatePlace(activePlaceId);
    }

    if (!showPlaceDetails(activePlaceId, options.focusDetails)) {
      selection.clear();
    }
  }

  function restorePublicStateFromUrl(sourceUrl: URL): void {
    const parsed = parsePublicAppUrlState(catalog, sourceUrl);

    isRestoringFromHistory = true;

    try {
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
      window.history.replaceState(
        window.history.state,
        '',
        parsed.canonicalUrl,
      );
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

void bootstrapPublicDataRuntime(app, campaignCatalog)
  .then((publicDataRuntime) =>
    mountPublicExperience(publicDataRuntime.catalog, publicDataRuntime),
  )
  .catch(() => mountPublicExperience(campaignCatalog));
