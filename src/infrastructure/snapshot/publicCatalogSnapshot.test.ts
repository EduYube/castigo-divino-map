import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import { createSha256Checksum } from '../../data-access/publicCatalog';
import { INITIAL_PUBLIC_CAMPAIGN_ID } from '../../data-access/publicCatalogQueryContract.js';
import {
  parsePublicCatalogSnapshotV3,
  projectPublicCatalogSnapshotV3ToV2,
} from './multicampaignSnapshotCodec';
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
  test('validates the committed multicampaign v3 snapshot and checksum', async () => {
    const snapshot = await readSnapshot();
    const result = await parsePublicCatalogSnapshotV3(snapshot, () =>
      Date.parse(String(snapshot.generatedAt)),
    );

    expect(result.data.contract).toBe('beta03');
    expect(result.metadata.schemaVersion).toBe(3);
    expect(result.metadata.checksum).toBe(snapshot.checksum);
  });

  test('loads the native multicampaign v3 snapshot through the degraded-mode repository', async () => {
    const snapshot = await readSnapshot();
    const generatedAt = Date.parse(String(snapshot.generatedAt));
    const parsed = await parsePublicCatalogSnapshotV3(snapshot, () => generatedAt);
    if (parsed.data.contract !== 'beta03') {
      throw new Error('Expected the committed snapshot to use the beta03 contract.');
    }
    const snapshotV3 = parsed.data.catalog;
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

    expect(parsed.metadata.schemaVersion).toBe(3);
    expect(loaded.metadata.schemaVersion).toBe(3);
    expect(loaded.source).toBe('bundled-snapshot');
    expect(loaded.data.contract).toBe('beta03');

    if (loaded.data.contract !== 'beta03') {
      throw new Error('Expected the v3 snapshot to remain beta03.');
    }

    expect(loaded.data.catalog.campaigns).toEqual(snapshotV3.campaigns);
    const projected = projectPublicCatalogSnapshotV3ToV2(
      loaded.data.catalog,
      INITIAL_PUBLIC_CAMPAIGN_ID,
    );
    const initialCatalog = snapshotV3.campaignCatalogs.find(
      ({ campaignId }) => campaignId === INITIAL_PUBLIC_CAMPAIGN_ID,
    );
    expect(initialCatalog).toBeDefined();
    expect(projected).not.toBeNull();
    expect(projected?.categories).toEqual(initialCatalog?.categories);
    expect(projected?.entities).toEqual(initialCatalog?.entities);
  });

  test('rejects a v3 snapshot whose public content no longer matches its checksum', async () => {
    const snapshot = await readSnapshot();
    const campaignCatalogs = snapshot.campaignCatalogs as {
      entities: { name: string }[];
    }[];
    const firstEntity = campaignCatalogs[0]?.entities[0];
    if (!firstEntity) throw new Error('Expected at least one committed public entity.');
    firstEntity.name = 'Contenido manipulado';

    await expect(parsePublicCatalogSnapshotV3(snapshot)).rejects.toMatchObject({
      code: 'checksum-mismatch',
    });
  });

  test('loads the packaged multicampaign v3 snapshot as the bundled fallback and marks age', async () => {
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
    expect(loaded.data.contract).toBe('beta03');
    expect(loaded.metadata.stale).toBe(true);
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
