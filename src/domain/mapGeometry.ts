import type { MapEntityType } from './adminMapEntities';
import { isMapCoordinateWithinBounds, type MapCoordinate } from './mapCoordinates';

export interface MapPointGeometry {
  readonly kind: 'point';
  readonly coordinates: MapCoordinate;
}

export interface MapPolygonGeometry {
  readonly kind: 'polygon';
  readonly vertices: readonly MapCoordinate[];
}

export type MapEntityGeometry = MapPointGeometry | MapPolygonGeometry;
export const MAP_POLYGON_MAX_VERTICES = 64;
const GEOMETRY_EPSILON = 1e-9;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coordinateFromUnknown(value: unknown): MapCoordinate {
  if (!isRecord(value) || typeof value.x !== 'number' || typeof value.y !== 'number') {
    throw new Error('Map geometry coordinates must contain numeric x/y values.');
  }
  const coordinate = { x: value.x, y: value.y };
  if (!isMapCoordinateWithinBounds(coordinate)) {
    throw new Error('Map geometry coordinates must stay within the published map bounds.');
  }
  return coordinate;
}

function orientation(a: MapCoordinate, b: MapCoordinate, c: MapCoordinate): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(a: MapCoordinate, b: MapCoordinate, p: MapCoordinate): boolean {
  return (
    Math.abs(orientation(a, b, p)) <= GEOMETRY_EPSILON &&
    p.x >= Math.min(a.x, b.x) - GEOMETRY_EPSILON &&
    p.x <= Math.max(a.x, b.x) + GEOMETRY_EPSILON &&
    p.y >= Math.min(a.y, b.y) - GEOMETRY_EPSILON &&
    p.y <= Math.max(a.y, b.y) + GEOMETRY_EPSILON
  );
}

function segmentsIntersect(
  a: MapCoordinate,
  b: MapCoordinate,
  c: MapCoordinate,
  d: MapCoordinate,
): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
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
  return vertices.reduce((sum, vertex, index) => {
    const next = vertices[(index + 1) % vertices.length]!;
    return sum + vertex.x * next.y - next.x * vertex.y;
  }, 0);
}

function assertSimplePolygon(vertices: readonly MapCoordinate[]): void {
  const areaTwice = signedAreaTwice(vertices);
  if (Math.abs(areaTwice) <= GEOMETRY_EPSILON) {
    throw new Error('Map polygon geometry must have non-zero area.');
  }
  for (let index = 0; index < vertices.length; index += 1) {
    const a = vertices[index]!;
    const b = vertices[(index + 1) % vertices.length]!;
    for (let other = index + 1; other < vertices.length; other += 1) {
      if (other === index + 1 || (index === 0 && other === vertices.length - 1)) continue;
      const c = vertices[other]!;
      const d = vertices[(other + 1) % vertices.length]!;
      if (segmentsIntersect(a, b, c, d)) {
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
    if (current.x < first.x || (current.x === first.x && current.y < first.y)) firstIndex = index;
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
    return { kind: 'point', coordinates: coordinateFromUnknown(value.coordinates) };
  }
  if (value.kind !== 'polygon') throw new Error('Map geometry kind must be point or polygon.');
  if (entityType === 'character') throw new Error('Characters must use point geometry.');
  if (entityType !== 'location') throw new Error('Missions and hazards must use point geometry.');
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

export function mapEntityUsesPointGeometry(value: {
  readonly geometry?: MapEntityGeometry;
  readonly coordinates?: MapCoordinate;
}): boolean {
  // Historical snapshots before MAP-060 have no explicit geometry and are points.
  return value.geometry?.kind !== 'polygon';
}
