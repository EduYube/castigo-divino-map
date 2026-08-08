import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import { parsePublicCatalogSnapshotV2 } from '../infrastructure/supabase/publicCatalogCodec';
import { campaignCatalog } from './catalog';
import { toBeta01CompatibilityCatalog } from './beta01Compatibility';

const SNAPSHOT_URL = new URL('../../public/data/public-catalog.snapshot.json', import.meta.url);

describe('Beta 0.1 compatibility projection', () => {
  test('reconstructs the published Beta 0.1 catalog exactly from the Beta 0.2 snapshot', async () => {
    const snapshot = JSON.parse(await readFile(SNAPSHOT_URL, 'utf8')) as unknown;
    const envelope = await parsePublicCatalogSnapshotV2(snapshot);

    expect(envelope.data.contract).toBe('beta02');

    if (envelope.data.contract !== 'beta02') {
      throw new Error('Expected the committed Beta 0.2 snapshot.');
    }

    expect(toBeta01CompatibilityCatalog(envelope.data.catalog)).toEqual(campaignCatalog);
  });
});
