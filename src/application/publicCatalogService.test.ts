import { describe, expect, test } from 'vitest';

import type { CampaignCatalog } from '../data/model';
import type { PublicCatalogSnapshotV4 } from '../data/beta04-model';
import {
  PublicDataRepositoryError,
  type PublicCatalogEnvelope,
  type PublicCatalogRepository,
} from '../data-access/publicCatalog';
import { ResilientPublicCatalogService } from './publicCatalogService';

const EMPTY_CATALOG: CampaignCatalog = {
  categories: [],
  tags: [],
  places: [],
  notes: [],
};

const FALLBACK_ENVELOPE: PublicCatalogEnvelope = {
  data: { contract: 'beta01', catalog: EMPTY_CATALOG },
  source: 'bundled-snapshot',
  metadata: {
    contract: 'beta01',
    schemaVersion: 1,
    generatedAt: '2026-08-06T00:00:00.000Z',
    loadedAt: '2026-08-06T00:00:00.000Z',
    sourceRevision: 'snapshot-test',
    checksum: 'sha256:fallback',
    stale: false,
  },
};

const REMOTE_ENVELOPE: PublicCatalogEnvelope = {
  data: {
    contract: 'beta02',
    catalog: {
      schemaVersion: 2,
      generatedAt: '2026-08-06T00:00:00.000Z',
      sourceRevision: 'remote-test',
      checksum: 'sha256:remote',
      categories: [],
      tags: [],
      players: [],
      entities: [],
      dispositions: [],
      characterLocationRelations: [],
      notes: [],
      geographicNames: [],
      characterLocationEvents: [],
    },
  },
  source: 'supabase',
  metadata: {
    contract: 'beta02',
    schemaVersion: 2,
    generatedAt: '2026-08-06T00:00:00.000Z',
    loadedAt: '2026-08-06T00:00:00.000Z',
    sourceRevision: 'remote-test',
    checksum: 'sha256:remote',
    stale: false,
  },
};

function repository(load: PublicCatalogRepository['load']): PublicCatalogRepository {
  return { load };
}

function v4Envelope(
  source: PublicCatalogEnvelope['source'],
  generatedAt: string,
  checksum: string,
): PublicCatalogEnvelope {
  const catalog: PublicCatalogSnapshotV4 = {
    schemaVersion: 4,
    generatedAt,
    sourceRevision: checksum,
    checksum,
    campaigns: [],
    campaignCatalogs: [],
    geographicNames: [],
    mapContexts: [],
    campaignLocalMaps: [],
  };
  return {
    data: { contract: 'beta04', catalog },
    source,
    metadata: {
      contract: 'beta04',
      schemaVersion: 4,
      generatedAt,
      loadedAt: generatedAt,
      sourceRevision: checksum,
      checksum,
      stale: false,
    },
  };
}


