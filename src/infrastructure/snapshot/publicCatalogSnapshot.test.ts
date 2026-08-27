import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import type { PublicCatalogSnapshotV2 } from '../../data/beta02-model';
import type { PublicCatalogSnapshotV3 } from '../../data/beta03-model';
import { createSha256Checksum } from '../../data-access/publicCatalog';
import { INITIAL_PUBLIC_CAMPAIGN_ID } from '../../data-access/publicCatalogQueryContract.js';
import { parsePublicCatalogSnapshotV2 } from '../supabase/publicCatalogRepository';
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

async function upgradeCommittedSnapshotToV3(
  snapshot: Record<string, unknown>,
): Promise<PublicCatalogSnapshotV3> {
  const catalog = snapshot as unknown as PublicCatalogSnapshotV2;
  const campaign = {
    id: INITIAL_PUBLIC_CAMPAIGN_ID,
    slug: 'castigo-divino',
    name: 'Castigo Divino',
    status: 'active' as const,
    displayOrder: 0,
  };
  const geographicEntityLinks = catalog.geographicNames.flatMap((name) =>
    name.entityId === null
      ? []
      : [
          {
            campaignId: campaign.id,
            geographicNameId: name.id,
            entityId: name.entityId,
          },
        ],
  );
  const geographicNames = catalog.geographicNames.map((geographicName) => ({
    id: geographicName.id,
    slug: geographicName.slug,
    name: geographicName.name,
    language: geographicName.language,
    aliases: geographicName.aliases,
    coordinates: geographicName.coordinates,
    searchExtent: geographicName.searchExtent,
    recommendedZoom: geographicName.recommendedZoom,
  }));
  const content = {
    schemaVersion: 3 as const,
    campaigns: [campaign],
    campaignCatalogs: [
      {
        campaignId: campaign.id,
        categories: catalog.categories,
        tags: catalog.tags,
        players: catalog.players,
        entities: catalog.entities,
        dispositions: catalog.dispositions,
        characterLocationRelations: catalog.characterLocationRelations,
        notes: catalog.notes,
        characterLocationEvents: catalog.characterLocationEvents,
        geographicEntityLinks,
      },
    ],
    geographicNames,
  };
  const checksum = await createSha256Checksum(content);

  return {
    ...content,
    generatedAt: snapshot.generatedAt as string,
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

  test('loads a native multicampaign v3 snapshot through the degraded-mode repository', async () => {
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
    expect(loaded.data.contract).toBe('beta03');

    if (loaded.data.contract !== 'beta03') {
      throw new Error('Expected the v3 snapshot to remain beta03.');
    }

    expect(loaded.data.catalog.campaigns).toEqual(snapshotV3.campaigns);
    const projected = projectPublicCatalogSnapshotV3ToV2(
      loaded.data.catalog,
      INITIAL_PUBLIC_CAMPAIGN_ID,
    );
    expect(projected?.entities).toEqual(legacySnapshot.entities);
    expect(projected?.geographicNames).toEqual(legacySnapshot.geographicNames);
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

    const loaded = await repository.load({ signal: new AbortController().signal });

    expect(loaded.source).toBe('bundled-snapshot');
    expect(loaded.data.contract).toBe('beta02');
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
