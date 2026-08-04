# Fuente y condiciones de uso del mapa base

## Estado de la decisión

La Beta 0.1 utilizará como mapa base el mapa oficial de la Costa de la Espada y el noroeste de Faerûn publicado por Wizards of the Coast en 2015, en su variante de baja resolución, cargado directamente desde el dominio oficial de Wizards.

El archivo **no se copiará al repositorio ni al artefacto desplegado**. Tampoco se generarán mosaicos derivados mientras no exista autorización escrita que cubra expresamente la modificación y redistribución del recurso.

Esta es una decisión de proyecto prudente, no asesoramiento jurídico.

## Fuente oficial

- Página de origen histórica: `https://dnd.wizards.com/articles/features/sword-coast-adventurers-guide-map`
- Recurso recomendado para la beta: `https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg`
- Variante media: `https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_MedRes.jpg`
- Variante alta: `https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_HighRes.jpg`
- Política de contenido de fans: `https://company.wizards.com/es/legal/fancontentpolicy`
- Términos de Wizards: `https://company.wizards.com/en/legal/terms`

La página histórica puede no estar ya indexada o disponible en la web actual, pero los tres recursos siguen siendo servidos por `media.wizards.com` con respuesta HTTP correcta a fecha de 2026-08-04.

## Autoría y propiedad

- Editor y titular identificado: Wizards of the Coast LLC.
- Cartografía atribuida públicamente: Mike Schley.
- Obra asociada: *Sword Coast Adventurer's Guide* (2015).
- El recurso contiene propiedad intelectual de Wizards y no se considera contenido abierto.

No se ha localizado una licencia específica adjunta a la descarga que conceda derechos generales de modificación o redistribución del archivo.

## Metadatos verificados

Los archivos se descargaron temporalmente desde el dominio oficial, se abrieron localmente y se inspeccionaron con Pillow. No se incorporó ninguna copia al repositorio.

| Variante | Formato | Dimensiones | Peso | Memoria RGBA aproximada | SHA-256 verificado |
|---|---:|---:|---:|---:|---|
| LowRes | JPEG RGB | 3600 × 2329 px | 1,054,611 B (1.01 MiB) | 32.0 MiB | `9f60e95dfe2e4501f8d86757a5ba2cae75b0aa729fd66a0a408f91b870283d8a` |
| MedRes | JPEG RGB | 10200 × 6600 px | 10,981,404 B (10.47 MiB) | 256.8 MiB | `280079e929bfb4cb516cc2053cce485d7ec24303e8374b6d341eb8ab5d997497` |
| HighRes | JPEG RGB | 10200 × 6600 px | 27,206,941 B (25.95 MiB) | 256.8 MiB | `b3c2522246efed96f5ae00a3f06183dd1d36909efe132ee095258767cf085518` |

Las tres variantes son JPEG no progresivos, RGB, con densidad declarada de 72 dpi. MedRes y HighRes tienen las mismas dimensiones y distinta compresión/calidad.

La memoria aproximada se calcula como ancho × alto × 4 bytes y representa el orden de magnitud de la imagen decodificada en memoria, no el consumo total del navegador.

## Condiciones de uso relevantes

La Política de contenido de fans de Wizards permite crear y compartir gratuitamente sitios web de fans que incorporen propiedad intelectual y arte de Wizards, siempre que se cumplan sus condiciones. Entre ellas:

- acceso gratuito al contenido;
- identificación clara como contenido no oficial;
- conservación de avisos legales, logotipos y marcas ya presentes en el material;
- prohibición de vender o licenciar el contenido de fans por compensación;
- respeto de derechos de terceros;
- cumplimiento adicional de los Términos de Wizards;
- posibilidad de que Wizards restrinja o retire el permiso en cualquier momento.

La propia política distingue el contenido creado por fans de la copia literal y republicación de propiedad intelectual de Wizards. Por tanto, la existencia de una descarga pública **no equivale a una licencia de redistribución**.

## Matriz de permisos y decisión del proyecto

| Acción | Evaluación | Decisión para Beta 0.1 |
|---|---|---|
| Descargar para inspección privada | Razonablemente compatible con la descarga oficial y el uso privado | Permitido temporalmente durante desarrollo |
| Abrir y visualizar localmente | Compatible con la finalidad del recurso | Permitido |
| Mostrar el arte en una web de fans gratuita | Contemplado por la Política de contenido de fans, sujeto a sus condiciones | Permitido con atribución y aviso legal |
| Cargar el archivo desde `media.wizards.com` | No crea una copia en el repositorio o despliegue, pero depende del servicio externo | Estrategia elegida para la beta |
| Copiar el JPEG al repositorio privado | Sigue siendo una reproducción; no se ha hallado permiso específico | No incluir |
| Copiar el JPEG al repositorio público | Redistribución clara del archivo original | No incluir |
| Servir una copia desde GitHub Pages/CDN propio | Republicación pública del archivo | No hacer sin autorización escrita |
| Reescalar, recortar o recomprimir | Modificación/obra derivada no expresamente autorizada | No hacer sin autorización escrita |
| Generar una pirámide de mosaicos | Modificación y redistribución de múltiples derivados | No hacer sin autorización escrita |
| Quitar rótulos, marcas o avisos | Prohibido cuando altera signos existentes; además crea un derivado | No hacer |

## Uso privado frente a publicación pública

