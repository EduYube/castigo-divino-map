# ADR 0001 — Usar una imagen oficial remota de baja resolución en la Beta 0.1

- Estado: Aceptada
- Fecha: 2026-08-04
- Issue: MAP-002 / #2

## Contexto

La Beta 0.1 necesita un mapa navegable de Faerûn compatible con Leaflet y dispositivos móviles. Wizards of the Coast mantiene tres variantes JPEG oficiales del mapa de la Costa de la Espada y el noroeste de Faerûn.

Las variantes media y alta miden 10200 × 6600 píxeles y requieren aproximadamente 257 MiB una vez decodificadas como RGBA, además de transferencias de 10.47 y 25.95 MiB. La variante baja mide 3600 × 2329 píxeles, pesa 1.01 MiB y requiere aproximadamente 32 MiB decodificada.

Una pirámide de mosaicos ofrecería mejor carga incremental y menor presión de memoria, pero exige transformar y republicar el arte. No se ha localizado una licencia específica que autorice esas operaciones. La Política de contenido de fans permite mostrar arte de Wizards en una web de fans gratuita bajo ciertas condiciones, pero distingue ese uso de la copia literal y republicación de la propiedad intelectual.

## Decisión

Para Beta 0.1 se utilizará la variante oficial `Sword-Coast-Map_LowRes.jpg` cargada directamente desde `media.wizards.com` como una imagen única.

La integración posterior usará Leaflet con `CRS.Simple` y `L.imageOverlay`.

El JPEG no se copiará al repositorio, al bundle, a GitHub Pages, a un CDN propio, a releases ni a artefactos de CI. No se generarán recortes, recompressiones, conversiones ni mosaicos.

La aplicación incluirá el aviso de contenido de fans exigido por Wizards, atribución a Wizards of the Coast y crédito cartográfico a Mike Schley. También tendrá una ruta de error cuando el recurso remoto no esté disponible.

## Consecuencias positivas

- Reduce la descarga inicial a aproximadamente 1 MiB.
- Reduce la memoria decodificada estimada a aproximadamente 32 MiB.
- Es viable para la validación móvil de la beta.
- Evita almacenar o redistribuir una copia del recurso.
- Evita crear derivados sin permiso expreso.
- Simplifica MAP-004.

## Consecuencias negativas

- El mapa completo se descarga y decodifica aunque solo se vea una región.
- El detalle máximo es inferior al de las variantes de 10200 × 6600.
- La aplicación depende de disponibilidad, rendimiento y políticas de carga externa de Wizards.
- La URL histórica puede cambiar o desaparecer.
- La estrategia no es óptima para una versión de mayor escala o detalle.

## Alternativas consideradas

### Alojar la imagen original

Rechazada porque supondría copiar y republicar el archivo sin una licencia de redistribución inequívoca.

### Generar una pirámide de mosaicos

Técnicamente preferible para rendimiento y escalabilidad, pero rechazada por ahora porque supone modificación y redistribución de derivados.

### Usar MedRes o HighRes como imagen única

Rechazada por transferencia y memoria excesivas para móvil.

### Usar recursos de AideDD

Rechazada expresamente: no existe autorización para extraerlos o reutilizarlos.

### Crear un mapa propio o usar uno con licencia explícita

Conservada como plan alternativo si la fuente oficial deja de ser utilizable o no obtiene autorización.

## Condiciones de revisión

Esta decisión se revisará cuando ocurra cualquiera de las siguientes situaciones:

- Wizards concede permiso escrito para alojar y transformar el recurso;
- se obtiene un mapa alternativo con licencia compatible;
- la URL oficial deja de funcionar o bloquea la carga externa;
- las pruebas de MAP-004 demuestran que LowRes no satisface los requisitos funcionales o móviles.

Con permiso suficiente, la siguiente opción preferida será una pirámide de mosaicos estáticos reproducible y optimizada para móvil.
