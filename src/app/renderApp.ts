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
          <p class="eyebrow">Cartografía interactiva · MAP-007</p>
          <h1 id="atlas-title">El Atlas de los Nuevos Dioses</h1>
          <p class="map-introduction__lead">
            Explora lugares públicos de la campaña sobre la Costa de la Espada, búscalos por su
            nombre, alias o notas públicas y consulta sus categorías y etiquetas.
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
            Busca lugares por nombre, alias o título de nota. Recorre los resultados y marcadores
            con Tab o las flechas indicadas, y actívalos con Enter o la barra espaciadora. Arrastra
            el mapa y usa la rueda, los gestos táctiles o los controles para cambiar el zoom.
          </p>
        </div>

        <section
          class="place-search"
          data-place-search
          role="search"
          aria-labelledby="place-search-label"
        >
          <div class="place-search__header">
            <div>
              <label id="place-search-label" class="place-search__label" for="place-search-input">
                Buscar lugares
              </label>
              <p id="place-search-hint" class="place-search__hint">
                Nombre principal, alias público o título de una nota pública.
              </p>
            </div>
            <div class="place-search__controls">
              <input
                id="place-search-input"
                class="place-search__input"
                data-place-search-input
                type="search"
                name="place-search"
                autocomplete="off"
                spellcheck="false"
                aria-describedby="place-search-hint place-search-status"
              />
              <button
                class="place-search__clear"
                data-place-search-clear
                type="button"
                aria-controls="place-search-results"
              >
                Limpiar búsqueda
              </button>
            </div>
          </div>
          <p
            id="place-search-status"
            class="place-search__status"
            data-place-search-status
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            Escribe un nombre, alias o título de nota pública.
          </p>
          <ul
            id="place-search-results"
            class="place-search__results"
            data-place-search-results
            aria-label="Resultados de búsqueda de lugares"
            hidden
          ></ul>
        </section>

        <div class="map-workspace" data-map-workspace>
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

          <aside
            class="place-details"
            data-place-details
            data-testid="place-details"
            role="region"
            aria-labelledby="place-details-title"
            aria-live="polite"
            hidden
          >
            <div class="place-details__toolbar">
              <p class="place-details__label">Ficha del lugar activo</p>
              <button
                class="place-details__close"
                type="button"
                data-place-details-close
                aria-label="Cerrar la ficha del lugar"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div class="place-details__content" data-place-details-content></div>
          </aside>
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
