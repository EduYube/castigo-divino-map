import type { EntityId, PublicCatalogSnapshotV2 } from './beta02-model';
import type { CampaignCatalog, PlaceId } from './model';
import type { AtlasPinMarkerModel } from './pinMarkers';
import { buildPublicEntityPresentation } from './publicEntityPresentation';
import type { PinEntityType, PinPlayerDispositionInput } from '../domain/pinVisualSystem';

export interface CompactDetailCategory {
  readonly id: string;
  readonly name: string;
}

export interface CompactDetailTag {
  readonly id: string;
  readonly name: string;
}

export interface CompactImportantCharacter {
  readonly id: EntityId;
  readonly name: string;
  readonly relationStatus: 'present' | 'associated' | 'last-seen';
  readonly relationLabel: string;
}

export interface CompactAssociatedPlayer {
  readonly id: string;
  readonly name: string;
  readonly accentColor: string;
}

export interface CompactPinDetailModel {
  readonly id: string;
  readonly legacyPlaceId: PlaceId | null;
  readonly entityId: EntityId | null;
  readonly entitySlug: string | null;
  readonly entityType: PinEntityType;
  readonly name: string;
  readonly category: CompactDetailCategory;
  readonly tags: readonly CompactDetailTag[];
  readonly dispositions: readonly PinPlayerDispositionInput[];
  readonly associatedPlayers: readonly CompactAssociatedPlayer[];
  readonly importantCharacters: readonly CompactImportantCharacter[];
  readonly portraitPath: string | null;
  readonly source: 'beta01' | 'beta02';
}

function buildBeta02Details(
  catalog: PublicCatalogSnapshotV2,
  marker: AtlasPinMarkerModel,
): CompactPinDetailModel | undefined {
  if (!marker.entityId) {
    return undefined;
  }

  const entity = catalog.entities.find(({ id }) => id === marker.entityId);
  if (!entity) {
    return undefined;
  }

  const presentation = buildPublicEntityPresentation(catalog, entity);
  if (!presentation) {
    return undefined;
  }

  return {
    id: marker.id,
    legacyPlaceId: marker.legacyPlaceId,
    entityId: entity.id,
    entitySlug: entity.slug,
    entityType: entity.entityType,
    name: entity.name,
    category: {
      id: presentation.category.id,
      name: presentation.category.name,
    },
    tags: presentation.tags.map(({ id, name }) => ({ id, name })),
    dispositions: presentation.dispositions,
    associatedPlayers: presentation.associatedPlayers,
    importantCharacters: presentation.importantCharacters.map(
      ({ id, name, relationStatus, relationLabel }) => ({
        id,
        name,
        relationStatus,
        relationLabel,
      }),
    ),
    portraitPath: entity.entityType === 'character' ? (entity.portraitPath ?? null) : null,
    source: 'beta02',
  };
}

function buildLegacyDetails(
  catalog: CampaignCatalog,
  marker: AtlasPinMarkerModel,
): CompactPinDetailModel | undefined {
  if (!marker.legacyPlaceId) {
    return undefined;
  }

  const place = catalog.places.find(({ id }) => id === marker.legacyPlaceId);
  if (!place) {
    return undefined;
  }

  const category = catalog.categories.find(({ id }) => id === place.categoryId);
  if (!category) {
    return undefined;
  }

  const tags = place.tagIds.map((tagId) => {
    const tag = catalog.tags.find(({ id }) => id === tagId);
    if (!tag) {
      throw new Error(`Missing tag "${tagId}" for place "${place.id}".`);
    }

    return { id: tag.id, name: tag.name };
  });

  return {
    id: marker.id,
    legacyPlaceId: place.id,
    entityId: null,
    entitySlug: null,
    entityType: 'location',
    name: place.name,
    category: { id: category.id, name: category.name },
    tags,
    dispositions: marker.dispositions,
    associatedPlayers: [],
    importantCharacters: [],
    portraitPath: null,
    source: 'beta01',
  };
}

export function buildCompactPinDetailModel(
  legacyCatalog: CampaignCatalog,
  beta02Catalog: PublicCatalogSnapshotV2 | null,
  marker: AtlasPinMarkerModel,
): CompactPinDetailModel | undefined {
  return (
    (beta02Catalog ? buildBeta02Details(beta02Catalog, marker) : undefined) ??
    buildLegacyDetails(legacyCatalog, marker)
  );
}
