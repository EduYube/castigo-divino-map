import type { MapCoordinate } from './mapCoordinates';

export type MapEntityType = 'character' | 'location';
export type MapVisibility = 'pin' | 'search_only';
export type MapEntityAudience = 'public' | 'master';
export type PlayerDisposition = 'ally' | 'enemy' | 'neutral';
export type MapEntityPublicationStatus = 'draft' | 'published' | 'archived';

export interface AdminMapEntityRecord extends MapCoordinate {
  readonly id: string;
  readonly slug: string;
  readonly entityType: MapEntityType;
  readonly visibility: MapVisibility;
  /**
   * Older in-memory fixtures predate MAP-044. Runtime repositories always return
   * this field; absence is interpreted as the migration default (`public`).
   */
  readonly audience?: MapEntityAudience;
  /** MAP-045 opaque private Storage reference; null/missing means no portrait. */
  readonly portraitPath?: string | null;
  readonly name: string;
  readonly summary: string;
  readonly description: string;
  readonly categoryId: string;
  readonly publicationStatus: MapEntityPublicationStatus;
  readonly publishedAt: string | null;
  readonly archivedAt: string | null;
  readonly updatedAt: string;
}

export interface AdminCategoryReference {
  readonly id: string;
  readonly name: string;
  readonly publicationStatus: MapEntityPublicationStatus;
}

export interface AdminTagReference {
  readonly id: string;
  readonly name: string;
  readonly publicationStatus: MapEntityPublicationStatus;
}

export interface AdminPlayerReference {
  readonly id: string;
  readonly displayName: string;
  readonly publicationStatus: MapEntityPublicationStatus;
}

export interface AdminEntityTagLink {
  readonly id: string;
  readonly tagId: string;
  readonly publicationStatus: MapEntityPublicationStatus;
  readonly publishedAt: string | null;
  readonly updatedAt: string;
}

export interface AdminEntityDisposition {
  readonly playerId: string;
  readonly displayName: string;
  readonly disposition: PlayerDisposition;
  readonly updatedAt: string;
}

export interface AdminMapEntityDeleteBlockers {
  readonly aliases: number;
  readonly tags: number;
  readonly geographicNames: number;
  readonly notes: number;
  readonly locationEvents: number;
  readonly requests: number;
}

export interface AdminMapEntityDetail {
  readonly record: AdminMapEntityRecord;
  readonly tagLinks: readonly AdminEntityTagLink[];
  readonly dispositions: readonly AdminEntityDisposition[];
  readonly relationsRevision: string;
  readonly deleteBlockers: AdminMapEntityDeleteBlockers;
}

export interface AdminMapEntityReferences {
  readonly categories: readonly AdminCategoryReference[];
  readonly tags: readonly AdminTagReference[];
  readonly players: readonly AdminPlayerReference[];
}

export interface AdminDispositionDraft {
  readonly playerId: string;
  readonly disposition: PlayerDisposition;
}

export interface AdminMapEntityDraft extends MapCoordinate {
  readonly id: string;
  readonly slug: string;
  readonly entityType: MapEntityType;
  readonly visibility: MapVisibility;
  /** See AdminMapEntityRecord.audience. Missing means the safe migration default. */
  readonly audience?: MapEntityAudience;
  readonly portraitPath?: string | null;
  readonly name: string;
  readonly summary: string;
  readonly description: string;
  readonly categoryId: string;
  readonly tagIds: readonly string[];
  readonly dispositions: readonly AdminDispositionDraft[];
  readonly publicationStatus: MapEntityPublicationStatus;
}

export function getMapEntityAudience(
  value: Pick<AdminMapEntityRecord | AdminMapEntityDraft, 'audience'>,
): MapEntityAudience {
  return value.audience ?? 'public';
}

export function getSelectedTagIds(detail: AdminMapEntityDetail): readonly string[] {
  return detail.tagLinks
    .filter((link) => link.publicationStatus !== 'archived')
    .map((link) => link.tagId);
}

export function detailToDraft(detail: AdminMapEntityDetail): AdminMapEntityDraft {
  return {
    id: detail.record.id,
    slug: detail.record.slug,
    entityType: detail.record.entityType,
    visibility: detail.record.visibility,
    audience: getMapEntityAudience(detail.record),
    portraitPath: detail.record.portraitPath ?? null,
    name: detail.record.name,
    summary: detail.record.summary,
    description: detail.record.description,
    x: detail.record.x,
    y: detail.record.y,
    categoryId: detail.record.categoryId,
    tagIds: getSelectedTagIds(detail),
    dispositions: detail.dispositions.map(({ playerId, disposition }) => ({
      playerId,
      disposition,
    })),
    publicationStatus: detail.record.publicationStatus,
  };
}

export function createEmptyMapEntityDraft(
  references: AdminMapEntityReferences,
  entityType: MapEntityType = 'character',
): AdminMapEntityDraft {
  return {
    id: 'entity-',
    slug: '',
    entityType,
    visibility: 'pin',
    audience: 'public',
    portraitPath: null,
    name: '',
    summary: '',
    description: '',
    x: Number.NaN,
    y: Number.NaN,
    categoryId:
      references.categories.find((category) => category.publicationStatus !== 'archived')?.id ?? '',
    tagIds: [],
    dispositions: references.players.map((player) => ({
      playerId: player.id,
      disposition: 'neutral',
    })),
    publicationStatus: 'draft',
  };
}

export function hasDeleteBlockers(blockers: AdminMapEntityDeleteBlockers): boolean {
  return Object.values(blockers).some((count) => count > 0);
}

export function canPhysicallyDeleteMapEntity(detail: AdminMapEntityDetail): boolean {
  return detail.record.publishedAt === null && !hasDeleteBlockers(detail.deleteBlockers);
}
