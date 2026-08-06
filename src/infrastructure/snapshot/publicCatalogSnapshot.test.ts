import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import { PublicDataRepositoryError } from '../../data-access/publicCatalog';
import { parsePublicCatalogSnapshotV1, PUBLIC_SNAPSHOT_MAX_AGE_MS } from './publicCatalogSnapshot';

const SNAPSHOT_URL = new URL('../../../public/data/public-catalog.snapshot.json', import.meta.url);

async function readSnapshot(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(SNAPSHOT_URL, 'utf8')) as Record<string, unknown>;
}

describe('public catalog snapshot', () => {
  test('validates the committed Beta 0.1 snapshot and checksum', async () => {
    const snapshot = await readSnapshot();
    const result = await parsePublicCatalogSnapshotV1(snapshot, () =>
      Date.parse('2026-08-07T00:00:00Z'),
    );

    expect(result.source).toBe('bundled-snapshot');
    expect(result.data.contract).toBe('beta01');
    expect(result.metadata.schemaVersion).toBe(1);
    expect(result.metadata.stale).toBe(false);
  });

  test('rejects a snapshot whose content no longer matches its checksum', async () => {
    const snapshot = await readSnapshot();
    const catalog = snapshot.catalog as { places: { name: string }[] };
    catalog.places[0]!.name = 'Contenido manipulado';

    await expect(parsePublicCatalogSnapshotV1(snapshot)).rejects.toMatchObject<
      Partial<PublicDataRepositoryError>
    >({ code: 'checksum-mismatch' });
  });

  test('keeps an old valid snapshot usable and marks it stale', async () => {
    const snapshot = await readSnapshot();
    const generatedAt = Date.parse(String(snapshot.generatedAt));
    const result = await parsePublicCatalogSnapshotV1(
      snapshot,
      () => generatedAt + PUBLIC_SNAPSHOT_MAX_AGE_MS + 1,
    );

    expect(result.metadata.stale).toBe(true);
    expect(result.data.contract).toBe('beta01');
  });
});
