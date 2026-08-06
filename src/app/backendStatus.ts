import type { PublicCatalogLoadResult } from '../data-access/publicCatalog';

export interface BackendStatusController {
  setChecking(): void;
  update(result: PublicCatalogLoadResult): void;
  setRetryHandler(handler: () => void): void;
  destroy(): void;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  element.className = className;
  return element;
}

function formatSnapshotDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function describeResult(result: PublicCatalogLoadResult): string {
  if (result.availability === 'unavailable') {
    return 'No se pudo cargar el contenido público. Reintenta la conexión.';
  }

  if (result.backend.state === 'connected') {
    return 'Servicio de datos conectado.';
  }

  const snapshotDate = formatSnapshotDate(result.metadata?.generatedAt);
  const suffix = snapshotDate ? ` Se muestra contenido guardado del ${snapshotDate}.` : '';

  if (result.backend.state === 'offline') {
    return `Sin conexión.${suffix}`;
  }

  return `Modo de respaldo. El servicio de datos no está disponible.${suffix}`;
}

export function mountBackendStatus(root: ParentNode = document): BackendStatusController {
  const badgeContainer = root.querySelector<HTMLElement>('.site-header__badges');

  if (!badgeContainer) {
    throw new Error('Missing application status badge container.');
  }

  const container = createElement('div', 'backend-status');
  const symbol = createElement('span', 'backend-status__symbol');
  const text = createElement('span', 'backend-status__text');
  const retryButton = createElement('button', 'backend-status__retry');
  let retryHandler: () => void = () => undefined;

  container.dataset.backendStatus = 'checking';
  container.dataset.backendState = 'checking';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'true');
  container.setAttribute('aria-busy', 'true');
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = '◌';
  text.textContent = 'Comprobando el servicio de datos…';
  retryButton.type = 'button';
  retryButton.textContent = 'Reintentar';
  retryButton.hidden = true;
  const handleRetry = (): void => retryHandler();
  retryButton.addEventListener('click', handleRetry);
  container.append(symbol, text, retryButton);
  badgeContainer.append(container);

  return {
    setChecking(): void {
      container.dataset.backendState = 'checking';
      container.setAttribute('role', 'status');
      container.setAttribute('aria-busy', 'true');
      symbol.textContent = '◌';
      text.textContent = 'Comprobando el servicio de datos…';
      retryButton.hidden = true;
    },
    update(result: PublicCatalogLoadResult): void {
      const isUnavailable = result.availability === 'unavailable';
      container.dataset.backendState = result.backend.state;
      container.dataset.dataSource = result.source ?? 'none';
      container.dataset.remoteSource = result.remoteSource ?? 'none';
      container.setAttribute('role', isUnavailable ? 'alert' : 'status');
      container.setAttribute('aria-busy', 'false');
      symbol.textContent =
        result.backend.state === 'connected' ? '✓' : result.backend.state === 'offline' ? '×' : '!';
      text.textContent = describeResult(result);
      retryButton.hidden = result.backend.state === 'connected' && !isUnavailable;
    },
    setRetryHandler(handler: () => void): void {
      retryHandler = handler;
    },
    destroy(): void {
      retryButton.removeEventListener('click', handleRetry);
      container.remove();
    },
  };
}
