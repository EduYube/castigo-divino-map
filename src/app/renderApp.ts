export function renderApp(): string {
  return `
    <header class="site-header">
      <a class="brand" href="#main-content" aria-label="Ir al mapa del Atlas">
        <span class="brand__mark" aria-hidden="true">✦</span>
        <span>Castigo Divino</span>
      </a>
      <div class="site-header__badges" aria-label="Estado de la aplicación">
        <span class="release-badge">Beta 0.1</span>
        <span class="fan-badge">Contenido de fans no oficial</span>
      </div>
    </header>

    <main id="main-content" class="atlas-main">
      <section class="map-introduction" aria-labelledby="atlas-title">
        <div>
          <p class="eyebrow">Cartografía interactiva · MAP-004</p>
          <h1 id="atlas-title">El Atlas de los Nuevos Dioses</h1>
          <p class="map-introduction__lead">
            Explora la Costa de la Espada y el noroeste de Faerûn con zoom y desplazamiento
            acotados a la cartografía disponible.
          </p>
        </div>
        <p class="map-introduction__source">
          Imagen oficial remota de baja resolución · 3600 × 2329 píxeles
        </p>
      </section>

      <section class="map-experience" aria-labelledby="map-heading">
        <div class="map-experience__heading">
          <div>
            <p class="eyebrow">Mapa navegable</p>
            <h2 id="map-heading">Faerûn</h2>
          </div>
          <p id="map-instructions" class="map-instructions">
            Arrastra para desplazarte. Usa la rueda, el trackpad, los gestos táctiles o los
            controles para acercar y alejar.
          </p>
        </div>

        <div
          class="map-shell"
          data-map-shell
          data-map-state="loading"
          data-testid="map-shell"
          aria-busy="true"
        >
          <div
            class="map-canvas"
            data-map-canvas
            aria-label="Mapa navegable de la Costa de la Espada y el noroeste de Faerûn"
            aria-describedby="map-instructions"
          ></div>
          <p class="map-status" data-map-status role="status" aria-live="polite">
            Cargando la cartografía oficial de Faerûn…
          </p>
        </div>
      </section>

      <aside class="map-notice" aria-labelledby="map-notice-title">
        <div>
          <p class="eyebrow">Uso responsable</p>
          <h2 id="map-notice-title">La imagen no forma parte de la aplicación</h2>
        </div>
        <p>
          El mapa se solicita directamente a Wizards of the Coast. Este repositorio, su build y
          sus pruebas no almacenan, transforman ni publican copias o derivados del recurso.
        </p>
      </aside>
    </main>

    <footer class="site-footer">
      <p>
        El Atlas de los Nuevos Dioses es contenido de fans no oficial permitido por la Política de
        contenido de fans. No está aprobado ni respaldado por Wizards. Parte de los materiales
        utilizados es propiedad de Wizards of the Coast. ©Wizards of the Coast LLC. Cartografía:
        Mike Schley.
      </p>
      <nav aria-label="Información legal y fuente cartográfica">
        <a href="https://company.wizards.com/es/legal/fancontentpolicy" rel="noreferrer">
          Política de contenido de fans
        </a>
        <a
          href="https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg"
          rel="noreferrer"
        >
          Fuente oficial del mapa
        </a>
      </nav>
    </footer>
  `;
}
