export type GeographicCoverageKind =
  'settlement' | 'landmark' | 'region' | 'forest' | 'mountain' | 'water' | 'island' | 'route';

export type GeographicZoomClass = 'point' | 'area';

export interface GeographicCoverageManifestAlias {
  readonly id: string;
  readonly value: string;
}

export interface GeographicCoverageManifestEntry {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly kind: GeographicCoverageKind;
  readonly zoomClass: GeographicZoomClass;
  readonly mapCell: string;
  readonly requiredAliases: readonly GeographicCoverageManifestAlias[];
  readonly lockedCoordinates: Readonly<{
    x: number;
    y: number;
  }> | null;
}

export const OFFICIAL_MAP_PIXEL_BOUNDS: Readonly<{ width: 3600; height: 2329 }>;
export const GEOGRAPHIC_ZOOM_POLICY: Readonly<{ point: 0.75; area: 0.5 }>;
export const MAP039_AUDITED_INVENTORY_COUNT: 213;
export const MAP032_STABLE_IDS: readonly string[];
export const GEOGRAPHIC_COVERAGE_MANIFEST: readonly GeographicCoverageManifestEntry[];
export const GEOGRAPHIC_COVERAGE_MANIFEST_COUNT: number;
