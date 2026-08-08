import { ResilientPublicCatalogService } from '../application/publicCatalogService';
import type { PublicCatalogSnapshotV2 } from '../data/beta02-model';
import { toBeta01CompatibilityCatalog } from '../data/beta01Compatibility';
import type { CampaignCatalog } from '../data/model';
import {
  PublicDataRepositoryError,
  toPublicDataIssue,
  type PublicCatalogLoadResult,
  type PublicDataIssue,
} from '../data-access/publicCatalog';
import { BundledPublicCatalogRepository } from '../infrastructure/snapshot/publicCatalogSnapshot';
import { BrowserPublicCatalogSessionCache } from '../infrastructure/snapshot/sessionCatalogCache';
import { SupabasePublicCatalogRepository } from '../infrastructure/supabase/publicCatalogRepository';
import { mountBackendStatus } from './backendStatus';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

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

export type Beta02CatalogListener = (catalog: PublicCatalogSnapshotV2 | null) => void;

export interface PublicDataRuntime {
  readonly catalog: CampaignCatalog;
  subscribeBeta02Catalog(listener: Beta02CatalogListener): () => void;
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

function getValidatedBeta02Catalog(
  service: ResilientPublicCatalogService,
  result: PublicCatalogLoadResult,
): PublicCatalogSnapshotV2 | null {
  const remoteEnvelope = service.getLastRemoteEnvelope();

  if (remoteEnvelope?.data.contract === 'beta02') {
    return remoteEnvelope.data.catalog;
  }

  return result.data?.contract === 'beta02' ? result.data.catalog : null;
}

function toCompatibilityCatalog(result: PublicCatalogLoadResult): CampaignCatalog {
  if (!result.data) {
    throw new PublicDataRepositoryError(
      'invalid-snapshot',
      'No hay una proyección pública válida disponible para iniciar el atlas.',
      { source: 'application' },
    );
  }

  return result.data.contract === 'beta01'
    ? result.data.catalog
    : toBeta01CompatibilityCatalog(result.data.catalog);
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
  const initialResult = await service.initialize();
  const initialCatalog = toCompatibilityCatalog(initialResult);
  const beta02Listeners = new Set<Beta02CatalogListener>();
  let beta02Catalog = getValidatedBeta02Catalog(service, initialResult);
  let beta02Checksum = beta02Catalog?.checksum ?? null;
  let hasCompletedRemoteCheck = false;
  let lastRefreshAt = 0;

  const publishBeta02Catalog = (result: PublicCatalogLoadResult): void => {
    const nextCatalog = getValidatedBeta02Catalog(service, result);
    const nextChecksum = nextCatalog?.checksum ?? null;

    if (nextChecksum === beta02Checksum) {
      return;
    }

    beta02Catalog = nextCatalog;
    beta02Checksum = nextChecksum;
    beta02Listeners.forEach((listener) => listener(beta02Catalog));
  };

  const unsubscribe = service.subscribe((result) => {
    dispatchSafeStatusEvent(result);
    publishBeta02Catalog(result);

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
    subscribeBeta02Catalog(listener: Beta02CatalogListener): () => void {
      beta02Listeners.add(listener);
      listener(beta02Catalog);

      return (): void => {
        beta02Listeners.delete(listener);
      };
    },
    destroy(): void {
      window.clearInterval(refreshInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      beta02Listeners.clear();
      unsubscribe();
      service.dispose();
      status.destroy();
    },
  };
}
