import { describe, expect, it, vi } from 'vitest';

import { createPlaceSelectionController } from './placeSelection';

describe('place selection controller', () => {
  it('keeps one active place and publishes selection and close transitions', () => {
    const controller = createPlaceSelectionController();
    const listener = vi.fn();

    controller.subscribe(listener);
    controller.select('place-demo-harbor');
    controller.select('place-demo-pass');
    controller.clear();

    expect(listener.mock.calls).toEqual([['place-demo-harbor'], ['place-demo-pass'], [null]]);
    expect(controller.getActivePlaceId()).toBeNull();
  });

  it('does not publish redundant transitions', () => {
    const controller = createPlaceSelectionController();
    const listener = vi.fn();

    controller.subscribe(listener);
    controller.clear();
    controller.select('place-demo-harbor');
    controller.select('place-demo-harbor');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports unsubscribing listeners', () => {
    const controller = createPlaceSelectionController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    unsubscribe();
    controller.select('place-demo-harbor');

    expect(listener).not.toHaveBeenCalled();
  });
});
