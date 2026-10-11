import type { AdminCatalogResourceKind } from './adminCatalog';
import type { AdminCampaignRecord } from './adminCampaignRoster';

export function resolveAdminCampaignName(
  campaigns: readonly Pick<AdminCampaignRecord, 'id' | 'name'>[],
  campaignId: string,
  fallback = campaignId,
): string {
  return campaigns.find(({ id }) => id === campaignId)?.name ?? fallback;
}

export function isCampaignScopedAdminCatalogResource(
  resourceKind: AdminCatalogResourceKind,
): boolean {
  return (
    resourceKind === 'category' ||
    resourceKind === 'tag' ||
    resourceKind === 'entity-alias'
  );
}

export function describePublicAdminCampaignRelationship(
  campaigns: readonly Pick<AdminCampaignRecord, 'id' | 'name'>[],
  adminCampaignId: string,
  publicCampaignId: string,
  publicFallback: string,
): string {
  const adminName = resolveAdminCampaignName(campaigns, adminCampaignId);
  const publicName = resolveAdminCampaignName(campaigns, publicCampaignId, publicFallback);
  return adminCampaignId === publicCampaignId
    ? `Campaña pública visible: ${publicName}. Coincide con la campaña administrativa.`
    : `Campaña pública visible: ${publicName}. La edición sigue afectando solo a ${adminName}.`;
}
