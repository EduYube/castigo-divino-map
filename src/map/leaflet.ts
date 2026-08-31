import type { PlaceId } from '../data/model';
import type { AtlasPinMarkerModel } from '../data/pinMarkers';
import {
  mountCampaignRegions,
  type AtlasRegionMarkerModel,
  type RegionMatchingSemantics,
} from './campaignRegions';
import {
  mountFaerunMap as mountPointFaerunMap,
  type FaerunMapController,
  type FaerunMapMarkerUpdateOptions,
  type FaerunMapOptions,
  type MapSearchTarget,
} from './leafletBase';

export type {
  FaerunMapController,
  FaerunMapMarkerUpdateOptions,
  FaerunMapOptions,
  MapLoadState,
  MapSearchTarget,
  PinMatchingSemantics,
} from './leafletBase';

function isRegion(marker: AtlasPinMarkerModel): marker is AtlasRegionMarkerModel {
  return marker.mapPresentation?.kind === 'polygon';
}

function searchTargetMatchesPin(target: MapSearchTarget, pin: AtlasPinMarkerModel): boolean {
  const sameCoordinate =
    pin.coordinate[0] === target.coordinates.y && pin.coordinate[1] === target.coordinates.x;
  if (!sameCoordinate) return false;

  const normalizedLabel = target.label.trim().toLocaleLowerCase('es');
  const normalizedName = pin.name.trim().toLocaleLowerCase('es');
  return (
    normalizedLabel === normalizedName ||
    normalizedLabel.startsWith(`${normalizedName},`) ||
    normalizedLabel.startsWith(`${normalizedName}.`)
  );
}

function splitMarkers(markers: readonly AtlasPinMarkerModel[]): {
  readonly points: readonly AtlasPinMarkerModel[];
  readonly regions: readonly AtlasRegionMarkerModel[];
} {
  const points: AtlasPinMarkerModel[] = [];
  const regions: AtlasRegionMarkerModel[] = [];
  markers.forEach((marker) => {
    if (isRegion(marker)) regions.push(marker);
    else points.push(marker);
  });
  return { points, regions };
}

