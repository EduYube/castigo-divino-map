export interface GeographicCoverageAlias {
  readonly id: string;
  readonly geographicNameId: string;
  readonly language: string;
  readonly value: string;
}

export interface GeographicCoverageEntryBase {
  readonly id: string;
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

export interface GeographicCoverageEntry extends GeographicCoverageEntryBase {
  readonly entityId: string | null;
}

export interface GeographicGlobalCoverageEntry extends GeographicCoverageEntryBase {
  readonly entityId?: never;
}

export type GeographicCoverageContent =
  | {
      readonly schemaVersion?: 1 | 2;
      readonly geographicNames?: readonly GeographicCoverageEntry[];
    }
  | {
      readonly schemaVersion: 3;
      readonly geographicNames?: readonly GeographicGlobalCoverageEntry[];
    };

export const MINIMUM_GEOGRAPHIC_NAME_COUNT: number;
export const REQUIRED_GEOGRAPHIC_NAMES: readonly (readonly [string, string])[];
export const MAP032_STABLE_IDS: readonly string[];

export function assertGeographicCoverageManifest(): void;

export function assertGeographicSearchCoverage(
  content: GeographicCoverageContent,
  sourceLabel?: string,
): void;
