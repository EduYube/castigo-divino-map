import type { PinPlayerAssociationInput } from '../domain/pinVisualSystem';
import {
  getPinPlayerAssociation,
  PIN_PLAYER_ASSOCIATIONS_CHANGED_EVENT,
} from './pinPlayerAssociationRegistry';
import '../styles/pin-player-associations.css';

const RING_CLASS = 'pin-player-association-ring';
const COUNT_CLASS = 'pin-player-association-count';

export function createPlayerAssociationAccent(
  associations: readonly PinPlayerAssociationInput[],
): string {
  if (associations.length === 0) return 'transparent';
  if (associations.length === 1) return associations[0]?.accentColor ?? 'transparent';

  const segment = 100 / associations.length;
  const stops = associations.map(({ accentColor }, index) => {
    const start = Number((index * segment).toFixed(4));
    const end = Number(((index + 1) * segment).toFixed(4));
    return `${accentColor} ${start}% ${end}%`;
  });
  return `conic-gradient(from -90deg, ${stops.join(', ')})`;
}

function removeAssociationDescription(element: HTMLElement): void {
  const previous = element.dataset.playerAssociationDescription;
  if (!previous) return;

  const current = element.getAttribute('aria-description') ?? '';
  if (current.endsWith(previous)) {
    const base = current.slice(0, -previous.length).trim();
    if (base) element.setAttribute('aria-description', base);
    else element.removeAttribute('aria-description');
  }
  delete element.dataset.playerAssociationDescription;
}

function synchronizeAssociationDescription(
  element: HTMLElement,
  associations: readonly PinPlayerAssociationInput[],
): void {
  removeAssociationDescription(element);
  if (associations.length === 0) return;

  const description = `Relacionado con: ${associations.map(({ playerName }) => playerName).join(', ')}.`;
  const current = element.getAttribute('aria-description')?.trim() ?? '';
  const next = current ? `${current} ${description}` : description;
  if (element.getAttribute('aria-description') !== next) {
    element.setAttribute('aria-description', next);
  }
  element.dataset.playerAssociationDescription = description;
}

function decorateMarker(element: HTMLElement): void {
  const pinId = element.dataset.pinId;
  if (!pinId) return;

  const entry = getPinPlayerAssociation(pinId);
  const associations = entry?.associations ?? [];
  let ring = element.querySelector<HTMLElement>(`:scope > .${RING_CLASS}`);
  let count = element.querySelector<HTMLElement>(`:scope > .${COUNT_CLASS}`);

  synchronizeAssociationDescription(element, associations);

  if (!entry || associations.length === 0) {
    ring?.remove();
    count?.remove();
    delete element.dataset.associationCount;
    delete element.dataset.associatedPlayerIds;
    return;
  }

  if (!ring) {
    ring = document.createElement('span');
    ring.className = RING_CLASS;
    ring.setAttribute('aria-hidden', 'true');
    element.prepend(ring);
  }
  ring.classList.toggle(`${RING_CLASS}--location`, entry.entityType === 'location');
  ring.style.setProperty('--pin-player-association-accent', createPlayerAssociationAccent(associations));
  ring.dataset.associationCount = String(associations.length);

  if (!count) {
    count = document.createElement('span');
    count.className = COUNT_CLASS;
    count.setAttribute('aria-hidden', 'true');
    element.append(count);
  }
  count.textContent = String(associations.length);

  element.dataset.associationCount = String(associations.length);
  element.dataset.associatedPlayerIds = associations.map(({ playerId }) => playerId).join(',');
}

let scheduled = false;

function decorateAllMarkers(): void {
  scheduled = false;
  document
    .querySelectorAll<HTMLElement>('.campaign-marker-icon[data-pin-id]')
    .forEach(decorateMarker);
}

function scheduleDecoration(): void {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(decorateAllMarkers);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener(PIN_PLAYER_ASSOCIATIONS_CHANGED_EVENT, scheduleDecoration);

  const start = (): void => {
    const target = document.body;
    if (!target) return;
    const observer = new MutationObserver(scheduleDecoration);
    observer.observe(target, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-description', 'data-pin-id'],
    });
    scheduleDecoration();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
