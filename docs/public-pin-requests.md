# Solicitudes públicas de nuevos pines

- Estado: implementado para Beta 0.2.
- Issue: MAP-026 / #45.
- Superficie pública: mapa principal.
- Persistencia: `public.public_requests` mediante `public.submit_public_request(...)`.

## Objetivo

MAP-026 permite que un visitante sin sesión administrativa proponga un personaje o emplazamiento desde el mapa. Una propuesta es una entrada de moderación independiente del catálogo público: se persiste con estado `pending` y nunca crea ni publica automáticamente una entidad, categoría, etiqueta o pin.

La operación no modifica los parámetros navegables `q`, `place`, `category`, `tag` o `entity`, ni introduce parámetros URL nuevos.

## Campos públicos

El formulario acepta exclusivamente:

| Campo | Regla |
|---|---|
| Nombre o apodo del remitente | obligatorio, 1–80 caracteres |
| Nombre propuesto | obligatorio, 1–160 caracteres |
| Tipo | lista cerrada: `character` o `location` |
| Coordenada `x` | espacio canónico del mapa, 0–3600 |
| Coordenada `y` | espacio canónico del mapa, 0–2329 |
| Descripción | obligatoria, 1–2000 caracteres |
| Motivo | obligatorio, 1–1000 caracteres |
| Honeypot | campo técnico invisible; nunca forma parte del contenido editorial |

No existen campos para categoría, etiqueta ni código de campaña. El visitante tampoco puede enviar estado de moderación, ID convertido, moderador, timestamps editoriales ni ningún otro campo de la fila persistida.

Los textos se normalizan recortando espacio exterior y finales de línea. Los valores vacíos o formados solo por espacios se rechazan. Se permiten cadenas con aspecto HTML como texto ordinario; la UI no las interpreta como marcado. Los caracteres de control no seguros se rechazan antes del transporte.

## Selección cartográfica

La selección usa el mismo `L.CRS.Simple` y las mismas coordenadas canónicas del atlas: `Leaflet.lat = y` y `Leaflet.lng = x`. No existe un segundo sistema de coordenadas.

El usuario puede:

1. activar `Elegir posición en el mapa` y tocar o hacer clic en el mapa;
2. corregirla repitiendo la selección antes de enviar;
3. usar `Usar el centro visible` como alternativa operable por teclado.

La posición elegida se representa con un marcador temporal no interactivo y un texto con las coordenadas. El marcador no entra en el catálogo, no altera la selección de pines existente y desaparece tras un envío confirmado.

## Persistencia y frontera de seguridad

MAP-026 reutiliza la frontera creada y endurecida en MAP-014; no añade migraciones, tablas, policies, grants ni RPC nuevas.

`public.public_requests` tiene RLS activa. Los visitantes no tienen `SELECT`, `INSERT`, `UPDATE` ni `DELETE` directos sobre la tabla. El único alta pública permitida es `public.submit_public_request(...)`, una función `SECURITY DEFINER` con `search_path` fijo y `EXECUTE` concedido a `anon` y `authenticated` después de revocar el permiso público general.

La RPC acepta únicamente los ocho parámetros del formulario, valida longitudes y coordenadas, inserta la fila con `request_status = 'pending'` y fija los campos administrativos a `NULL`. Un trigger de defensa en profundidad vuelve a forzar el estado inicial y limpia los campos de moderación en inserción.

No existe lectura pública de solicitudes. El acceso de moderación continúa protegido por RLS y `private.is_admin()`.

## Privacidad

Se almacenan el nombre o apodo y el contenido que el remitente introduce en la solicitud, junto con tipo, coordenadas y metadatos técnicos de la fila. El nombre o apodo es exclusivamente administrativo durante Beta 0.2: no aparece en el mapa ni es legible por otros visitantes.

La interfaz informa de esta finalidad y pide no introducir correo, teléfono u otros datos personales. Los campos del formulario no se copian a `localStorage` ni `sessionStorage`. Si un envío falla, permanecen en el DOM de la página para poder corregir o reintentar mientras esa página siga abierta.

La única persistencia del navegador añadida por MAP-026 es un timestamp de último envío confirmado en `sessionStorage`, sin contenido de la solicitud ni identificadores personales.

