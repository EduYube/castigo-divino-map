export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

export type SimpleCoordinate = readonly [number, number];
export type SimpleBounds = readonly [SimpleCoordinate, SimpleCoordinate];

export const OFFICIAL_MAP_URL =
  'https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg';

export const FAERUN_MAP_SIZE: PixelSize = Object.freeze({
  width: 3600,
  height: 2329,
});

export const FAERUN_MAP_CONFIG = Object.freeze({
  maxZoom: 1,
  initialMinZoom: -5,
  zoomSnap: 0.25,
  zoomDelta: 0.5,
});

function assertPositiveSize(size: PixelSize, label: string): void {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) {
    throw new TypeError(`${label} must use finite dimensions.`);
  }

  if (size.width <= 0 || size.height <= 0) {
    throw new RangeError(`${label} dimensions must be greater than zero.`);
  }
}

export function createSimpleImageBounds(size: PixelSize = FAERUN_MAP_SIZE): SimpleBounds {
  assertPositiveSize(size, 'Map image');

  return [
    [0, 0],
    [size.height, size.width],
  ];
}

export function calculateFitZoom(
  viewport: PixelSize,
  image: PixelSize = FAERUN_MAP_SIZE,
): number {
  assertPositiveSize(viewport, 'Viewport');
  assertPositiveSize(image, 'Map image');

  const scale = Math.min(viewport.width / image.width, viewport.height / image.height);

  return Math.log2(scale);
}
