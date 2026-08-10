import type { GeographicCoverageManifestEntry } from './geographicCoverageManifest.js';

export function spanishGeographicAliasId(geographicNameId: string): string;
export function assertGeographicSpanishReviewIdentitySet(
  map039Entries?: readonly Pick<GeographicCoverageManifestEntry, 'id'>[],
): void;
export function assertGeographicSpanishReviewManifest(): void;
export function assertGeographicSpanishSearchCoverage(
  content: unknown,
  label?: string,
): void;
