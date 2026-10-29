import { describe, expect, test } from 'vitest';
import type { PublicCatalogSnapshotV2 } from '../../data/beta02-model';
import type { CampaignCatalog } from '../../data/model';
import { searchPublicAtlas } from '../../data/search';
import { createAtlasPinMarkerModels, createAtlasSearchOnlyDetailPin } from '../../data/pinMarkers';
import {
  mergePublicLocalCatalog,
  parsePublicLocalPlacement,
  projectPublicLocalSurface,
  SupabasePublicLocalMapRepository,
  type PublicLocalMapData,
  type PublicLocalContext,
} from './publicLocalMapRepository';
import {
  PUBLIC_CATALOG_TABLE_QUERIES,
  fetchCompletePublicCatalogTable,
} from '../../data-access/publicCatalogQueryContract.js';

const CAMPAIGN = '00000000-0000-4000-8000-000000000068';
const contexts: readonly PublicLocalContext[] = [
  { id: 'map-local-a', slug: 'local-a', name: 'Local A', width: 5000, height: 4000 },
  { id: 'map-local-b', slug: 'local-b', name: 'Local B', width: 200, height: 300 },
];
const world: PublicCatalogSnapshotV2 = {
  schemaVersion: 2,
  generatedAt: '2026-10-29T12:00:00.000Z',
  sourceRevision: 'fixture',
  checksum: 'fixture',
  categories: [{ id: 'category-test', slug: 'test', name: 'Test', description: '' }],
  tags: [],
  players: [],
  entities: [
    {
      id: 'entity-world',
      slug: 'world',
      entityType: 'character',
      lifecycleStatus: null,
      visibility: 'pin',
      name: 'World',
      nameLanguage: 'en',
      summary: 'world',
      description: '',
      categoryId: 'category-test',
      aliases: [],
      tagIds: [],
      coordinates: { x: 100, y: 200 },
    },
  ],
  dispositions: [],
  associations: [],
  entityRelations: [],
  characterLocationRelations: [],
  notes: [],
  geographicNames: [],
  characterLocationEvents: [],
};
const LOCAL_ENTITY: PublicLocalMapData['localOnlyEntities'][number] = {
  id: 'entity-local',
  slug: 'local',
  entityType: 'character',
  lifecycleStatus: null,
  visibility: 'pin',
  name: 'Local Only',
  nameLanguage: 'en',
  summary: 'unique',
  description: 'Canonical details',
  categoryId: 'category-test',
  tagIds: [],
  aliases: [{ id: 'alias-local', entityId: 'entity-local', language: 'en', value: 'Hidden Name' }],
  portraitPath: null,
  coordinates: { x: 4000, y: 3000 },
};
const local: PublicLocalMapData = {
  campaignId: CAMPAIGN,
  contexts,
  placements: [
    {
      contextId: 'map-local-a',
      entityId: 'entity-world',
      geometry: { kind: 'point', coordinates: { x: 4000, y: 3000 } },
      coordinates: { x: 4000, y: 3000 },
    },
    {
      contextId: 'map-local-b',
      entityId: 'entity-world',
      geometry: { kind: 'point', coordinates: { x: 50, y: 60 } },
      coordinates: { x: 50, y: 60 },
    },
    {
      contextId: 'map-local-a',
      entityId: 'entity-local',
      geometry: { kind: 'point', coordinates: { x: 4000, y: 3000 } },
      coordinates: { x: 4000, y: 3000 },
    },
  ],
  localOnlyEntities: [LOCAL_ENTITY],
  notes: [
    {
      id: 'note-local',
      slug: 'note-local',
      entityId: 'entity-local',
      title: 'Local note',
      body: 'Public note',
      sortOrder: 0,
      tagIds: [],
    },
  ],
  dispositions: [],
  associations: [],
  entityRelations: [],
  characterLocationRelations: [],
};
const legacy: CampaignCatalog = { categories: [], tags: [], places: [], notes: [] };

