import { describe, expect, it } from 'vitest';

import { isSpatialEntityType } from './entitySpatiality';

describe('MAP-069 entity spatiality capability', () => {
  it('treats organization as explicitly non-spatial', () => {
    expect(isSpatialEntityType('organization')).toBe(false);
  });

  it.each(['character', 'location', 'mission', 'hazard'] as const)(
    'keeps %s spatial',
    (entityType) => {
      expect(isSpatialEntityType(entityType)).toBe(true);
    },
  );
});
