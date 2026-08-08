import type {
  CharacterLocationRelationStatus,
  PublicCatalogSnapshotV2,
  PublicCharacterLocationRelation,
  PublicMapEntity,
} from './beta02-model';

export interface PublicImportantCharacterAtLocation {
  readonly character: PublicMapEntity;
  readonly relation: PublicCharacterLocationRelation;
}

export interface PublicRelatedLocationForCharacter {
  readonly location: PublicMapEntity;
  readonly relation: PublicCharacterLocationRelation;
}

const STATUS_ORDER = new Map([
  ['present', 0],
  ['associated', 1],
  ['last-seen', 2],
] as const);

const RELATION_LABELS: Record<CharacterLocationRelationStatus, string> = {
  present: 'Presente',
  associated: 'Relacionado',
  'last-seen': 'Visto por última vez',
};

export function getCharacterLocationRelationLabel(
  status: CharacterLocationRelationStatus,
): string {
  return RELATION_LABELS[status];
}

export function getImportantCharactersForLocation(
  catalog: PublicCatalogSnapshotV2,
  locationId: PublicMapEntity['id'],
): readonly PublicImportantCharacterAtLocation[] {
  const entities = new Map(catalog.entities.map((entity) => [entity.id, entity] as const));
  return catalog.characterLocationRelations
    .filter((relation) => relation.locationId === locationId)
    .map((relation) => ({ relation, character: entities.get(relation.characterId) }))
    .filter(
      (entry): entry is { relation: PublicCharacterLocationRelation; character: PublicMapEntity } =>
        entry.character?.entityType === 'character',
    )
    .sort((left, right) => {
      const status =
        (STATUS_ORDER.get(left.relation.relationStatus) ?? Number.MAX_SAFE_INTEGER) -
        (STATUS_ORDER.get(right.relation.relationStatus) ?? Number.MAX_SAFE_INTEGER);
      return (
        status ||
        left.character.name.localeCompare(right.character.name) ||
        left.character.id.localeCompare(right.character.id)
      );
    });
}

export function getRelatedLocationsForCharacter(
  catalog: PublicCatalogSnapshotV2,
  characterId: PublicMapEntity['id'],
): readonly PublicRelatedLocationForCharacter[] {
  const entities = new Map(catalog.entities.map((entity) => [entity.id, entity] as const));
  return catalog.characterLocationRelations
    .filter((relation) => relation.characterId === characterId)
    .map((relation) => ({ relation, location: entities.get(relation.locationId) }))
    .filter(
      (entry): entry is { relation: PublicCharacterLocationRelation; location: PublicMapEntity } =>
        entry.location?.entityType === 'location',
    )
    .sort(
      (left, right) =>
        left.location.name.localeCompare(right.location.name) ||
        left.location.id.localeCompare(right.location.id),
    );
}
