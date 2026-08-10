export type GeographicSearchExtentReviewStatus = 'point' | 'extent' | 'unverified';

export interface GeographicSearchExtent {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface GeographicSearchExtentReviewEntry {
  readonly id: string;
  readonly canonicalName: string;
  readonly status: GeographicSearchExtentReviewStatus;
  readonly searchExtent: GeographicSearchExtent | null;
  readonly source: string | null;
}

export const MAP041_GEOGRAPHIC_REVIEW_COUNT: 213;
export const MAP041_REVIEWED_MAP039_FINGERPRINT: string;
export const MAP041_EXTENT_SOURCES: Readonly<
  Record<string, Readonly<{ label: string; url: string; methodology: string }>>
>;
export function geographicCoverageSemanticFingerprint(entries?: readonly unknown[]): string;
export const GEOGRAPHIC_SEARCH_EXTENT_REVIEW_MANIFEST: readonly GeographicSearchExtentReviewEntry[];
export const MAP041_GEOGRAPHIC_REVIEW_COUNTS: Readonly<{
  point: number;
  extent: number;
  unverified: number;
}>;
export const MAP041_PUBLISHED_SEARCH_EXTENTS: readonly GeographicSearchExtentReviewEntry[];
