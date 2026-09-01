export interface PublicPolygonCoordinate {
  readonly x: number;
  readonly y: number;
}

const EPSILON = 1e-9;

function cross(
  a: PublicPolygonCoordinate,
  b: PublicPolygonCoordinate,
  c: PublicPolygonCoordinate,
): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(
  a: PublicPolygonCoordinate,
  b: PublicPolygonCoordinate,
  point: PublicPolygonCoordinate,
): boolean {
  return (
    Math.abs(cross(a, b, point)) <= EPSILON &&
    point.x >= Math.min(a.x, b.x) - EPSILON &&
    point.x <= Math.max(a.x, b.x) + EPSILON &&
    point.y >= Math.min(a.y, b.y) - EPSILON &&
    point.y <= Math.max(a.y, b.y) + EPSILON
  );
}

function segmentsIntersect(
  a: PublicPolygonCoordinate,
  b: PublicPolygonCoordinate,
  c: PublicPolygonCoordinate,
  d: PublicPolygonCoordinate,
): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (
    ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
    ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))
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

export function publicPolygonHasSelfIntersection(
  vertices: readonly PublicPolygonCoordinate[],
): boolean {
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
        return true;
      }
    }
  }
  return false;
}
