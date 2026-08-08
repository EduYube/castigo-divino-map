import type {
  PublicCatalogSnapshotV2,
  PublicMapEntity,
  PublicNote,
  PublicTag,
} from './beta02-model';
import {
  getCharacterLocationRelationLabel,
  getImportantCharactersForLocation,
  getRelatedLocationsForCharacter,
} from './characterLocationRelations';
import type { PinPlayerDispositionInput } from '../domain/pinVisualSystem';

export interface PublicEntityPresentationCategory {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface PublicEntityPresentationTag {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface PublicEntityPresentationRelation {
  readonly id: PublicMapEntity['id'];
  readonly slug: PublicMapEntity['slug'];
  readonly name: string;
  readonly relationStatus: 'present' | 'associated' | 'last-seen';
  readonly relationLabel: string;
}

export interface PublicEntityPresentationNote {
  readonly id: PublicNote['id'];
  readonly slug: PublicNote['slug'];
  readonly title: string;
  readonly body: string;
  readonly tags: readonly PublicEntityPresentationTag[];
}

export interface PublicEntityPresentation {
  readonly entity: PublicMapEntity;
  readonly category: PublicEntityPresentationCategory;
  readonly tags: readonly PublicEntityPresentationTag[];
  readonly dispositions: readonly PinPlayerDispositionInput[];
  readonly notes: readonly PublicEntityPresentationNote[];
  readonly importantCharacters: readonly PublicEntityPresentationRelation[];
  readonly relatedLocations: readonly PublicEntityPresentationRelation[];
}

function resolveTag(tag: PublicTag): PublicEntityPresentationTag {
  return { id: tag.id, name: tag.name, description: tag.description };
}

export function buildPublicEntityPresentation(
  catalog: PublicCatalogSnapshotV2,
  entity: PublicMapEntity,
): PublicEntityPresentation | undefined {
  const category = catalog.categories.find(({ id }) => id === entity.categoryId);

  if (!category) {
    return undefined;
  }

  const tagsById = new Map(catalog.tags.map((tag) => [tag.id, tag] as const));
  const tags = entity.tagIds
    .map((tagId) => tagsById.get(tagId))
    .filter((tag): tag is PublicTag => Boolean(tag))
    .map(resolveTag);
  const dispositions = catalog.players.map((player) => ({
    playerId: player.id,
    playerName: player.displayName,
    disposition: catalog.dispositions.find(
      (candidate) => candidate.entityId === entity.id && candidate.playerId === player.id,
    )?.disposition,
  }));
  const notes = catalog.notes
    .filter(({ entityId }) => entityId === entity.id)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
    .map((note) => ({
      id: note.id,
      slug: note.slug,
      title: note.title,
      body: note.body,
      tags: note.tagIds
        .map((tagId) => tagsById.get(tagId))
        .filter((tag): tag is PublicTag => Boolean(tag))
        .map(resolveTag),
    }));
  const importantCharacters =
    entity.entityType === 'location'
      ? getImportantCharactersForLocation(catalog, entity.id).map(({ character, relation }) => ({
          id: character.id,
          slug: character.slug,
          name: character.name,
          relationStatus: relation.relationStatus,
          relationLabel: getCharacterLocationRelationLabel(relation.relationStatus),
        }))
      : [];
  const relatedLocations =
    entity.entityType === 'character'
      ? getRelatedLocationsForCharacter(catalog, entity.id).map(({ location, relation }) => ({
          id: location.id,
          slug: location.slug,
          name: location.name,
          relationStatus: relation.relationStatus,
          relationLabel: getCharacterLocationRelationLabel(relation.relationStatus),
        }))
      : [];

  return {
    entity,
    category: { id: category.id, name: category.name, description: category.description },
    tags,
    dispositions,
    notes,
    importantCharacters,
    relatedLocations,
  };
}
