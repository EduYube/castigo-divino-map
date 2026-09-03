import { describe, expect, it } from 'vitest';
import type { PublicMapEntity } from '../data/beta02-model';
import type { AtlasPinMarkerModel } from '../data/pinMarkers';
import {
  filterAtlasMarkersByLayers,
  getMapLayerForEntity,
  getMapLayerForMarker,
  normalizeMapLayerIds,
} from './mapLayers';

function entity(
  entityType: PublicMapEntity['entityType'],
  geometry: PublicMapEntity['geometry'],
): PublicMapEntity {
  return {
    id: `entity-${entityType}`,
    slug: entityType,
    entityType,
    lifecycleStatus: entityType === 'mission' ? 'completed' : entityType === 'hazard' ? 'resolved' : null,
    visibility: 'pin',
    name: entityType,
    nameLanguage: 'en',
    aliases: [],
    summary: '',
    description: '',
    geometry,
    coordinates: geometry?.kind === 'point' ? geometry.coordinates : { x: 10, y: 10 },
    categoryId: 'category-test',
    tagIds: [],
  };
}

function marker(id: string, entityType: AtlasPinMarkerModel['entityType'], polygon = false): AtlasPinMarkerModel {
  return {
    id,
    entityId: `entity-${id}`,
    legacyPlaceId: null,
    name: id,
    coordinate: [10, 10],
    entityType,
    lifecycleStatus: entityType === 'mission' ? 'completed' : entityType === 'hazard' ? 'resolved' : null,
    portraitPath: null,
    dispositions: [],
    mapPresentation: polygon
      ? { kind: 'polygon', vertices: [[10, 10], [11, 10], [10, 11]] }
      : { kind: 'point' },
  } as AtlasPinMarkerModel;
}

describe('MAP-065 map layer domain', () => {
  it('classifies polygon locations as regions without changing persistent entity type', () => {
    const region = entity('location', {
      kind: 'polygon',
      vertices: [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 11 }],
    });
    const location = entity('location', { kind: 'point', coordinates: { x: 10, y: 10 } });

    expect(getMapLayerForEntity(region)).toBe('region');
    expect(getMapLayerForEntity(location)).toBe('location');
  });

  it('keeps lifecycle independent from mission and hazard layer membership', () => {
    expect(getMapLayerForEntity(entity('mission', { kind: 'point', coordinates: { x: 1, y: 1 } }))).toBe('mission');
    expect(getMapLayerForEntity(entity('hazard', { kind: 'point', coordinates: { x: 2, y: 2 } }))).toBe('hazard');
  });

  it('filters markers before clustering while leaving regions independent from point locations', () => {
    const markers = [
      marker('character', 'character'),
      marker('location', 'location'),
      marker('region', 'location', true),
      marker('mission', 'mission'),
      marker('hazard', 'hazard'),
    ];

    const visible = filterAtlasMarkersByLayers(markers, {
      activeLayerIds: ['character', 'region', 'hazard'],
    });

    expect(visible.map(({ id }) => id)).toEqual(['character', 'region', 'hazard']);
    expect(getMapLayerForMarker(markers[2]!)).toBe('region');
  });

  it('normalizes unknown, duplicate and reordered layer ids deterministically', () => {
    expect(normalizeMapLayerIds(['hazard', 'future', 'character', 'hazard'])).toEqual([
      'character',
      'hazard',
    ]);
  });
});
