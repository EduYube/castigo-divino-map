import { describe, expect, it } from 'vitest';

import type { CampaignCatalog } from '../data/model';
import {
  EMPTY_PUBLIC_APP_URL_STATE,
  createCanonicalPublicAppUrl,
  parsePublicAppUrlState,
} from './urlState';

const catalog: CampaignCatalog = {
  categories: [],
  tags: [],
  places: [],
  notes: [],
};

describe('MAP-077 local map URL state', () => {
  it('retains a map slug and campaign for refresh and sharing', () => {
    const input = new URL('https://atlas.example/?campaign=un-aliento-menos&map=neverwinter');
    const parsed = parsePublicAppUrlState(catalog, input);

    expect(parsed.state.mapSlug).toBe('neverwinter');
    expect(parsed.canonicalUrl.searchParams.get('campaign')).toBe('un-aliento-menos');
    const canonical = createCanonicalPublicAppUrl(catalog, input, parsed.state);
    expect(canonical.searchParams.get('map')).toBe('neverwinter');
  });

  it('rejects malformed slugs without changing the campaign', () => {
    const input = new URL('https://atlas.example/?campaign=castigo-divino&map=../other');
    const parsed = parsePublicAppUrlState(catalog, input);

    expect(parsed.state.mapSlug).toBeUndefined();
    expect(parsed.canonicalUrl.searchParams.has('map')).toBe(false);
    expect(parsed.canonicalUrl.searchParams.get('campaign')).toBe('castigo-divino');
  });

  it('leaves v1.2 world-only state unchanged', () => {
    expect(EMPTY_PUBLIC_APP_URL_STATE.mapSlug).toBeUndefined();
    const parsed = parsePublicAppUrlState(catalog, new URL('https://atlas.example/'));
    expect(parsed.state.mapSlug).toBeUndefined();
  });
});
