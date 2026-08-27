import { describe, expect, test, vi } from 'vitest';

import type { AdminAuthController } from '../auth/adminAuthController';
import type { AdminAuthState } from '../auth/authState';
import {
  MasterCatalogRepositoryError,
  type AuthorizedMasterCatalog,
  type MasterCatalogRepository,
} from '../data-access/masterCatalog';
import type { AdminMapEntityController, AdminMapEntityState } from './adminMapEntityController';
import { MasterModeController } from './masterModeController';

const CAMPAIGN_A = '00000000-0000-4000-8000-000000000053';
const CAMPAIGN_B = '00000000-0000-4000-8000-000000000055';

const EMPTY_CATALOG: AuthorizedMasterCatalog = {
  entities: [],
  categories: [],
  aliases: [],
  tags: [],
  entityTags: [],
  players: [],
  dispositions: [],
  relations: [],
  relationEntities: [],
};

class FakeAuthController {
  readonly invalidations: Array<401 | 403> = [];
  readonly #listeners = new Set<(state: AdminAuthState) => void>();
  #state: AdminAuthState = {
    phase: 'authorized',
    identity: {
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'admin@example.invalid',
      expiresAt: null,
    },
    issue: null,
    operationId: 1,
  };

  getState(): AdminAuthState {
    return this.#state;
  }

  subscribe(listener: (state: AdminAuthState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  setPhase(phase: AdminAuthState['phase']): void {
    this.#state = {
      ...this.#state,
      phase,
      identity: phase === 'authorized' ? this.#state.identity : null,
    };
    for (const listener of this.#listeners) listener(this.#state);
  }

  invalidateFromAdministrativeResponse(status: 401 | 403): void {
    this.invalidations.push(status);
    this.setPhase(status === 401 ? 'expired' : 'unauthorized');
  }
}

class FakeMapEntityController {
  readonly #listeners = new Set<(state: AdminMapEntityState) => void>();
  #state: AdminMapEntityState = {
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

  getState(): AdminMapEntityState {
    return this.#state;
  }

  subscribe(listener: (state: AdminMapEntityState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  setAccess(authorized: boolean, backendConnected: boolean): void {
    this.#state = { ...this.#state, authorized, backendConnected };
    for (const listener of this.#listeners) listener(this.#state);
  }
}

function createController(
  repository: MasterCatalogRepository,
  auth = new FakeAuthController(),
  entities = new FakeMapEntityController(),
): {
  readonly controller: MasterModeController;
  readonly auth: FakeAuthController;
  readonly entities: FakeMapEntityController;
} {
  return {
    controller: new MasterModeController(
      repository,
      auth as unknown as AdminAuthController,
      entities as unknown as AdminMapEntityController,
      CAMPAIGN_A,
    ),
    auth,
    entities,
  };
}

describe('MasterModeController', () => {
  test('starts OFF, keeps the catalog only in memory and purges it when disabled or logged out', async () => {
    const repository: MasterCatalogRepository = {
      load: vi.fn(async () => EMPTY_CATALOG),
    };
    const { controller, auth } = createController(repository);

    expect(controller.getState()).toMatchObject({ available: true, enabled: false, phase: 'off' });
    expect(controller.getState().catalog).toBeNull();

    await controller.setEnabled(true);
    expect(repository.load).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
      campaignId: CAMPAIGN_A,
    });
    expect(controller.getState()).toMatchObject({ available: true, enabled: true, phase: 'on' });
    expect(controller.getState().catalog).toBe(EMPTY_CATALOG);

    await controller.setEnabled(false);
    expect(controller.getState()).toMatchObject({ enabled: false, phase: 'off', catalog: null });

    await controller.setEnabled(true);
    auth.setPhase('anonymous');
    expect(controller.getState()).toMatchObject({
      available: false,
      enabled: false,
      phase: 'unavailable',
      catalog: null,
    });
  });

  test('purges campaign A synchronously before loading campaign B and keeps Master intent ON', async () => {
    let resolveCampaignB: (catalog: AuthorizedMasterCatalog) => void = () => {
      throw new Error('Campaign B resolver was not initialized.');
    };
    const campaignBCatalog: AuthorizedMasterCatalog = { ...EMPTY_CATALOG, entities: [] };
    const repository: MasterCatalogRepository = {
      load: vi.fn(({ campaignId }) => {
        if (campaignId === CAMPAIGN_A) return Promise.resolve(EMPTY_CATALOG);
        return new Promise<AuthorizedMasterCatalog>((resolve) => {
          resolveCampaignB = resolve;
        });
      }),
    };
    const { controller } = createController(repository);

    await controller.setEnabled(true);
    expect(controller.getState().catalog).toBe(EMPTY_CATALOG);

    controller.setCampaign(CAMPAIGN_B);

    expect(controller.getState()).toMatchObject({
      enabled: true,
      phase: 'loading',
      catalog: null,
    });
    expect(repository.load).toHaveBeenLastCalledWith({
      signal: expect.any(AbortSignal),
      campaignId: CAMPAIGN_B,
    });

    resolveCampaignB(campaignBCatalog);
    await vi.waitFor(() => expect(controller.getState().phase).toBe('on'));
    expect(controller.getState().catalog).toBe(campaignBCatalog);
  });

  test.each([
    [401, 'session-expired'],
    [403, 'unauthorized'],
  ] as const)('purges private state and invalidates Auth after %s', async (status, code) => {
    const repository: MasterCatalogRepository = {
      load: vi.fn(async () => {
        throw new MasterCatalogRepositoryError(code, 'rejected', { status });
      }),
    };
    const { controller, auth } = createController(repository);

    await controller.setEnabled(true);

    expect(auth.invalidations).toEqual([status]);
    expect(controller.getState()).toMatchObject({
      available: false,
      enabled: false,
      phase: 'unavailable',
      catalog: null,
    });
  });

  test('keeps the ON intention but purges private content while the backend is unavailable', async () => {
    const repository: MasterCatalogRepository = {
      load: vi.fn(async () => EMPTY_CATALOG),
    };
    const { controller, entities } = createController(repository);

    await controller.setEnabled(true);
    entities.setAccess(true, false);

    expect(controller.getState()).toMatchObject({
      available: false,
      enabled: true,
      phase: 'error',
      catalog: null,
    });
  });
});
