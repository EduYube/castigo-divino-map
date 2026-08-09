import { describe, expect, it } from 'vitest';

import { getInitialCollapsibleControlState } from './collapsibleControls';

describe('getInitialCollapsibleControlState', () => {
  it('starts search and filters collapsed on desktop', () => {
    expect(getInitialCollapsibleControlState(false)).toEqual({
      searchExpanded: false,
      filtersExpanded: false,
    });
  });

  it('starts search and filters collapsed on mobile', () => {
    expect(getInitialCollapsibleControlState(true)).toEqual({
      searchExpanded: false,
      filtersExpanded: false,
    });
  });
});
