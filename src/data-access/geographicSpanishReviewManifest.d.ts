export type GeographicSpanishReviewStatus = 'translated' | 'unchanged' | 'unverified';

export interface GeographicSpanishReviewEntry {
  readonly id: string;
  readonly canonicalName: string;
  readonly status: GeographicSpanishReviewStatus;
  readonly aliases: readonly string[];
  readonly sources: readonly string[];
}

export interface VerifiedSpanishGeographicAlias {
  readonly geographicNameId: string;
  readonly value: string;
}

export const MAP040_SPANISH_REVIEW_COUNT: 213;
export const MAP040_SPANISH_REVIEW_SOURCES: Readonly<Record<string, string>>;
export const GEOGRAPHIC_SPANISH_REVIEW_MANIFEST: readonly GeographicSpanishReviewEntry[];
export const MAP040_SPANISH_REVIEW_COUNTS: Readonly<{
  translated: number;
  unchanged: number;
  unverified: number;
}>;
export const MAP040_VERIFIED_SPANISH_ALIASES: readonly VerifiedSpanishGeographicAlias[];
