export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScreenViewport {
  readonly width: number;
  readonly height: number;
}

export interface ProximityPinGroup<T> {
  readonly pins: readonly [T, ...T[]];
  readonly center: ScreenPoint;
}

/**
 * Leaflet marker icons use a 52×52 interaction box (MAP-031/MAP-045/MAP-058).
 * Using that same footprint as the screen-space grouping threshold means two
 * marker targets cluster while their interaction boxes would materially overlap,
 * and separate as soon as zoom makes the targets independently operable.
 */
export const PIN_INTERACTION_TARGET_PX = 52;
export const PIN_CLUSTER_DISTANCE_PX = PIN_INTERACTION_TARGET_PX;
export const SPIDERFY_EDGE_GUTTER_PX = 12;

function distanceSquared(left: ScreenPoint, right: ScreenPoint): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

function averagePoint(points: readonly ScreenPoint[]): ScreenPoint {
  const total = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  );
  return { x: total.x / points.length, y: total.y / points.length };
}

/**
 * Deterministic near-linear clustering using a small spatial hash. Exact-coordinate
 * pins are simply the zero-distance case of the same algorithm; there is no second
 * exact-coordinate rendering path.
 */
export function groupPinsByScreenDistance<T>(
  pins: readonly T[],
  project: (pin: T) => ScreenPoint,
  thresholdPx = PIN_CLUSTER_DISTANCE_PX,
): readonly ProximityPinGroup<T>[] {
  if (pins.length === 0) return [];
  if (!(thresholdPx > 0) || !Number.isFinite(thresholdPx)) {
    throw new Error('Pin clustering threshold must be a finite positive number.');
  }

  const points = pins.map(project);
  const parents = pins.map((_, index) => index);
  const ranks = pins.map(() => 0);
  const cellSize = thresholdPx;
  const buckets = new Map<string, number[]>();
  const thresholdSquared = thresholdPx * thresholdPx;

  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root]!;
    while (parents[index] !== index) {
      const next = parents[index]!;
      parents[index] = root;
      index = next;
    }
    return root;
  };

  const union = (left: number, right: number): void => {
    let leftRoot = find(left);
    let rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    if (ranks[leftRoot]! < ranks[rightRoot]!) [leftRoot, rightRoot] = [rightRoot, leftRoot];
    parents[rightRoot] = leftRoot;
    if (ranks[leftRoot] === ranks[rightRoot]) ranks[leftRoot] = ranks[leftRoot]! + 1;
  };

  points.forEach((point, index) => {
    const cellX = Math.floor(point.x / cellSize);
    const cellY = Math.floor(point.y / cellSize);

    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const candidates = buckets.get(`${cellX + offsetX}:${cellY + offsetY}`) ?? [];
        for (const candidate of candidates) {
          // At exactly one target width, the interaction boxes can meet without
          // obscuring one another, so only strictly closer centers are grouped.
          if (distanceSquared(point, points[candidate]!) < thresholdSquared) {
            union(index, candidate);
          }
        }
      }
    }

    const key = `${cellX}:${cellY}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(index);
    buckets.set(key, bucket);
  });

  const groupedIndices = new Map<number, number[]>();
  pins.forEach((_, index) => {
    const root = find(index);
    const group = groupedIndices.get(root) ?? [];
    group.push(index);
    groupedIndices.set(root, group);
  });

  return Array.from(groupedIndices.values())
    .sort((left, right) => left[0]! - right[0]!)
    .map((indices) => {
      const groupedPins = indices.map((index) => pins[index]!) as [T, ...T[]];
      return {
        pins: groupedPins,
        center: averagePoint(indices.map((index) => points[index]!)),
      };
    });
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

/**
 * Produces non-persistent screen positions for spiderfied members. Rings derive
 * their spacing from the same 52px target used for clustering and the layout is
 * shifted/reduced near viewport edges so members remain operable on narrow maps.
 */
export function createSpiderfyPoints(
  origin: ScreenPoint,
  count: number,
  viewport: ScreenViewport,
  targetPx = PIN_INTERACTION_TARGET_PX,
): readonly ScreenPoint[] {
  if (count <= 0) return [];
  if (count === 1) return [origin];

  const halfTarget = targetPx / 2;
  const edgeInset = halfTarget + SPIDERFY_EDGE_GUTTER_PX;
  const minRadius = targetPx * 0.88;
  const ringGap = targetPx * 0.92;
  const rings: Array<{ readonly count: number; readonly radius: number }> = [];
  let remaining = count;
  let radius = minRadius;

  while (remaining > 0) {
    const capacity = Math.max(6, Math.floor((2 * Math.PI * radius) / (targetPx * 1.08)));
    const ringCount = Math.min(remaining, capacity);
    rings.push({ count: ringCount, radius });
    remaining -= ringCount;
    radius += ringGap;
  }

  const desiredRadius = rings.at(-1)?.radius ?? minRadius;
  const availableRadiusX = Math.max(0, (viewport.width - edgeInset * 2) / 2);
  const availableRadiusY = Math.max(0, (viewport.height - edgeInset * 2) / 2);
  const fittedRadius = Math.min(desiredRadius, availableRadiusX, availableRadiusY);
  const scale = desiredRadius > 0 ? Math.min(1, fittedRadius / desiredRadius) : 1;
  const maxRadius = desiredRadius * scale;
  const center = {
    x: clamp(origin.x, edgeInset + maxRadius, viewport.width - edgeInset - maxRadius),
    y: clamp(origin.y, edgeInset + maxRadius, viewport.height - edgeInset - maxRadius),
  };

  const points: ScreenPoint[] = [];
  for (const [ringIndex, ring] of rings.entries()) {
    const fittedRingRadius = ring.radius * scale;
    const phase = -Math.PI / 2 + (ringIndex % 2 === 0 ? 0 : Math.PI / ring.count);
    for (let index = 0; index < ring.count; index += 1) {
      const angle = phase + (2 * Math.PI * index) / ring.count;
      points.push({
        x: clamp(
          center.x + Math.cos(angle) * fittedRingRadius,
          edgeInset,
          viewport.width - edgeInset,
        ),
        y: clamp(
          center.y + Math.sin(angle) * fittedRingRadius,
          edgeInset,
          viewport.height - edgeInset,
        ),
      });
    }
  }

  return points;
}
