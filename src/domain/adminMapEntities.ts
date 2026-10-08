import type { EntityType } from '../data/beta02-model';
import type { MapEntityGeometry } from './mapGeometry';

export type MapEntityType = EntityType;
export type MapEntityLifecycleStatus = 'active' | 'completed' | 'failed' | 'resolved';
export type MapVisibility = 'pin' | 'search_only';
export type MapEntityAudience = 'public' | 'master';
export type PlayerDisposition = 'ally' | 'enemy' | 'neutral';
export type MapEntityPublicationStatus = 'draft' | 'published' | 'archived';

export interface AdminMapEntityRecord {
  readonly id: string;
  readonly slug: string;
  readonly entityType: MapEntityType;
  /** MAP-064 functional lifecycle, separate from publicationStatus. */
  readonly lifecycleStatus?: MapEntityLifecycleStatus | null;
  readonly visibility: MapVisibility;
  /**
   * Older in-memory fixtures predate MAP-044. Runtime repositories always return
   * this field; absence is interpreted as the migration default (`public`).
   */
  readonly audience?: MapEntityAudience;
  /** MAP-045 opaque private Storage reference; null/missing means no portrait. */
  readonly portraitPath?: string | null;
  /**
   * MAP-060 persistent geometry. Older fixtures/snapshots omit it and therefore
   * represent the historical point at x/y.
   */
  readonly geometry?: MapEntityGeometry | null;
  readonly x: number | null;
  readonly y: number | null;
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
  readonly accentColor: string;
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

export interface AdminEntityAssociation {
  readonly playerId: string;
  readonly displayName: string;
  readonly accentColor: string;
  readonly publicationStatus: MapEntityPublicationStatus;
  readonly createdAt: string;
}

export interface AdminMapEntityDeleteBlockers {
  readonly aliases: number;
  readonly tags: number;
  readonly geographicNames: number;
  readonly notes: number;
  readonly locationEvents: number;
  readonly requests: number;
  /** Missing only in legacy fixtures that predate MAP-058. */
  readonly playerAssociations?: number;
  readonly entityRelations?: number;
}

export interface AdminEntityRelation {
  readonly otherEntityId: string;
  readonly otherName: string;
  readonly otherEntityType: MapEntityType;
  readonly otherAudience: MapEntityAudience;
  readonly ownLabel: string;
  readonly otherLabel: string;
}

export interface AdminEntityRelationReference {
  readonly id: string;
  readonly name: string;
  readonly entityType: MapEntityType;
  readonly audience: MapEntityAudience;
  readonly publicationStatus: MapEntityPublicationStatus;
}

export interface AdminMapEntityDetail {
  readonly record: AdminMapEntityRecord;
  readonly tagLinks: readonly AdminEntityTagLink[];
  readonly dispositions: readonly AdminEntityDisposition[];
  /** Missing only in legacy fixtures/responses that predate MAP-058. */
  readonly associations?: readonly AdminEntityAssociation[];
  readonly entityRelations?: readonly AdminEntityRelation[];
  readonly relationEntities?: readonly AdminEntityRelationReference[];
  readonly relationsRevision: string;
  readonly entityRelationsRevision?: string;
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

export interface AdminEntityRelationDraft {
  readonly targetEntityId: string;
  readonly ownLabel: string;
  readonly targetLabel: string;
}

export interface AdminMapEntityDraft {
  readonly id: string;
  readonly slug: string;
  readonly entityType: MapEntityType;
  readonly lifecycleStatus?: MapEntityLifecycleStatus | null;
  readonly visibility: MapVisibility;
  /** See AdminMapEntityRecord.audience. Missing means the safe migration default. */
  readonly audience?: MapEntityAudience;
  readonly portraitPath?: string | null;
  /** Missing means the historical point represented by x/y. */
  readonly geometry?: MapEntityGeometry | null;
  readonly x: number | null;
  readonly y: number | null;
  readonly name: string;
  readonly summary: string;
  readonly description: string;
  readonly categoryId: string;
  readonly tagIds: readonly string[];
  readonly dispositions: readonly AdminDispositionDraft[];
  readonly playerAssociationIds?: readonly string[];
  readonly entityRelations?: readonly AdminEntityRelationDraft[];
  readonly publicationStatus: MapEntityPublicationStatus;
}

export function getMapEntityAudience(
  value: Pick<AdminMapEntityRecord | AdminMapEntityDraft, 'audience'>,
): MapEntityAudience {
  return value.audience ?? 'public';
}

export function getMapEntityLifecycleStatus(
  value: Pick<AdminMapEntityRecord | AdminMapEntityDraft, 'entityType' | 'lifecycleStatus'>,
): MapEntityLifecycleStatus | null {
  if (value.entityType === 'mission' || value.entityType === 'hazard') {
    return value.lifecycleStatus ?? 'active';
  }
  return null;
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
    lifecycleStatus: getMapEntityLifecycleStatus(detail.record),
    visibility: detail.record.visibility,
    audience: getMapEntityAudience(detail.record),
    portraitPath: detail.record.portraitPath ?? null,
    geometry: detail.record.geometry,
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
    playerAssociationIds: (detail.associations ?? [])
      .filter(({ publicationStatus }) => publicationStatus !== 'archived')
      .map(({ playerId }) => playerId),
    entityRelations: (detail.entityRelations ?? []).map((relation) => ({
      targetEntityId: relation.otherEntityId,
      ownLabel: relation.ownLabel,
      targetLabel: relation.otherLabel,
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
    lifecycleStatus: entityType === 'mission' || entityType === 'hazard' ? 'active' : null,
    visibility: entityType === 'organization' ? 'search_only' : 'pin',
    audience: 'public',
    portraitPath: null,
    name: '',
    summary: '',
    description: '',
    x: entityType === 'organization' ? null : Number.NaN,
    y: entityType === 'organization' ? null : Number.NaN,
    categoryId:
      references.categories.find((category) => category.publicationStatus !== 'archived')?.id ?? '',
    tagIds: [],
    dispositions:
      entityType === 'organization'
        ? []
        : references.players.map((player) => ({
            playerId: player.id,
            disposition: 'neutral',
          })),
    playerAssociationIds: [],
    entityRelations: [],
    publicationStatus: 'draft',
  };
}

export function hasDeleteBlockers(blockers: AdminMapEntityDeleteBlockers): boolean {
  return Object.values(blockers).some((count) => (count ?? 0) > 0);
}

export function canPhysicallyDeleteMapEntity(detail: AdminMapEntityDetail): boolean {
  return detail.record.publishedAt === null && !hasDeleteBlockers(detail.deleteBlockers);
}
