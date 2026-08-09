export function renderApp(): string {
  return `
    <a class="skip-link" href="#main-content">Saltar al contenido principal</a>

    <header class="site-header">
      <a class="brand" href="#main-content" aria-label="Ir al mapa del Atlas">
        <span class="brand__mark" aria-hidden="true">✦</span>
        <span>Castigo Divino</span>
      </a>
      <div class="site-header__badges" aria-label="Estado de la aplicación">
        <span class="release-badge">Beta 0.2</span>
        <span class="fan-badge">Contenido de fans no oficial</span>
      </div>
    </header>

    <main id="main-content" class="atlas-main">
      <section class="map-experience" aria-labelledby="atlas-title">
        <div class="map-experience__heading">
          <div>
            <p class="eyebrow">Mapa interactivo de Faerûn · Beta 0.2</p>
            <h1 id="atlas-title">El Atlas de los Nuevos Dioses</h1>
          </div>
          <details class="map-help" data-map-help>
            <summary class="map-help__summary" data-map-help-summary>
              Ayuda y leyenda del mapa
            </summary>
            <div class="map-help__panel" data-map-help-panel>
              <section class="map-help__section" aria-labelledby="map-help-usage-title">
                <h2 id="map-help-usage-title" class="map-help__section-title">Cómo usar el mapa</h2>
                <ol class="map-help__steps">
                  <li>
                    <strong>Buscar.</strong> Abre Búsqueda y escribe un nombre geográfico, personaje,
                    emplazamiento, alias público o título de nota. Selecciona un resultado para
                    localizarlo.
                  </li>
                  <li>
                    <strong>Filtrar.</strong> Abre Filtrar lugares y limita el catálogo por categorías
                    o etiquetas. Puedes limpiar los filtros para recuperar todos los lugares.
                  </li>
                  <li>
                    <strong>Abrir un pin.</strong> Activa un marcador con ratón, toque, Enter o barra
                    espaciadora para abrir su ficha compacta. Un contador indica varias entidades en
                    la misma coordenada y abre una lista para elegir entre ellas. Los pines atenuados
                    siguen siendo operables.
                  </li>
                </ol>
              </section>

              <section class="map-help__legend" data-pin-legend aria-labelledby="pin-legend-title">
                <h2 id="pin-legend-title" class="map-help__legend-title pin-legend__title">
                  Leyenda de pines
                </h2>
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
                <p class="pin-legend__note">
                  La disposición es por jugador: varios símbolos en un pin representan perspectivas
                  distintas. El color es complementario; forma, símbolo, borde y texto conservan el
                  significado en alto contraste.
                </p>
              </section>

              <section class="map-help__section" aria-labelledby="map-help-keyboard-title">
                <h2 id="map-help-keyboard-title" class="map-help__section-title">
                  Teclado y tecnologías asistivas
                </h2>
                <p>
                  Recorre controles, resultados y pines con Tab y activa los controles con Enter o
                  barra espaciadora. La forma, los símbolos, los bordes y los nombres accesibles
                  transmiten la misma información sin depender del color ni del hover.
                </p>
              </section>
            </div>
          </details>
          <p id="map-instructions" class="visually-hidden">
            Usa Búsqueda para localizar nombres, personajes y emplazamientos, y Filtrar lugares para
            limitar el catálogo. Recorre controles, resultados y pines con Tab y actívalos con Enter
            o la barra espaciadora. Activar un pin abre su ficha compacta. Un pin con contador agrupa
            entidades en la misma coordenada y abre una lista accesible. Los pines atenuados siguen
            siendo operables. Un círculo indica personaje y un rombo, emplazamiento. Los símbolos
            más, menos, punto e interrogación indican aliado, enemigo, neutral y sin dato visible. La
            disposición se expresa por jugador y el color es solo una señal complementaria.
          </p>
        </div>

        <section class="place-search" data-place-search role="search" aria-label="Buscar lugares">
          <div class="collapsible-control__header">
            <div class="collapsible-control__heading-copy">
              <h2 id="place-search-title" class="collapsible-control__title">Búsqueda</h2>
              <p
                class="collapsible-control__summary"
                data-place-search-summary
                aria-live="polite"
                aria-atomic="true"
              >
                Sin consulta activa.
              </p>
            </div>
            <button
              id="place-search-toggle"
              class="collapsible-control__toggle"
              data-place-search-toggle
              type="button"
              aria-expanded="true"
              aria-controls="place-search-region"
            >
              Ocultar búsqueda
            </button>
          </div>
          <div
            id="place-search-region"
            class="collapsible-control__region place-search__region"
            data-place-search-region
            role="region"
            aria-labelledby="place-search-toggle"
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
              tabindex="-1"
              hidden
            ></ul>
          </div>
        </section>

        <section
          class="place-filters"
          data-place-filters
          data-has-matches="true"
          aria-labelledby="place-filters-title"
        >
          <div class="collapsible-control__header">
            <div class="collapsible-control__heading-copy">
              <h2 id="place-filters-title" class="place-filters__title">Filtrar lugares</h2>
              <p
                class="collapsible-control__summary"
                data-place-filters-summary
                aria-live="polite"
                aria-atomic="true"
              >
                Sin filtros activos.
              </p>
            </div>
            <button
              id="place-filters-toggle"
              class="collapsible-control__toggle"
              data-place-filters-toggle
              type="button"
              aria-expanded="true"
              aria-controls="place-filters-region"
            >
              Ocultar filtros
            </button>
          </div>
          <div
            id="place-filters-region"
            class="collapsible-control__region place-filters__region"
            data-place-filters-region
            role="region"
            aria-labelledby="place-filters-toggle"
            aria-describedby="place-filters-hint place-filters-status"
          >
            <div class="place-filters__header">
              <p id="place-filters-hint" class="place-filters__hint">
                Dentro de cada grupo se aplica OR; categoría, etiquetas y búsqueda se combinan con
                AND. Las etiquetas incluyen las asociadas a notas públicas.
              </p>
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
          </div>
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
              role="region"
              aria-label="Mapa navegable de la Costa de la Espada y el noroeste de Faerûn"
              aria-describedby="map-instructions place-filters-status map-search-status"
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
              <p class="place-details__label">Ficha compacta</p>
              <button
                class="place-details__close"
                type="button"
                data-place-details-close
                aria-label="Cerrar la ficha compacta"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div class="place-details__content" data-place-details-content></div>
          </aside>
        </div>
      </section>

      <section class="map-introduction" aria-label="Acerca del Atlas">
        <p class="map-introduction__lead">
          Explora el catálogo público de la campaña, localiza lugares y personajes y abre fichas
          compactas o completas, con respaldo degradable cuando el backend no está disponible.
        </p>
        <p class="map-introduction__source">
          Imagen oficial remota de baja resolución · 3600 × 2329 píxeles
        </p>
      </section>

      <aside class="map-instructions" aria-label="Uso responsable del mapa">
        <strong>Uso responsable del mapa.</strong>
        La cartografía se carga de forma remota directamente desde Wizards of the Coast. Este
        repositorio, su build y sus pruebas no almacenan, transforman ni publican copias o derivados
        del recurso.
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
