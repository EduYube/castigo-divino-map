import { describe, expect, it } from 'vitest';

import {
  createFullEntityUrl,
  isPublicEntitySlug,
  parseFullEntityUrlRequest,
} from './fullEntityUrl';

describe('full entity URL contract', () => {
  it('creates a canonical query-only URL under the existing pathname and preserves campaign', () => {
    const source = new URL(
      'https://example.test/castigo-divino-map/?place=demo&q=guard&category=settlement&tag=watch&campaign=campaign-b#map',
    );

    expect(createFullEntityUrl(source, 'harbor-guard').href).toBe(
      'https://example.test/castigo-divino-map/?entity=harbor-guard&campaign=campaign-b',
    );
  });

  it('parses and canonicalizes valid entity URLs without preserving map dimensions', () => {
    const source = new URL(
      'https://example.test/castigo-divino-map/?entity=harbor-guard&q=ignored&campaign=campaign-b&extra=value#ignored',
    );
    const parsed = parseFullEntityUrlRequest(source);

    expect(parsed).toMatchObject({ requested: true, slug: 'harbor-guard', isCanonical: false });
    expect(parsed?.canonicalUrl?.href).toBe(
      'https://example.test/castigo-divino-map/?entity=harbor-guard&campaign=campaign-b',
    );
  });

  it('keeps legacy entity URLs valid when no campaign has been canonicalized yet', () => {
    const source = new URL('https://example.test/castigo-divino-map/?entity=harbor-guard');
    const parsed = parseFullEntityUrlRequest(source);

    expect(parsed).toMatchObject({ requested: true, slug: 'harbor-guard', isCanonical: true });
    expect(parsed?.canonicalUrl?.href).toBe(
      'https://example.test/castigo-divino-map/?entity=harbor-guard',
    );
  });

  it('treats duplicate, empty and malformed identities as unavailable requests', () => {
    for (const url of [
      'https://example.test/castigo-divino-map/?entity=',
      'https://example.test/castigo-divino-map/?entity=Harbor%20Guard',
      'https://example.test/castigo-divino-map/?entity=one&entity=two',
    ]) {
      expect(parseFullEntityUrlRequest(new URL(url))).toEqual({
        requested: true,
        slug: null,
        canonicalUrl: null,
        isCanonical: true,
      });
    }
  });

  it('does not claim map URLs without entity as full entity requests', () => {
    expect(
      parseFullEntityUrlRequest(new URL('https://example.test/castigo-divino-map/?q=guard')),
    ).toBeNull();
  });

  it('accepts only public slug syntax', () => {
    expect(isPublicEntitySlug('harbor-guard')).toBe(true);
    expect(isPublicEntitySlug('harbor_guard')).toBe(false);
    expect(() =>
      createFullEntityUrl(new URL('https://example.test/castigo-divino-map/'), 'Harbor Guard'),
    ).toThrow(/invalid slug/);
  });
});
