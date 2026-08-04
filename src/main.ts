import 'leaflet/dist/leaflet.css';

import { mountPlaceDetails } from './app/placeDetails';
import { mountPlaceSearch } from './app/placeSearch';
import { createPlaceSelectionController } from './app/placeSelection';
import { renderApp } from './app/renderApp';
import { campaignCatalog } from './data/catalog';
import type { PlaceId } from './data/model';
import { buildPlaceDetailModel, createPlaceMarkerModels } from './data/placeDetails';
import { mountFaerunMap } from './map/leaflet';
import './styles/main.css';
import './styles/search.css';

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

selection.subscribe((activePlaceId) => {
  mapController.setActivePlace(activePlaceId);

  if (!activePlaceId) {
    placeDetailsController.hide();
    return;
  }

  if (!showPlaceDetails(activePlaceId)) {
    selection.clear();
  }
});

mountPlaceSearch(app, {
  catalog: campaignCatalog,
  onSelect(placeId): void {
    const wasAlreadyActive = selection.getActivePlaceId() === placeId;

    mapController.locatePlace(placeId);
    selection.select(placeId);

    if (wasAlreadyActive && !showPlaceDetails(placeId)) {
      selection.clear();
    }
  },
});
