# Alcance de la Beta 0.2

## Objetivo

Convertir el atlas público de Beta 0.1 en una aplicación persistente y administrable, manteniendo intacta la experiencia pública existente y añadiendo edición segura, búsqueda geográfica y solicitudes moderadas.

## Decisiones cerradas

- Backend: Supabase con PostgreSQL, Auth y Row Level Security.
- Frontend y publicación: Vite + TypeScript + Leaflet sobre GitHub Pages.
- Solo un administrador autenticado tendrá permisos de escritura.
- Los visitantes conservarán búsqueda, filtros, selección, fichas, URLs y navegación pública.
- Tipo y disposición son dimensiones independientes.
- Tipos principales: personaje y emplazamiento.
- Disposiciones: aliado, enemigo, neutral y desconocido.
- El borrado habitual será archivado; la eliminación física será excepcional y restringida.
- El contenido podrá estar en borrador, publicado o archivado.
- Beta 0.2 trabajará únicamente con nombres geográficos en inglés.
- Las traducciones se mantienen en el roadmap futuro.
- Las notas privadas del director de juego quedan fuera de Beta 0.2.

## Administración

El administrador podrá:

- iniciar y cerrar sesión;
- crear, modificar, archivar y, cuando sea seguro, eliminar categorías, etiquetas y nombres;
- crear, modificar, archivar y publicar personajes y emplazamientos;
- elegir coordenadas pulsando y arrastrando sobre el mapa;
- guardar borradores y previsualizarlos antes de publicar;
- gestionar relaciones entre personajes y emplazamientos;
- revisar solicitudes públicas y convertirlas en borradores.

## Experiencia pública

La Beta 0.2 añadirá:

- búsqueda de nombres geográficos en inglés, aunque no exista un pin visible;
- centrado, zoom recomendado y resaltado temporal del resultado;
- controles de búsqueda y filtros colapsables;
- dos tipos visuales principales de pin;
- disposición visible mediante color, borde y texto, nunca solo mediante color;
- resolución accesible de pines con coordenadas coincidentes;
- ficha compacta con nombre, tipo, disposición, categoría, etiquetas y personajes importantes;
- ficha completa en una pestaña nueva con toda la información pública;
- solicitudes públicas de nuevos pines.

## Solicitudes públicas

El formulario solicitará:

- nombre o apodo del remitente;
- nombre propuesto;
- tipo de pin elegido desde una lista cerrada;
- coordenadas seleccionadas visualmente;
- descripción y motivo.

No permitirá crear ni sugerir categorías o etiquetas y no exigirá código de campaña en Beta 0.2. Una solicitud siempre comenzará como pendiente y nunca se publicará automáticamente.

## Resiliencia

La aplicación mostrará un indicador accesible del estado del backend:

- conectado;
- degradado;
- sin conexión.

Una instantánea pública validada permitirá conservar el mapa, la búsqueda, los filtros, las fichas y las URLs con el último contenido publicado disponible cuando Supabase no responda.

## Seguridad

- Todo contenido entregado al visitante se considera público.
- Borradores, archivados, solicitudes y datos administrativos estarán protegidos por RLS.
- La clave privilegiada de Supabase nunca estará en el navegador, repositorio, build, Pages o artefactos de CI.
- El frontend no será la frontera de seguridad: todas las operaciones se validarán también en base de datos.
- No se almacenarán notas secretas del director de juego en este alcance.

## Backlog

La Beta 0.2 se ejecutará mediante MAP-013 a MAP-030. El orden y las dependencias están registrados en las Issues y en `docs/project-status.md`.
