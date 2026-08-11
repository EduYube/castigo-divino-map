import { ResilientPublicCatalogService } from '../application/publicCatalogService';
import type { EntityId, PublicCatalogSnapshotV2 } from '../data/beta02-model';
import { toBeta01CompatibilityCatalog } from '../data/beta01Compatibility';
import type { CampaignCatalog } from '../data/model';
import {
  PublicDataRepositoryError,
  toPublicDataIssue,
  type PublicCatalogLoadResult,
  type PublicDataIssue,
} from '../data-access/publicCatalog';
import {
  applyEntityRevocationsToBeta01,
  applyEntityRevocationsToBeta02,
} from '../data/publicCatalogRevocations';
import { BundledPublicCatalogRepository } from '../infrastructure/snapshot/publicCatalogSnapshot';
import { BrowserPublicCatalogSessionCache } from '../infrastructure/snapshot/sessionCatalogCache';
import { SupabasePublicCatalogRepository } from '../infrastructure/supabase/publicCatalogRepository';
import {
  ADMIN_ENTITY_AUDIENCE_CHANGED_EVENT,
  type AdminEntityAudienceChangedDetail,
} from './adminEntityAudienceEvents';
import { mountBackendStatus } from './backendStatus';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const EMPTY_COMPATIBILITY_CATALOG: CampaignCatalog = {
  categories: [],
  tags: [],
  places: [],
  notes: [],
};

interface PublicDataTestConfig {
  readonly projectUrl?: string;
  readonly publishableKey?: string;
  readonly timeoutMs?: number;
  readonly retryDelaysMs?: readonly number[];
}

declare global {
  interface Window {
    __MAP016_PUBLIC_DATA_TEST_CONFIG__?: PublicDataTestConfig;
  }
}

export interface PublicCatalogState {
  readonly availability: PublicCatalogLoadResult['availability'];
  readonly checksum: string | null;
  readonly beta02: PublicCatalogSnapshotV2 | null;
  readonly compatibility: CampaignCatalog;
}

export type PublicCatalogStateListener = (state: PublicCatalogState) => void;

export interface PublicDataRuntime {
  getCatalogState(): PublicCatalogState;
  subscribeCatalogState(listener: PublicCatalogStateListener): () => void;
  refresh(): Promise<void>;
  revokeEntity(entityId: EntityId): void;
  clearEntityRevocation(entityId: EntityId): void;
  destroy(): void;
}

function resolveTestConfig(): PublicDataTestConfig | undefined {
  return import.meta.env.DEV ? window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ : undefined;
}

function isAudienceChangedEvent(
  event: Event,
): event is CustomEvent<AdminEntityAudienceChangedDetail> {
  return event instanceof CustomEvent && event.type === ADMIN_ENTITY_AUDIENCE_CHANGED_EVENT;
}

function dispatchSafeStatusEvent(result: PublicCatalogLoadResult): void {
  window.dispatchEvent(
    new CustomEvent('atlas:public-data-status', {
      detail: {
        backendState: result.backend.state,
        availability: result.availability,
        source: result.source,
        remoteSource: result.remoteSource,
        reason: result.backend.reason,
        checkedAt: result.backend.checkedAt,
      },
    }),
  );
}

function toCatalogState(
  result: PublicCatalogLoadResult,
  revokedEntityIds: ReadonlySet<EntityId>,
): PublicCatalogState {
  if (!result.data) {
    return {
      availability: 'unavailable',
      checksum: null,
      beta02: null,
      compatibility: EMPTY_COMPATIBILITY_CATALOG,
    };
  }

  if (result.data.contract === 'beta01') {
    return {
      availability: result.availability,
      checksum: result.metadata?.checksum ?? null,
      beta02: null,
      compatibility: applyEntityRevocationsToBeta01(result.data.catalog, revokedEntityIds),
    };
  }

  const beta02 = applyEntityRevocationsToBeta02(result.data.catalog, revokedEntityIds);
  return {
    availability: result.availability,
    checksum: result.metadata?.checksum ?? result.data.catalog.checksum,
    beta02,
    compatibility: toBeta01CompatibilityCatalog(beta02),
  };
}

function isSameCatalogRevision(left: PublicCatalogState, right: PublicCatalogState): boolean {
  return (
    left.availability === right.availability &&
    left.checksum === right.checksum &&
    (left.beta02 === null) === (right.beta02 === null)
  );
}

