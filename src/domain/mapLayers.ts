import type { PublicMapEntity } from '../data/beta02-model';
import type { AtlasPinMarkerModel } from '../data/pinMarkers';
import type { AtlasSearchResult } from '../data/search';

export const MAP_LAYER_IDS = ['character', 'location', 'region', 'mission', 'hazard'] as const;

export type MapLayerId = (typeof MAP_LAYER_IDS)[number];

export interface MapLayerState {
  readonly activeLayerIds: readonly MapLayerId[];
}

export const ALL_MAP_LAYER_STATE: MapLayerState = {
  activeLayerIds: MAP_LAYER_IDS,
};

const MAP_LAYER_ID_SET = new Set<string>(MAP_LAYER_IDS);

export function isMapLayerId(value: string): value is MapLayerId {
  return MAP_LAYER_ID_SET.has(value);
}

export function normalizeMapLayerIds(values: readonly string[] | undefined): readonly MapLayerId[] {
  if (!values) return MAP_LAYER_IDS;
  const requested = new Set(values.filter(isMapLayerId));
  return MAP_LAYER_IDS.filter((layerId) => requested.has(layerId));
}

export function normalizeMapLayerState(state: MapLayerState): MapLayerState {
  return { activeLayerIds: normalizeMapLayerIds(state.activeLayerIds) };
}

export function getMapLayerForEntity(entity: PublicMapEntity): MapLayerId {
  if (entity.entityType === 'location' && entity.geometry?.kind === 'polygon') {
    return 'region';
  }
  return entity.entityType;
}

export function getMapLayerForMarker(marker: AtlasPinMarkerModel): MapLayerId {
  if (marker.mapPresentation?.kind === 'polygon') return 'region';
  return marker.entityType;
}

export function getMapLayerForSearchResult(result: AtlasSearchResult): MapLayerId | null {
  if (result.type === 'geographic') return null;
  return result.type;
}

export function isMapLayerEnabled(state: MapLayerState, layerId: MapLayerId): boolean {
  return state.activeLayerIds.includes(layerId);
}

export function isEntityVisibleForMapLayers(
  entity: PublicMapEntity,
  state: MapLayerState,
): boolean {
  return isMapLayerEnabled(state, getMapLayerForEntity(entity));
}

export function isMarkerVisibleForMapLayers(
  marker: AtlasPinMarkerModel,
  state: MapLayerState,
): boolean {
  return isMapLayerEnabled(state, getMapLayerForMarker(marker));
}

export function isSearchResultVisibleForMapLayers(
  result: AtlasSearchResult,
  state: MapLayerState,
  entityById?: ReadonlyMap<string, PublicMapEntity>,
): boolean {
  if (result.type === 'geographic') return true;
  if (result.linkedEntityId && entityById) {
    const entity = entityById.get(result.linkedEntityId);
    if (entity) return isEntityVisibleForMapLayers(entity, state);
  }
  const layerId = getMapLayerForSearchResult(result);
  return layerId ? isMapLayerEnabled(state, layerId) : true;
}

export function filterAtlasMarkersByLayers(
  markers: readonly AtlasPinMarkerModel[],
  state: MapLayerState,
): readonly AtlasPinMarkerModel[] {
  return markers.filter((marker) => isMarkerVisibleForMapLayers(marker, state));
}
