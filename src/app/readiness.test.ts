import { describe, expect, it } from 'vitest';

import { countReadyItems, readinessItems } from './readiness';

describe('countReadyItems', () => {
  it('counts only completed technical foundations', () => {
    expect(countReadyItems(readinessItems)).toBe(2);
  });
});
