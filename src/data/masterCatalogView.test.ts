import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import type { AuthorizedMasterCatalog } from '../data-access/masterCatalog';
import { INITIAL_PUBLIC_CAMPAIGN_ID } from '../data-access/publicCatalogQueryContract.js';
import {
  parsePublicCatalogSnapshotV3,
  projectPublicCatalogSnapshotV3ToV2,
} from '../infrastructure/snapshot/multicampaignSnapshotCodec';
import { createAuthorizedMasterCatalogView } from './masterCatalogView';

const SNAPSHOT_URL = new URL('../../public/data/public-catalog.snapshot.json', import.meta.url);

async function publicCatalog() {
  const raw = JSON.parse(await readFile(SNAPSHOT_URL, 'utf8')) as unknown;
  const parsed = await parsePublicCatalogSnapshotV3(raw);
  if (parsed.data.contract !== 'beta03') throw new Error('Expected Beta 0.3 snapshot fixture.');
  const projected = projectPublicCatalogSnapshotV3ToV2(
    parsed.data.catalog,
    INITIAL_PUBLIC_CAMPAIGN_ID,
  );
  if (!projected) throw new Error('Expected the initial campaign in the committed v3 snapshot.');
  return projected;
}

function masterCatalog(
  categoryId: string,
  entityId = 'entity-master-unit',
): AuthorizedMasterCatalog {
  return {
    entities: [
      {
        id: entityId,
        slug: 'master-unit',
        entityType: 'character',
        visibility: 'pin',
        audience: 'master',
        name: 'MAP044 MASTER UNIT CANARY',
        summary: 'Private summary',
        description: 'Private description',
        x: 123,
        y: 456,
        categoryId,
        updatedAt: '2026-08-10T21:00:00.000Z',
      },
    ],
    categories: [],
    aliases: [
      {
        id: 'alias-master-unit',
        entityId,
        value: 'Private alias',
      },
    ],
    tags: [],
    entityTags: [],
    players: [],
    dispositions: [],
    associations: [],
    relations: [],
    relationEntities: [],
  };
}

describe('createAuthorizedMasterCatalogView', () => {
  test('adds private entities only to the returned in-memory projection', async () => {
    const publicSnapshot = await publicCatalog();
    const originalEntityIds = publicSnapshot.entities.map(({ id }) => id);
    const category = publicSnapshot.categories[0];
    if (!category) throw new Error('Expected at least one public category.');

    const view = createAuthorizedMasterCatalogView(publicSnapshot, masterCatalog(category.id));

    expect(view.masterEntityIds.has('entity-master-unit')).toBe(true);
    expect(view.catalog.entities).toHaveLength(publicSnapshot.entities.length + 1);
    expect(view.catalog.entities.at(-1)).toMatchObject({
      id: 'entity-master-unit',
      name: 'MAP044 MASTER UNIT CANARY',
    });
    expect(publicSnapshot.entities.map(({ id }) => id)).toEqual(originalEntityIds);
    expect(publicSnapshot.entities.some(({ id }) => id === 'entity-master-unit')).toBe(false);
  });

  test('fails closed if a private id is ever present in the public snapshot', async () => {
    const publicSnapshot = await publicCatalog();
    const publicEntity = publicSnapshot.entities[0];
    const category = publicSnapshot.categories[0];
    if (!publicEntity || !category) throw new Error('Expected public entity/category fixtures.');

    expect(() =>
      createAuthorizedMasterCatalogView(
        publicSnapshot,
        masterCatalog(category.id, publicEntity.id),
      ),
    ).toThrow(/también apareció en el catálogo público/i);
  });
});
