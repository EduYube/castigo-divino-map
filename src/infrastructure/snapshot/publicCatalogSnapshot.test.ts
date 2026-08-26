import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import { createSha256Checksum } from '../../data-access/publicCatalog';
import {
  BundledPublicCatalogRepository,
  parsePublicCatalogSnapshotV1,
  PUBLIC_SNAPSHOT_MAX_AGE_MS,
} from './publicCatalogSnapshot';
import { parsePublicCatalogSnapshotV3 } from './multicampaignSnapshotCodec';
import { parsePublicCatalogSnapshotV2 } from '../supabase/publicCatalogCodec';

const SNAPSHOT_URL = new URL('../../../public/data/public-catalog.snapshot.json', import.meta.url);
const INITIAL_CAMPAIGN_ID = '00000000-0000-4000-8000-000000000053';

async function readSnapshot(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(SNAPSHOT_URL, 'utf8')) as Record<string, unknown>;
}

async function upgradeCommittedSnapshotToV3(
  snapshot: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const legacyGeographicNames = snapshot.geographicNames as Record<string, unknown>[];
  const geographicNames = legacyGeographicNames.map((name) => {
    const globalName = { ...name };
    delete globalName.entityId;
    return globalName;
  });
  const geographicEntityLinks = legacyGeographicNames.flatMap((name) =>
    typeof name.entityId === 'string'
      ? [
          {
            campaignId: INITIAL_CAMPAIGN_ID,
            geographicNameId: name.id,
            entityId: name.entityId,
          },
        ]
      : [],
  );
  const content = {
    schemaVersion: 3,
    campaigns: [
      {
        id: INITIAL_CAMPAIGN_ID,
        slug: 'castigo-divino',
        name: 'Castigo Divino',
        status: 'active',
        displayOrder: 0,
      },
    ],
    campaignCatalogs: [
      {
        campaignId: INITIAL_CAMPAIGN_ID,
        categories: snapshot.categories,
        tags: snapshot.tags,
        players: snapshot.players,
        entities: snapshot.entities,
        dispositions: snapshot.dispositions,
        characterLocationRelations: snapshot.characterLocationRelations,
        notes: snapshot.notes,
        characterLocationEvents: snapshot.characterLocationEvents,
        geographicEntityLinks,
      },
    ],
    geographicNames,
  };
  const checksum = await createSha256Checksum(content);

  return {
    ...content,
    generatedAt: snapshot.generatedAt,
    sourceRevision: checksum,
    checksum,
  };
}

describe('public catalog snapshot', () => {
  test('validates the committed Beta 0.2 snapshot and checksum', async () => {
    const snapshot = await readSnapshot();
    const result = await parsePublicCatalogSnapshotV2(snapshot, () =>
      Date.parse(String(snapshot.generatedAt)),
    );

    expect(result.data.contract).toBe('beta02');
    expect(result.metadata.schemaVersion).toBe(2);
    expect(result.metadata.checksum).toBe(snapshot.checksum);
  });

  test('loads an equivalent multicampaign v3 snapshot through the degraded-mode repository', async () => {
    const legacySnapshot = await readSnapshot();
    const snapshotV3 = await upgradeCommittedSnapshotToV3(legacySnapshot);
    const generatedAt = Date.parse(String(snapshotV3.generatedAt));
    const parsed = await parsePublicCatalogSnapshotV3(snapshotV3, () => generatedAt);
    const repository = new BundledPublicCatalogRepository({
      url: '/data/public-catalog.snapshot.json',
      now: () => generatedAt,
      fetchImplementation: async () =>
        new Response(JSON.stringify(snapshotV3), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    const loaded = await repository.load({ signal: new AbortController().signal });

    expect(parsed.metadata.schemaVersion).toBe(3);
    expect(loaded.metadata.schemaVersion).toBe(3);
    expect(loaded.source).toBe('bundled-snapshot');
    expect(loaded.data.contract).toBe('beta02');

    if (loaded.data.contract !== 'beta02') {
      throw new Error('Expected the v3 snapshot to project as beta02.');
    }

    expect(loaded.data.catalog.entities).toEqual(legacySnapshot.entities);
    expect(loaded.data.catalog.geographicNames).toEqual(legacySnapshot.geographicNames);
  });

  test('rejects a Beta 0.2 snapshot whose public content no longer matches its checksum', async () => {
    const snapshot = await readSnapshot();
    const entities = snapshot.entities as { name: string }[];
    entities[0]!.name = 'Contenido manipulado';

    await expect(parsePublicCatalogSnapshotV2(snapshot)).rejects.toMatchObject({
      code: 'checksum-mismatch',
    });
  });

  test('loads the packaged Beta 0.2 snapshot as the bundled fallback and marks age', async () => {
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

    const result = await repository.load({ signal: new AbortController().signal });

    expect(result.source).toBe('bundled-snapshot');
    expect(result.data.contract).toBe('beta02');
    expect(result.metadata.stale).toBe(true);
  });

  test('keeps the Beta 0.1 parser available for a forward rollback deployment', async () => {
    const catalog = { categories: [], tags: [], places: [], notes: [] };
    const generatedAt = '2026-08-06T00:00:00.000Z';
    const sourceRevision = 'sha256:legacy';
    const checksum = await createSha256Checksum({
      schemaVersion: 1,
      contract: 'beta01',
      generatedAt,
      sourceRevision,
      catalog,
    });

    const result = await parsePublicCatalogSnapshotV1({
      schemaVersion: 1,
      contract: 'beta01',
      generatedAt,
      sourceRevision,
      checksum,
      catalog,
    });

    expect(result.data.contract).toBe('beta01');
  });
});
