import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import { INITIAL_PUBLIC_CAMPAIGN_ID } from '../../data-access/publicCatalogQueryContract.js';
import { createSha256Checksum } from '../../data-access/publicCatalog';
import {
  parsePublicCatalogSnapshotV3,
  projectPublicCatalogSnapshotV3ToV2,
} from '../snapshot/multicampaignSnapshotCodec';
import { parsePublicCatalogSnapshotV2 } from './publicCatalogCodec';

const SNAPSHOT_URL = new URL('../../../public/data/public-catalog.snapshot.json', import.meta.url);

describe('historical Beta 0.2 cache compatibility', () => {
  test('verifies the historic checksum before normalizing MAP-058 fields', async () => {
    const raw = JSON.parse(await readFile(SNAPSHOT_URL, 'utf8')) as unknown;
    const parsedV3 = await parsePublicCatalogSnapshotV3(raw);
    if (parsedV3.data.contract !== 'beta03') throw new Error('Expected Beta 0.3 snapshot.');

    const projected = projectPublicCatalogSnapshotV3ToV2(
      parsedV3.data.catalog,
      INITIAL_PUBLIC_CAMPAIGN_ID,
    );
    if (!projected) throw new Error('Expected the initial campaign projection.');

    const historicContent = {
      schemaVersion: 2 as const,
      categories: projected.categories,
      tags: projected.tags,
      players: projected.players.map(({ accentColor: _accentColor, ...player }) => player),
      entities: projected.entities,
      dispositions: projected.dispositions,
      characterLocationRelations: projected.characterLocationRelations,
      notes: projected.notes,
      geographicNames: projected.geographicNames,
      characterLocationEvents: projected.characterLocationEvents,
    };
    const checksum = await createSha256Checksum(historicContent);
    const historicSnapshot = {
      ...historicContent,
      generatedAt: projected.generatedAt,
      sourceRevision: checksum,
      checksum,
    };

    const parsedV2 = await parsePublicCatalogSnapshotV2(historicSnapshot);
    expect(parsedV2.data.contract).toBe('beta02');
    if (parsedV2.data.contract !== 'beta02') throw new Error('Expected Beta 0.2 cache.');

    expect(parsedV2.data.catalog.associations).toEqual([]);
    expect(parsedV2.data.catalog.players.every(({ accentColor }) => accentColor === '#475569')).toBe(
      true,
    );
    expect(parsedV2.metadata.checksum).toBe(checksum);
  });
});
