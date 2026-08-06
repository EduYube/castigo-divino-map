import { ResilientPublicCatalogService } from '../application/publicCatalogService';
import type { CampaignCatalog } from '../data/model';
import {
  PublicDataRepositoryError,
  toPublicDataIssue,
  type PublicCatalogLoadResult,
  type PublicDataIssue,
} from '../data-access/publicCatalog';
import {
  BundledPublicCatalogRepository,
  StaticPublicCatalogRepository,
} from '../infrastructure/snapshot/publicCatalogSnapshot';
import { BrowserPublicCatalogSessionCache } from '../infrastructure/snapshot/sessionCatalogCache';
import { SupabasePublicCatalogRepository } from '../infrastructure/supabase/publicCatalogRepository';
import { mountBackendStatus } from './backendStatus';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const LEGACY_CATALOG_REVISION = 'beta01-static-catalog';

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

export interface PublicDataRuntime {
  readonly catalog: CampaignCatalog;
  destroy(): void;
}

function resolveTestConfig(): PublicDataTestConfig | undefined {
  return import.meta.env.DEV ? window.__MAP016_PUBLIC_DATA_TEST_CONFIG__ : undefined;
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

export async function bootstrapPublicDataRuntime(
  root: ParentNode,
  legacyCatalog: CampaignCatalog,
): Promise<PublicDataRuntime> {
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
    fallbackRepositories: [
      new BundledPublicCatalogRepository({ url: snapshotUrl }),
      new StaticPublicCatalogRepository(legacyCatalog, {
        sourceRevision: LEGACY_CATALOG_REVISION,
      }),
    ],
    remoteRepository,
    sessionCache: new BrowserPublicCatalogSessionCache(),
    configurationIssue,
    timeoutMs: testConfig?.timeoutMs,
    retryDelaysMs: testConfig?.retryDelaysMs,
  });
  const initialResult = await service.initialize();
  const initialCatalog =
    initialResult.data?.contract === 'beta01' ? initialResult.data.catalog : legacyCatalog;
  let hasCompletedRemoteCheck = false;
  let lastRefreshAt = 0;

  const unsubscribe = service.subscribe((result) => {
    dispatchSafeStatusEvent(result);

    if (hasCompletedRemoteCheck) {
      status.update(result);
    }
  });

  const refresh = async (): Promise<void> => {
    const wasInitialCheck = !hasCompletedRemoteCheck;

    if (wasInitialCheck) {
      status.setChecking();
    }

    const result = await service.refresh();
    hasCompletedRemoteCheck = true;
    lastRefreshAt = Date.now();

    if (wasInitialCheck) {
      status.update(result);
    }
  };

  status.setRetryHandler(() => {
    void refresh();
  });

  const handleOnline = (): void => {
    void refresh();
  };
  const handleOffline = (): void => {
    hasCompletedRemoteCheck = true;
    service.markOffline();
  };
  const handleVisibilityChange = (): void => {
    if (
      document.visibilityState === 'visible' &&
      navigator.onLine &&
      Date.now() - lastRefreshAt >= REFRESH_INTERVAL_MS
    ) {
      void refresh();
    }
  };
  const refreshInterval = window.setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      void refresh();
    }
  }, REFRESH_INTERVAL_MS);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  void refresh();

  return {
    catalog: initialCatalog,
    destroy(): void {
      window.clearInterval(refreshInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribe();
      service.dispose();
      status.destroy();
    },
  };
}