describe('MAP-079 explicit world/local boundary', () => {
  test('search_only selects a transient canonical detail model without rendering a permanent pin', () => {
    const searchOnlyLocal: PublicLocalMapData = {
      ...local,
      localOnlyEntities: [{ ...LOCAL_ENTITY, visibility: 'search_only' }],
    };
    const projected = projectPublicLocalSurface(world, searchOnlyLocal, 'map-local-a');
    const pin = createAtlasSearchOnlyDetailPin(projected, 'entity-local');
    expect(pin).toMatchObject({
      id: 'entity-local',
      entityId: 'entity-local',
      name: 'Local Only',
      coordinate: [3000, 4000],
      source: 'beta02',
    });
    expect(createAtlasPinMarkerModels(legacy, projected).some(({ entityId }) => entityId === 'entity-local')).toBe(false);
    expect(createAtlasSearchOnlyDetailPin(world, 'entity-local')).toBeNull();
  });

  test('world REST query explicitly excludes local-only independent of RLS', async () => {
    expect(PUBLIC_CATALOG_TABLE_QUERIES.entities?.worldMapEnabled).toBe(true);
    let url: URL | null = null;
    await fetchCompletePublicCatalogTable({
      projectUrl: 'https://fixture.supabase.co',
      publishableKey: 'sb_publishable_fixture_key',
      signal: new AbortController().signal,
      query: PUBLIC_CATALOG_TABLE_QUERIES.entities!,
      fetchImplementation: async (input) => {
        url = new URL(String(input));
        return new Response('[]', { status: 200, headers: { 'Content-Range': '*/0' } });
      },
    });
    expect(url!.searchParams.get('world_map_enabled')).toBe('eq.true');
  });

  test('canonical entity occurs once in merged search and has local placement per context', () => {
    const combined = mergePublicLocalCatalog(world, local);
    expect(combined.entities.map(({ id }) => id)).toEqual(['entity-world', 'entity-local']);
    expect(searchPublicAtlas(legacy, combined, 'local').map(({ id }) => id)).toEqual([
      'entity-local',
    ]);
    expect(searchPublicAtlas(legacy, combined, 'Hidden Name').map(({ id }) => id)).toEqual([
      'entity-local',
    ]);
    expect(searchPublicAtlas(legacy, combined, 'local note').map(({ id }) => id)).toEqual([
      'entity-local',
    ]);
    const first = projectPublicLocalSurface(world, local, 'map-local-a');
    const second = projectPublicLocalSurface(world, local, 'map-local-b');
    expect(first.entities.map(({ id }) => id)).toEqual(['entity-world', 'entity-local']);
    expect(first.entities[0]?.coordinates).toEqual({ x: 4000, y: 3000 });
    expect(second.entities.map(({ id }) => id)).toEqual(['entity-world']);
    expect(second.entities[0]?.coordinates).toEqual({ x: 50, y: 60 });
    expect(world.entities[0]?.coordinates).toEqual({ x: 100, y: 200 });
    expect(combined.entities[0]?.coordinates).toEqual({ x: 100, y: 200 });
  });

  test('fails closed for cross-campaign placement, missing binding and invalid polygon', () => {
    const row = {
      campaign_id: CAMPAIGN,
      map_context_id: 'map-local-b',
      entity_id: 'entity-local',
      publication_status: 'published',
      x: 20,
      y: 30,
      geometry: { kind: 'point', coordinates: { x: 20, y: 30 } },
    };
    expect(() =>
      parsePublicLocalPlacement(row, '00000000-0000-4000-8000-000000000053', contexts),
    ).toThrow();
    expect(() =>
      parsePublicLocalPlacement({ ...row, map_context_id: 'map-other' }, CAMPAIGN, contexts),
    ).toThrow();
    expect(() =>
      parsePublicLocalPlacement({ ...row, publication_status: 'draft' }, CAMPAIGN, contexts),
    ).toThrow();
    expect(() =>
      parsePublicLocalPlacement(
        {
          ...row,
          geometry: {
            kind: 'polygon',
            vertices: [
              { x: 5, y: 5 },
              { x: 30, y: 30 },
              { x: 30, y: 5 },
              { x: 5, y: 30 },
            ],
          },
        },
        CAMPAIGN,
        contexts,
      ),
    ).toThrow();
    expect(() => projectPublicLocalSurface(world, local, 'map-unbound')).toThrow();
  });

  test('world identity and local-only identity cannot be duplicated', () => {
    const duplicate: PublicLocalMapData = {
      ...local,
      localOnlyEntities: [{ ...LOCAL_ENTITY, id: 'entity-world' }],
    };
    expect(() => mergePublicLocalCatalog(world, duplicate)).toThrow();
  });

  test('repository filters local-only explicitly and keeps published links campaign-scoped', async () => {
    const requested: string[] = [];
    const tables: Record<string, readonly Record<string, unknown>[]> = {
      campaign_geographic_map_context_links: contexts.map((context) => ({
        campaign_id: CAMPAIGN,
        geographic_name_id: 'geo-synthetic-' + context.slug,
        map_context_id: context.id,
        map_contexts: { ...context, publication_status: 'published' },
      })),
      entity_map_placements: local.placements.map((placement) => ({
        campaign_id: CAMPAIGN,
        map_context_id: placement.contextId,
        entity_id: placement.entityId,
        geometry: placement.geometry,
        x: placement.coordinates.x,
        y: placement.coordinates.y,
        publication_status: 'published',
      })),
      map_entities: [
        {
          id: 'entity-local',
          slug: 'local',
          entity_type: 'character',
          lifecycle_status: null,
          visibility: 'pin',
          name: 'Local Only',
          name_language: 'en',
          summary: 'unique',
          description: 'Canonical details',
          portrait_path: null,
          x: null,
          y: null,
          geometry: null,
          category_id: 'category-test',
          world_map_enabled: false,
          publication_status: 'published',
          audience: 'public',
        },
      ],
      entity_aliases: [
        { id: 'alias-local', entity_id: 'entity-local', language: 'en', value: 'Hidden Name' },
      ],
      entity_tags: [],
      entity_player_dispositions: [],
      entity_player_associations: [],
      entity_relations: [],
      character_location_relations: [],
      public_notes: [],
      public_note_tags: [],
    };
    const repository = new SupabasePublicLocalMapRepository({
      projectUrl: 'https://fixture.supabase.co',
      publishableKey: 'sb_publishable_fixture_key',
      fetchImplementation: async (input) => {
        const url = new URL(String(input));
        const name = url.pathname.split('/').pop()!;
        requested.push(name);
        if (name === 'map_entities')
          expect(url.searchParams.get('world_map_enabled')).toBe('eq.false');
        expect(url.searchParams.get('campaign_id')).toBe('eq.' + CAMPAIGN);
        const rows = tables[name] ?? [];
        return new Response(JSON.stringify(rows), {
          status: 200,
          headers: {
            'Content-Range': rows.length ? '0-' + (rows.length - 1) + '/' + rows.length : '*/0',
          },
        });
      },
    });
    const data = await repository.load({
      campaignId: CAMPAIGN,
      signal: new AbortController().signal,
    });
    expect(data.contexts).toHaveLength(2);
    expect(data.placements).toHaveLength(3);
    expect(data.localOnlyEntities).toHaveLength(1);
    expect(data.localOnlyEntities[0]?.aliases).toHaveLength(1);
    expect(requested).toContain('entity_map_placements');
  });

  test('stale or aborted local requests fail closed', async () => {
    const controller = new AbortController();
    const repository = new SupabasePublicLocalMapRepository({
      projectUrl: 'https://fixture.supabase.co',
      publishableKey: 'sb_publishable_fixture_key',
      fetchImplementation: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        }),
    });
    const request = repository.load({ campaignId: CAMPAIGN, signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toMatchObject({ code: 'request-aborted' });
  });
});
