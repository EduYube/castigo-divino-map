export const EXPAND_MAP_LABEL = 'Expandir mapa';
export const RESTORE_MAP_LABEL = 'Restaurar tamaño del mapa';

export interface ExpandToggleBinding {
  setExpanded(expanded: boolean): void;
  destroy(): void;
}

export function bindExpandedMapToggle(
  button: HTMLButtonElement,
  onToggle: (expanded: boolean) => void,
): ExpandToggleBinding {
  let expanded = false;

  const render = (): void => {
    const label = expanded ? RESTORE_MAP_LABEL : EXPAND_MAP_LABEL;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', expanded ? 'true' : 'false');
    button.title = label;

    const icon = button.querySelector<HTMLElement>('[data-map-expand-icon]');
    if (icon) icon.textContent = expanded ? '↙' : '⛶';
  };

  const handleClick = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    onToggle(!expanded);
  };

  button.addEventListener('click', handleClick);
  render();

  return {
    setExpanded(nextExpanded): void {
      if (expanded === nextExpanded) return;
      expanded = nextExpanded;
      render();
    },
    destroy(): void {
      button.removeEventListener('click', handleClick);
    },
  };
}
