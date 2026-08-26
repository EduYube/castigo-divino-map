export interface RemotePublicRowsOptions {
  readonly projectUrl?: string;
  readonly publishableKey?: string;
  readonly fetchImplementation?: typeof fetch;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly campaignId?: string;
}

export interface PublicCampaignSnapshotV3 {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: 'active';
  readonly displayOrder: number;
}

export interface PublicMulticampaignRows {
  readonly campaigns: readonly Record<string, unknown>[];
  readonly global: Record<string, readonly Record<string, unknown>[]>;
  readonly campaignsById: Record<string, Record<string, readonly Record<string, unknown>[]>>;
}

export const INITIAL_PUBLIC_CAMPAIGN: Readonly<PublicCampaignSnapshotV3>;

export function loadRemotePublicRows(
  options?: RemotePublicRowsOptions,
): Promise<Record<string, readonly Record<string, unknown>[]>>;

export function loadRemotePublicMulticampaignRows(
  options?: RemotePublicRowsOptions,
): Promise<PublicMulticampaignRows>;

export function buildPublicSnapshotContent(raw: Record<string, unknown>): Record<string, unknown>;
export function buildPublicMulticampaignSnapshotContent(
  raw: PublicMulticampaignRows,
): Record<string, unknown>;
export function upgradeLegacySnapshotContentV2(content: unknown): Record<string, unknown>;
export function projectMulticampaignSnapshotContentToV2(
  content: unknown,
  campaignId?: string,
): Record<string, unknown>;
export function assertPublicMulticampaignSnapshotContent(content: unknown): void;
