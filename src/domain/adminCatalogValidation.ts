import type {
  AdminCatalogDraft,
  AdminCatalogRecord,
  AdminCatalogResourceKind,
} from './adminCatalog';
import { getAdminRecordDisplayName } from './adminCatalog';

export interface AdminCatalogValidationResult {
  readonly valid: boolean;
  readonly fieldErrors: Readonly<Record<string, string>>;
}

const SAFE_SLUG = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const CATEGORY_ID = /^category-[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const ENTITY_ALIAS_ID = /^alias-[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const GEOGRAPHIC_NAME_ID = /^geo-[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const GEOGRAPHIC_ALIAS_ID = /^geo-alias-[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;

export function normalizeAdminSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function requiredText(
  errors: Record<string, string>,
  field: string,
  value: string,
  maxLength: number,
): void {
  const trimmed = value.trim();

  if (!trimmed) {
    errors[field] = 'Este campo es obligatorio.';
  } else if (trimmed.length > maxLength) {
    errors[field] = `Debe tener como máximo ${maxLength} caracteres.`;
  }
}

function safeIdentifier(
  errors: Record<string, string>,
  field: string,
  value: string,
  pattern: RegExp,
  message: string,
): void {
  if (!pattern.test(value)) {
    errors[field] = message;
  }
}

function validateStatusTransition(
  errors: Record<string, string>,
  draft: AdminCatalogDraft,
  original: AdminCatalogRecord | null,
): void {
  if (original?.publicationStatus === 'archived' && draft.publicationStatus === 'published') {
    errors.publicationStatus = 'Un registro archivado debe volver primero a borrador.';
  }
}

function validateLocalNameCollision(
  errors: Record<string, string>,
  draft: AdminCatalogDraft,
  existing: readonly AdminCatalogRecord[],
  original: AdminCatalogRecord | null,
): void {
  if (draft.publicationStatus !== 'published') {
    return;
  }

  const candidate =
    draft.kind === 'entity-alias' || draft.kind === 'geographic-alias'
      ? draft.value
      : draft.kind === 'category' || draft.kind === 'tag' || draft.kind === 'geographic-name'
        ? draft.name
        : '';
  const normalizedCandidate = normalizeAdminSearchText(candidate);

  if (!normalizedCandidate) {
    return;
  }

  const collides = existing.some((record) => {
    if (record.id === original?.id || record.publicationStatus !== 'published') {
      return false;
    }

    if (draft.kind === 'geographic-name' || draft.kind === 'geographic-alias') {
      if (record.kind !== 'geographic-name' && record.kind !== 'geographic-alias') {
        return false;
      }
    } else if (draft.kind === 'entity-alias') {
      if (record.kind !== 'entity-alias') {
        return false;
      }
    } else if (record.kind !== draft.kind) {
      return false;
    }

    return normalizeAdminSearchText(getAdminRecordDisplayName(record)) === normalizedCandidate;
  });

  if (collides) {
    const field =
      draft.kind === 'entity-alias' || draft.kind === 'geographic-alias' ? 'value' : 'name';
    errors[field] = 'Ya existe un nombre publicado equivalente.';
  }
}

export function validateAdminCatalogDraft(
  draft: AdminCatalogDraft,
  options: {
    readonly original?: AdminCatalogRecord | null;
    readonly existing?: readonly AdminCatalogRecord[];
  } = {},
): AdminCatalogValidationResult {
  const errors: Record<string, string> = {};
  const original = options.original ?? null;
  const existing = options.existing ?? [];

  switch (draft.kind) {
    case 'category':
      safeIdentifier(
        errors,
        'id',
        draft.id,
        CATEGORY_ID,
        'Usa un ID category-... en minúsculas y kebab-case.',
      );
      safeIdentifier(
        errors,
        'slug',
        draft.slug,
        SAFE_SLUG,
        'Usa un slug en minúsculas y kebab-case.',
      );
      requiredText(errors, 'name', draft.name, 120);
      if (draft.description.length > 1000) {
        errors.description = 'Debe tener como máximo 1000 caracteres.';
      }
      break;
    case 'tag':
      safeIdentifier(errors, 'id', draft.id, SAFE_SLUG, 'Usa un ID en minúsculas y kebab-case.');
      requiredText(errors, 'name', draft.name, 120);
      if (draft.description.length > 1000) {
        errors.description = 'Debe tener como máximo 1000 caracteres.';
      }
      break;
    case 'entity-alias':
      safeIdentifier(
        errors,
        'id',
        draft.id,
        ENTITY_ALIAS_ID,
        'Usa un ID alias-... en minúsculas y kebab-case.',
      );
      requiredText(errors, 'entityId', draft.entityId, 160);
      requiredText(errors, 'value', draft.value, 160);
      if (draft.language !== 'en') {
        errors.language = 'Beta 0.2 solo admite nombres en inglés.';
      }
      break;
    case 'geographic-name':
      safeIdentifier(
        errors,
        'id',
        draft.id,
        GEOGRAPHIC_NAME_ID,
        'Usa un ID geo-... en minúsculas y kebab-case.',
      );
      safeIdentifier(
        errors,
        'slug',
        draft.slug,
        SAFE_SLUG,
        'Usa un slug en minúsculas y kebab-case.',
      );
      requiredText(errors, 'name', draft.name, 160);
      if (draft.language !== 'en') {
        errors.language = 'Beta 0.2 solo admite nombres en inglés.';
      }
      if (!Number.isFinite(draft.x) || draft.x < 0 || draft.x > 3600) {
        errors.x = 'La coordenada X debe estar entre 0 y 3600.';
      }
      if (!Number.isFinite(draft.y) || draft.y < 0 || draft.y > 2329) {
        errors.y = 'La coordenada Y debe estar entre 0 y 2329.';
      }
      if (
        draft.recommendedZoom !== null &&
        (!Number.isFinite(draft.recommendedZoom) ||
          draft.recommendedZoom < -5 ||
          draft.recommendedZoom > 10)
      ) {
        errors.recommendedZoom = 'El zoom recomendado debe estar entre -5 y 10.';
      }
      break;
    case 'geographic-alias':
      safeIdentifier(
        errors,
        'id',
        draft.id,
        GEOGRAPHIC_ALIAS_ID,
        'Usa un ID geo-alias-... en minúsculas y kebab-case.',
      );
      requiredText(errors, 'geographicNameId', draft.geographicNameId, 160);
      requiredText(errors, 'value', draft.value, 160);
      if (draft.language !== 'en') {
        errors.language = 'Beta 0.2 solo admite nombres en inglés.';
      }
      break;
  }

  if (original && original.kind !== draft.kind) {
    errors.id = 'El tipo de recurso no puede cambiar durante la edición.';
  }

  if (original && original.id !== draft.id) {
    errors.id = 'El ID es estable y no puede modificarse.';
  }

  validateStatusTransition(errors, draft, original);
  validateLocalNameCollision(errors, draft, existing, original);

  return { valid: Object.keys(errors).length === 0, fieldErrors: errors };
}

export function resourceAllowsPhysicalDelete(record: AdminCatalogRecord): boolean {
  return record.publicationStatus !== 'published' && record.publishedAt === null;
}

export function resourceRequiresParent(kind: AdminCatalogResourceKind): boolean {
  return kind === 'entity-alias' || kind === 'geographic-alias';
}
