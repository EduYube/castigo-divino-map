import type { Map as LeafletMap } from 'leaflet';

import '../styles/public-pin-request.css';
import {
  mountPublicPinRequest as mountPublicPinRequestController,
  type PublicPinRequestController,
} from './publicPinRequest';

function getRequiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required public request host: ${selector}`);
  }

  return element;
}

export function mountPublicPinRequest(
  root: ParentNode,
  map: LeafletMap,
): PublicPinRequestController {
  const mapHeading = getRequiredElement<HTMLElement>(root, '.map-experience__heading');
  const openButton = document.createElement('button');
  let controller: PublicPinRequestController | null = null;

  openButton.type = 'button';
  openButton.className = 'public-pin-request__open';
  openButton.dataset.publicPinRequestOpen = '';
  openButton.setAttribute('aria-expanded', 'false');
  openButton.textContent = 'Proponer un pin';
  mapHeading.append(openButton);

  const handleFirstOpen = (): void => {
    openButton.removeEventListener('click', handleFirstOpen);
    openButton.remove();
    controller = mountPublicPinRequestController(root, map);

    const form = getRequiredElement<HTMLFormElement>(root, '[data-public-pin-request-form]');
    const privacy = getRequiredElement<HTMLElement>(root, '#public-pin-request-privacy');
    const mountedOpenButton = getRequiredElement<HTMLButtonElement>(
      root,
      '[data-public-pin-request-open]',
    );

    form.prepend(privacy);
    mountedOpenButton.click();
  };

  openButton.addEventListener('click', handleFirstOpen);

  return {
    destroy(): void {
      openButton.removeEventListener('click', handleFirstOpen);
      openButton.remove();
      controller?.destroy();
    },
  };
}
