export interface GeographicCoverageAlias {
  readonly value: string;
}

export interface GeographicCoverageEntry {
  readonly slug: string;
  readonly name: string;
  readonly language: string;
  readonly aliases?: readonly GeographicCoverageAlias[];
  readonly coordinates?: {
    readonly x: number;
    readonly y: number;
  };
  readonly recommendedZoom: number | null;
}

export interface GeographicCoverageContent {
  readonly geographicNames?: readonly GeographicCoverageEntry[];
}

export const MINIMUM_GEOGRAPHIC_NAME_COUNT: number;
export const REQUIRED_GEOGRAPHIC_NAMES: readonly (readonly [string, string])[];

export function assertGeographicSearchCoverage(
  content: GeographicCoverageContent,
  sourceLabel?: string,
): void;
