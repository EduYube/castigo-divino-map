import type {
  PublicCampaignV3,
  PublicCampaignCatalogV3,
  PublicGlobalGeographicNameV3,
} from './beta03-model';
import type { PublicLocalMapData } from '../infrastructure/supabase/publicLocalMapRepository';

/**
 * V4 is a single public revision with TWO distinct spatial projections:
 * campaignCatalogs contain world-enabled entities only. campaignLocalMaps
 * contain local placements and local-only canonical metadata.
 */
export interface PublicMapContextV4 {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly width: number;
  readonly height: number;
  readonly imageUri: string | null;
}

export interface PublicGeographicMapContextLinkV4 {
  readonly campaignId: string;
  readonly geographicNameId: string;
  readonly contextId: string;
}

export interface PublicCampaignLocalMapV4 extends PublicLocalMapData {
  readonly geographicMapContextLinks: readonly PublicGeographicMapContextLinkV4[];
}

export interface PublicCatalogSnapshotV4 {
  readonly schemaVersion: 4;
  readonly generatedAt: string;
  readonly sourceRevision: string;
  readonly checksum: string;
  readonly campaigns: readonly PublicCampaignV3[];
  readonly campaignCatalogs: readonly PublicCampaignCatalogV3[];
  readonly geographicNames: readonly PublicGlobalGeographicNameV3[];
  readonly mapContexts: readonly PublicMapContextV4[];
  readonly campaignLocalMaps: readonly PublicCampaignLocalMapV4[];
}
