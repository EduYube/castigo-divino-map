import 'leaflet/dist/leaflet.css';

import { mountPlaceDetails } from './app/placeDetails';
import {
  mountPlaceFilters,
  type PlaceFiltersController,
} from './app/placeFilters';
import { mountPlaceSearch, type PlaceSearchController } from './app/placeSearch';
import { createPlaceSelectionController } from './app/placeSelection';
import { renderApp } from './app/renderApp';
import { campaignCatalog } from './data/catalog';
import {
  deriveMatchingPublicPlaceIds,
  EMPTY_PUBLIC_PLACE_FILTER_STATE,
} from './data/filters';
import type { PlaceId } from './data/model';
import { buildPlaceDetailModel, createPlaceMarkerModels } from './data/placeDetails';
import { mountFaerunMap } from './map/leaflet';
import './styles/main.css';
import './styles/search.css';
import './styles/filters.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('No se encontró el elemento raíz de la aplicación.');
}

app.innerHTML = renderApp();

const selection = createPlaceSelectionController();
const mapController = mountFaerunMap(app, {
  markers: createPlaceMarkerModels(campaignCatalog),
  onPlaceActivate(placeId): void {
    selection.select(placeId);
  },
});

const placeDetailsController = mountPlaceDetails(app, {
  onClose(): void {
    const previouslyActivePlaceId = selection.getActivePlaceId();

    selection.clear();

    if (previouslyActivePlaceId) {
      window.requestAnimationFrame(() => mapController.focusMarker(previouslyActivePlaceId));
    }
  },
});

const showPlaceDetails = (placeId: PlaceId): boolean => {
  const details = buildPlaceDetailModel(campaignCatalog, placeId);

  if (!details) {
    return false;
  }

  placeDetailsController.show(details);
  return true;
};

let placeFiltersController: PlaceFiltersController | undefined;
let placeSearchController: PlaceSearchController | undefined;

const updateMatchingPlaces = (): void => {
  const matchingPlaceIds = deriveMatchingPublicPlaceIds(
    campaignCatalog,
    placeSearchController?.getQuery() ?? '',
    placeFiltersController?.getState() ?? EMPTY_PUBLIC_PLACE_FILTER_STATE,
  );
  const matchingPlaceIdSet = new Set(matchingPlaceIds);
  const activePlaceId = selection.getActivePlaceId();

  mapController.setMatchingPlaces(matchingPlaceIdSet);
  placeFiltersController?.setMatchSummary(
    matchingPlaceIds.length,
    activePlaceId ? matchingPlaceIdSet.has(activePlaceId) : null,
  );
};

placeFiltersController = mountPlaceFilters(app, {
  catalog: campaignCatalog,
  onChange: updateMatchingPlaces,
});

placeSearchController = mountPlaceSearch(app, {
  catalog: campaignCatalog,
  onQueryChange: updateMatchingPlaces,
  onSelect(placeId): void {
    const wasAlreadyActive = selection.getActivePlaceId() === placeId;

    mapController.locatePlace(placeId);
    selection.select(placeId);

    if (wasAlreadyActive && !showPlaceDetails(placeId)) {
      selection.clear();
    }
  },
});

selection.subscribe((activePlaceId) => {
  mapController.setActivePlace(activePlaceId);
  updateMatchingPlaces();

  if (!activePlaceId) {
    placeDetailsController.hide();
    return;
  }

  if (!showPlaceDetails(activePlaceId)) {
    selection.clear();
  }
});

updateMatchingPlaces();
