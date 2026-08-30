import { describe, expect, it } from 'vitest';

import {
  createSpiderfyPoints,
  groupPinsByScreenDistance,
  PIN_CLUSTER_DISTANCE_PX,
  PIN_INTERACTION_TARGET_PX,
} from './pinProximity';

interface TestPin {
  readonly id: string;
  readonly point: { readonly x: number; readonly y: number };
}

const groupIds = (pins: readonly TestPin[]) =>
  groupPinsByScreenDistance(pins, (pin) => pin.point).map((group) =>
    group.pins.map(({ id }) => id),
  );

describe('pin proximity clustering', () => {
  it('uses the existing 52px marker interaction footprint as its threshold', () => {
    expect(PIN_CLUSTER_DISTANCE_PX).toBe(PIN_INTERACTION_TARGET_PX);
    expect(PIN_CLUSTER_DISTANCE_PX).toBe(52);
  });

  it('groups visually overlapping pins but separates targets once their centers are one footprint apart', () => {
    expect(
      groupIds([
        { id: 'a', point: { x: 100, y: 100 } },
        { id: 'b', point: { x: 151, y: 100 } },
      ]),
    ).toEqual([['a', 'b']]);

    expect(
      groupIds([
        { id: 'a', point: { x: 100, y: 100 } },
        { id: 'b', point: { x: 152, y: 100 } },
      ]),
    ).toEqual([['a'], ['b']]);
  });

  it('treats exact coordinates as the zero-distance case of the same algorithm', () => {
    expect(
      groupIds([
        { id: 'legacy-a', point: { x: 220, y: 310 } },
        { id: 'legacy-b', point: { x: 220, y: 310 } },
        { id: 'other', point: { x: 400, y: 310 } },
      ]),
    ).toEqual([['legacy-a', 'legacy-b'], ['other']]);
  });

  it('supports transitive visual groups without quadratic all-pairs scanning semantics', () => {
    expect(
      groupIds([
        { id: 'a', point: { x: 0, y: 0 } },
        { id: 'b', point: { x: 40, y: 0 } },
        { id: 'c', point: { x: 80, y: 0 } },
      ]),
    ).toEqual([['a', 'b', 'c']]);
  });
});

describe('spiderfy geometry', () => {
  it('separates two members by more than one marker target without mutating the origin', () => {
    const origin = { x: 160, y: 180 };
    const points = createSpiderfyPoints(origin, 2, { width: 320, height: 360 });
    const distance = Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y);

    expect(distance).toBeGreaterThan(PIN_INTERACTION_TARGET_PX);
    expect(origin).toEqual({ x: 160, y: 180 });
  });

  it.each([320, 390, 430])('keeps spiderfied targets inside a %ipx mobile viewport', (width) => {
    const points = createSpiderfyPoints({ x: width - 8, y: 8 }, 4, {
      width,
      height: 420,
    });
    const halfTarget = PIN_INTERACTION_TARGET_PX / 2;

    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(halfTarget);
      expect(point.x).toBeLessThanOrEqual(width - halfTarget);
      expect(point.y).toBeGreaterThanOrEqual(halfTarget);
      expect(point.y).toBeLessThanOrEqual(420 - halfTarget);
    }
  });
});
