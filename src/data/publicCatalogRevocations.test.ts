import { describe, expect, it } from 'vitest';

import type { PublicCatalogSnapshotV2 } from './beta02-model';
import type { CampaignCatalog } from './model';
import {
  applyEntityRevocationsToBeta01,
  applyEntityRevocationsToBeta02,
} from './publicCatalogRevocations';

const beta02: PublicCatalogSnapshotV2 = {
  schemaVersion: 2,
  generatedAt: '2026-08-10T00:00:00.000Z',
  sourceRevision: 'sha256:test',
  checksum: 'sha256:test',
  categories: [
    { id: 'category-test', slug: 'test', name: 'Test', description: '' },
  ],
  tags: [],
  players: [
    { id: 'player-test', slug: 'test', displayName: 'Test', nameLanguage: 'en' },
  ],
  entities: [
    {
      id: 'entity-public-character',
      slug: 'public-character',
      entityType: 'character',
      visibility: 'pin',
      name: 'Public character',
      nameLanguage: 'en',
      aliases: [],
      summary: '',
      description: '',
      coordinates: { x: 10, y: 10 },
      categoryId: 'category-test',
      tagIds: [],
    },
    {
      id: 'place-revoked-secret',
      slug: 'revoked-secret',
      entityType: 'location',
      visibility: 'pin',
      name: 'Previously public secret',
      nameLanguage: 'en',
      aliases: [
        {
          id: 'alias-revoked',
          entityId: 'place-revoked-secret',
          language: 'en',
          value: 'Revoked alias',
        },
      ],
      summary: '',
      description: '',
      coordinates: { x: 20, y: 20 },
      categoryId: 'category-test',
      tagIds: [],
    },
  ],
  dispositions: [
    {
      entityId: 'place-revoked-secret',
      playerId: 'player-test',
      disposition: 'neutral',
    },
  ],
  characterLocationRelations: [
    {
      characterId: 'entity-public-character',
      locationId: 'place-revoked-secret',
      relationStatus: 'associated',
    },
  ],
  notes: [
    {
      id: 'note-revoked',
      slug: 'revoked-note',
      entityId: 'place-revoked-secret',
      title: 'Revoked note',
      body: '',
      sortOrder: 0,
      tagIds: [],
    },
  ],
  geographicNames: [
    {
      id: 'geo-revoked',
      slug: 'revoked-geo',
      name: 'Revoked geography',
      language: 'en',
      aliases: [],
      coordinates: { x: 20, y: 20 },
      recommendedZoom: 1,
      entityId: 'place-revoked-secret',
    },
  ],
  characterLocationEvents: [
    {
      id: 'location-event-revoked',
      characterId: 'entity-public-character',
      eventType: 'sighting',
      location: {
        locationEntityId: 'place-revoked-secret',
        geographicNameId: 'geo-revoked',
        coordinates: null,
        locationLabel: 'Secret',
      },
      summary: '',
      language: 'en',
      observedAt: null,
      relatedSightingId: null,
    },
  ],
};

const beta01: CampaignCatalog = {
  categories: [{ id: 'category-test', slug: 'test', name: 'Test', description: '' }],
  tags: [],
  places: [
    {
      id: 'place-revoked-secret',
      slug: 'revoked-secret',
      name: 'Previously public secret',
      aliases: [],
      coordinates: { x: 20, y: 20 },
      categoryId: 'category-test',
      tagIds: [],
    },
  ],
  notes: [
    {
      id: 'note-revoked',
      slug: 'revoked-note',
      placeId: 'place-revoked-secret',
      title: 'Revoked note',
      body: '',
      tagIds: [],
    },
  ],
};

describe('MAP-044 public catalog revocations', () => {
  it('removes a reprivatized entity and every dependent public projection from Beta 0.2', () => {
    const result = applyEntityRevocationsToBeta02(
      beta02,
      new Set(['place-revoked-secret']),
    );

    expect(result.entities.map(({ id }) => id)).toEqual(['entity-public-character']);
    expect(result.dispositions).toEqual([]);
    expect(result.characterLocationRelations).toEqual([]);
    expect(result.notes).toEqual([]);
    expect(result.geographicNames).toEqual([]);
    expect(result.characterLocationEvents).toEqual([]);
    expect(beta02.entities).toHaveLength(2);
  });

  it('also removes a revoked legacy place and its note from a Beta 0.1 fallback', () => {
    const result = applyEntityRevocationsToBeta01(
      beta01,
      new Set(['place-revoked-secret']),
    );

    expect(result.places).toEqual([]);
    expect(result.notes).toEqual([]);
    expect(result.categories).toEqual([]);
  });
});
