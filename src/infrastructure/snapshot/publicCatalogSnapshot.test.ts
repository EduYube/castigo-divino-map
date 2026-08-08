import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import {
  BundledPublicCatalogRepository,
  parsePublicCatalogSnapshotV1,
  PUBLIC_SNAPSHOT_MAX_AGE_MS,
} from './publicCatalogSnapshot';
import { parsePublicCatalogSnapshotV2 } from '../supabase/publicCatalogCodec';

const SNAPSHOT_URL = new URL('../../../public/data/public-catalog.snapshot.json', import.meta.url);

async function readSnapshot(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(SNAPSHOT_URL, 'utf8')) as Record<string, unknown>;
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
    const { createSha256Checksum } = await import('../../data-access/publicCatalog');
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
