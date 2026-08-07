export function renderApp(): string {
  return `
    <a class="skip-link" href="#main-content">Saltar al contenido principal</a>

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
          <p class="eyebrow">Cartografía interactiva · MAP-022</p>
          <h1 id="atlas-title">El Atlas de los Nuevos Dioses</h1>
          <p class="map-introduction__lead">
            Explora lugares públicos de la campaña, localiza personajes y reconoce el tipo y las
            disposiciones de los pines sin abrir una ficha.
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
            Busca y filtra lugares. Recorre controles, resultados y pines con Tab, y actívalos con
            Enter o la barra espaciadora. Un pin con contador agrupa entidades en la misma
            coordenada y abre una lista accesible. Los pines atenuados siguen siendo operables.
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
                Nombre geográfico en inglés, personaje, emplazamiento, alias público o título de una
                nota pública. El tipo de cada resultado se indica por texto.
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
            aria-atomic="true"
          >
            Escribe un nombre, alias o título de nota pública.
          </p>
          <ul
            id="place-search-results"
            class="place-search__results"
            data-place-search-results
            aria-label="Resultados de búsqueda de lugares"
            aria-describedby="place-search-status"
            hidden
          ></ul>
        </section>

        <section
          class="place-filters"
          data-place-filters
          data-has-matches="true"
          aria-labelledby="place-filters-title"
          aria-describedby="place-filters-hint place-filters-status"
        >
          <div class="place-filters__header">
            <div>
              <h3 id="place-filters-title" class="place-filters__title">Filtrar lugares</h3>
              <p id="place-filters-hint" class="place-filters__hint">
                Dentro de cada grupo se aplica OR; categoría, etiquetas y búsqueda se combinan con
                AND. Las etiquetas incluyen las asociadas a notas públicas.
              </p>
            </div>
            <button
              class="place-filters__clear"
              data-place-filters-clear
              type="button"
              aria-controls="place-filter-categories place-filter-tags"
            >
              Limpiar filtros
            </button>
          </div>
          <div class="place-filters__groups">
            <fieldset class="place-filters__group">
              <legend>Categorías</legend>
              <div
                id="place-filter-categories"
                class="place-filters__options"
                data-place-filter-categories
                aria-describedby="place-filters-hint"
              ></div>
            </fieldset>
            <fieldset class="place-filters__group">
              <legend>Etiquetas</legend>
              <div
                id="place-filter-tags"
                class="place-filters__options"
                data-place-filter-tags
                aria-describedby="place-filters-hint"
              ></div>
            </fieldset>
          </div>
          <p
            id="place-filters-status"
            class="place-filters__status"
            data-place-filters-status
            role="status"
            aria-atomic="true"
          >
            Todos los lugares coinciden.
          </p>
        </section>

        <aside class="pin-legend" data-pin-legend aria-labelledby="pin-legend-title">
          <strong id="pin-legend-title" class="pin-legend__title">Leyenda de pines</strong>
          <div class="pin-legend__group" aria-label="Tipos de entidad">
            <span class="pin-legend__item">
              <span class="pin-legend__shape pin-legend__shape--character" aria-hidden="true"><span>●</span></span>
              Personaje
            </span>
            <span class="pin-legend__item">
              <span class="pin-legend__shape pin-legend__shape--location" aria-hidden="true"><span>◆</span></span>
              Emplazamiento
            </span>
          </div>
          <div class="pin-legend__group" aria-label="Disposición por jugador">
            <span class="pin-legend__item"><span class="pin-disposition pin-disposition--ally" aria-hidden="true">+</span>Aliado</span>
            <span class="pin-legend__item"><span class="pin-disposition pin-disposition--enemy" aria-hidden="true">−</span>Enemigo</span>
            <span class="pin-legend__item"><span class="pin-disposition pin-disposition--neutral" aria-hidden="true">•</span>Neutral</span>
            <span class="pin-legend__item"><span class="pin-disposition pin-disposition--unknown" aria-hidden="true">?</span>Sin dato visible</span>
          </div>
          <p id="pin-legend-note" class="pin-legend__note">
            La disposición es por jugador: varios símbolos en un pin representan perspectivas
            distintas. El color es complementario; forma, símbolo, borde y texto conservan el
            significado en alto contraste.
          </p>
        </aside>

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
              role="region"
              aria-label="Mapa navegable de la Costa de la Espada y el noroeste de Faerûn"
              aria-describedby="map-instructions place-filters-status pin-legend-note map-search-status"
            ></div>
            <p class="map-status" data-map-status role="status" aria-atomic="true">
              Cargando la cartografía oficial de Faerûn…
            </p>
            <p
              id="map-search-status"
              class="visually-hidden"
              data-map-search-status
              role="status"
              aria-live="polite"
              aria-atomic="true"
            ></p>
          </div>

          <aside
            class="place-details"
            data-place-details
            data-testid="place-details"
            role="region"
            aria-labelledby="place-details-title"
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