export function mountFaerunMap(
  root: ParentNode = document,
  options: FaerunMapOptions = {},
): FaerunMapController {
  let renderedMarkers = options.markers ?? [];
  let activePlaceId: PlaceId | null = null;
  let activeSupplementalPinId: string | null = null;
  let matchingPinIds = new Set(renderedMarkers.map(({ id }) => id));
  let matchingSemantics: RegionMatchingSemantics = 'search-and-filters';
  const initial = splitMarkers(renderedMarkers);

  const pointController = mountPointFaerunMap(root, {
    ...options,
    markers: initial.points,
    onPinActivate(pin): void {
      if (pin.legacyPlaceId) {
        activePlaceId = pin.legacyPlaceId;
        activeSupplementalPinId = null;
      } else {
        activePlaceId = null;
        activeSupplementalPinId = pin.id;
      }
      options.onPinActivate?.(pin);
      synchronizeRegionPresentation();
    },
  });

  const regionController = mountCampaignRegions(root, pointController.map, {
    regions: initial.regions,
    onActivate(region): void {
      pointController.clearSearchFocus();
      synchronizePointSelectionForRegion(region);
      if (region.legacyPlaceId) {
        activePlaceId = region.legacyPlaceId;
        activeSupplementalPinId = null;
      } else {
        activePlaceId = null;
        activeSupplementalPinId = region.id;
      }
      options.onPinActivate?.(region);
      synchronizeRegionPresentation();
      announceActiveRegion(region, `${region.name}, región de campaña, seleccionada en el mapa.`);
    },
  });

  function activeRegionId(): string | null {
    const active = renderedMarkers.find(
      (marker) =>
        isRegion(marker) &&
        (marker.legacyPlaceId
          ? marker.legacyPlaceId === activePlaceId
          : marker.id === activeSupplementalPinId),
    );
    return active?.id ?? null;
  }

  function announceActiveRegion(region: AtlasRegionMarkerModel, message: string): void {
    window.requestAnimationFrame(() => {
      if (activeRegionId() !== region.id) return;
      const status = root.querySelector<HTMLElement>('[data-map-search-status]');
      if (status) status.textContent = message;
    });
  }

  function synchronizePointSelectionForRegion(region: AtlasRegionMarkerModel): void {
    if (region.legacyPlaceId) {
      pointController.setActivePlace(region.legacyPlaceId);
      return;
    }
    pointController.setActivePlace(null);
    pointController.clearSupplementalPinSelection();
  }

  function synchronizeRegionPresentation(): void {
    regionController.setActiveRegion(activeRegionId());
    regionController.setMatchingRegions(matchingPinIds, matchingSemantics);
  }

  function clearRegionFocusMetadata(): void {
    delete pointController.map.getContainer().dataset.regionFocusBounds;
  }

  function findRegionByPlace(placeId: PlaceId): AtlasRegionMarkerModel | undefined {
    return renderedMarkers.find(
      (marker): marker is AtlasRegionMarkerModel =>
        isRegion(marker) && marker.legacyPlaceId === placeId,
    );
  }

  function findRegionBySearchTarget(target: MapSearchTarget): AtlasRegionMarkerModel | undefined {
    // MAP-041 geographic navigation is an independent transient overlay. Even if a
    // geographic label happens to share a name and representative coordinate with
    // a persistent region, it must keep its own point/extent semantics.
    if (target.label.toLocaleLowerCase('es').includes(', lugar geográfico')) return undefined;
    return renderedMarkers.find(
      (marker): marker is AtlasRegionMarkerModel =>
        isRegion(marker) && searchTargetMatchesPin(target, marker),
    );
  }

  synchronizeRegionPresentation();

  return {
    map: pointController.map,
    setMarkers(markers, updateOptions: FaerunMapMarkerUpdateOptions = {}): void {
      // Purge old polygon DOM/bounds before adopting the next catalog. This is
      // intentionally synchronous so a Master region cannot flash across campaign
      // changes, logout, OFF or a 401/403-driven catalog downgrade.
      regionController.setRegions([]);
      clearRegionFocusMetadata();
      renderedMarkers = markers;
      if (
        activeSupplementalPinId &&
        !renderedMarkers.some(({ id }) => id === activeSupplementalPinId)
      ) {
        activeSupplementalPinId = null;
      }
      if (
        activePlaceId &&
        !renderedMarkers.some(({ legacyPlaceId }) => legacyPlaceId === activePlaceId)
      ) {
        activePlaceId = null;
      }
      const next = splitMarkers(markers);
      pointController.setMarkers(next.points, updateOptions);
      regionController.setRegions(next.regions);
      synchronizeRegionPresentation();
    },
    setActivePlace(placeId): void {
      activePlaceId = placeId;
      if (placeId !== null) activeSupplementalPinId = null;
      pointController.setActivePlace(placeId);
      synchronizeRegionPresentation();
    },
    clearSupplementalPinSelection(): void {
      activeSupplementalPinId = null;
      pointController.clearSupplementalPinSelection();
      synchronizeRegionPresentation();
    },
    setMatchingPins(pinIds, semantics = 'search-and-filters'): void {
      matchingPinIds = new Set(pinIds);
      matchingSemantics = semantics;
      pointController.setMatchingPins(pinIds, semantics);
      synchronizeRegionPresentation();
    },
    locatePlace(placeId): void {
      const region = findRegionByPlace(placeId);
      if (region) {
        pointController.clearSearchFocus();
        regionController.locateRegion(region.id, region.name);
        return;
      }
      clearRegionFocusMetadata();
      pointController.locatePlace(placeId);
    },
    locateSearchTarget(target): void {
      const region = findRegionBySearchTarget(target);
      if (region) {
        synchronizePointSelectionForRegion(region);
        if (region.legacyPlaceId) {
          activePlaceId = region.legacyPlaceId;
          activeSupplementalPinId = null;
        } else {
          activePlaceId = null;
          activeSupplementalPinId = region.id;
        }
        options.onPinActivate?.(region);
        synchronizeRegionPresentation();
        pointController.clearSearchFocus();
        regionController.locateRegion(region.id, target.label);
        announceActiveRegion(region, `Mapa encuadrado en ${target.label}; región de campaña.`);
        return;
      }
      clearRegionFocusMetadata();
      pointController.locateSearchTarget(target);
    },
    clearSearchFocus(): void {
      clearRegionFocusMetadata();
      pointController.clearSearchFocus();
    },
    focusMarker(placeId): void {
      const region = findRegionByPlace(placeId);
      if (region) {
        regionController.focusRegion(region.id);
        return;
      }
      pointController.focusMarker(placeId);
    },
    destroy(): void {
      regionController.destroy();
      pointController.destroy();
    },
  };
}
