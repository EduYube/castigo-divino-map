const ENTITY_QUERY_PARAMETER = 'entity';
const CAMPAIGN_QUERY_PARAMETER = 'campaign';
const PUBLIC_ENTITY_SLUG_PATTERN = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;

export interface FullEntityUrlRequest {
  readonly requested: true;
  readonly slug: string | null;
  readonly canonicalUrl: URL | null;
  readonly isCanonical: boolean;
}

export function isPublicEntitySlug(value: string): boolean {
  return PUBLIC_ENTITY_SLUG_PATTERN.test(value);
}

export function createFullEntityUrl(sourceUrl: URL, slug: string): URL {
  if (!isPublicEntitySlug(slug)) {
    throw new Error('Cannot create a public entity URL from an invalid slug.');
  }

  const campaign = sourceUrl.searchParams.get(CAMPAIGN_QUERY_PARAMETER)?.trim() ?? '';
  const url = new URL(sourceUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set(ENTITY_QUERY_PARAMETER, slug);
  if (campaign) url.searchParams.set(CAMPAIGN_QUERY_PARAMETER, campaign);
  return url;
}

export function parseFullEntityUrlRequest(sourceUrl: URL): FullEntityUrlRequest | null {
  const values = sourceUrl.searchParams.getAll(ENTITY_QUERY_PARAMETER);

  if (values.length === 0) {
    return null;
  }

  const slug = values.length === 1 && isPublicEntitySlug(values[0] ?? '') ? values[0] : null;

  if (!slug) {
    return {
      requested: true,
      slug: null,
      canonicalUrl: null,
      isCanonical: true,
    };
  }

  const canonicalUrl = createFullEntityUrl(sourceUrl, slug);

  return {
    requested: true,
    slug,
    canonicalUrl,
    isCanonical: canonicalUrl.href === sourceUrl.href,
  };
}
