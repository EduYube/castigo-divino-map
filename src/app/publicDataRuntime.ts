import { ResilientPublicCatalogService } from '../application/publicCatalogService';
import type { EntityId, PublicCatalogSnapshotV2 } from '../data/beta02-model';
import type { PublicCampaignV3 } from '../data/beta03-model';
import { toBeta01CompatibilityCatalog } from '../data/beta01Compatibility';
import type { CampaignCatalog } from '../data/model';
import {
  PublicDataRepositoryError,
  toPublicDataIssue,
  type PublicCatalogLoadResult,
  type PublicDataIssue,
} from '../data-access/publicCatalog';
import { INITIAL_PUBLIC_CAMPAIGN_ID } from '../data-access/publicCatalogQueryContract.js';
import {
  applyEntityRevocationsToBeta01,
  applyEntityRevocationsToBeta02,
} from '../data/publicCatalogRevocations';
import {
  projectPublicCatalogSnapshotV3ToV2,
} from '../infrastructure/snapshot/multicampaignSnapshotCodec';
import { BundledPublicCatalogRepository } from '../infrastructure/snapshot/publicCatalogSnapshot';
import { BrowserPublicCatalogSessionCache } from '../infrastructure/snapshot/sessionCatalogCache';
import { SupabasePublicCatalogRepository } from '../infrastructure/supabase/publicCatalogRepository';
import {
  getBufferedAdminEntityRevocations,
  subscribeAdminEntityAudienceChanges,
} from './adminEntityAudienceEvents';
import { mountBackendStatus } from './backendStatus';
import {
  INITIAL_PUBLIC_CAMPAIGN_SLUG,
  setCurrentPublicCampaignSelection,
} from './campaignSelection';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const EMPTY_COMPATIBILITY_CATALOG: CampaignCatalog = {
  categories: [],
  tags: [],
  places: [],
  notes: [],
};
const LEGACY_INITIAL_CAMPAIGN: PublicCampaignV3 = {
  id: INITIAL_PUBLIC_CAMPAIGN_ID,
  slug: INITIAL_PUBLIC_CAMPAIGN_SLUG,
  name: 'Campaña inicial',
  status: 'active',
  displayOrder: 0,
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
  readonly campaigns: readonly PublicCampaignV3[];
  readonly selectedCampaign: PublicCampaignV3 | null;
}

export type PublicCatalogStateListener = (state: PublicCatalogState) => void;