## Abuso básico

La protección deliberadamente ligera de Beta 0.2 combina varias capas:

- lista de tipos cerrada en UI y PostgreSQL;
- límites y validación tanto en cliente como en la RPC/tabla;
- honeypot: si un bot rellena el campo técnico, la RPC devuelve éxito mínimo pero no inserta la solicitud;
- cooldown local de 60 segundos después de un envío confirmado, almacenando únicamente un timestamp por pestaña;
- botón deshabilitado mientras existe un envío en curso;
- rechazo normalizado de `429` para permitir que el backend aplique límites adicionales sin cambiar el contrato de UI.

No se introduce CAPTCHA, servicio externo, Edge Function ni infraestructura paralela. MAP-029 conserva la responsabilidad de evaluar si la protección es suficiente antes de publicar Beta 0.2.

El cooldown local no se considera una frontera de seguridad: un cliente manipulado puede omitirlo. La seguridad autoritativa sigue estando en la operación SQL cerrada y sus restricciones; el honeypot reduce automatización trivial sin convertir el navegador en una fuente de confianza.

## Errores y reintentos

Los errores de configuración, red, servidor, rate limit, rechazo y respuesta no verificable producen mensajes accesibles y no limpian los campos ni la posición seleccionada. No se realiza reintento automático de una escritura para evitar duplicados ambiguos.

Solo una respuesta booleana `true` de la RPC se considera confirmación. Tras esa confirmación:

- el formulario se limpia;
- la posición temporal desaparece;
- empieza el cooldown local;
- el mensaje recuerda expresamente que la solicitud queda pendiente de revisión y no se publica automáticamente.

## Accesibilidad y responsive

La superficie está pensada para 320 px y escritorio:

- controles táctiles con objetivo mínimo de 44 px;
- labels explícitos y `fieldset` para la posición;
- errores vinculados mediante `aria-invalid` y `aria-errormessage`;
- foco al primer campo inválido;
- `role=status`, `aria-live` y `aria-atomic` para estado y posición;
- el encabezado del panel recibe foco al abrir y el botón de apertura recupera el foco al cerrar;
- alternativa por teclado a la selección con puntero;
- el estado de selección no depende solo del color;
- `forced-colors` conserva bordes y marcador;
- `prefers-reduced-motion` elimina transiciones;
- textos largos permiten corte y el layout pasa a una sola columna sin overflow horizontal.

## Transporte

El adaptador `SupabasePublicPinRequestRepository` usa la URL pública y la clave publicable ya aceptadas por la aplicación. Para producción exige un host `*.supabase.co` y una clave `sb_publishable_*`; una clave `anon` legacy solo se acepta contra el stack local en modo desarrollo.

La petición es un `POST` a `/rest/v1/rpc/submit_public_request`, usa únicamente el header público `apikey` y no añade `Authorization`, `service_role`, `sb_secret_*` ni credenciales operativas.

## Pruebas

La cobertura de MAP-026 incluye:

- unitarias de normalización, campos obligatorios, longitudes, coordenadas, tipos cerrados, HTML-like, caracteres de control y payload exacto;
- unitarias del adaptador RPC: configuración pública, headers, respuesta mínima, red, `429`, errores de cliente y servidor;
- la suite pgTAP existente de MAP-014, que comprueba RLS, ausencia de lectura e inserción directa anónimas, RPC pública válida, coordenadas inválidas y honeypot sin persistencia;
- E2E de envío anónimo, selección visual de posición, ausencia de categoría/etiqueta/código de campaña, no publicación automática, validación, conservación tras fallo, cooldown, 320 px, teclado, foco, targets táctiles, ausencia de overflow y estabilidad de URL;
- smoke del build de Pages para confirmar que la acción pública y el formulario cerrado se incluyen en el artefacto desplegable.

## Límites conocidos

Beta 0.2 no intenta detectar duplicados semánticos de propuestas ni identificar personas reales. La moderación decide si dos solicitudes representan el mismo contenido. Tampoco existe una garantía fuerte de rate limiting por dispositivo o IP en esta fase; introducir una infraestructura de ese tipo requiere evidencia de abuso y se evalúa en MAP-029.
