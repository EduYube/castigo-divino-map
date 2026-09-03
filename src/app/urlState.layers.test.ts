import { describe, expect, it } from 'vitest';
import { campaignCatalog } from '../data/catalog';
import { MAP_LAYER_IDS } from '../domain/mapLayers';
import {
  createCanonicalPublicAppUrl,
  parsePublicAppUrlState,
  serializePublicAppUrlState,
} from './urlState';

const baseState = {
  activePlaceId: null,
  query: '',
  geographicNameId: null,
  selectedCategoryIds: [],
  selectedTagIds: [],
  activeLayerIds: MAP_LAYER_IDS,
} as const;

describe('MAP-065 public layer URL state', () => {
  it('keeps legacy and all-on URLs free of redundant layer parameters', () => {
    const parsed = parsePublicAppUrlState(
      campaignCatalog,
      new URL('https://atlas.test/?campaign=main'),
    );

    expect(parsed.state.activeLayerIds).toEqual(MAP_LAYER_IDS);
    expect(parsed.canonicalUrl.searchParams.has('layers')).toBe(false);
    expect(serializePublicAppUrlState(campaignCatalog, baseState).has('layers')).toBe(false);
  });

  it('serializes a partial state in stable contract order and round-trips it', () => {
    const url = createCanonicalPublicAppUrl(
      campaignCatalog,
      new URL('https://atlas.test/?campaign=main'),
      { ...baseState, activeLayerIds: ['hazard', 'character', 'mission'] },
    );

    expect(url.searchParams.get('layers')).toBe('character,mission,hazard');
    expect(parsePublicAppUrlState(campaignCatalog, url).state.activeLayerIds).toEqual([
      'character',
      'mission',
      'hazard',
    ]);
  });

  it('represents all-off explicitly', () => {
    const url = createCanonicalPublicAppUrl(campaignCatalog, new URL('https://atlas.test/'), {
      ...baseState,
      activeLayerIds: [],
    });

    expect(url.searchParams.get('layers')).toBe('none');
    expect(parsePublicAppUrlState(campaignCatalog, url).state.activeLayerIds).toEqual([]);
  });

  it('canonicalizes duplicates, order and unknown future values without breaking', () => {
    const parsed = parsePublicAppUrlState(
      campaignCatalog,
      new URL('https://atlas.test/?layers=hazard,unknown,character,hazard'),
    );

    expect(parsed.state.activeLayerIds).toEqual(['character', 'hazard']);
    expect(parsed.canonicalUrl.searchParams.get('layers')).toBe('character,hazard');
    expect(parsed.isCanonical).toBe(false);
  });

  it('canonicalizes an invalid-only value back to the legacy all-on representation', () => {
    const parsed = parsePublicAppUrlState(
      campaignCatalog,
      new URL('https://atlas.test/?layers=unknown,future'),
    );

    expect(parsed.state.activeLayerIds).toEqual(MAP_LAYER_IDS);
    expect(parsed.canonicalUrl.searchParams.has('layers')).toBe(false);
  });
});