export interface PublicDataRuntime {
  getCatalogState(): PublicCatalogState;
  subscribeCatalogState(listener: PublicCatalogStateListener): () => void;
  selectCampaign(slug: string): boolean;
  refresh(): Promise<void>;
  revokeEntity(entityId: EntityId): void;
  clearEntityRevocation(entityId: EntityId): void;
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

function sortCampaigns(campaigns: readonly PublicCampaignV3[]): readonly PublicCampaignV3[] {
  return [...campaigns].sort(
    (left, right) => left.displayOrder - right.displayOrder || left.id.localeCompare(right.id),
  );
}

function resolveCampaign(
  campaigns: readonly PublicCampaignV3[],
  preferredSlug: string,
): PublicCampaignV3 | null {
  return (
    campaigns.find(({ slug }) => slug === preferredSlug) ??
    campaigns.find(({ slug }) => slug === INITIAL_PUBLIC_CAMPAIGN_SLUG) ??
    sortCampaigns(campaigns)[0] ??
    null
  );
}

function toCatalogState(
  result: PublicCatalogLoadResult,
  revokedEntityIds: ReadonlySet<EntityId>,
  preferredCampaignSlug: string,
): PublicCatalogState {
  if (!result.data) {
    return {
      availability: 'unavailable',
      checksum: null,
      beta02: null,
      compatibility: EMPTY_COMPATIBILITY_CATALOG,
      campaigns: [],
      selectedCampaign: null,
    };
  }

  if (result.data.contract === 'beta01') {
    return {
      availability: result.availability,
      checksum: result.metadata?.checksum ?? null,
      beta02: null,
      compatibility: applyEntityRevocationsToBeta01(result.data.catalog, revokedEntityIds),
      campaigns: [LEGACY_INITIAL_CAMPAIGN],
      selectedCampaign: LEGACY_INITIAL_CAMPAIGN,
    };
  }

  if (result.data.contract === 'beta02') {
    const beta02 = applyEntityRevocationsToBeta02(result.data.catalog, revokedEntityIds);
    return {
      availability: result.availability,
      checksum: result.metadata?.checksum ?? result.data.catalog.checksum,
      beta02,
      compatibility: toBeta01CompatibilityCatalog(beta02),
      campaigns: [LEGACY_INITIAL_CAMPAIGN],
      selectedCampaign: LEGACY_INITIAL_CAMPAIGN,
    };
  }

  const campaigns = sortCampaigns(result.data.catalog.campaigns);
  const selectedCampaign = resolveCampaign(campaigns, preferredCampaignSlug);
  const projection = selectedCampaign
    ? projectPublicCatalogSnapshotV3ToV2(result.data.catalog, selectedCampaign.id)
    : null;
  const beta02 = projection ? applyEntityRevocationsToBeta02(projection, revokedEntityIds) : null;

  return {
    availability: beta02 ? result.availability : 'unavailable',
    checksum: result.metadata?.checksum ?? result.data.catalog.checksum,
    beta02,
    compatibility: beta02 ? toBeta01CompatibilityCatalog(beta02) : EMPTY_COMPATIBILITY_CATALOG,
    campaigns,
    selectedCampaign,
  };
}

function campaignsSignature(campaigns: readonly PublicCampaignV3[]): string {
  return campaigns.map(({ id, slug, name, displayOrder }) => `${id}:${slug}:${name}:${displayOrder}`).join('|');
}

function isSameCatalogRevision(left: PublicCatalogState, right: PublicCatalogState): boolean {
  return (
    left.availability === right.availability &&
    left.checksum === right.checksum &&
    left.selectedCampaign?.id === right.selectedCampaign?.id &&
    campaignsSignature(left.campaigns) === campaignsSignature(right.campaigns) &&
    (left.beta02 === null) === (right.beta02 === null)
  );
}

interface CampaignSelectorController {
  update(state: PublicCatalogState): void;
  announce(message: string): void;
  destroy(): void;
}

function mountCampaignSelector(
  root: ParentNode,
  onSelect: (slug: string) => void,
): CampaignSelectorController {
  const search = root.querySelector<HTMLElement>('[data-place-search]');
  const section = document.createElement('section');
  const label = document.createElement('label');
  const select = document.createElement('select');
  const status = document.createElement('p');

  section.className = 'campaign-switcher';
  section.dataset.campaignSwitcher = '';
  label.className = 'campaign-switcher__label';
  label.htmlFor = 'public-campaign-select';
  label.textContent = 'Campaña';
  select.id = 'public-campaign-select';
  select.name = 'campaign';
  select.className = 'campaign-switcher__select';
  select.dataset.campaignSelect = '';
  select.setAttribute('aria-describedby', 'public-campaign-status');
  status.id = 'public-campaign-status';
  status.className = 'campaign-switcher__status';
  status.dataset.campaignStatus = '';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  section.append(label, select, status);

  if (search?.parentNode) search.parentNode.insertBefore(section, search);
  else root.appendChild(section);

  let optionSignature = '';
  const handleChange = (): void => onSelect(select.value);
  select.addEventListener('change', handleChange);

  return {
    update(state): void {
      const nextSignature = campaignsSignature(state.campaigns);
      if (nextSignature !== optionSignature) {
        optionSignature = nextSignature;
        select.replaceChildren(
          ...state.campaigns.map((campaign) => {
            const option = document.createElement('option');
            option.value = campaign.slug;
            option.textContent = campaign.name;
            return option;
          }),
        );
      }
      if (state.selectedCampaign) select.value = state.selectedCampaign.slug;
      select.disabled = state.campaigns.length === 0;
      status.textContent = state.selectedCampaign
        ? `Campaña seleccionada: ${state.selectedCampaign.name}.`
        : 'No hay campañas públicas disponibles.';
    },
    announce(message): void {
      status.textContent = message;
    },
    destroy(): void {
      select.removeEventListener('change', handleChange);
      section.remove();
    },
  };
}

function campaignSlugFromLocation(): string {
  return new URL(window.location.href).searchParams.get('campaign')?.trim() || INITIAL_PUBLIC_CAMPAIGN_SLUG;
}

function setCampaignInUrl(slug: string, mode: 'push' | 'replace'): void {
  const url = new URL(window.location.href);
  url.searchParams.set('campaign', slug);
  if (mode === 'push') {
    url.searchParams.delete('place');
    url.searchParams.delete('category');
    url.searchParams.delete('tag');
    window.history.pushState(window.history.state, '', url);
  } else {
    window.history.replaceState(window.history.state, '', url);
  }
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
  const revokedEntityIds = new Set<EntityId>(getBufferedAdminEntityRevocations());
  let publishBufferedRevocations: (() => void) | null = null;

  const setEntityRevoked = (entityId: EntityId, revoked: boolean): void => {
    const changed = revoked
      ? !revokedEntityIds.has(entityId) && (revokedEntityIds.add(entityId), true)
      : revokedEntityIds.delete(entityId);
    if (changed) publishBufferedRevocations?.();
  };

  const unsubscribeAudienceChanges = subscribeAdminEntityAudienceChanges((detail) => {
    setEntityRevoked(detail.entityId, detail.audience === 'master');
  });

  let initialResult: PublicCatalogLoadResult;
  try {
    initialResult = await service.initialize();
  } catch (error) {
    unsubscribeAudienceChanges();
    service.dispose();
    status.destroy();
    throw error;
  }

  const catalogListeners = new Set<PublicCatalogStateListener>();
  let latestResult = initialResult;
  let preferredCampaignSlug = campaignSlugFromLocation();
  let catalogState = toCatalogState(initialResult, revokedEntityIds, preferredCampaignSlug);
  let lastRefreshAt = 0;

  const prepareCampaignTransition = (nextCampaign: PublicCampaignV3): void => {
    const previousCampaign = catalogState.selectedCampaign;
    if (!previousCampaign || previousCampaign.id === nextCampaign.id) return;
    setCurrentPublicCampaignSelection({ id: nextCampaign.id, slug: nextCampaign.slug });
    window.dispatchEvent(
      new CustomEvent('atlas:campaign-will-change', {
        detail: {
          fromCampaignId: previousCampaign.id,
          fromCampaignSlug: previousCampaign.slug,
          toCampaignId: nextCampaign.id,
          toCampaignSlug: nextCampaign.slug,
        },
      }),
    );
  };

  const publishCatalogState = (result: PublicCatalogLoadResult, force = false): void => {
    latestResult = result;
    const nextState = toCatalogState(result, revokedEntityIds, preferredCampaignSlug);
    if (!force && isSameCatalogRevision(nextState, catalogState)) return;
    if (nextState.selectedCampaign) prepareCampaignTransition(nextState.selectedCampaign);
    catalogState = nextState;
    if (catalogState.selectedCampaign) {
      preferredCampaignSlug = catalogState.selectedCampaign.slug;
      setCurrentPublicCampaignSelection({
        id: catalogState.selectedCampaign.id,
        slug: catalogState.selectedCampaign.slug,
      });
    }
    catalogListeners.forEach((listener) => listener(catalogState));
  };

  publishBufferedRevocations = () => publishCatalogState(latestResult, true);

  const selector = mountCampaignSelector(root, (slug) => {
    const target = catalogState.campaigns.find((campaign) => campaign.slug === slug);
    if (!target || target.id === catalogState.selectedCampaign?.id) return;
    preferredCampaignSlug = target.slug;
    prepareCampaignTransition(target);
    catalogState = toCatalogState(latestResult, revokedEntityIds, preferredCampaignSlug);
    setCurrentPublicCampaignSelection({ id: target.id, slug: target.slug });
    selector.update(catalogState);
    catalogListeners.forEach((listener) => listener(catalogState));
    setCampaignInUrl(target.slug, 'push');
    selector.announce(`Campaña seleccionada: ${target.name}.`);
  });
  selector.update(catalogState);

  if (catalogState.selectedCampaign) {
    setCurrentPublicCampaignSelection({
      id: catalogState.selectedCampaign.id,
      slug: catalogState.selectedCampaign.slug,
    });
    const requested = new URL(window.location.href).searchParams.get('campaign')?.trim();
    if (!requested || catalogState.campaigns.some(({ slug }) => slug === requested)) {
      setCampaignInUrl(catalogState.selectedCampaign.slug, 'replace');
    }
  }

  const revokeEntity = (entityId: EntityId): void => setEntityRevoked(entityId, true);
  const clearEntityRevocation = (entityId: EntityId): void => setEntityRevoked(entityId, false);

  const unsubscribe = service.subscribe((result) => {
    dispatchSafeStatusEvent(result);
    publishCatalogState(result);
    selector.update(catalogState);
    status.update(result);
  });

  const refresh = async (showChecking: boolean): Promise<void> => {
    if (showChecking) status.setChecking();
    await service.refresh();
    lastRefreshAt = Date.now();
  };

  status.setRetryHandler(() => void refresh(true));
  const handleOnline = (): void => void refresh(true);
  const handleOffline = (): void => service.markOffline();
  const handleVisibilityChange = (): void => {
    if (
      document.visibilityState === 'visible' &&
      navigator.onLine &&
      Date.now() - lastRefreshAt >= REFRESH_INTERVAL_MS
    ) {
      void refresh(false);
    }
  };
  const handlePopState = (): void => {
    const requestedSlug = campaignSlugFromLocation();
    const target = resolveCampaign(catalogState.campaigns, requestedSlug);
    if (!target || target.id === catalogState.selectedCampaign?.id) return;
    preferredCampaignSlug = target.slug;
    prepareCampaignTransition(target);
    catalogState = toCatalogState(latestResult, revokedEntityIds, preferredCampaignSlug);
    setCurrentPublicCampaignSelection({ id: target.id, slug: target.slug });
    selector.update(catalogState);
    catalogListeners.forEach((listener) => listener(catalogState));
  };
  const refreshInterval = window.setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) void refresh(false);
  }, REFRESH_INTERVAL_MS);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('popstate', handlePopState);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  void refresh(false);

  return {
    getCatalogState(): PublicCatalogState {
      return catalogState;
    },
    subscribeCatalogState(listener: PublicCatalogStateListener): () => void {
      catalogListeners.add(listener);
      return (): void => catalogListeners.delete(listener);
    },
    selectCampaign(slug: string): boolean {
      const target = catalogState.campaigns.find((campaign) => campaign.slug === slug);
      if (!target) return false;
      if (target.id !== catalogState.selectedCampaign?.id) {
        preferredCampaignSlug = target.slug;
        prepareCampaignTransition(target);
        catalogState = toCatalogState(latestResult, revokedEntityIds, preferredCampaignSlug);
        setCurrentPublicCampaignSelection({ id: target.id, slug: target.slug });
        selector.update(catalogState);
        catalogListeners.forEach((listener) => listener(catalogState));
      }
      return true;
    },
    refresh(): Promise<void> {
      return refresh(false);
    },
    revokeEntity,
    clearEntityRevocation,
    destroy(): void {
      window.clearInterval(refreshInterval);
      unsubscribeAudienceChanges();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      publishBufferedRevocations = null;
      revokedEntityIds.clear();
      catalogListeners.clear();
      unsubscribe();
      selector.destroy();
      service.dispose();
      status.destroy();
    },
  };
}
