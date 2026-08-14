import { describe, expect, it, vi } from 'vitest';

import { bindExpandedMapToggle, EXPAND_MAP_LABEL, RESTORE_MAP_LABEL } from './expandToggle';

class FakeButton extends EventTarget {
  title = '';
  private readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelector<T extends HTMLElement>(): T | null {
    return null;
  }
}

describe('bindExpandedMapToggle', () => {
  it('updates accessible state and removes its listener on destroy', () => {
    const button = new FakeButton();
    const onToggle = vi.fn();
    const binding = bindExpandedMapToggle(button as unknown as HTMLButtonElement, onToggle);

    expect(button.getAttribute('aria-label')).toBe(EXPAND_MAP_LABEL);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.title).toBe(EXPAND_MAP_LABEL);

    button.dispatchEvent(new Event('click', { cancelable: true }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenLastCalledWith(true);

    binding.setExpanded(true);
    expect(button.getAttribute('aria-label')).toBe(RESTORE_MAP_LABEL);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.title).toBe(RESTORE_MAP_LABEL);

    binding.destroy();
    button.dispatchEvent(new Event('click', { cancelable: true }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
