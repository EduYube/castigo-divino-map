import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import { createSha256Checksum } from '../../data-access/publicCatalog';
import { INITIAL_PUBLIC_CAMPAIGN_ID } from '../../data-access/publicCatalogQueryContract.js';
import {
  parsePublicCatalogSnapshotV4,
  projectPublicCatalogSnapshotV4ToV2,
} from './multimapSnapshotCodec';
import {
  BundledPublicCatalogRepository,
  PUBLIC_SNAPSHOT_MAX_AGE_MS,
  parsePublicCatalogSnapshotV1,
} from './publicCatalogSnapshot';

const SNAPSHOT_URL = new URL('../../../public/data/public-catalog.snapshot.json', import.meta.url);

async function readSnapshot(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(SNAPSHOT_URL, 'utf8')) as Record<string, unknown>;
}

describe('public catalog snapshot', () => {
  test('validates the committed atomic V4 world and local snapshot and checksum', async () => {
    const snapshot = await readSnapshot();
    const result = await parsePublicCatalogSnapshotV4(snapshot, () =>
      Date.parse(String(snapshot.generatedAt)),
    );

    expect(result.data.contract).toBe('beta04');
    expect(result.metadata.schemaVersion).toBe(4);
    expect(result.metadata.checksum).toBe(snapshot.checksum);
  });

  test('loads the native V4 snapshot through the degraded-mode repository', async () => {
    const snapshot = await readSnapshot();
    const generatedAt = Date.parse(String(snapshot.generatedAt));
    const parsed = await parsePublicCatalogSnapshotV4(snapshot, () => generatedAt);
    if (parsed.data.contract !== 'beta04') {
      throw new Error('Expected the committed snapshot to use beta04.');
    }
    const snapshotV4 = parsed.data.catalog;
    const repository = new BundledPublicCatalogRepository({
      url: '/data/public-catalog.snapshot.json',
      now: () => generatedAt,
      fetchImplementation: async () =>
        new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    const loaded = await repository.load({ signal: new AbortController().signal });

    expect(parsed.metadata.schemaVersion).toBe(4);
    expect(loaded.metadata.schemaVersion).toBe(4);
    expect(loaded.source).toBe('bundled-snapshot');
    expect(loaded.data.contract).toBe('beta04');

    if (loaded.data.contract !== 'beta04') {
      throw new Error('Expected the V4 snapshot to remain beta04.');
    }

    expect(loaded.data.catalog.campaigns).toEqual(snapshotV4.campaigns);
    const projected = projectPublicCatalogSnapshotV4ToV2(
      loaded.data.catalog,
      INITIAL_PUBLIC_CAMPAIGN_ID,
    );
    const initialCatalog = snapshotV4.campaignCatalogs.find(
      ({ campaignId }) => campaignId === INITIAL_PUBLIC_CAMPAIGN_ID,
    );
    expect(initialCatalog).toBeDefined();
    expect(projected).not.toBeNull();
    expect(projected?.categories).toEqual(initialCatalog?.categories);
    expect(projected?.entities).toEqual(initialCatalog?.entities);
  });

  test('rejects a V4 snapshot whose world content no longer matches its checksum', async () => {
    const snapshot = await readSnapshot();
    const campaignCatalogs = snapshot.campaignCatalogs as {
      entities: { name: string }[];
    }[];
    const firstEntity = campaignCatalogs[0]?.entities[0];
    if (!firstEntity) throw new Error('Expected at least one committed public entity.');
    firstEntity.name = 'Contenido manipulado';

    await expect(parsePublicCatalogSnapshotV4(snapshot)).rejects.toMatchObject({
      code: 'checksum-mismatch',
    });
  });

  test('loads the packaged multicampaign V4 snapshot as the bundled fallback and marks age', async () => {
    const snapshot = await readSnapshot();
    const generatedAt = Date.parse(String(snapshot.generatedAt));
    const repository = new BundledPublicCatalogRepository({
      url: '/data/public-catalog.snapshot.json',
      now: () => generatedAt + PUBLIC_SNAPSHOT_MAX_AGE_MS + 1,
      fetchImplementation: async () =>
        new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    const loaded = await repository.load({ signal: new AbortController().signal });

    expect(loaded.source).toBe('bundled-snapshot');
    expect(loaded.data.contract).toBe('beta04');
    expect(loaded.metadata.stale).toBe(true);
  });

  test('Neverwinter V4 context belongs only to Un aliento menos', async () => {
    const envelope = await parsePublicCatalogSnapshotV4(await readSnapshot());
    if (envelope.data.contract !== 'beta04') throw new Error('V4 expected');
    const snapshot = envelope.data.catalog;
    expect(snapshot.mapContexts).toEqual([
      {
        id: 'map-neverwinter',
        slug: 'neverwinter',
        name: 'Neverwinter',
        parentId: null,
        width: 2048,
        height: 1582,
        imageUri: null,
      },
    ]);
    const castigo = snapshot.campaignLocalMaps.find(
      (m) => m.campaignId === INITIAL_PUBLIC_CAMPAIGN_ID,
    );
    const second = snapshot.campaignLocalMaps.find(
      (m) => m.campaignId !== INITIAL_PUBLIC_CAMPAIGN_ID,
    );
    expect(castigo?.geographicMapContextLinks).toEqual([]);
    expect(second?.geographicMapContextLinks).toEqual([
      expect.objectContaining({
        geographicNameId: 'geo-neverwinter',
        contextId: 'map-neverwinter',
      }),
    ]);
    expect(second?.placements).toEqual([]);
    expect(second?.localOnlyEntities).toEqual([]);
  });

  test('rejects a rehashed cross-campaign local map binding', async () => {
    const snapshot = await readSnapshot();
    const locals = snapshot.campaignLocalMaps as Array<{
      campaignId: string;
      geographicMapContextLinks: Array<{ campaignId: string }>;
    }>;
    const bound = locals.find((m) => m.geographicMapContextLinks.length > 0)!;
    bound.geographicMapContextLinks[0]!.campaignId = INITIAL_PUBLIC_CAMPAIGN_ID;
    const {
      checksum: _checksum,
      sourceRevision: _revision,
      generatedAt: _at,
      ...content
    } = snapshot;
    void _checksum;
    void _revision;
    void _at;
    const hash = await createSha256Checksum(content);
    snapshot.checksum = hash;
    snapshot.sourceRevision = hash;
    await expect(parsePublicCatalogSnapshotV4(snapshot)).rejects.toMatchObject({
      code: 'invalid-snapshot',
    });
  });

  test('invalid local-only content and private relation endpoints never reach cache', async () => {
    const snapshot = await readSnapshot();
    const locals = snapshot.campaignLocalMaps as Array<Record<string, unknown>>;
    const bound = locals.find((m) => m.campaignId !== INITIAL_PUBLIC_CAMPAIGN_ID)!;
    const world = (snapshot.campaignCatalogs as Array<Record<string, unknown>>).find(
      (m) => m.campaignId === bound.campaignId,
    )!;
    const categoryId = (world.categories as Array<{ id: string }>)[0]!.id;
    const localId = 'entity-synthetic-local';
    const placement = {
      contextId: 'map-neverwinter',
      entityId: localId,
      geometry: { kind: 'point', coordinates: { x: 100, y: 100 } },
      coordinates: { x: 100, y: 100 },
    };
    bound.placements = [placement];
    bound.localOnlyEntities = [
      {
        id: localId,
        slug: 'synthetic-local',
        entityType: 'character',
        lifecycleStatus: null,
        visibility: 'pin',
        name: 'Synthetic Local',
        nameLanguage: 'en',
        summary: 'Public only',
        description: 'Public synthetic local details',
        portraitPath: null,
        categoryId,
        aliases: [],
        tagIds: [],
        coordinates: { x: 100, y: 100 },
      },
    ];
    bound.entityRelations = [
      {
        leftEntityId: localId,
        rightEntityId: 'entity-MASTER-PRIVATE-CANARY',
        leftLabel: 'unsafe',
        rightLabel: 'unsafe',
      },
    ];
    const {
      checksum: _checksum,
      sourceRevision: _revision,
      generatedAt: _at,
      ...content
    } = snapshot;
    void _checksum;
    void _revision;
    void _at;
    const hash = await createSha256Checksum(content);
    snapshot.checksum = hash;
    snapshot.sourceRevision = hash;
    await expect(parsePublicCatalogSnapshotV4(snapshot)).rejects.toMatchObject({
      code: 'invalid-snapshot',
    });
  });

  test('keeps the Beta 0.1 parser available for a forward rollback deployment', async () => {
    const snapshot = await readSnapshot();
    const catalog = {
      categories: [],
      tags: [],
      places: [],
      notes: [],
    };
    const sourceRevision = 'rollback-test-revision';
    const checksum = await createSha256Checksum({
      schemaVersion: 1,
      contract: 'beta01',
      generatedAt: snapshot.generatedAt,
      sourceRevision,
      catalog,
    });
    const parsed = await parsePublicCatalogSnapshotV1({
      schemaVersion: 1,
      contract: 'beta01',
      generatedAt: snapshot.generatedAt,
      sourceRevision,
      checksum,
      catalog,
    });

    expect(parsed.data.contract).toBe('beta01');
  });
});
