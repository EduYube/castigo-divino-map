import type { EntityId, PublicCatalogSnapshotV2, PublicMapEntity } from './beta02-model';
import { toLeafletSimpleCoordinate, type LeafletSimpleCoordinate } from './coordinates';
import type { CampaignCatalog, PlaceId } from './model';
import type { AtlasPinMarkerModel } from './pinMarkers';

export interface AtlasRegionBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface AtlasRegionModel {
  readonly id: string;
  readonly entityId: EntityId;
  readonly legacyPlaceId: PlaceId | null;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly categorySlug: string;
  readonly vertices: readonly LeafletSimpleCoordinate[];
  readonly bounds: AtlasRegionBounds;
  /** Marker-shaped presentation adapter used only by the existing compact detail surface. */
  readonly detailMarker: AtlasPinMarkerModel;
}

function stableLegacyPlaceId(
  catalog: CampaignCatalog,
  entity: PublicMapEntity,
): PlaceId | null {
  return (
    catalog.places.find((place) => place.id === entity.id || place.slug === entity.slug)?.id ?? null
  );
}

function polygonBounds(vertices: readonly { readonly x: number; readonly y: number }[]): AtlasRegionBounds {
  const xs = vertices.map(({ x }) => x);
  const ys = vertices.map(({ y }) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function createAtlasRegionModels(
  legacyCatalog: CampaignCatalog,
  beta02Catalog: PublicCatalogSnapshotV2 | null,
): readonly AtlasRegionModel[] {
  if (!beta02Catalog) return [];

  return beta02Catalog.entities.flatMap((entity): readonly AtlasRegionModel[] => {
    if (
      entity.entityType !== 'location' ||
      entity.visibility !== 'pin' ||
      entity.geometry?.kind !== 'polygon'
    ) {
      return [];
    }

    const category = beta02Catalog.categories.find(({ id }) => id === entity.categoryId);
    const legacyPlaceId = stableLegacyPlaceId(legacyCatalog, entity);
    const detailMarker: AtlasPinMarkerModel = {
      id: entity.id,
      legacyPlaceId,
      entityId: entity.id,
      name: entity.name,
      entityType: 'location',
      coordinate: toLeafletSimpleCoordinate(entity.coordinates),
      categoryId: entity.categoryId,
      categoryName: category?.name ?? entity.categoryId,
      categorySlug: category?.slug ?? entity.categoryId,
      dispositions: [],
      associations: [],
      portraitPath: null,
      source: 'beta02',
    };

    return [
      {
        id: entity.id,
        entityId: entity.id,
        legacyPlaceId,
        name: entity.name,
        categoryId: entity.categoryId,
        categoryName: category?.name ?? entity.categoryId,
        categorySlug: category?.slug ?? entity.categoryId,
        vertices: entity.geometry.vertices.map(toLeafletSimpleCoordinate),
        bounds: polygonBounds(entity.geometry.vertices),
        detailMarker,
      },
    ];
  });
}
