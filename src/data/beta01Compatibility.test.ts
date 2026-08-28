import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import { INITIAL_PUBLIC_CAMPAIGN_ID } from '../data-access/publicCatalogQueryContract.js';
import {
  parsePublicCatalogSnapshotV3,
  projectPublicCatalogSnapshotV3ToV2,
} from '../infrastructure/snapshot/multicampaignSnapshotCodec';
import { campaignCatalog } from './catalog';
import { toBeta01CompatibilityCatalog } from './beta01Compatibility';

const SNAPSHOT_URL = new URL('../../public/data/public-catalog.snapshot.json', import.meta.url);
const EMPTY_BETA01_CATALOG = {
  categories: [],
  tags: [],
  places: [],
  notes: [],
};

async function readCommittedBeta02Catalog() {
  const snapshot = JSON.parse(await readFile(SNAPSHOT_URL, 'utf8')) as unknown;
  const envelope = await parsePublicCatalogSnapshotV3(snapshot);

  expect(envelope.data.contract).toBe('beta03');

  if (envelope.data.contract !== 'beta03') {
    throw new Error('Expected the committed Beta 0.3 snapshot.');
  }

  const projected = projectPublicCatalogSnapshotV3ToV2(
    envelope.data.catalog,
    INITIAL_PUBLIC_CAMPAIGN_ID,
  );
  if (!projected) throw new Error('Expected the initial campaign in the committed v3 snapshot.');
  return projected;
}

describe('Beta 0.1 compatibility projection', () => {
  test('does not resurrect archived Beta 0.1 demo entities from the historical fixture', async () => {
    expect(campaignCatalog.places.map(({ id }) => id)).toEqual([
      'place-demo-harbor',
      'place-demo-pass',
    ]);
    expect(toBeta01CompatibilityCatalog(await readCommittedBeta02Catalog())).toEqual(
      EMPTY_BETA01_CATALOG,
    );
  });

  test('does not turn unrelated future Beta 0.2 taxonomy into legacy filters', async () => {
    const catalog = await readCommittedBeta02Catalog();
    const extendedCatalog = {
      ...catalog,
      categories: [
        ...catalog.categories,
        {
          id: 'category-future' as const,
          slug: 'future-category',
          name: 'Future category',
          description: 'Not part of the Beta 0.1 compatibility surface.',
        },
      ],
      tags: [
        ...catalog.tags,
        {
          id: 'future-tag',
          name: 'Future tag',
          description: 'Not part of the Beta 0.1 compatibility surface.',
        },
      ],
    };

    expect(toBeta01CompatibilityCatalog(extendedCatalog)).toEqual(EMPTY_BETA01_CATALOG);
  });
});