### Desarrollo privado

Se permite conservar una copia temporal fuera del repositorio para verificar formato, dimensiones, peso, integridad y compatibilidad técnica. La copia debe eliminarse cuando deje de ser necesaria y no debe sincronizarse con Git, artefactos de CI, almacenamiento compartido o despliegues.

### Publicación pública

La aplicación publicada será gratuita, se identificará como proyecto de fans no oficial y mostrará el mapa mediante la URL oficial. El bundle no contendrá el JPEG ni derivados. La publicación debe poder retirar o sustituir el recurso rápidamente si Wizards cambia la política, elimina la URL o solicita su retirada.

## Imagen única frente a pirámide de mosaicos

### Imagen única

Ventajas:

- integración muy simple con `L.imageOverlay` y `CRS.Simple`;
- una sola petición;
- no requiere generar derivados;
- la variante LowRes pesa aproximadamente 1 MiB;
- suficiente para validar navegación, marcadores y experiencia de beta.

Inconvenientes:

- el navegador decodifica la imagen completa, aproximadamente 32 MiB antes de otros costes;
- se descarga completa aunque el usuario vea una zona pequeña;
- menor detalle al ampliar;
- dependencia de disponibilidad y rendimiento del host oficial;
- una URL externa puede cambiar o dejar de admitir carga cruzada.

### Pirámide de mosaicos

Ventajas:

- descarga únicamente los mosaicos visibles;
- menor memoria y transferencia inicial;
- mejor escalado a mapas de gran resolución;
- mejor experiencia en conexiones móviles y desplazamientos parciales;
- caché granular y niveles de zoom naturales para Leaflet.

Inconvenientes:

- requiere procesar y transformar el original;
- produce muchos archivos derivados;
- incrementa complejidad de generación, despliegue e invalidación de caché;
- en este caso no hay permiso expreso para modificar y redistribuir esos derivados.

## Decisión técnica

Para Beta 0.1:

1. utilizar `Sword-Coast-Map_LowRes.jpg` como imagen única remota;
2. configurar Leaflet con `CRS.Simple` e `L.imageOverlay` en MAP-004;
3. limitar el zoom máximo a la resolución útil de 3600 × 2329;
4. mostrar un estado de error y una alternativa cuando la imagen no cargue;
5. evitar cualquier conversión, recorte, recompression o mosaico;
6. no añadir el recurso a `public/maps/`, Git LFS, releases, cachés precargadas ni artefactos de CI.

La variante LowRes reduce la descarga inicial de 10–26 MiB a aproximadamente 1 MiB y la memoria decodificada de unos 257 MiB a unos 32 MiB, una diferencia decisiva para móvil.

## Atribución y aviso legal

La aplicación debe incluir, de forma visible y accesible desde el mapa o el pie de página:

> El Atlas de los Nuevos Dioses es contenido de fans no oficial permitido por la Política de contenido de fans. No está aprobado ni respaldado por Wizards. Parte de los materiales utilizados es propiedad de Wizards of the Coast. ©Wizards of the Coast LLC. Cartografía: Mike Schley.

Además:

- no presentar el sitio como oficial;
- no usar logotipos de Wizards como marca propia;
- no eliminar ni tapar marcas o avisos existentes en el mapa;
- enlazar a la Política de contenido de fans y a la fuente oficial;
- mantener el acceso gratuito.

## Plan alternativo

Si la URL oficial deja de estar disponible, bloquea el uso externo o Wizards no autoriza la estrategia:

1. no sustituirla por una copia no autorizada ni por recursos de AideDD;
2. mostrar temporalmente un fondo cartográfico neutro generado por el proyecto, sin propiedad intelectual de terceros;
3. conservar marcadores y navegación sobre coordenadas abstractas con `CRS.Simple`;
4. solicitar autorización escrita a Wizards para alojar el original y generar mosaicos;
5. evaluar un mapa creado desde cero o adquirido con licencia explícita para modificación, redistribución y publicación web;
6. registrar cualquier nueva fuente y licencia antes de incorporarla.

## Condiciones para reconsiderar mosaicos

Se abrirá una nueva decisión cuando exista al menos una de estas condiciones:

- permiso escrito de Wizards para transformar y alojar el mapa;
- un mapa alternativo con licencia explícita compatible;
- evidencia de que LowRes no cumple los requisitos funcionales de la beta.

Con permiso suficiente, la solución preferida será una pirámide de mosaicos estáticos generada de forma reproducible, con niveles de zoom ajustados a móvil y sin incluir el original de máxima resolución en el bundle.

## Verificación realizada

- Descarga HTTP correcta de las tres variantes oficiales.
- Apertura local correcta de los JPEG.
- Verificación de formato, dimensiones, peso y hash.
- Comparación de transferencia y memoria decodificada.
- Revisión de la Política de contenido de fans y de los Términos vigentes consultados el 2026-08-04.

## Riesgos pendientes

- La Política de contenido de fans no concede de forma inequívoca una licencia de redistribución del archivo original.
- La carga remota depende de una URL histórica sin garantía de permanencia o SLA.
- El titular puede cambiar la política o pedir la retirada del contenido.
- La autoría cartográfica debe conservarse, pero no sustituye el aviso legal exigido por Wizards.
- La validación legal definitiva requeriría autorización escrita o revisión jurídica profesional.
