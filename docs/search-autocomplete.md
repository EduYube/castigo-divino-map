# Autocompletado de búsqueda pública

MAP-038 añade sugerencias seleccionables a la búsqueda pública sin crear un índice ni reglas de matching paralelas.

## Fuente y ranking

Las sugerencias delegan en `searchPublicAtlas`, por lo que reutilizan las fuentes públicas, normalización, aliases, tipos y desempates ya definidos por la búsqueda. El orden conserva la prioridad existente:

1. coincidencia exacta;
2. prefijo;
3. coincidencia parcial;
4. criterios estables ya definidos por la búsqueda pública.

La lista de sugerencias muestra como máximo seis resultados. El límite afecta solo al desplegable; la lista completa de resultados de búsqueda sigue disponible debajo y conserva acciones existentes como **Abrir ficha**.

Dos resultados con el mismo nombre visible no se fusionan si sus identidades son distintas. Cada sugerencia mantiene `id` y tipo (`geographic`, `location` o `character`) y el tipo se presenta también como texto comprensible.

## Interacción

Mientras el campo tiene foco y la consulta produce coincidencias, se muestra un `listbox` asociado al buscador. El usuario puede:

- seguir escribiendo una consulta libre sin elegir sugerencia;
- recorrer sugerencias con `ArrowDown` y `ArrowUp` sin sacar el foco del campo;
- aceptar la opción activa con `Enter`;
- cerrar solo el desplegable con `Escape`, conservando la consulta;
- seleccionar con ratón o interacción táctil;
- abandonar el campo para cerrar las sugerencias.

Seleccionar una sugerencia sustituye la consulta por su nombre canónico y aplica inmediatamente la identidad concreta elegida mediante el flujo cartográfico existente.

## Accesibilidad

El control sigue el patrón combobox/listbox con:

- `role="combobox"` y `aria-expanded` en el contenedor asociado al campo;
- `aria-autocomplete="list"` y `aria-controls` en el input;
- `role="listbox"` para el desplegable;
- `role="option"`, `aria-selected` y `aria-activedescendant` para la opción activa;
- foco retenido en el input durante la navegación por flechas;
- ausencia de focus trap y cierre por `Escape` o pérdida de foco.

Los tipos de resultado y la causa de coincidencia se expresan mediante texto; el estado activo no depende únicamente del color y conserva contraste utilizable en `forced-colors`.

## Responsive

El desplegable es una capa absoluta respecto al campo, por lo que no empuja el mapa ni modifica el flujo vertical del workspace. Su altura es limitada y scrollable; en móvil usa un máximo menor basado también en `svh` para evitar monopolizar una pantalla corta o el espacio restante al aparecer el teclado virtual.

La cobertura E2E comprueba 320 px y un viewport corto de 430 × 360, además de los proyectos móviles Chromium y WebKit configurados en Playwright, incluyendo ausencia de overflow horizontal y estabilidad de la posición del mapa al abrir sugerencias.

## Seguridad y datos

MAP-038 se resuelve completamente en cliente sobre el catálogo público ya disponible. No añade ni modifica schema PostgreSQL, migraciones, RLS, Auth, roles, grants, secretos ni permisos de datos.
