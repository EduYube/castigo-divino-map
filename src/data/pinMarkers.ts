import { publishPinPlayerAssociations } from '../app/pinPlayerAssociationRegistry';
import type { EntityId, PublicCatalogSnapshotV2, PublicMapEntity } from './beta02-model';
import { toLeafletSimpleCoordinate, type LeafletSimpleCoordinate } from './coordinates';
import type { CampaignCatalog, PlaceId } from './model';
import type {
  PinEntityType,
  PinPlayerAssociationInput,
  PinPlayerDispositionInput,
} from '../domain/pinVisualSystem';

export interface AtlasRegionBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export type AtlasMapPresentation =
  | { readonly kind: 'point' }
  | {
      readonly kind: 'polygon';
      readonly vertices: readonly LeafletSimpleCoordinate[];
      readonly bounds: AtlasRegionBounds;
    };

export interface AtlasPinMarkerModel {
  readonly id: string;
  readonly legacyPlaceId: PlaceId | null;
  readonly entityId: EntityId | null;
  readonly name: string;
  readonly entityType: PinEntityType;
  readonly lifecycleStatus: PublicMapEntity['lifecycleStatus'];
  /** Representative point. Polygon regions use it only for existing search/detail contracts. */
  readonly coordinate: LeafletSimpleCoordinate;
  /** Missing only in historical fixtures; runtime models always provide it and missing means point. */
  readonly mapPresentation?: AtlasMapPresentation;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly categorySlug: string;
  readonly dispositions: readonly PinPlayerDispositionInput[];
  readonly associations: readonly PinPlayerAssociationInput[];
  /** MAP-045 opaque Storage reference; only characters may provide it. */
  readonly portraitPath: string | null;
  readonly source: 'beta01' | 'beta02';
}

function resolveBeta02Dispositions(
  catalog: PublicCatalogSnapshotV2,
  entityId: EntityId,
): readonly PinPlayerDispositionInput[] {
  return catalog.players.map((player) => ({
    playerId: player.id,
    playerName: player.displayName,
    disposition:
      catalog.dispositions.find(
        (entry) => entry.entityId === entityId && entry.playerId === player.id,
      )?.disposition ?? null,
  }));
}

function resolveBeta02Associations(
  catalog: PublicCatalogSnapshotV2,
  entityId: EntityId,
): readonly PinPlayerAssociationInput[] {
  const playerById = new Map(catalog.players.map((player) => [player.id, player] as const));
  return (catalog.associations ?? [])
    .filter((association) => association.entityId === entityId)
    .map((association) => {
      const player = playerById.get(association.playerId);
      if (!player) {
        throw new Error(
          `Missing player "${association.playerId}" for association with "${entityId}".`,
        );
      }
      const accentColor = player.accentColor;
      if (!accentColor) {
        throw new Error(
          `Missing persisted accent for player "${player.id}" associated with "${entityId}".`,
        );
      }
      return {
        playerId: player.id,
        playerName: player.displayName,
        accentColor,
      };
    });
}

function findStableBeta02Location(
  catalog: PublicCatalogSnapshotV2 | null,
  place: CampaignCatalog['places'][number],
): PublicMapEntity | undefined {
  return catalog?.entities.find(
    (entity) =>
      entity.entityType === 'location' && (entity.id === place.id || entity.slug === place.slug),
  );
}

function polygonBounds(
  vertices: readonly { readonly x: number; readonly y: number }[],
): AtlasRegionBounds {
  const xs = vertices.map(({ x }) => x);
  const ys = vertices.map(({ y }) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function mapPresentation(entity: PublicMapEntity | undefined): AtlasMapPresentation {
  if (entity?.geometry?.kind !== 'polygon') return { kind: 'point' };
  return {
    kind: 'polygon',
    vertices: entity.geometry.vertices.map(toLeafletSimpleCoordinate),
    bounds: polygonBounds(entity.geometry.vertices),
  };
}

export function createAtlasPinMarkerModels(
  legacyCatalog: CampaignCatalog,
  beta02Catalog: PublicCatalogSnapshotV2 | null,
): readonly AtlasPinMarkerModel[] {
  const consumedEntityIds = new Set<EntityId>();
  const legacyPins = legacyCatalog.places.flatMap((place): readonly AtlasPinMarkerModel[] => {
    const legacyCategory = legacyCatalog.categories.find(({ id }) => id === place.categoryId);
    if (!legacyCategory) {
      throw new Error(`Missing category "${place.categoryId}" for place "${place.id}".`);
    }

    const beta02Entity = findStableBeta02Location(beta02Catalog, place);
    if (beta02Entity) consumedEntityIds.add(beta02Entity.id);
    // A stable Beta 0.2 entity owns the legacy identity even when it deliberately
    // has no permanent presentation. Never resurrect the Beta 0.1 fallback for
    // search_only locations. Published polygons are represented as regions below.
    if (beta02Entity && beta02Entity.visibility !== 'pin') return [];

    const beta02Category = beta02Entity
      ? beta02Catalog?.categories.find(({ id }) => id === beta02Entity.categoryId)
      : undefined;

    return [
      {
        id: place.id,
        legacyPlaceId: place.id,
        entityId: beta02Entity?.id ?? null,
        name: beta02Entity?.name ?? place.name,
        entityType: beta02Entity?.entityType ?? 'location',
        lifecycleStatus: beta02Entity?.lifecycleStatus ?? null,
        coordinate: toLeafletSimpleCoordinate(beta02Entity?.coordinates ?? place.coordinates),
        mapPresentation: mapPresentation(beta02Entity),
        categoryId: beta02Entity?.categoryId ?? legacyCategory.id,
        categoryName: beta02Category?.name ?? legacyCategory.name,
        categorySlug: beta02Category?.slug ?? legacyCategory.slug,
        dispositions:
          beta02Catalog && beta02Entity
            ? resolveBeta02Dispositions(beta02Catalog, beta02Entity.id)
            : [],
        associations:
          beta02Catalog && beta02Entity
            ? resolveBeta02Associations(beta02Catalog, beta02Entity.id)
            : [],
        portraitPath:
          beta02Entity?.entityType === 'character' ? (beta02Entity.portraitPath ?? null) : null,
        source: beta02Entity ? 'beta02' : 'beta01',
      },
    ];
  });

  const supplementalPins = (beta02Catalog?.entities ?? [])
    .filter((entity) => entity.visibility === 'pin' && !consumedEntityIds.has(entity.id))
    .map((entity): AtlasPinMarkerModel => {
      const category = beta02Catalog?.categories.find(({ id }) => id === entity.categoryId);

      return {
        id: entity.id,
        legacyPlaceId: null,
        entityId: entity.id,
        name: entity.name,
        entityType: entity.entityType,
        lifecycleStatus: entity.lifecycleStatus ?? null,
        coordinate: toLeafletSimpleCoordinate(entity.coordinates),
        mapPresentation: mapPresentation(entity),
        categoryId: entity.categoryId,
        categoryName: category?.name ?? entity.categoryId,
        categorySlug: category?.slug ?? entity.categoryId,
        dispositions: beta02Catalog ? resolveBeta02Dispositions(beta02Catalog, entity.id) : [],
        associations: beta02Catalog ? resolveBeta02Associations(beta02Catalog, entity.id) : [],
        portraitPath: entity.entityType === 'character' ? (entity.portraitPath ?? null) : null,
        source: 'beta02',
      };
    });

  const markers = [...legacyPins, ...supplementalPins];
  publishPinPlayerAssociations(markers);
  return markers;
}
