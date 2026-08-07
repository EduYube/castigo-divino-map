export interface MapCoordinate {
  readonly x: number;
  readonly y: number;
}

export const FAERUN_COORDINATE_BOUNDS = Object.freeze({
  minX: 0,
  maxX: 3600,
  minY: 0,
  maxY: 2329,
});

export function isFiniteMapCoordinate(coordinate: MapCoordinate): boolean {
  return Number.isFinite(coordinate.x) && Number.isFinite(coordinate.y);
}

export function isMapCoordinateWithinBounds(coordinate: MapCoordinate): boolean {
  return (
    isFiniteMapCoordinate(coordinate) &&
    coordinate.x >= FAERUN_COORDINATE_BOUNDS.minX &&
    coordinate.x <= FAERUN_COORDINATE_BOUNDS.maxX &&
    coordinate.y >= FAERUN_COORDINATE_BOUNDS.minY &&
    coordinate.y <= FAERUN_COORDINATE_BOUNDS.maxY
  );
}
