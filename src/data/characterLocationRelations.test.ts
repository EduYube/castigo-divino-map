import { describe, expect, test } from 'vitest';

import type { PublicCatalogSnapshotV2, PublicMapEntity } from './beta02-model';
import {
  getImportantCharactersForLocation,
  getRelatedLocationsForCharacter,
} from './characterLocationRelations';

function entity(
  id: PublicMapEntity['id'],
  name: string,
  entityType: PublicMapEntity['entityType'],
): PublicMapEntity {
  return {
    id,
    slug: id.replace(/^entity-/, ''),
    entityType,
    visibility: 'pin',
    name,
    nameLanguage: 'en',
    aliases: [],
    summary: '',
    description: '',
    coordinates: { x: 10, y: 10 },
    categoryId: entityType === 'character' ? 'category-people' : 'category-places',
    tagIds: [],
  };
}

const catalog: PublicCatalogSnapshotV2 = {
  schemaVersion: 2,
  generatedAt: '2026-08-07T00:00:00Z',
  sourceRevision: `sha256:${'1'.repeat(64)}`,
  checksum: `sha256:${'2'.repeat(64)}`,
  categories: [],
  tags: [],
  players: [],
  entities: [
    entity('entity-zara', 'Zara', 'character'),
    entity('entity-aster', 'Aster', 'character'),
    entity('entity-bramble', 'Bramble', 'location'),
    entity('entity-citadel', 'Citadel', 'location'),
  ],
  dispositions: [],
  characterLocationRelations: [
    { characterId: 'entity-zara', locationId: 'entity-bramble', relationStatus: 'associated' },
    { characterId: 'entity-aster', locationId: 'entity-bramble', relationStatus: 'present' },
    { characterId: 'entity-aster', locationId: 'entity-citadel', relationStatus: 'last-seen' },
  ],
  notes: [],
  geographicNames: [],
  characterLocationEvents: [],
};

describe('character-location public projections', () => {
  test('location cards get important characters in stable semantic/name order', () => {
    expect(
      getImportantCharactersForLocation(catalog, 'entity-bramble').map(({ character, relation }) => [
        character.name,
        relation.relationStatus,
      ]),
    ).toEqual([
      ['Aster', 'present'],
      ['Zara', 'associated'],
    ]);
  });

  test('character cards derive all related locations from the same normalized source', () => {
    expect(
      getRelatedLocationsForCharacter(catalog, 'entity-aster').map(({ location }) => location.name),
    ).toEqual(['Bramble', 'Citadel']);
  });
});
