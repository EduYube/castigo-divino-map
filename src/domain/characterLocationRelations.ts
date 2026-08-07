export type CharacterLocationRelationStatus = 'present' | 'associated' | 'last-seen';
export type CharacterLocationRelationPublicationStatus = 'draft' | 'published' | 'archived';

export interface CharacterLocationEntityReference {
  readonly id: string;
  readonly name: string;
  readonly entityType: 'character' | 'location';
  readonly publicationStatus: CharacterLocationRelationPublicationStatus;
}

export interface AdminCharacterLocationRelationRecord {
  readonly characterId: string;
  readonly locationId: string;
  readonly relationStatus: CharacterLocationRelationStatus;
  readonly publicationStatus: CharacterLocationRelationPublicationStatus;
  readonly publishedAt: string | null;
  readonly archivedAt: string | null;
  readonly updatedAt: string;
}

export interface AdminCharacterLocationRelationReferences {
  readonly characters: readonly CharacterLocationEntityReference[];
  readonly locations: readonly CharacterLocationEntityReference[];
}

export interface AdminCharacterLocationRelationDraft {
  readonly characterId: string;
  readonly locationId: string;
  readonly relationStatus: CharacterLocationRelationStatus;
  readonly publicationStatus: CharacterLocationRelationPublicationStatus;
}

export const CHARACTER_LOCATION_RELATION_STATUS_LABELS: Readonly<
  Record<CharacterLocationRelationStatus, string>
> = {
  present: 'Presente',
  associated: 'Asociado',
  'last-seen': 'Visto por última vez',
};

export const CHARACTER_LOCATION_RELATION_STATUS_ORDER: readonly CharacterLocationRelationStatus[] = [
  'present',
  'associated',
  'last-seen',
];

export function characterLocationRelationKey(
  characterId: string,
  locationId: string,
): string {
  return `${characterId}\u0000${locationId}`;
}

export function relationRecordToDraft(
  record: AdminCharacterLocationRelationRecord,
): AdminCharacterLocationRelationDraft {
  return {
    characterId: record.characterId,
    locationId: record.locationId,
    relationStatus: record.relationStatus,
    publicationStatus: record.publicationStatus,
  };
}

export function createEmptyCharacterLocationRelationDraft(
  references: AdminCharacterLocationRelationReferences,
): AdminCharacterLocationRelationDraft {
  return {
    characterId:
      references.characters.find(({ publicationStatus }) => publicationStatus !== 'archived')?.id ?? '',
    locationId:
      references.locations.find(({ publicationStatus }) => publicationStatus !== 'archived')?.id ?? '',
    relationStatus: 'associated',
    publicationStatus: 'draft',
  };
}