describe('ResilientPublicCatalogService', () => {
  test('promotes a valid remote catalog to the visible source while keeping the snapshot as fallback', async () => {
    const service = new ResilientPublicCatalogService({
      fallbackRepositories: [repository(async () => FALLBACK_ENVELOPE)],
      remoteRepository: repository(async () => REMOTE_ENVELOPE),
      isOnline: () => true,
      retryDelaysMs: [0],
      now: () => Date.parse('2026-08-06T00:00:01.000Z'),
    });

    const initial = await service.initialize();
    const connected = await service.refresh();

    expect(initial.source).toBe('bundled-snapshot');
    expect(connected.backend.state).toBe('connected');
    expect(connected.source).toBe('supabase');
    expect(connected.remoteSource).toBe('supabase');
    expect(connected.data?.contract).toBe('beta02');
    expect(connected.degradation.usingFallback).toBe(false);
  });

  test('restores a newer complete V4 session revision during offline startup', async () => {
    const bundled = v4Envelope(
      'bundled-snapshot',
      '2026-10-30T00:00:00.000Z',
      'sha256:bundled-v4',
    );
    const cached = v4Envelope(
      'session-cache',
      '2026-11-01T00:00:00.000Z',
      'sha256:cached-v4',
    );
    const service = new ResilientPublicCatalogService({
      fallbackRepositories: [repository(async () => bundled)],
      remoteRepository: null,
      sessionCache: {
        read: async () => cached,
        write: async () => {},
        clear: () => {},
      },
      isOnline: () => false,
    });

    const initial = await service.initialize();
    const offline = await service.refresh();
    expect(initial.source).toBe('session-cache');
    expect(initial.metadata?.checksum).toBe(cached.metadata.checksum);
    expect(offline.source).toBe('session-cache');
    expect(offline.backend.state).toBe('offline');
    expect(offline.data?.contract).toBe('beta04');
  });

  test('does not replace a newer bundled V4 with older or historical session data', async () => {
    const bundled = v4Envelope(
      'bundled-snapshot',
      '2026-11-01T00:00:00.000Z',
      'sha256:new-bundled-v4',
    );
    const cachedV4 = v4Envelope(
      'session-cache',
      '2026-10-30T00:00:00.000Z',
      'sha256:old-cached-v4',
    );
    for (const cached of [
      cachedV4,
      { ...REMOTE_ENVELOPE, source: 'session-cache' as const },
    ]) {
      const service = new ResilientPublicCatalogService({
        fallbackRepositories: [repository(async () => bundled)],
        remoteRepository: null,
        sessionCache: {
          read: async () => cached,
          write: async () => {},
          clear: () => {},
        },
        isOnline: () => false,
      });
      const result = await service.initialize();
      expect(result.source).toBe('bundled-snapshot');
      expect(result.metadata?.checksum).toBe(bundled.metadata.checksum);
      expect(result.data?.contract).toBe('beta04');
      service.dispose();
    }
  });

  test('classifies an aborted slow request as a recoverable timeout', async () => {
    const remote = repository(
      ({ signal }) =>
        new Promise<PublicCatalogEnvelope>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () =>
              reject(
                new PublicDataRepositoryError('request-aborted', 'aborted', {
                  source: 'supabase',
                }),
              ),
            { once: true },
          );
        }),
    );
    const service = new ResilientPublicCatalogService({
      fallbackRepositories: [repository(async () => FALLBACK_ENVELOPE)],
      remoteRepository: remote,
      isOnline: () => true,
      retryDelaysMs: [0],
      timeoutMs: 5,
    });

    await service.initialize();
    const result = await service.refresh();

    expect(result.backend.state).toBe('degraded');
    expect(result.backend.reason).toBe('request-timeout');
    expect(result.source).toBe('bundled-snapshot');
  });

  test('falls through when the packaged snapshot does not complete', async () => {
    const stalled = repository(
      ({ signal }) =>
        new Promise<PublicCatalogEnvelope>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () =>
              reject(
                new PublicDataRepositoryError('request-aborted', 'aborted', {
                  source: 'snapshot',
                }),
              ),
            { once: true },
          );
        }),
    );
    const service = new ResilientPublicCatalogService({
      fallbackRepositories: [stalled, repository(async () => FALLBACK_ENVELOPE)],
      remoteRepository: null,
      isOnline: () => true,
      fallbackTimeoutMs: 5,
    });

    const result = await service.initialize();

    expect(result.availability).toBe('ready');
    expect(result.source).toBe('bundled-snapshot');
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'request-timeout' }));
  });

  test('uses the offline state without attempting the remote repository', async () => {
    let remoteCalls = 0;
    const service = new ResilientPublicCatalogService({
      fallbackRepositories: [repository(async () => FALLBACK_ENVELOPE)],
      remoteRepository: repository(async () => {
        remoteCalls += 1;
        return REMOTE_ENVELOPE;
      }),
      isOnline: () => false,
      retryDelaysMs: [0],
    });

    await service.initialize();
    const result = await service.refresh();

    expect(result.backend.state).toBe('offline');
    expect(result.source).toBe('bundled-snapshot');
    expect(remoteCalls).toBe(0);
  });

  test('does not retry a permanent configuration error', async () => {
    let remoteCalls = 0;
    const service = new ResilientPublicCatalogService({
      fallbackRepositories: [repository(async () => FALLBACK_ENVELOPE)],
      remoteRepository: repository(async () => {
        remoteCalls += 1;
        throw new PublicDataRepositoryError('configuration-invalid', 'invalid configuration', {
          source: 'supabase',
          recoverable: false,
        });
      }),
      isOnline: () => true,
      retryDelaysMs: [0, 0, 0],
    });

    await service.initialize();
    const result = await service.refresh();

    expect(result.backend.state).toBe('degraded');
    expect(result.backend.reason).toBe('configuration-invalid');
    expect(remoteCalls).toBe(1);
  });
});