export async function bootstrapPublicDataRuntime(
  root: ParentNode,
  _legacyCatalog?: CampaignCatalog,
): Promise<PublicDataRuntime> {
  void _legacyCatalog;
  const status = mountBackendStatus(root);
  const testConfig = resolveTestConfig();
  const projectUrl = testConfig?.projectUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '';
  const publishableKey =
    testConfig?.publishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
  let remoteRepository: SupabasePublicCatalogRepository | null = null;
  let configurationIssue: PublicDataIssue | null = null;

  try {
    remoteRepository = new SupabasePublicCatalogRepository({
      projectUrl,
      publishableKey,
      allowLocalProject: import.meta.env.DEV,
    });
  } catch (error) {
    configurationIssue = toPublicDataIssue(
      error instanceof PublicDataRepositoryError
        ? error
        : new PublicDataRepositoryError(
            'configuration-invalid',
            'La configuración pública de Supabase no es válida.',
            { source: 'supabase', recoverable: false, cause: error },
          ),
    );
  }

  const snapshotUrl = `${import.meta.env.BASE_URL}data/public-catalog.snapshot.json`;
  const service = new ResilientPublicCatalogService({
    fallbackRepositories: [new BundledPublicCatalogRepository({ url: snapshotUrl })],
    remoteRepository,
    sessionCache: new BrowserPublicCatalogSessionCache(),
    configurationIssue,
    timeoutMs: testConfig?.timeoutMs,
    retryDelaysMs: testConfig?.retryDelaysMs,
  });
  const revokedEntityIds = new Set<EntityId>();
  let publishBufferedRevocations: (() => void) | null = null;

  const setEntityRevoked = (entityId: EntityId, revoked: boolean): void => {
    const changed = revoked
      ? !revokedEntityIds.has(entityId) && (revokedEntityIds.add(entityId), true)
      : revokedEntityIds.delete(entityId);
    if (changed) publishBufferedRevocations?.();
  };

  const handleAudienceChanged = (event: Event): void => {
    if (!isAudienceChangedEvent(event)) return;
    setEntityRevoked(event.detail.entityId, event.detail.audience === 'master');
  };

  // Capture audience transitions before the first asynchronous public load. An
  // administrative session can already be restored while initialize() is waiting on
  // Supabase, cache, or the bundled snapshot; those revocations must be applied to
  // whichever initial result eventually wins instead of being lost during bootstrap.
  window.addEventListener(ADMIN_ENTITY_AUDIENCE_CHANGED_EVENT, handleAudienceChanged);

  let initialResult: PublicCatalogLoadResult;
  try {
    initialResult = await service.initialize();
  } catch (error) {
    window.removeEventListener(ADMIN_ENTITY_AUDIENCE_CHANGED_EVENT, handleAudienceChanged);
    service.dispose();
    status.destroy();
    throw error;
  }

  const catalogListeners = new Set<PublicCatalogStateListener>();
  let latestResult = initialResult;
  let catalogState = toCatalogState(initialResult, revokedEntityIds);
  let lastRefreshAt = 0;

  const publishCatalogState = (result: PublicCatalogLoadResult, force = false): void => {
    latestResult = result;
    const nextState = toCatalogState(result, revokedEntityIds);

    if (!force && isSameCatalogRevision(nextState, catalogState)) {
      return;
    }

    catalogState = nextState;
    catalogListeners.forEach((listener) => listener(catalogState));
  };

  publishBufferedRevocations = () => publishCatalogState(latestResult, true);

  const revokeEntity = (entityId: EntityId): void => {
    setEntityRevoked(entityId, true);
  };

  const clearEntityRevocation = (entityId: EntityId): void => {
    setEntityRevoked(entityId, false);
  };

  const unsubscribe = service.subscribe((result) => {
    dispatchSafeStatusEvent(result);
    publishCatalogState(result);
    status.update(result);
  });

  const refresh = async (showChecking: boolean): Promise<void> => {
    if (showChecking) {
      status.setChecking();
    }

    await service.refresh();
    lastRefreshAt = Date.now();
  };

  status.setRetryHandler(() => {
    void refresh(true);
  });

  const handleOnline = (): void => {
    void refresh(true);
  };
  const handleOffline = (): void => {
    service.markOffline();
  };
  const handleVisibilityChange = (): void => {
    if (
      document.visibilityState === 'visible' &&
      navigator.onLine &&
      Date.now() - lastRefreshAt >= REFRESH_INTERVAL_MS
    ) {
      void refresh(false);
    }
  };
  const refreshInterval = window.setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      void refresh(false);
    }
  }, REFRESH_INTERVAL_MS);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  void refresh(false);

  return {
    getCatalogState(): PublicCatalogState {
      return catalogState;
    },
    subscribeCatalogState(listener: PublicCatalogStateListener): () => void {
      catalogListeners.add(listener);
      listener(catalogState);

      return (): void => {
        catalogListeners.delete(listener);
      };
    },
    refresh(): Promise<void> {
      return refresh(false);
    },
    revokeEntity,
    clearEntityRevocation,
    destroy(): void {
      window.clearInterval(refreshInterval);
      window.removeEventListener(ADMIN_ENTITY_AUDIENCE_CHANGED_EVENT, handleAudienceChanged);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      publishBufferedRevocations = null;
      revokedEntityIds.clear();
      catalogListeners.clear();
      unsubscribe();
      service.dispose();
      status.destroy();
    },
  };
}
