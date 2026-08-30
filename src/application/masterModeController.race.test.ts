import { describe, expect, test, vi } from 'vitest';

import type { AdminAuthController } from '../auth/adminAuthController';
import type { AdminAuthState } from '../auth/authState';
import type {
  AuthorizedMasterCatalog,
  MasterCatalogRepository,
} from '../data-access/masterCatalog';
import type { AdminMapEntityController, AdminMapEntityState } from './adminMapEntityController';
import { MasterModeController } from './masterModeController';

const CAMPAIGN_A = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B = '00000000-0000-4000-8000-000000000055';

const AUTH_STATE: AdminAuthState = {
  phase: 'authorized',
  identity: {
    userId: '00000000-0000-4000-8000-000000000001',
    email: 'admin@example.invalid',
    expiresAt: null,
  },
  issue: null,
  operationId: 1,
};

const MAP_STATE: AdminMapEntityState = {
  records: [],
  references: { categories: [], tags: [], players: [] },
  editorDetail: null,
  creating: false,
  phase: 'ready',
  issue: null,
  authorized: true,
  backendConnected: true,
  pendingAudience: 'public',
};

const EMPTY_CATALOG: AuthorizedMasterCatalog = {
  entities: [],
  categories: [],
  aliases: [],
  tags: [],
  entityTags: [],
  players: [],
  dispositions: [],
  associations: [],
  relations: [],
  relationEntities: [],
};

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred resolver was not initialized.');
  };
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function catalog(label: string): AuthorizedMasterCatalog {
  return {
    ...EMPTY_CATALOG,
    categories: [{ id: `category-${label}`, name: label }],
  };
}

function createController(repository: MasterCatalogRepository): MasterModeController {
  const auth = {
    getState: () => AUTH_STATE,
    subscribe(listener: (state: AdminAuthState) => void): () => void {
      listener(AUTH_STATE);
      return () => undefined;
    },
    invalidateFromAdministrativeResponse: vi.fn(),
  } as unknown as AdminAuthController;

  const entities = {
    getState: () => MAP_STATE,
    subscribe(listener: (state: AdminMapEntityState) => void): () => void {
      listener(MAP_STATE);
      return () => undefined;
    },
  } as unknown as AdminMapEntityController;

  return new MasterModeController(repository, auth, entities, CAMPAIGN_A);
}

describe('MasterModeController campaign race isolation', () => {
  test('ignores stale campaign A when it resolves after B even if the repository ignores abort', async () => {
    const staleA = deferred<AuthorizedMasterCatalog>();
    const currentB = deferred<AuthorizedMasterCatalog>();
    const staleACatalog = catalog('stale-a');
    const currentBCatalog = catalog('current-b');
    const signals: AbortSignal[] = [];

    const repository: MasterCatalogRepository = {
      load: vi.fn(({ signal, campaignId }) => {
        signals.push(signal);
        return campaignId === CAMPAIGN_A ? staleA.promise : currentB.promise;
      }),
    };
    const controller = createController(repository);

    const enabling = controller.setEnabled(true);
    await vi.waitFor(() => expect(repository.load).toHaveBeenCalledTimes(1));

    controller.setCampaign(CAMPAIGN_B);

    expect(signals[0]?.aborted).toBe(true);
    expect(controller.getState()).toMatchObject({
      enabled: true,
      phase: 'loading',
      catalog: null,
    });
    await vi.waitFor(() => expect(repository.load).toHaveBeenCalledTimes(2));

    currentB.resolve(currentBCatalog);
    await vi.waitFor(() => expect(controller.getState().catalog).toBe(currentBCatalog));

    staleA.resolve(staleACatalog);
    await enabling;
    await Promise.resolve();

    expect(controller.getState()).toMatchObject({ enabled: true, phase: 'on' });
    expect(controller.getState().catalog).toBe(currentBCatalog);
    expect(controller.getState().catalog).not.toBe(staleACatalog);

    controller.destroy();
  });

  test('A to B to A keeps only the newest generation when older responses resolve in reverse order', async () => {
    const firstA = deferred<AuthorizedMasterCatalog>();
    const staleB = deferred<AuthorizedMasterCatalog>();
    const currentA = deferred<AuthorizedMasterCatalog>();
    const firstACatalog = catalog('first-a');
    const staleBCatalog = catalog('stale-b');
    const currentACatalog = catalog('current-a');
    const loads = [firstA, staleB, currentA] as const;
    const requestedCampaigns: string[] = [];
    const signals: AbortSignal[] = [];

    const repository: MasterCatalogRepository = {
      load: vi.fn(({ signal, campaignId }) => {
        const index = requestedCampaigns.length;
        requestedCampaigns.push(campaignId);
        signals.push(signal);
        const next = loads[index];
        if (!next) throw new Error('Unexpected Master catalog load.');
        return next.promise;
      }),
    };
    const controller = createController(repository);

    const enabling = controller.setEnabled(true);
    await vi.waitFor(() => expect(repository.load).toHaveBeenCalledTimes(1));

    controller.setCampaign(CAMPAIGN_B);
    await vi.waitFor(() => expect(repository.load).toHaveBeenCalledTimes(2));
    controller.setCampaign(CAMPAIGN_A);
    await vi.waitFor(() => expect(repository.load).toHaveBeenCalledTimes(3));

    expect(requestedCampaigns).toEqual([CAMPAIGN_A, CAMPAIGN_B, CAMPAIGN_A]);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(true);
    expect(signals[2]?.aborted).toBe(false);

    currentA.resolve(currentACatalog);
    await vi.waitFor(() => expect(controller.getState().catalog).toBe(currentACatalog));

    staleB.resolve(staleBCatalog);
    firstA.resolve(firstACatalog);
    await enabling;
    await Promise.resolve();

    expect(controller.getState()).toMatchObject({ enabled: true, phase: 'on' });
    expect(controller.getState().catalog).toBe(currentACatalog);
    expect(controller.getState().catalog).not.toBe(staleBCatalog);
    expect(controller.getState().catalog).not.toBe(firstACatalog);

    controller.destroy();
  });
});
