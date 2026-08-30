import type {
  PublicCategory,
  PublicCharacterLocationEvent,
  PublicCharacterLocationRelation,
  PublicEntityPlayerAssociation,
  PublicEntityPlayerDisposition,
  PublicGeographicName,
  PublicMapEntity,
  PublicNote,
  PublicPlayer,
  PublicTag,
} from './beta02-model';

export type CampaignId = string;

export interface PublicCampaignV3 {
  readonly id: CampaignId;
  readonly slug: string;
  readonly name: string;
  readonly status: 'active';
  readonly displayOrder: number;
}

export interface PublicCampaignGeographicEntityLinkV3 {
  readonly campaignId: CampaignId;
  readonly geographicNameId: string;
  readonly entityId: string;
}

/**
 * Campaign scope is represented structurally by the containing campaignId.
 * Keeping the v1.0 row shapes intact makes projection back to Beta 0.2 lossless.
 */
export interface PublicCampaignCatalogV3 {
  readonly campaignId: CampaignId;
  readonly categories: readonly PublicCategory[];
  readonly tags: readonly PublicTag[];
  readonly players: readonly PublicPlayer[];
  readonly entities: readonly PublicMapEntity[];
  readonly dispositions: readonly PublicEntityPlayerDisposition[];
  readonly associations: readonly PublicEntityPlayerAssociation[];
  readonly characterLocationRelations: readonly PublicCharacterLocationRelation[];
  readonly notes: readonly PublicNote[];
  readonly characterLocationEvents: readonly PublicCharacterLocationEvent[];
  readonly geographicEntityLinks: readonly PublicCampaignGeographicEntityLinkV3[];
}

/**
 * Global geographic names deliberately have no campaign entity pointer in v3.
 * The pointer lives in PublicCampaignGeographicEntityLinkV3 instead.
 */
export type PublicGlobalGeographicNameV3 = Omit<PublicGeographicName, 'entityId'>;

export interface PublicCatalogSnapshotV3 {
  readonly schemaVersion: 3;
  readonly generatedAt: string;
  readonly sourceRevision: string;
  readonly checksum: string;
  readonly campaigns: readonly PublicCampaignV3[];
  readonly campaignCatalogs: readonly PublicCampaignCatalogV3[];
  readonly geographicNames: readonly PublicGlobalGeographicNameV3[];
}
