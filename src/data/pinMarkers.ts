import { publishPinPlayerAssociations } from '../app/pinPlayerAssociationRegistry';
import type { EntityId, PublicCatalogSnapshotV2, PublicMapEntity } from './beta02-model';
import { toLeafletSimpleCoordinate, type LeafletSimpleCoordinate } from './coordinates';
import type { CampaignCatalog, PlaceId } from './model';
import { mapEntityUsesPointGeometry } from '../domain/mapGeometry';
import type {
  PinEntityType,
  PinPlayerAssociationInput,
  PinPlayerDispositionInput,
} from '../domain/pinVisualSystem';

export interface AtlasPinMarkerModel {
  readonly id: string;
  readonly legacyPlaceId: PlaceId | null;
  readonly entityId: EntityId | null;
  readonly name: string;
  readonly entityType: PinEntityType;
  readonly coordinate: LeafletSimpleCoordinate;
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
      entity.entityType === 'location' &&
      entity.visibility === 'pin' &&
      (entity.id === place.id || entity.slug === place.slug),
  );
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
    // MAP-060 polygons are map-visible areas, not point markers. Suppress the
    // historical Beta 0.1 fallback as well, otherwise a migrated location would
    // accidentally reappear as a clusterable pin at its representative point.
    if (beta02Entity && !mapEntityUsesPointGeometry(beta02Entity)) return [];

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
        coordinate: toLeafletSimpleCoordinate(beta02Entity?.coordinates ?? place.coordinates),
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
    .filter(
      (entity) =>
        entity.visibility === 'pin' &&
        mapEntityUsesPointGeometry(entity) &&
        !consumedEntityIds.has(entity.id),
    )
    .map((entity): AtlasPinMarkerModel => {
      const category = beta02Catalog?.categories.find(({ id }) => id === entity.categoryId);

      return {
        id: entity.id,
        legacyPlaceId: null,
        entityId: entity.id,
        name: entity.name,
        entityType: entity.entityType,
        coordinate: toLeafletSimpleCoordinate(entity.coordinates),
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
