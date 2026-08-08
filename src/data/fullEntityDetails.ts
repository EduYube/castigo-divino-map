import type {
  EntityId,
  PublicCatalogSnapshotV2,
  PublicCharacterLocationEvent,
  PublicMapEntity,
} from './beta02-model';
import {
  buildPublicEntityPresentation,
  type PublicEntityPresentation,
  type PublicEntityPresentationRelation,
} from './publicEntityPresentation';
import type { PinPlayerDispositionInput } from '../domain/pinVisualSystem';

export interface FullEntityLocationHistoryEntry {
  readonly id: PublicCharacterLocationEvent['id'];
  readonly eventType: PublicCharacterLocationEvent['eventType'];
  readonly eventLabel: string;
  readonly locationEntityId: EntityId | null;
  readonly locationSlug: string | null;
  readonly locationName: string;
  readonly summary: string;
  readonly observedAt: string | null;
}

export interface FullEntityDetailModel {
  readonly id: PublicMapEntity['id'];
  readonly slug: PublicMapEntity['slug'];
  readonly entityType: PublicMapEntity['entityType'];
  readonly visibility: PublicMapEntity['visibility'];
  readonly name: string;
  readonly aliases: readonly string[];
  readonly summary: string;
  readonly description: string;
  readonly category: PublicEntityPresentation['category'];
  readonly tags: PublicEntityPresentation['tags'];
  readonly dispositions: readonly PinPlayerDispositionInput[];
  readonly notes: PublicEntityPresentation['notes'];
  readonly importantCharacters: readonly PublicEntityPresentationRelation[];
  readonly relatedLocations: readonly PublicEntityPresentationRelation[];
  readonly locationHistory: readonly FullEntityLocationHistoryEntry[];
  readonly publicUpdatedAt: string;
}

function resolveHistoryLocation(
  catalog: PublicCatalogSnapshotV2,
  event: PublicCharacterLocationEvent,
): Pick<
  FullEntityLocationHistoryEntry,
  'locationEntityId' | 'locationSlug' | 'locationName'
> {
  const locationEntity = event.location.locationEntityId
    ? catalog.entities.find(({ id }) => id === event.location.locationEntityId)
    : undefined;

  if (locationEntity?.entityType === 'location') {
    return {
      locationEntityId: locationEntity.id,
      locationSlug: locationEntity.slug,
      locationName: locationEntity.name,
    };
  }

  const geographicName = event.location.geographicNameId
    ? catalog.geographicNames.find(({ id }) => id === event.location.geographicNameId)
    : undefined;

  if (geographicName) {
    return {
      locationEntityId: geographicName.entityId,
      locationSlug:
        geographicName.entityId === null
          ? null
          : (catalog.entities.find(({ id }) => id === geographicName.entityId)?.slug ?? null),
      locationName: geographicName.name,
    };
  }

  if (event.location.locationLabel) {
    return {
      locationEntityId: null,
      locationSlug: null,
      locationName: event.location.locationLabel,
    };
  }

  return {
    locationEntityId: null,
    locationSlug: null,
    locationName: `Coordenadas ${event.location.coordinates?.x ?? '—'}, ${event.location.coordinates?.y ?? '—'}`,
  };
}

function buildLocationHistory(
  catalog: PublicCatalogSnapshotV2,
  characterId: PublicMapEntity['id'],
): readonly FullEntityLocationHistoryEntry[] {
  return catalog.characterLocationEvents
    .filter((event) => event.characterId === characterId)
    .map((event) => ({
      id: event.id,
      eventType: event.eventType,
      eventLabel: event.eventType === 'sighting' ? 'Avistamiento' : 'Salida',
      ...resolveHistoryLocation(catalog, event),
      summary: event.summary,
      observedAt: event.observedAt,
    }))
    .sort((left, right) => {
      if (left.observedAt && right.observedAt) {
        const dateOrder = Date.parse(right.observedAt) - Date.parse(left.observedAt);
        if (dateOrder !== 0) return dateOrder;
      } else if (left.observedAt) {
        return -1;
      } else if (right.observedAt) {
        return 1;
      }

      return left.id.localeCompare(right.id);
    });
}

export function resolveFullEntityDetail(
  catalog: PublicCatalogSnapshotV2,
  slug: string,
): FullEntityDetailModel | undefined {
  const entity = catalog.entities.find((candidate) => candidate.slug === slug);

  if (!entity) {
    return undefined;
  }

  const presentation = buildPublicEntityPresentation(catalog, entity);
  if (!presentation) {
    return undefined;
  }

  return {
    id: entity.id,
    slug: entity.slug,
    entityType: entity.entityType,
    visibility: entity.visibility,
    name: entity.name,
    aliases: entity.aliases.map(({ value }) => value),
    summary: entity.summary,
    description: entity.description,
    category: presentation.category,
    tags: presentation.tags,
    dispositions: presentation.dispositions,
    notes: presentation.notes,
    importantCharacters: presentation.importantCharacters,
    relatedLocations: presentation.relatedLocations,
    locationHistory:
      entity.entityType === 'character' ? buildLocationHistory(catalog, entity.id) : [],
    publicUpdatedAt: catalog.generatedAt,
  };
}
