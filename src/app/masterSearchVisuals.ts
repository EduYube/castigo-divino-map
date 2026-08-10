import type { EntityId } from '../data/beta02-model';

export interface MasterSearchVisualController {
  refresh(masterEntityIds: ReadonlySet<EntityId>): void;
  destroy(): void;
}

export function mountMasterSearchVisuals(root: ParentNode): MasterSearchVisualController {
  let masterEntityIds: ReadonlySet<EntityId> = new Set();
  let frame: number | null = null;
  let destroyed = false;

  const decorate = (): void => {
    frame = null;
    if (destroyed) return;

    root.querySelectorAll<HTMLElement>('[data-search-result-id]').forEach((result) => {
      const id = result.dataset.searchResultId as EntityId | undefined;
      const master = Boolean(id && masterEntityIds.has(id));
      result.dataset.audience = master ? 'master' : 'public';
      result.querySelector<HTMLElement>('[data-master-search-badge]')?.remove();
      if (!master) return;
      const badge = document.createElement('span');
      badge.className = 'place-search__result-audience';
      badge.dataset.masterSearchBadge = '';
      badge.textContent = 'Máster';
      result.append(badge);
      const label = result.getAttribute('aria-label') ?? result.textContent ?? '';
      if (!label.includes('Contenido del Máster')) {
        result.setAttribute('aria-label', `${label.trim()}. Contenido del Máster.`);
      }
    });

    root.querySelectorAll<HTMLElement>('[data-search-suggestion-id]').forEach((suggestion) => {
      const id = suggestion.dataset.searchSuggestionId as EntityId | undefined;
      const master = Boolean(id && masterEntityIds.has(id));
      suggestion.dataset.audience = master ? 'master' : 'public';
      suggestion.querySelector<HTMLElement>('[data-master-search-badge]')?.remove();
      if (!master) return;
      const badge = document.createElement('span');
      badge.className = 'place-search__result-audience';
      badge.dataset.masterSearchBadge = '';
      badge.textContent = 'Máster';
      suggestion.append(badge);
      const label = suggestion.getAttribute('aria-label') ?? suggestion.textContent ?? '';
      suggestion.setAttribute('aria-label', `${label.trim()}. Contenido del Máster.`);
    });
  };

  const schedule = (): void => {
    if (destroyed || frame !== null) return;
    frame = window.requestAnimationFrame(decorate);
  };

  const observer = new MutationObserver(schedule);
  const target = root.querySelector<HTMLElement>('[data-place-search]');
  if (target) observer.observe(target, { childList: true, subtree: true });

  return {
    refresh(nextMasterEntityIds): void {
      masterEntityIds = nextMasterEntityIds;
      schedule();
    },
    destroy(): void {
      destroyed = true;
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      root.querySelectorAll<HTMLElement>('[data-master-search-badge]').forEach((badge) => badge.remove());
    },
  };
}
