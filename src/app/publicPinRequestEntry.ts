import type { Map as LeafletMap } from 'leaflet';

import '../styles/public-pin-request.css';
import '../styles/public-pin-request-campaign.css';
import {
  mountPublicPinRequest as mountPublicPinRequestController,
  type PublicPinRequestController,
} from './publicPinRequest';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function getRequiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required public request host: ${selector}`);
  }

  return element;
}

function navigateToMountedPanel(root: ParentNode): void {
  const heading = getRequiredElement<HTMLElement>(root, '[data-public-pin-request-heading]');
  const prefersReducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;

  window.requestAnimationFrame(() => {
    heading.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
      inline: 'nearest',
    });
    heading.focus({ preventScroll: true });
  });
}

function preservePublicRequestAccessibilityContract(root: ParentNode): void {
  const form = getRequiredElement<HTMLFormElement>(
    root,
    '[data-public-pin-request-form]',
  );
  const campaignTarget = getRequiredElement<HTMLElement>(
    root,
    '[data-public-pin-request-campaign-target]',
  );
  const campaignTargetName = getRequiredElement<HTMLElement>(
    root,
    '[data-public-pin-request-campaign-target-name]',
  );
  const campaignTargetLabel = campaignTarget.querySelector<HTMLElement>('strong');

  form.setAttribute(
    'aria-describedby',
    'public-pin-request-privacy public-pin-request-status',
  );
  form.setAttribute('aria-details', 'public-pin-request-campaign-target');
  campaignTargetLabel?.after(campaignTargetName);
}

export function mountPublicPinRequest(
  root: ParentNode,
  map: LeafletMap,
): PublicPinRequestController {
  const mapHeading = getRequiredElement<HTMLElement>(root, '.map-experience__heading');
  const openButton = document.createElement('button');
  let controller: PublicPinRequestController | null = null;
  let mountedOpenButton: HTMLButtonElement | null = null;

  openButton.type = 'button';
  openButton.className = 'public-pin-request__open';
  openButton.dataset.publicPinRequestOpen = '';
  openButton.setAttribute('aria-expanded', 'false');
  openButton.setAttribute('aria-controls', 'public-pin-request-panel');
  openButton.textContent = 'Proponer un pin';
  mapHeading.append(openButton);

  const handleMountedOpen = (): void => navigateToMountedPanel(root);

  const handleFirstOpen = (): void => {
    openButton.removeEventListener('click', handleFirstOpen);
    openButton.remove();
    controller = mountPublicPinRequestController(root, map);
    preservePublicRequestAccessibilityContract(root);

    mountedOpenButton = getRequiredElement<HTMLButtonElement>(
      root,
      '[data-public-pin-request-open]',
    );
    mountedOpenButton.addEventListener('click', handleMountedOpen);
    mountedOpenButton.click();
  };

  openButton.addEventListener('click', handleFirstOpen);

  return {
    destroy(): void {
      openButton.removeEventListener('click', handleFirstOpen);
      openButton.remove();
      mountedOpenButton?.removeEventListener('click', handleMountedOpen);
      controller?.destroy();
    },
  };
}
