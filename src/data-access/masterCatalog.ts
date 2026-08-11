import type {
  MapEntityAudience,
  MapEntityType,
  MapVisibility,
  PlayerDisposition,
} from '../domain/adminMapEntities';

export interface MasterCatalogEntity {
  readonly id: string;
  readonly slug: string;
  readonly entityType: MapEntityType;
  readonly visibility: MapVisibility;
  readonly audience: Extract<MapEntityAudience, 'master'>;
  readonly name: string;
  readonly summary: string;
  readonly description: string;
  readonly portraitPath?: string | null;
  readonly x: number;
  readonly y: number;
  readonly categoryId: string;
  readonly updatedAt: string;
}

export interface MasterCatalogCategory {
  readonly id: string;
  readonly name: string;
}

export interface MasterCatalogAlias {
  readonly id: string;
  readonly entityId: string;
  readonly value: string;
}

export interface MasterCatalogTag {
  readonly id: string;
  readonly name: string;
}

export interface MasterCatalogEntityTag {
  readonly entityId: string;
  readonly tagId: string;
}

export interface MasterCatalogPlayer {
  readonly id: string;
  readonly displayName: string;
}

export interface MasterCatalogDisposition {
  readonly entityId: string;
  readonly playerId: string;
  readonly disposition: PlayerDisposition;
}

export interface MasterCatalogRelation {
  readonly characterId: string;
  readonly locationId: string;
  readonly relationStatus: 'present' | 'associated' | 'last-seen';
}

export interface MasterCatalogRelationEntity {
  readonly id: string;
  readonly name: string;
  readonly entityType: MapEntityType;
  readonly audience: MapEntityAudience;
}

export interface AuthorizedMasterCatalog {
  readonly entities: readonly MasterCatalogEntity[];
  readonly categories: readonly MasterCatalogCategory[];
  readonly aliases: readonly MasterCatalogAlias[];
  readonly tags: readonly MasterCatalogTag[];
  readonly entityTags: readonly MasterCatalogEntityTag[];
  readonly players: readonly MasterCatalogPlayer[];
  readonly dispositions: readonly MasterCatalogDisposition[];
  readonly relations: readonly MasterCatalogRelation[];
  readonly relationEntities: readonly MasterCatalogRelationEntity[];
}

export type MasterCatalogRepositoryErrorCode =
  | 'session-expired'
  | 'unauthorized'
  | 'backend-unavailable'
  | 'request-timeout'
  | 'invalid-response'
  | 'unexpected';

export class MasterCatalogRepositoryError extends Error {
  readonly code: MasterCatalogRepositoryErrorCode;
  readonly status: number | null;

  constructor(
    code: MasterCatalogRepositoryErrorCode,
    message: string,
    options: { readonly status?: number; readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'MasterCatalogRepositoryError';
    this.code = code;
    this.status = options.status ?? null;
  }
}

export interface MasterCatalogRepository {
  load(options: { readonly signal: AbortSignal }): Promise<AuthorizedMasterCatalog>;
}
