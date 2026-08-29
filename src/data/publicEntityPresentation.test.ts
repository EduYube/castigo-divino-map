import { describe, expect, it } from 'vitest';

import type { PublicCatalogSnapshotV2, PublicMapEntity, PublicPlayer } from './beta02-model';
import { buildPublicEntityPresentation } from './publicEntityPresentation';

const entityA: PublicMapEntity = {
  id: 'entity-map057-a',
  slug: 'map057-a',
  entityType: 'character',
  visibility: 'pin',
  name: 'Entidad A',
  nameLanguage: 'en',
  aliases: [],
  summary: '',
  description: '',
  coordinates: { x: 100, y: 100 },
  categoryId: 'category-map057',
  tagIds: [],
};

const entityB: PublicMapEntity = {
  ...entityA,
  id: 'entity-map057-b',
  slug: 'map057-b',
  name: 'Entidad B',
};

const skade: PublicPlayer = {
  id: 'player-skade',
  slug: 'skade',
  displayName: 'Skade',
  nameLanguage: 'en',
};
const ura: PublicPlayer = {
  id: 'player-ura',
  slug: 'ura',
  displayName: 'Ura',
  nameLanguage: 'en',
};
const veyra: PublicPlayer = {
  id: 'player-veyra',
  slug: 'veyra',
  displayName: 'Veyra',
  nameLanguage: 'en',
};
const echo: PublicPlayer = {
  id: 'player-echo',
  slug: 'echo',
  displayName: 'Echo',
  nameLanguage: 'en',
};

function catalog(
  players: readonly PublicPlayer[],
  entities: readonly PublicMapEntity[],
  dispositions: PublicCatalogSnapshotV2['dispositions'],
): PublicCatalogSnapshotV2 {
  return {
    schemaVersion: 2,
    generatedAt: '2026-08-29T10:00:00.000Z',
    sourceRevision: 'map057-test',
    checksum: 'map057-test',
    categories: [
      {
        id: 'category-map057',
        slug: 'map057',
        name: 'MAP-057',
        description: '',
      },
    ],
    tags: [],
    players,
    entities,
    dispositions,
    characterLocationRelations: [],
    notes: [],
    geographicNames: [],
    characterLocationEvents: [],
  };
}

describe('MAP-057 public player disposition projection', () => {
  it('projects three distinct real dispositions for the selected campaign roster', () => {
    const campaignA = catalog(
      [skade, ura, veyra],
      [entityA],
      [
        { entityId: entityA.id, playerId: skade.id, disposition: 'ally' },
        { entityId: entityA.id, playerId: ura.id, disposition: 'neutral' },
        { entityId: entityA.id, playerId: veyra.id, disposition: 'enemy' },
      ],
    );

    expect(buildPublicEntityPresentation(campaignA, entityA)?.dispositions).toEqual([
      { playerId: skade.id, playerName: 'Skade', disposition: 'ally' },
      { playerId: ura.id, playerName: 'Ura', disposition: 'neutral' },
      { playerId: veyra.id, playerName: 'Veyra', disposition: 'enemy' },
    ]);
  });

  it('uses only campaign B roster and cannot leak A dispositions into its presentation', () => {
    const campaignB = catalog(
      [echo],
      [entityB],
      [
        { entityId: entityB.id, playerId: echo.id, disposition: 'enemy' },
        // A stale/corrupt row is deliberately present in the input fixture. Because Skade is not
        // in campaign B roster, the public projection must never expose it.
        { entityId: entityB.id, playerId: skade.id, disposition: 'ally' },
      ],
    );

    expect(buildPublicEntityPresentation(campaignB, entityB)?.dispositions).toEqual([
      { playerId: echo.id, playerName: 'Echo', disposition: 'enemy' },
    ]);
  });

  it('does not invent Neutral when a campaign player is missing a relation row', () => {
    const incomplete = catalog(
      [skade, ura],
      [entityA],
      [{ entityId: entityA.id, playerId: skade.id, disposition: 'ally' }],
    );

    expect(buildPublicEntityPresentation(incomplete, entityA)?.dispositions).toEqual([
      { playerId: skade.id, playerName: 'Skade', disposition: 'ally' },
      { playerId: ura.id, playerName: 'Ura', disposition: undefined },
    ]);
  });

  it('returns an empty relation list when the selected campaign has no players', () => {
    const withoutPlayers = catalog([], [entityA], []);

    expect(buildPublicEntityPresentation(withoutPlayers, entityA)?.dispositions).toEqual([]);
  });
});
