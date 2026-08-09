import { describe, expect, test } from 'vitest';

import type { CampaignCatalog } from '../data/model';
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
