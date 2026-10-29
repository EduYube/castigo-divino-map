import type { MapEntityType } from './adminMapEntities';
import { normalizeMapEntityGeometry, type MapEntityGeometry } from './mapGeometry';
import { FAERUN_COORDINATE_BOUNDS } from './mapCoordinates';

export type LocalPublicationStatus = 'draft' | 'published' | 'archived';
export type LocalLoadingStrategy = 'remote' | 'bundled' | null;
export interface LocalMapContext {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  width: number;
  height: number;
  publicationStatus: LocalPublicationStatus;
  imageUri: string | null;
  loadingStrategy: LocalLoadingStrategy;
  sourceUrl: string | null;
  rightsHolder: string | null;
  attribution: string | null;
  licenseNotes: string | null;
  updatedAt: string;
}
export type LocalMapContextDraft = Omit<LocalMapContext, 'updatedAt'>;
export interface LocalMapBinding {
  campaignId: string;
  geographicNameId: string;
  mapContextId: string;
}
export interface LocalMapPlacement {
  campaignId: string;
  mapContextId: string;
  entityId: string;
  geometry: MapEntityGeometry;
  publicationStatus: LocalPublicationStatus;
  updatedAt: string;
}
export interface LocalMapEntity {
  id: string;
  name: string;
  entityType: MapEntityType;
}
export interface LocalGeography {
  id: string;
  name: string;
}
export type FieldErrors = Readonly<Record<string, string>>;
const CONTEXT_ID = /^map-[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const SLUG = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;

export function isLocalCoordinateInBounds(
  x: number,
  y: number,
  context: Pick<LocalMapContext, 'width' | 'height'>,
): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0 &&
    y >= 0 &&
    x <= context.width &&
    y <= context.height
  );
}

/** Reuse MAP-060 polygon topology checks after an affine transformation into world bounds. */
export function validateLocalGeometry(
  geometry: unknown,
  entityType: MapEntityType,
  context: Pick<LocalMapContext, 'width' | 'height'>,
): MapEntityGeometry {
  if (entityType === 'organization') throw new Error('Una organización no puede tener placement.');
  if (!(context.width > 0 && context.height > 0)) throw new Error('Dimensiones inválidas.');
  if (typeof geometry !== 'object' || !geometry) throw new Error('Geometría necesaria.');
  const source = geometry as Partial<MapEntityGeometry>;
  const scaleX = FAERUN_COORDINATE_BOUNDS.maxX / context.width;
  const scaleY = FAERUN_COORDINATE_BOUNDS.maxY / context.height;
  const scale = (v: { x: number; y: number }) => {
    if (!isLocalCoordinateInBounds(v.x, v.y, context))
      throw new Error('Coordenadas fuera del contexto.');
    return { x: v.x * scaleX, y: v.y * scaleY };
  };
  if (source.kind === 'point' && source.coordinates) {
    const original = source.coordinates;
    normalizeMapEntityGeometry(entityType, { kind: 'point', coordinates: scale(original) });
    return { kind: 'point', coordinates: { x: original.x, y: original.y } };
  }
  if (source.kind === 'polygon' && Array.isArray(source.vertices)) {
    const original = source.vertices;
    const normalized = normalizeMapEntityGeometry(entityType, {
      kind: 'polygon',
      vertices: original.map(scale),
    });
    if (normalized.kind !== 'polygon') throw new Error('Polígono inválido.');
    // Preserve original coordinate precision while applying the shared topology/canonical order.
    return {
      kind: 'polygon',
      vertices: normalized.vertices.map((v) => ({
        x: Number((v.x / scaleX).toPrecision(15)),
        y: Number((v.y / scaleY).toPrecision(15)),
      })),
    };
  }
  throw new Error('La geometría debe ser un punto o un polígono válido.');
}

export function localContextDescendants(
  contexts: readonly LocalMapContext[],
  id: string,
): Set<string> {
  const children = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const context of contexts) {
      if (
        context.parentId &&
        (context.parentId === id || children.has(context.parentId)) &&
        !children.has(context.id)
      ) {
        children.add(context.id);
        changed = true;
      }
    }
  }
  return children;
}

export function validateLocalContext(
  draft: LocalMapContextDraft,
  original: LocalMapContext | null,
  contexts: readonly LocalMapContext[],
  hasPlacements: boolean,
): FieldErrors {
  const errors: Record<string, string> = {};
  if (!CONTEXT_ID.test(draft.id))
    errors.id = 'ID estable: map- seguido de letras minúsculas, números o guiones.';
  if (!SLUG.test(draft.slug)) errors.slug = 'Slug estable: letras minúsculas, números o guiones.';
  if (draft.name.trim().length < 1 || draft.name.trim().length > 160)
    errors.name = 'El nombre debe tener entre 1 y 160 caracteres.';
  if (!Number.isFinite(draft.width) || draft.width <= 0)
    errors.width = 'La anchura debe ser positiva y finita.';
  if (!Number.isFinite(draft.height) || draft.height <= 0)
    errors.height = 'La altura debe ser positiva y finita.';
  if (!['draft', 'published', 'archived'].includes(draft.publicationStatus))
    errors.publicationStatus = 'Estado no permitido.';
  if (original?.publicationStatus === 'archived' && draft.publicationStatus === 'published')
    errors.publicationStatus = 'Un contexto archivado debe pasar por borrador antes de publicarse.';
  if (original && (draft.id !== original.id || draft.slug !== original.slug))
    errors.id = 'ID y slug son inmutables.';
  if (
    original &&
    hasPlacements &&
    (draft.width !== original.width || draft.height !== original.height)
  ) {
    errors.width = 'No se pueden cambiar dimensiones con placements existentes.';
    errors.height = errors.width;
  }
  if (draft.parentId) {
    if (
      draft.parentId === draft.id ||
      localContextDescendants(contexts, draft.id).has(draft.parentId)
    )
      errors.parentId = 'No se permite un ciclo en la jerarquía.';
    const parent = contexts.find((c) => c.id === draft.parentId);
    if (!parent) errors.parentId = 'Selecciona un contexto padre existente.';
    else if (draft.publicationStatus === 'published' && parent.publicationStatus !== 'published')
      errors.parentId = 'Un contexto publicado requiere un padre publicado.';
  }
  if (
    original?.publicationStatus === 'published' &&
    draft.publicationStatus !== 'published' &&
    contexts.some((c) => c.parentId === draft.id && c.publicationStatus === 'published')
  ) {
    errors.publicationStatus = 'Archiva primero los contextos hijos publicados.';
  }
  if (draft.imageUri) {
    if (!draft.loadingStrategy)
      errors.loadingStrategy = 'Selecciona remote o bundled para una imagen.';
    if (!draft.sourceUrl?.trim()) errors.sourceUrl = 'Indica la fuente de la imagen.';
    if (!draft.rightsHolder?.trim()) errors.rightsHolder = 'Indica el titular de derechos.';
    if (!draft.licenseNotes?.trim()) errors.licenseNotes = 'Documenta las condiciones de licencia.';
  } else if (draft.loadingStrategy)
    errors.loadingStrategy = 'Sin URI, la estrategia debe estar vacía.';
  if (draft.loadingStrategy !== null && !['remote', 'bundled'].includes(draft.loadingStrategy))
    errors.loadingStrategy = 'Estrategia no admitida.';
  return errors;
}
