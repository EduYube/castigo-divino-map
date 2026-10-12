import { describe, expect, it } from 'vitest';
import type { AdminCampaignRecord } from './adminCampaignRoster';
import {
  describePublicAdminCampaignRelationship,
  isCampaignScopedAdminCatalogResource,
  resolveAdminCampaignName,
} from './adminCampaignUx';

const campaigns: readonly AdminCampaignRecord[] = [
  {
    id: 'campaign-a',
    slug: 'castigo-divino',
    name: 'Castigo Divino',
    status: 'active',
    displayOrder: 0,
    archivedAt: null,
    updatedAt: '2026-10-11T00:00:00.000Z',
  },
  {
    id: 'campaign-b',
    slug: 'un-aliento-menos',
    name: 'Un aliento menos',
    status: 'active',
    displayOrder: 1,
    archivedAt: null,
    updatedAt: '2026-10-11T00:00:00.000Z',
  },
];

describe('admin campaign UX helpers', () => {
  it('derives legible campaign names without hardcoded roster names', () => {
    expect(resolveAdminCampaignName(campaigns, 'campaign-a')).toBe('Castigo Divino');
    expect(resolveAdminCampaignName(campaigns, 'missing', 'Campaña externa')).toBe(
      'Campaña externa',
    );
  });

  it('makes public/admin divergence explicit', () => {
    expect(
      describePublicAdminCampaignRelationship(
        campaigns,
        'campaign-b',
        'campaign-a',
        'castigo-divino',
      ),
    ).toBe(
      'Campaña pública visible: Castigo Divino. La edición sigue afectando solo a Un aliento menos.',
    );
  });

  it('keeps global geographic catalog resources outside campaign purge', () => {
    expect(isCampaignScopedAdminCatalogResource('category')).toBe(true);
    expect(isCampaignScopedAdminCatalogResource('tag')).toBe(true);
    expect(isCampaignScopedAdminCatalogResource('entity-alias')).toBe(true);
    expect(isCampaignScopedAdminCatalogResource('geographic-name')).toBe(false);
    expect(isCampaignScopedAdminCatalogResource('geographic-alias')).toBe(false);
  });
});
