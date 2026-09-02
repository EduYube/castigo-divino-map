import type { EntityId, PlayerId } from '../data/beta02-model';

export const PUBLIC_NOTE_TITLE_MAX_LENGTH = 160;
export const PUBLIC_NOTE_BODY_MAX_LENGTH = 5000;

export type PublicNoteAuthorKind = 'master' | 'player';

export interface PublicNoteWriteRecord {
  readonly id: string;
  readonly entityId: EntityId;
  readonly title: string;
  readonly body: string;
  readonly sortOrder: number;
  readonly authorKind: PublicNoteAuthorKind;
  readonly authorPlayerId: PlayerId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastModifierKind: PublicNoteAuthorKind;
  readonly lastModifierPlayerId: PlayerId | null;
}

export interface PublicNoteDraft {
  readonly title: string;
  readonly body: string;
}

export interface PublicPlayerNoteDraft extends PublicNoteDraft {
  readonly playerId: PlayerId;
}

export type PublicNoteValidationResult =
  | { readonly valid: true; readonly title: string; readonly body: string }
  | { readonly valid: false; readonly field: 'title' | 'body'; readonly message: string };

export function validatePublicNoteDraft(draft: PublicNoteDraft): PublicNoteValidationResult {
  const title = draft.title.trim();
  const body = draft.body.trim();

  if (title.length === 0) {
    return { valid: false, field: 'title', message: 'Escribe un título para la nota.' };
  }
  if (title.length > PUBLIC_NOTE_TITLE_MAX_LENGTH) {
    return {
      valid: false,
      field: 'title',
      message: `El título no puede superar ${PUBLIC_NOTE_TITLE_MAX_LENGTH} caracteres.`,
    };
  }
  if (body.length === 0) {
    return { valid: false, field: 'body', message: 'Escribe el contenido de la nota.' };
  }
  if (body.length > PUBLIC_NOTE_BODY_MAX_LENGTH) {
    return {
      valid: false,
      field: 'body',
      message: `La nota no puede superar ${PUBLIC_NOTE_BODY_MAX_LENGTH} caracteres.`,
    };
  }

  return { valid: true, title, body };
}
