import {
  FAERUN_COORDINATE_BOUNDS,
  isMapCoordinateWithinBounds,
  type MapCoordinate,
} from './mapCoordinates';
import type { MapEntityType } from './adminMapEntities';

export const MAP_POLYGON_MAX_VERTICES = 64;
const GEOMETRY_EPSILON = 1e-9;

export interface MapPointGeometry {
  readonly kind: 'point';
  readonly coordinates: MapCoordinate;
}

export interface MapPolygonGeometry {
  readonly kind: 'polygon';
  readonly vertices: readonly MapCoordinate[];
}

export type MapEntityGeometry = MapPointGeometry | MapPolygonGeometry;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coordinateFromUnknown(value: unknown): MapCoordinate {
  if (!isRecord(value) || typeof value.x !== 'number' || typeof value.y !== 'number') {
    throw new Error('Map geometry coordinates must be numeric objects.');
  }
  const coordinate = { x: value.x, y: value.y };
  if (!isMapCoordinateWithinBounds(coordinate)) {
    throw new Error(
      `Map geometry coordinates must remain within X ${FAERUN_COORDINATE_BOUNDS.minX}–${FAERUN_COORDINATE_BOUNDS.maxX} and Y ${FAERUN_COORDINATE_BOUNDS.minY}–${FAERUN_COORDINATE_BOUNDS.maxY}.`,
    );
  }
  return coordinate;
}

function cross(a: MapCoordinate, b: MapCoordinate, c: MapCoordinate): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(a: MapCoordinate, b: MapCoordinate, point: MapCoordinate): boolean {
  return (
    Math.abs(cross(a, b, point)) <= GEOMETRY_EPSILON &&
    point.x >= Math.min(a.x, b.x) - GEOMETRY_EPSILON &&
    point.x <= Math.max(a.x, b.x) + GEOMETRY_EPSILON &&
    point.y >= Math.min(a.y, b.y) - GEOMETRY_EPSILON &&
    point.y <= Math.max(a.y, b.y) + GEOMETRY_EPSILON
  );
}

function segmentsIntersect(
  a: MapCoordinate,
  b: MapCoordinate,
  c: MapCoordinate,
  d: MapCoordinate,
): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (
    ((abC > GEOMETRY_EPSILON && abD < -GEOMETRY_EPSILON) ||
      (abC < -GEOMETRY_EPSILON && abD > GEOMETRY_EPSILON)) &&
    ((cdA > GEOMETRY_EPSILON && cdB < -GEOMETRY_EPSILON) ||
      (cdA < -GEOMETRY_EPSILON && cdB > GEOMETRY_EPSILON))
  ) {
    return true;
  }
  return (
    pointOnSegment(a, b, c) ||
    pointOnSegment(a, b, d) ||
    pointOnSegment(c, d, a) ||
    pointOnSegment(c, d, b)
  );
}

function signedAreaTwice(vertices: readonly MapCoordinate[]): number {
  return vertices.reduce((area, vertex, index) => {
    const next = vertices[(index + 1) % vertices.length]!;
    return area + vertex.x * next.y - next.x * vertex.y;
  }, 0);
}

function assertSimplePolygon(vertices: readonly MapCoordinate[]): void {
  for (let first = 0; first < vertices.length; first += 1) {
    const firstVertex = vertices[first]!;
    for (let second = first + 1; second < vertices.length; second += 1) {
      const secondVertex = vertices[second]!;
      if (firstVertex.x === secondVertex.x && firstVertex.y === secondVertex.y) {
        throw new Error('Map polygon geometry cannot repeat vertices.');
      }
    }
  }

  if (Math.abs(signedAreaTwice(vertices)) <= GEOMETRY_EPSILON) {
    throw new Error('Map polygon geometry must have non-zero area.');
  }

  for (let first = 0; first < vertices.length; first += 1) {
    const firstNext = (first + 1) % vertices.length;
    for (let second = first + 1; second < vertices.length; second += 1) {
      const secondNext = (second + 1) % vertices.length;
      if (second === firstNext || (first === 0 && secondNext === 0)) continue;
      if (
        segmentsIntersect(
          vertices[first]!,
          vertices[firstNext]!,
          vertices[second]!,
          vertices[secondNext]!,
        )
      ) {
        throw new Error('Map polygon geometry cannot self-intersect.');
      }
    }
  }
}

function canonicalizePolygon(vertices: readonly MapCoordinate[]): readonly MapCoordinate[] {
  assertSimplePolygon(vertices);
  const oriented = signedAreaTwice(vertices) < 0 ? [...vertices].reverse() : [...vertices];
  let firstIndex = 0;
  for (let index = 1; index < oriented.length; index += 1) {
    const current = oriented[index]!;
    const first = oriented[firstIndex]!;
    if (current.x < first.x || (current.x === first.x && current.y < first.y)) {
      firstIndex = index;
    }
  }
  return oriented.map((_, offset) => oriented[(firstIndex + offset) % oriented.length]!);
}

export function createPointMapGeometry(coordinate: MapCoordinate): MapPointGeometry {
  const normalized = coordinateFromUnknown(coordinate);
  return { kind: 'point', coordinates: normalized };
}

export function normalizeMapEntityGeometry(
  entityType: MapEntityType,
  value: unknown,
): MapEntityGeometry {
  if (!isRecord(value)) throw new Error('Map geometry must be an object.');
  if (value.kind === 'point') {
    return createPointMapGeometry(value.coordinates);
  }
  if (value.kind !== 'polygon') throw new Error('Map geometry kind must be point or polygon.');
  if (entityType !== 'location') throw new Error('Characters must use point geometry.');
  if (!Array.isArray(value.vertices)) throw new Error('Map polygon geometry requires vertices.');
  if (value.vertices.length < 3) {
    throw new Error('Map polygon geometry requires at least three vertices.');
  }
  if (value.vertices.length > MAP_POLYGON_MAX_VERTICES) {
    throw new Error(`Map polygon geometry cannot exceed ${MAP_POLYGON_MAX_VERTICES} vertices.`);
  }
  const vertices = value.vertices.map(coordinateFromUnknown);
  return { kind: 'polygon', vertices: canonicalizePolygon(vertices) };
}

export function mapGeometryRepresentativePoint(geometry: MapEntityGeometry): MapCoordinate {
  if (geometry.kind === 'point') return geometry.coordinates;
  const xs = geometry.vertices.map(({ x }) => x);
  const ys = geometry.vertices.map(({ y }) => y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

export function mapEntityUsesPointGeometry(
  value: { readonly geometry?: MapEntityGeometry; readonly coordinates?: MapCoordinate },
): boolean {
  // Historical snapshots before MAP-060 have no explicit geometry and are points.
  return value.geometry?.kind !== 'polygon';
}
