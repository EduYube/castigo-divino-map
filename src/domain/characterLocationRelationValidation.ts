import type {
  AdminCharacterLocationRelationDraft,
  AdminCharacterLocationRelationRecord,
  AdminCharacterLocationRelationReferences,
} from './characterLocationRelations';
import { characterLocationRelationKey } from './characterLocationRelations';

export interface CharacterLocationRelationValidationResult {
  readonly valid: boolean;
  readonly fieldErrors: Readonly<Record<string, string>>;
}

export function validateCharacterLocationRelationDraft(
  draft: AdminCharacterLocationRelationDraft,
  references: AdminCharacterLocationRelationReferences,
  records: readonly AdminCharacterLocationRelationRecord[],
  original: AdminCharacterLocationRelationRecord | null = null,
): CharacterLocationRelationValidationResult {
  const errors: Record<string, string> = {};
  const character = references.characters.find(({ id }) => id === draft.characterId);
  const location = references.locations.find(({ id }) => id === draft.locationId);

  if (!character || character.entityType !== 'character' || character.publicationStatus === 'archived') {
    errors.characterId = 'Selecciona un personaje disponible y no archivado.';
  }
  if (!location || location.entityType !== 'location' || location.publicationStatus === 'archived') {
    errors.locationId = 'Selecciona un emplazamiento disponible y no archivado.';
  }

  if (draft.publicationStatus === 'published') {
    if (character?.publicationStatus !== 'published') {
      errors.characterId = 'Una relación publicada requiere un personaje publicado.';
    }
    if (location?.publicationStatus !== 'published') {
      errors.locationId = 'Una relación publicada requiere un emplazamiento publicado.';
    }
  }

  if (original) {
    if (draft.characterId !== original.characterId) {
      errors.characterId = 'El personaje de una relación existente no puede cambiar.';
    }
    if (draft.locationId !== original.locationId) {
      errors.locationId = 'El emplazamiento de una relación existente no puede cambiar.';
    }
    if (original.publicationStatus === 'archived' && draft.publicationStatus === 'published') {
      errors.publicationStatus = 'Una relación archivada debe volver a borrador antes de publicarse.';
    }
  } else {
    const key = characterLocationRelationKey(draft.characterId, draft.locationId);
    if (records.some((record) => characterLocationRelationKey(record.characterId, record.locationId) === key)) {
      errors.locationId = 'Ese personaje ya tiene una relación con el emplazamiento seleccionado.';
    }
  }

  return { valid: Object.keys(errors).length === 0, fieldErrors: errors };
}
