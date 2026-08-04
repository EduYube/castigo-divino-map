import 'leaflet/dist/leaflet.css';

import { mountPlaceDetails } from './app/placeDetails';
import { createPlaceSelectionController } from './app/placeSelection';
import { renderApp } from './app/renderApp';
import { campaignCatalog } from './data/catalog';
import { buildPlaceDetailModel, createPlaceMarkerModels } from './data/placeDetails';
import { mountFaerunMap, type FaerunMapController } from './map/leaflet';
import './styles/main.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('No se encontró el elemento raíz de la aplicación.');
}

app.innerHTML = renderApp();

const selection = createPlaceSelectionController();
let mapController: FaerunMapController | undefined;

const placeDetailsController = mountPlaceDetails(app, {
  onClose(): void {
    const previouslyActivePlaceId = selection.getActivePlaceId();

    selection.clear();

    if (previouslyActivePlaceId) {
      window.requestAnimationFrame(() => mapController?.focusMarker(previouslyActivePlaceId));
    }
  },
});

mapController = mountFaerunMap(app, {
  markers: createPlaceMarkerModels(campaignCatalog),
  onPlaceActivate(placeId): void {
    selection.select(placeId);
  },
});

selection.subscribe((activePlaceId) => {
  mapController?.setActivePlace(activePlaceId);

  if (!activePlaceId) {
    placeDetailsController.hide();
    return;
  }

  const details = buildPlaceDetailModel(campaignCatalog, activePlaceId);

  if (!details) {
    selection.clear();
    return;
  }

  placeDetailsController.show(details);
});
