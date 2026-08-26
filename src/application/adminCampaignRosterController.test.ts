import { describe, expect, it, vi } from 'vitest';

import {
  AdminCampaignRosterRepositoryError,
  type AdminCampaignRosterRepository,
} from '../data-access/adminCampaignRoster';
import type {
  AdminCampaignDraft,
  AdminCampaignRecord,
  AdminPlayerDraft,
  AdminPlayerRecord,
  CampaignStatus,
} from '../domain/adminCampaignRoster';
import { AdminCampaignContext } from './adminCampaignContext';
import { AdminCampaignRosterController } from './adminCampaignRosterController';

const CAMPAIGN_A = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B = '00000000-0000-4000-8000-000000000540';

const campaignA: AdminCampaignRecord = {
  id: CAMPAIGN_A,
  slug: 'castigo-divino',
  name: 'Castigo Divino',
  status: 'active',
  displayOrder: 0,
  archivedAt: null,
  updatedAt: '2026-08-26T10:00:00.000Z',
};

const campaignB: AdminCampaignRecord = {
  id: CAMPAIGN_B,
  slug: 'campana-b',
  name: 'Campaña B',
  status: 'active',
  displayOrder: 1,
  archivedAt: null,
  updatedAt: '2026-08-26T10:01:00.000Z',
};

const playerA: AdminPlayerRecord = {
  id: 'player-a',
  campaignId: CAMPAIGN_A,
  slug: 'player-a',
  displayName: 'Player A',
  publicationStatus: 'published',
  publishedAt: '2026-08-26T10:00:00.000Z',
  displayOrder: 0,
  accentColor: '#c2410c',
  archivedAt: null,
  updatedAt: '2026-08-26T10:00:00.000Z',
};

const playerB: AdminPlayerRecord = {
  ...playerA,
  id: 'player-b',
  campaignId: CAMPAIGN_B,
  slug: 'player-b',
  displayName: 'Player B',
  accentColor: '#1e3a8a',
};

class FakeRepository implements AdminCampaignRosterRepository {
  listCampaigns = vi.fn(async () => [campaignA, campaignB] as const);
  createCampaign = vi.fn(async (draft: AdminCampaignDraft) => ({
    ...campaignB,
    id: '00000000-0000-4000-8000-000000000541',
    slug: draft.slug,
    name: draft.name,
    displayOrder: draft.displayOrder,
  }));
  updateCampaign = vi.fn(
    async (original: AdminCampaignRecord, draft: AdminCampaignDraft) => ({
      ...original,
      name: draft.name,
      displayOrder: draft.displayOrder,
    }),
  );
  setCampaignStatus = vi.fn(
    async (
      original: AdminCampaignRecord,
      status: CampaignStatus,
    ): Promise<AdminCampaignRecord> => ({
      ...original,
      status,
      archivedAt: status === 'archived' ? '2026-08-26T11:00:00.000Z' : null,
    }),
  );
  listPlayers = vi.fn(async (campaignId: string) =>
    campaignId === CAMPAIGN_B ? [playerB] : [playerA],
  );
  createPlayer = vi.fn(async (campaignId: string, draft: AdminPlayerDraft) => ({
    ...playerA,
    id: 'player-created',
    campaignId,
    displayName: draft.displayName,
    displayOrder: draft.displayOrder,
    accentColor: draft.accentColor,
  }));
  updatePlayer = vi.fn(
    async (_campaignId: string, original: AdminPlayerRecord, draft: AdminPlayerDraft) => ({
      ...original,
      displayName: draft.displayName,
      displayOrder: draft.displayOrder,
      accentColor: draft.accentColor,
    }),
  );
  setPlayerArchived = vi.fn(
    async (_campaignId: string, original: AdminPlayerRecord, archived: boolean) => ({
      ...original,
      publicationStatus: archived ? ('archived' as const) : ('published' as const),
      archivedAt: archived ? '2026-08-26T11:00:00.000Z' : null,
    }),
  );
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('AdminCampaignRosterController', () => {
  it('blocks reads and mutations until authorization and backend are both available', async () => {
    const repository = new FakeRepository();
    const controller = new AdminCampaignRosterController(repository, new AdminCampaignContext());

    controller.setAccess(true, false);
    await controller.reload();

    expect(repository.listCampaigns).not.toHaveBeenCalled();
    expect(controller.getState().phase).toBe('blocked');
  });

  it('loads the initial roster and switches campaign context before exposing the new roster', async () => {
    const repository = new FakeRepository();
    const context = new AdminCampaignContext();
    const controller = new AdminCampaignRosterController(repository, context);

    controller.setAccess(true, true);
    await flush();

    expect(controller.getState().phase).toBe('ready');
    expect(controller.getState().players.map(({ id }) => id)).toEqual(['player-a']);
    expect(repository.listPlayers).toHaveBeenLastCalledWith(CAMPAIGN_A, expect.any(Object));

    await expect(controller.selectCampaign(CAMPAIGN_B)).resolves.toBe(true);
    expect(context.getCampaignId()).toBe(CAMPAIGN_B);
    expect(controller.getState().players.map(({ id }) => id)).toEqual(['player-b']);
    expect(repository.listPlayers).toHaveBeenLastCalledWith(CAMPAIGN_B, expect.any(Object));
  });

  it('scopes roster creation and archival to the selected campaign', async () => {
    const repository = new FakeRepository();
    const context = new AdminCampaignContext();
    const controller = new AdminCampaignRosterController(repository, context);
    controller.setAccess(true, true);
    await flush();
    await controller.selectCampaign(CAMPAIGN_B);

    await expect(
      controller.createPlayer({
        displayName: 'Created B',
        displayOrder: 2,
        accentColor: '#1e3a8a',
      }),
    ).resolves.toBe(true);
    expect(repository.createPlayer).toHaveBeenCalledWith(
      CAMPAIGN_B,
      expect.objectContaining({ displayName: 'Created B' }),
      expect.any(Object),
    );

    await expect(controller.setPlayerArchived(playerB, true)).resolves.toBe(true);
    expect(repository.setPlayerArchived).toHaveBeenCalledWith(
      CAMPAIGN_B,
      playerB,
      true,
      expect.any(Object),
    );
  });

  it('propagates administrative authorization rejection on a 403 repository response', async () => {
    const repository = new FakeRepository();
    const onAuthorizationRejected = vi.fn();
    repository.listCampaigns.mockRejectedValueOnce(
      new AdminCampaignRosterRepositoryError('unauthorized', 'forbidden', { status: 403 }),
    );
    const controller = new AdminCampaignRosterController(repository, new AdminCampaignContext(), {
      onAuthorizationRejected,
    });

    controller.setAccess(true, true);
    await flush();

    expect(onAuthorizationRejected).toHaveBeenCalledWith(403);
    expect(controller.getState().issue?.code).toBe('unauthorized');
  });
});
