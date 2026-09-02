import {
  type AdminMapEntityDetail,
  type AdminMapEntityDraft,
  type AdminMapEntityReferences,
  getMapEntityLifecycleStatus,
  type MapEntityPublicationStatus,
} from './adminMapEntities';
import { isMapCoordinateWithinBounds } from './mapCoordinates';
import {
  createPointMapGeometry,
  mapGeometryRepresentativePoint,
  normalizeMapEntityGeometry,
} from './mapGeometry';

export interface AdminMapEntityValidationResult {
  readonly valid: boolean;
  readonly fieldErrors: Readonly<Record<string, string>>;
}

const ENTITY_ID_PATTERN = /^(?:entity|place)-[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const PLAYER_DISPOSITIONS = new Set(['ally', 'neutral', 'enemy']);
const REPRESENTATIVE_ROUNDING_TOLERANCE = 0.005 + Number.EPSILON;

function setError(errors: Record<string, string>, field: string, message: string): void {
  if (!errors[field]) errors[field] = message;
}

function validatesTransition(
  originalStatus: MapEntityPublicationStatus | null,
  nextStatus: MapEntityPublicationStatus,
): boolean {
  if (originalStatus === 'archived') return nextStatus === 'archived' || nextStatus === 'draft';
  return true;
}

export function validateAdminMapEntityDraft(
  draft: AdminMapEntityDraft,
  references: AdminMapEntityReferences,
  original: AdminMapEntityDetail | null = null,
): AdminMapEntityValidationResult {
  const errors: Record<string, string> = {};
  const name = draft.name.trim();
  const summary = draft.summary.trim();
  const description = draft.description.trim();

  if (!ENTITY_ID_PATTERN.test(draft.id)) {
    setError(errors, 'id', 'Usa un ID estable con prefijo entity- o place- y formato kebab-case.');
  }
  if (!SLUG_PATTERN.test(draft.slug)) {
    setError(errors, 'slug', 'El slug debe usar minúsculas, números y guiones.');
  }
  if (name.length < 1 || name.length > 160) {
    setError(errors, 'name', 'El nombre debe tener entre 1 y 160 caracteres.');
  }
  if (summary.length > 500) setError(errors, 'summary', 'El resumen no puede superar 500 caracteres.');
  if (description.length > 5000) {
    setError(errors, 'description', 'La descripción no puede superar 5000 caracteres.');
  }

  const lifecycleStatus = getMapEntityLifecycleStatus(draft);
  if (draft.entityType === 'mission') {
    if (lifecycleStatus !== 'active' && lifecycleStatus !== 'completed' && lifecycleStatus !== 'failed') {
      setError(errors, 'lifecycleStatus', 'Selecciona Activa, Completada o Fallida para la misión.');
    }
  } else if (draft.entityType === 'hazard') {
    if (lifecycleStatus !== 'active' && lifecycleStatus !== 'resolved') {
      setError(errors, 'lifecycleStatus', 'Selecciona Activo o Resuelto para el peligro.');
    }
  } else if (draft.lifecycleStatus != null) {
    setError(errors, 'lifecycleStatus', 'Personajes y emplazamientos no tienen lifecycle funcional.');
  }

  try {
    const geometry = normalizeMapEntityGeometry(
      draft.entityType,
      draft.geometry ?? createPointMapGeometry(draft),
    );
    const representative = mapGeometryRepresentativePoint(geometry);
    if (
      geometry.kind === 'polygon' &&
      (Math.abs(draft.x - representative.x) > REPRESENTATIVE_ROUNDING_TOLERANCE ||
        Math.abs(draft.y - representative.y) > REPRESENTATIVE_ROUNDING_TOLERANCE)
    ) {
      setError(errors, 'coordinates', 'Las coordenadas representativas de un área se derivan de su geometría.');
    }
  } catch (error) {
    setError(
      errors,
      'geometry',
      error instanceof Error ? error.message : 'La geometría del mapa no es válida.',
    );
  }

  if (!isMapCoordinateWithinBounds(draft)) {
    setError(errors, 'coordinates', 'Las coordenadas deben estar dentro de X 0–3600 e Y 0–2329.');
  }
  if (draft.entityType !== 'character' && draft.portraitPath) {
    setError(errors, 'portraitPath', 'Solo los personajes pueden tener retrato.');
  }

  const category = references.categories.find((candidate) => candidate.id === draft.categoryId);
  if (!category || category.publicationStatus === 'archived') {
    setError(errors, 'categoryId', 'Selecciona una categoría disponible.');
  } else if (draft.publicationStatus === 'published' && category.publicationStatus !== 'published') {
    setError(errors, 'categoryId', 'Una entidad publicada requiere una categoría publicada.');
  }

  const uniqueTagIds = new Set(draft.tagIds);
  if (uniqueTagIds.size !== draft.tagIds.length) {
    setError(errors, 'tagIds', 'Una etiqueta solo puede seleccionarse una vez.');
  }
  for (const tagId of uniqueTagIds) {
    const tag = references.tags.find((candidate) => candidate.id === tagId);
    if (!tag || tag.publicationStatus === 'archived') {
      setError(errors, 'tagIds', 'La selección contiene una etiqueta que ya no está disponible.');
      break;
    }
    if (draft.publicationStatus === 'published' && tag.publicationStatus !== 'published') {
      setError(errors, 'tagIds', 'Las etiquetas de una entidad publicada deben estar publicadas.');
      break;
    }
  }

  const associationIds = draft.playerAssociationIds ?? [];
  const uniqueAssociationIds = new Set(associationIds);
  if (uniqueAssociationIds.size !== associationIds.length) {
    setError(errors, 'playerAssociationIds', 'Un personaje solo puede asociarse una vez.');
  }
  for (const playerId of uniqueAssociationIds) {
    const player = references.players.find((candidate) => candidate.id === playerId);
    if (!player || player.publicationStatus === 'archived') {
      setError(errors, 'playerAssociationIds', 'La selección contiene un personaje que ya no está disponible en esta campaña.');
      break;
    }
  }

  const dispositionIds = draft.dispositions.map(({ playerId }) => playerId);
  const uniqueDispositionIds = new Set(dispositionIds);
  const playerIds = new Set(references.players.map(({ id }) => id));
  if (
    uniqueDispositionIds.size !== dispositionIds.length ||
    uniqueDispositionIds.size !== playerIds.size ||
    [...playerIds].some((playerId) => !uniqueDispositionIds.has(playerId))
  ) {
    setError(errors, 'dispositions', 'Las relaciones ya no coinciden con los personajes jugadores actuales. Recarga el editor.');
  } else if (draft.dispositions.some(({ disposition }) => !PLAYER_DISPOSITIONS.has(disposition))) {
    setError(errors, 'dispositions', 'Selecciona Aliado, Neutral o Enemigo para cada personaje jugador activo.');
  }

  if (original) {
    if (draft.id !== original.record.id) setError(errors, 'id', 'El ID de una entidad existente no puede cambiar.');
    if (draft.entityType !== original.record.entityType) {
      setError(errors, 'entityType', 'El tipo de entidad no puede cambiar después de crearla.');
    }
    if (original.record.publishedAt !== null && draft.slug !== original.record.slug) {
      setError(errors, 'slug', 'El slug no puede cambiar después de la primera publicación.');
    }
    if (!validatesTransition(original.record.publicationStatus, draft.publicationStatus)) {
      setError(errors, 'publicationStatus', 'Una entidad archivada debe volver a borrador antes de publicarse.');
    }
  }

  return { valid: Object.keys(errors).length === 0, fieldErrors: errors };
}
