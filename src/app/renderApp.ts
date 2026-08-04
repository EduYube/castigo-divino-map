import { leafletReadiness } from '../map/leaflet';
import { countReadyItems, readinessItems, type ReadinessStatus } from './readiness';

const statusLabels: Record<ReadinessStatus, string> = {
  ready: 'Preparado',
  planned: 'Siguiente fase',
};

function renderReadinessItems(): string {
  return readinessItems
    .map(
      ({ title, description, status }) => `
        <li class="readiness-card readiness-card--${status}">
          <div class="readiness-card__header">
            <h3>${title}</h3>
            <span class="status-badge" aria-label="Estado: ${statusLabels[status]}">
              ${statusLabels[status]}
            </span>
          </div>
          <p>${description}</p>
        </li>
      `,
    )
    .join('');
}

export function renderApp(): string {
  const readyCount = countReadyItems(readinessItems);

  return `
    <header class="site-header">
      <a class="brand" href="#main-content" aria-label="Ir al inicio del Atlas">
        <span class="brand__mark" aria-hidden="true">✦</span>
        <span>Castigo Divino</span>
      </a>
      <span class="release-badge">Beta 0.1</span>
    </header>

    <main id="main-content">
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero__content">
          <p class="eyebrow">Fundación técnica · MAP-003</p>
          <h1 id="hero-title">El Atlas de los Nuevos Dioses</h1>
          <p class="hero__lead">
            Una base rápida, accesible y reproducible para explorar el conocimiento descubierto
            de la campaña sobre Faerûn.
          </p>
          <div class="hero__meta" aria-label="Estado técnico">
            <span>${readyCount} bases listas</span>
            <span aria-hidden="true">·</span>
            <span>${leafletReadiness.library} ${leafletReadiness.version} instalado</span>
          </div>
        </div>

        <div class="map-placeholder" aria-labelledby="map-placeholder-title">
          <div class="map-placeholder__compass" aria-hidden="true">
            <span>N</span>
          </div>
          <div class="map-placeholder__copy">
            <p class="eyebrow">Próxima expedición</p>
            <h2 id="map-placeholder-title">Cartografía reservada</h2>
            <p>
              La navegación del mapa se integrará en ${leafletReadiness.integrationIssue}. Esta
              entrega no descarga, almacena ni representa el mapa oficial.
            </p>
          </div>
        </div>
      </section>

      <section class="readiness" aria-labelledby="readiness-title">
        <div class="section-heading">
          <p class="eyebrow">Preparación de la expedición</p>
          <h2 id="readiness-title">Una base lista para crecer</h2>
        </div>
        <ul class="readiness-grid">
          ${renderReadinessItems()}
        </ul>
      </section>
    </main>

    <footer class="site-footer">
      <p>
        Proyecto de fans no oficial. No está aprobado ni respaldado por Wizards of the Coast.
      </p>
      <p>El mapa oficial no forma parte de este repositorio ni de esta entrega.</p>
    </footer>
  `;
}
