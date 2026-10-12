# MAP-071 — Guía de QA administrativa v1.1.1

> **SEGURIDAD — LEER ANTES DE EMPEZAR.** En producción se autorizan únicamente lectura, navegación, inicio y cierre de sesión, cambios de selección e inspección visual que no escriban datos. **Crear, editar, publicar, archivar, borrar, moderar solicitudes o guardar relaciones son pruebas mutadoras**: ejecútalas solo en un entorno o conjunto de datos expresamente autorizado, nunca con contenido temporal o «canary» en producción por defecto. No copies credenciales, tokens, datos privados de Master ni datos personales a capturas, issues o informes.

**Documento canónico:** este Markdown. **PDF:** copia generada automáticamente, no edición independiente. **Alcance:** producto del baseline MAP-070 y regresión administrativa candidata a v1.1.1; esta guía no constituye aprobación de release ni prueba ya ejecutada.

## 1. Hoja de sesión y criterios

| Campo | Anotación de la sesión |
| --- | --- |
| Fecha / tester | __________________________________ |
| Entorno / autorización de mutaciones | __________________________________ |
| URL / SHA o build inspeccionado | __________________________________ |
| Navegador / versión | __________________________________ |
| Viewport / dispositivo | __________________________________ |
| Campaña pública inicial | __________________________________ |
| Campaña administrativa inicial | __________________________________ |
| Incidencia general / ticket | __________________________________ |

**Estados:** PASS = cumple lo observado; FAIL = incumplimiento reproducible; BLOCKED = no se pudo ejecutar por falta de acceso, entorno, datos o técnica segura; N/A = el escenario no corresponde al ámbito autorizado (justificar). No marques PASS si no se ejecutó. Para cada ID anota fecha, resultado, captura anonimizada o traza segura, observaciones y URL del finding. Prioriza evidencias sin nombres ni contenido privado.

**Dos carriles de prueba.** **P (production-safe):** navegación y lectura sin mutaciones; admite login/logout autorizado y filtros/selecciones locales. **M (mutating):** solo entorno/datos con permiso explícito, con plan de limpieza, sin escribir en producción por defecto. **C (controlado):** simulación local o fixture; no fuerces errores desactivando el backend real ni edites tokens. El QA de producción puede completar el carril P y marcar BLOCKED los casos M y C pendientes.

**Datos de referencia, no reglas hardcodeadas:** campaña **Castigo Divino** (roster **Ura, Skade**, sin Veyra) y **Un aliento menos** (roster **Veyra**, sin Ura ni Skade). La geografía física puede ser global; categorías, etiquetas, aliases de entidad, entidades, roster, relaciones y solicitudes tienen contexto de campaña. Los nombres del roster reflejan el contenido actual y deben revalidarse si se edita canónicamente.

## 2. Quick smoke de 10–15 minutos (P)

Con cuenta administrativa autorizada y backend conectado, realiza la siguiente secuencia *sin guardar ni moderar nada*:

1. Abre el atlas y pulsa **Administrar**; inicia sesión. Comprueba estado autorizado, foco y ausencia de detalles internos en errores.
2. Lee **Contexto administrativo** y **Editando campaña**; comprueba nombre legible y selector **Campaña administrativa**.
3. Selecciona **Castigo Divino** y mira **Personajes jugadores / referents**: Ura y Skade, nunca Veyra.
4. Cambia a **Un aliento menos**: Veyra, nunca Ura ni Skade; comprueba que recargan lista de entidades, referencias, relaciones y bandeja.
5. Abre una ficha administrativa espacial de la campaña B sin editarla y verifica tipo, referencias y geografía.
6. Abre una **organización** existente en la campaña que disponga de ella: aviso **No cartográfica**, sin X/Y, editor de mapa ni controles de jugadores. Si no existe, marca esta línea BLOCKED, no crees un canary.
7. Lee **Relaciones con otras entidades** de una ficha con relaciones: candidatos de B, etiquetas por extremo y tipos; si no hay fixture real, BLOCKED.
8. Mantén campaña pública A y administrativa B: el banner ha de decir que la edición afecta únicamente a B.
9. Vuelve a A; no deben quedar tarjetas ni jugadores de B bajo A.
10. Sal de la administración; comprueba cierre del panel y ausencia de información privada o controles de escritura. Si se usó Master Mode, sal también de él y confirma purge.

**Decisión rápida:** PASS en controles disponibles = «build aparentemente sano» (no aprobación integral). Un error de scope, acceso indebido, Master purge, o mezcla A/B = **«regresión administrativa importante»**: FAIL, captura sin secretos y detener cualquier QA mutadora. Lo no presente por falta de datos permanece BLOCKED, nunca PASS.

## 3. Casos manuales detallados

Cada caso incluye objetivo, precondiciones, pasos, resultado esperado, evidencia y resultado registrable. **Nunca uses una prueba M para fabricar datos en producción.**

### QA-AUTH-01 — Entrada, autenticación, logout y foco (P)

**Objetivo.** Acceso administrativo únicamente tras autenticación y autorización; navegación y foco previsibles.

**Precondiciones.** Atlas disponible; cuenta autorizada de prueba; sesión inicialmente cerrada.

**Pasos.** 1. Con teclado abre **Administrar**. 2. Comprueba foco inicial del diálogo y nombres de campos. 3. Observa transición de login/validación y completa el acceso con credenciales gestionadas fuera del informe. 4. Navega por la administración. 5. Cierra sesión; comprueba foco recuperado en el control útil. 6. Reabre y usa Escape para cerrar el diálogo sin autenticar.

**Resultado esperado.** El diálogo anuncia estados sin exponer detalles de infraestructura; solo un usuario autorizado ve controles administrativos operativos. Escape y logout dejan el atlas público usable y no muestran contenido de administración/Master.

**Evidencia.** Captura del shell sin datos personales, nota sobre foco y estado final.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-AUTH-02 — Usuario sin permisos, sesión expirada y errores (P/C)

**Objetivo.** Fallo cerrado de autorización sin degradar el atlas.

**Precondiciones.** Usuario no admin en entorno autorizado; fixture de expiración/revocación o sesión de prueba controlada; sin uso de credenciales reales de terceros.

**Pasos.** 1. Prueba login de usuario no autorizado y observa el estado. 2. Inspecciona que no se abre CRUD ni bandeja. 3. En fixture/local simula sesión vencida o revocada y solicita una lectura protegida. 4. Comprueba bloqueo de acciones tras un 401/403 simulado. 5. Revisa texto visible de error.

**Resultado esperado.** Login no implica autorización; estados no autorizado/caducado bloquean escritura. No aparecen SQLSTATE, PostgREST, constraints, JWT ni trazas crudas; el mapa público sigue navegable.

**Evidencia.** Estado UI anonimizado, método de simulación y ausencia de controles mutadores.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-CAMP-01 — Banner y roster de ambas campañas (P)

**Objetivo.** Identificar inequívocamente el destino administrativo de una escritura.

**Precondiciones.** Administración autorizada y campañas activas Castigo Divino/Un aliento menos.

**Pasos.** 1. Lee banner **Contexto administrativo**, nombre y selector **Campaña administrativa**. 2. Selecciona Castigo Divino y lee roster. 3. Selecciona Un aliento menos y vuelve a leer. 4. Compara el texto de campaña pública visible y su aviso de divergencia. 5. Comprueba anuncio accesible del cambio (región de estado).

**Resultado esperado.** Castigo Divino = Ura y Skade, sin Veyra. Un aliento menos = Veyra, sin Ura ni Skade. El nombre legible y contexto permanecen visibles; si público y admin divergen, el banner declara explícitamente qué campaña recibirá ediciones. Ningún jugador ajeno aparece como referent.

**Evidencia.** Dos capturas de roster/banner (sin información Master).

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-CAMP-02 — Cambio limpio A ↔ B (P)

**Objetivo.** Invalidar por completo el contenido dependiente de campaña.

**Precondiciones.** Sin editores ni notas pendientes; datos de lectura en ambas campañas.

**Pasos.** 1. En A revisa roster, entidades, categorías/tags, aliases y bandeja de solicitudes (si existen). 2. Cambia a B. 3. Revisa las mismas secciones y el selector de targets de **Relaciones con otras entidades**. 4. Regresa a A y repite.

**Resultado esperado.** El contexto no cambia parcialmente; roster, lista de entidades, referencias de aliases, relaciones y bandeja corresponden exclusivamente a la campaña confirmada. Las fichas o confirmaciones antiguas no continúan abiertas bajo el banner nuevo. Los registros de **nombres geográficos físicos** son globales, pero cualquier referencia de entidad vinculada se invalida y se obtiene de nuevo para el contexto actual.

**Evidencia.** Banner + selección + lista tras cada transición.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-CAMP-03 — Borrador sin guardar: cancelar cambio (P)

**Objetivo.** Proteger el trabajo local al cancelar.

**Precondiciones.** Formulario editable en A. Solo se escribe texto local, sin pulsar Guardar.

**Pasos.** 1. Introduce una modificación claramente identificable en descripción o nota administrativa. 2. Intenta pasar de A a B. 3. En la confirmación elige **Cancelar**. 4. Inspecciona campaña, contenido del campo, banner y foco.

**Resultado esperado.** Permanece A, el borrador sigue íntegro, el foco vuelve a un control útil y el banner sigue indicando A; no se emite una escritura.

**Evidencia.** Valor de prueba no sensible antes/después y destino del foco.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-CAMP-04 — Borrador sin guardar: aceptar descarte (P)

**Objetivo.** Evitar fugas de borradores entre campañas.

**Precondiciones.** Como QA-CAMP-03, con un campo o nota sin guardar.

**Pasos.** 1. Solicita cambio A → B. 2. Acepta descartar. 3. Revisa banner, roster, entidades, referencias, relaciones y solicitudes. 4. Vuelve a abrir el editor para verificar que no se ha trasladado el texto pendiente.

**Resultado esperado.** La nueva campaña solo queda confirmada después de cargar el roster B; se limpia el borrador anterior y se recargan todas las áreas dependientes. No se guarda el texto sin confirmar ni queda bajo B.

**Evidencia.** Contexto final y ausencia del texto local.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-CAMP-05 — Fallo de carga del destino y rollback (C)

**Objetivo.** Comprobar rollback atómico de un cambio de contexto fallido.

**Precondiciones.** Fixture/local capaz de fallar únicamente la lectura del roster B; NO bloquear el backend de producción.

**Pasos.** 1. Con A operativa, prepara fallo controlado del roster destino B. 2. Cambia A → B y espera mensaje accesible. 3. Restablece el fixture. 4. Comprueba banner A, roster A, listas y selector; recarga en A si es necesario.

**Resultado esperado.** B nunca aparece confirmada con datos parciales de A; vuelve A y su roster utilizable. Un error de autorización continúa con su bloqueo de seguridad correspondiente.

**Evidencia.** Fixture empleado, texto de error, banner y roster recuperados.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-CAT-01 — Categorías, etiquetas, aliases y nombres geográficos (M)

**Objetivo.** Validar el ciclo editorial del catálogo real sin confundir recursos de campaña y geografía global.

**Precondiciones.** Dataset de QA autorizado con categoría, tag, entidad de prueba y nombre geográfico físico; limpieza acordada.

**Pasos.** 1. Abre cada recurso: **categorías**, **etiquetas**, **nombres alternativos de entidad**, **nombres geográficos** y sus aliases si están disponibles. 2. Crea un borrador y provoca una validación (nombre/slug inválido). 3. Corrige, guarda y edita. 4. Inspecciona previsualización y publica solo si el dataset lo permite. 5. Archiva tras confirmación. 6. Revisa que el archivado deje de comportarse como contenido activo.

**Resultado esperado.** IDs/slugs estables según historial de publicación, validaciones por campo y estados draft/published/archived visibles. Categorías, tags y aliases de entidad obedecen al scope admin; un **nombre geográfico físico es global**, aunque su posible referencia a una entidad debe corresponder a la campaña actual. Sin publicar no aparece como contenido público.

**Evidencia.** IDs no personales, estados antes/después, validación y visualización de preview.

**Limpieza.** Archivar registros publicados; eliminar físicamente solo borradores nunca publicados que el sistema permita y que no tengan dependencias, según autorización.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-CAT-02 — Bloqueos, conflictos y borrado excepcional (M)

**Objetivo.** Confirmar que un recurso referenciado no se elimina destructivamente.

**Precondiciones.** Fixtures de QA con relaciones publicadas y borrador nunca publicado.

**Pasos.** 1. Intenta archivar un recurso que soporte una relación publicada. 2. Observa confirmación/bloqueo. 3. Fuerza una edición obsoleta con dos pestañas de prueba si existe fixture. 4. En borrador no publicado, observa disponibilidad de eliminación física y sus restricciones.

**Resultado esperado.** Conflicto o dependencia se explica con mensaje seguro; no hay cascadas ocultas ni sobrescritura silenciosa. La eliminación física solo se ofrece cuando nunca se publicó y no hay referencias que la impidan; archivado es la retirada ordinaria.

**Evidencia.** Mensajes normalizados y estado final consistente.

**Limpieza.** Revertir cambios de fixtures y archivar contenido publicado que corresponda.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-ENTITY-01 — Editor de tipos cartográficos (M)

**Objetivo.** Verificar geometría obligatoria y editor visual para character, location, mission y hazard.

**Precondiciones.** Dataset de QA, categoría válida y posición autorizada; no usar coordenadas ficticias en producción.

**Pasos.** 1. En **entidades** crea un borrador de cada tipo **Personaje**, **Emplazamiento**, **Misión** y **Peligro**. 2. Revisa **ID estable**, **Slug**, **Nombre principal (inglés)**, categoría, etiquetas, audiencia y resumen. 3. Para misión/peligro inspecciona **Estado funcional**. 4. Deja vacías X/Y o geometría y observa rechazo. 5. Introduce coordenadas válidas (X 0–3600; Y 0–2329) y usa **Geometría sobre el mapa** para punto y, donde aplique, **Área/Región**. 6. Comprueba preview y guarda borrador.

**Resultado esperado.** Ningún tipo espacial persiste sin coordenadas y geometría válidas; el punto o región y las coordenadas representativas son coherentes, con validación visible. El tipo de entidad no cambia después de crearla.

**Evidencia.** Preview con tipo y geometría, mensaje de coordenadas y estado draft.

**Limpieza.** Retirar borradores de QA únicamente si la política de borrado los permite.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-ENTITY-02 — Descubrimiento, publicación y archivado (M)

**Objetivo.** Ciclo de vida y visibilidad de la entidad.

**Precondiciones.** Entidad espacial válida en dataset de QA.

**Pasos.** 1. Compara **pin** y **search_only** mediante control de **Visibilidad cartográfica**. 2. Comprueba la preview antes de guardar. 3. Publica y verifica búsqueda/ficha pública exclusivamente en la campaña correspondiente; para search_only no esperes pin. 4. Archiva y comprueba retirada del contenido activo. 5. Verifica que un archived no sea target elegible para nuevas relaciones.

**Resultado esperado.** Guardar draft no publica; published se descubre conforme a visibilidad; search_only no crea marcador; archived no reaparece como activo.

**Evidencia.** Estados y captura del mapa/búsqueda de QA sin datos privados.

**Limpieza.** Archivar las entidades publicadas de prueba y verificar retirada.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-ORG-01 — Organización no cartográfica (P/M)

**Objetivo.** Diferenciar organizaciones de emplazamientos.

**Precondiciones.** P: organización existente legible; M: posibilidad de crear una en dataset autorizado.

**Pasos.** 1. Abre/crea tipo **Organización**. 2. Comprueba aviso literal **No cartográfica**. 3. Busca campos X, Y, geometría, selector de punto/región, canvas de mapa y marcadores. 4. Revisa descubrimiento, categoría, etiquetas, audiencia, lifecycle y **Relaciones con otras entidades**. 5. Busca controles de dispositions y player associations. 6. En M enlaza una sede física existente tipo location como relación genérica, sin asignar posición a organización.

**Resultado esperado.** No aparecen X/Y ni mapa, geometry o marker; descubrimiento está fijado a catálogo/búsqueda (search_only). No hay dispositions, player associations ni retrato cartográfico. Sí hay taxonomía, audiencia y relaciones genéricas compatibles. **La sede física se modela como una entidad location independiente relacionada con la organización**; nunca añadas coordenadas ficticias.

**Evidencia.** Editor/preview **No cartográfica** y ficha sin pan/zoom al abrir desde búsqueda.

**Limpieza.** M: retirar relación y archivar/retirar organización de QA conforme al ciclo permitido.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-ROSTER-01 — Personajes jugadores / referents (P/M)

**Objetivo.** Garantizar roster de campaña sin contaminación cruzada.

**Precondiciones.** Dos campañas y datos actuales; M solo si se editarán registros de roster en fixture.

**Pasos.** 1. Lee cabecera **Campañas y personajes jugadores**. 2. Compara roster de A y B. 3. Comprueba que cada jugador está ligado al personaje de su propia campaña. 4. En M revisa validación de nuevo jugador/orden/acento y cancela antes de guardar si no hay autorización adicional.

**Resultado esperado.** Solo Ura/Skade en A y Veyra en B; el roster no es una lista global de entidades ni de relaciones genéricas. No se puede elegir un referent de otra campaña.

**Evidencia.** Tabla breve A/B y captura anonimizada.

**Limpieza.** Si el fixture se modificó, devolver su roster editorial a estado inicial.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-DISP-01 — Dispositions (P/M)

**Objetivo.** Verificar disposiciones referidas únicamente a jugadores elegibles.

**Precondiciones.** Entidad espacial editable de A/B con roster; M si se guardan valores.

**Pasos.** 1. Abre **Relación con los personajes**. 2. En A verifica opciones Ura/Skade y ausencia de Veyra; en B verifica Veyra sin Ura/Skade. 3. Revisa los valores **ally / neutral / enemy** presentados con sus etiquetas. 4. Comprueba que la sección se distingue de **Relaciones con otras entidades**. 5. En M guarda y reabre una combinación autorizada.

**Resultado esperado.** Neutral es un valor válido de edición; solo el roster de campaña participa. Una organización nunca ofrece disposiciones. En el pin público pueden representarse solo ally/enemy aunque neutral se conserve en el editor.

**Evidencia.** Selectores de roster y valores, sin nombres Master.

**Limpieza.** Restaurar dispositions del fixture.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-ASSOC-01 — Player associations (P/M)

**Objetivo.** Separar las asociaciones jugador-entidad de disposiciones y relaciones genéricas.

**Precondiciones.** Entidad apta con controles de asociación y jugadores de la campaña.

**Pasos.** 1. Abre asociación de jugadores de una entidad apta. 2. Inspecciona candidatos en A y B, rechazando referencias cross-campaign. 3. Cambia campaña con panel abierto y observa cierre/recarga de controles. 4. Abre una organization y comprueba ausencia del bloque.

**Resultado esperado.** Candidatos solo de campaña administrativa; la transición desmonta asociaciones antiguas. Las organizaciones no participan. Una asociación no crea automáticamente una generic entity relation.

**Evidencia.** Capturas comparadas por campaña, sin datos privados.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-REL-01 — Relaciones genéricas y etiquetas orientadas (P/M)

**Objetivo.** Garantizar relaciones entre entidades same-campaign, separadas del roster.

**Precondiciones.** P: entidades ya relacionadas; M: fixtures con organization, location, character y, si es viable, dos organizaciones.

**Pasos.** 1. En el editor abre **Relaciones con otras entidades**, pulsa **Añadir relación** solo para inspeccionar candidatos (sin Guardar en P). 2. Confirma que cada opción identifica tipo y solo entidades activas de campaña. 3. En M guarda organization↔location, organization↔character y organization↔organization con dos etiquetas por extremo. 4. Abre cada extremo y compara la etiqueta que ve cada ficha. 5. Comprueba que una relación no se duplica al visitarla desde el otro lado.

**Resultado esperado.** Ambos extremos de la misma campaña; etiquetas orientadas correctamente en ambas fichas; relación única, independiente de dispositions y associations; tipo reconocible en el selector.

**Evidencia.** Pareja de fichas, etiquetas y nombre/tipo de targets.

**Limpieza.** Retirar relaciones de QA y archivar/retirar fixtures según autorización.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-REL-02 — Targets archivados y cross-campaign (P/M)

**Objetivo.** Impedir nuevas relaciones inválidas conservando historial legible.

**Precondiciones.** Fixtures con entidad archivada y relación histórica anterior; dos campañas.

**Pasos.** 1. Abre editor en A y enumera targets nuevos. 2. Verifica que ninguna entidad de B está disponible. 3. Comprueba que un target archivado no se ofrece para **nuevas** relaciones. 4. Abre una relación histórica conservada hacia target después archivado; observa representación en edición. 5. No intentes recrear el vínculo archivado.

**Resultado esperado.** Ni cross-campaign ni target archivado pueden elegirse para nuevas relaciones. Una relación histórica archivada sigue representada para no perderla al editar otros campos; su proyección pública puede ocultarse tras archivado.

**Evidencia.** Opciones de selector y representación histórica, sin guardar en P.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-REQ-01 — Bandeja, nota y rechazo (P/M)

**Objetivo.** Moderación confinada a la campaña de la solicitud.

**Precondiciones.** P: solicitudes legibles en su campaña; M: solicitud pending de fixture, sin remitentes reales.

**Pasos.** 1. En **solicitudes públicas** usa filtro **Pendientes**, orden por fecha y **Recargar solicitudes**. 2. Cambia de campaña y revisa que ninguna tarjeta anterior permanezca. 3. En M redacta **nota administrativa** opcional, pulsa **Rechazar**, inspecciona confirmación con campaña y confirma. 4. Reabre filtro **Rechazadas**.

**Resultado esperado.** Solo solicitudes de la campaña admin; el rechazo queda terminal y conserva nota/historial. **Necesita cambios** no es una acción existente. No hay datos de solicitudes accesibles a anon.

**Evidencia.** Estado pending→rejected en dataset de QA y contexto de campaña.

**Limpieza.** Las solicitudes terminales no se reabren ni borran por rutina; usar fixture descartable o restablecer dataset de QA por medios autorizados fuera del flujo editorial.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-REQ-02 — Conversión a borrador y publicación posterior (M)

**Objetivo.** Atomicidad y seguridad de una propuesta pública convertida.

**Precondiciones.** Solicitud pending legítima de un fixture en campaña A o B; no enviar solicitudes canary a producción.

**Pasos.** 1. En su campaña abre solicitud y **Confirmar conversión a borrador**. 2. Comprueba que **Crear borrador** no publica. 3. Abre el editor al que navega la interfaz; si falla apertura automática, recarga entidades **sin convertir otra vez**. 4. Revisa campaña, estado draft, audiencia public (no Master), nombre/descripción/posición y categoría vacía. 5. Inspecciona tags, dispositions, associations y relaciones vacías salvo edición posterior explícita. 6. Intenta publicar sin categoría y observa bloqueo; asigna categoría válida de la campaña antes de publicar en M. 7. Revisa solicitud **Convertidas** y comprueba que no puede reprocesarse.

**Resultado esperado.** Una única entidad draft en campaña original, public, sin categoría/tags/player data/relaciones inventadas. Publicación exige categoría; no hay conversión duplicada ni reuso de estado terminal.

**Evidencia.** ID solicitud→borrador, estados, mensaje de validación y campaña (sin datos personales).

**Limpieza.** Mantener historial terminal; archivar contenido de prueba publicado, o restablecer fixture conforme al protocolo del entorno.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-REQ-03 — Nota de moderación pendiente y cambio de campaña (P)

**Objetivo.** Incluir borradores de notas en la protección dirty de MAP-070.

**Precondiciones.** Solicitud pendiente de lectura en A; no se confirma ninguna moderación.

**Pasos.** 1. Escribe nota sin guardar. 2. Solicita A→B y **cancela**: la nota y A deben persistir. 3. Repite A→B y **acepta descartar**: se elimina nota local y se vacía bandeja A. 4. Regresa a A y comprueba que la nota descartada no reaparece. 5. Repite con logout si es seguro.

**Resultado esperado.** Cancel conserva foco/contexto/nota; aceptar descarta y recarga con B; logout/revocación purga notas no enviadas.

**Evidencia.** Nota de texto inocuo local y banner antes/después.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-PUBLIC-01 — Campaña pública A y administrativa B (P)

**Objetivo.** Verificar que el selector público nunca decide el destino de escritura administrativa.

**Precondiciones.** Ambas campañas activas; admin autorizado.

**Pasos.** 1. Selecciona **Castigo Divino** públicamente. 2. En administración elige **Un aliento menos**. 3. Lee línea **Campaña pública visible** en banner. 4. Abre formulario/editor administrativo sin guardar. 5. Cambia solo campaña pública y vuelve a leer banner/selector admin.

**Resultado esperado.** Texto de divergencia indica que la edición sigue afectando solo a Un aliento menos. La campaña admin no cambia al cambiar la pública; ninguna solicitud ni relación de A se interpreta como B.

**Evidencia.** Una captura conjunta de las dos selecciones (sin Master).

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-MASTER-01 — Cambio de campaña y purge Master (P/C)

**Objetivo.** Evitar persistencia de contenido privado tras switch, logout o revocación.

**Precondiciones.** Cuenta autorizada y datos Master en fixture seguro; capturas únicamente anonimizadas/privadas, nunca compartidas públicamente.

**Pasos.** 1. Activa **Master Mode** autorizado en A. 2. Abre ficha/búsqueda de un registro Master-only controlado. 3. Cambia a B y confirma que detalles, búsquedas y listas de A desaparecen. 4. Sal o revoca Master Mode. 5. Verifica que no queda ficha ni búsqueda Master-only abierta, incluso usando atrás/adelante. 6. Cierra sesión y revisa purge.

**Resultado esperado.** Nada Master de A sobrevive bajo B, al salir de Master o al revocar sesión; nunca se inserta información Master en snapshot o vista anónima.

**Evidencia.** Solo estados «detalle cerrado/búsqueda sin resultado» y procedimiento, sin nombres/contenido Master.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-NAV-01 — Search, deep links e historial (P)

**Objetivo.** Resolver cada entidad solo en su campaña.

**Precondiciones.** Slugs públicos conocidos de ambas campañas; usar identificadores no privados.

**Pasos.** 1. Busca una entidad de A y abre ficha. 2. Copia URL con **?campaign=...** y **?entity=...**, recarga y comprueba misma campaña/ficha. 3. Usa atrás/adelante. 4. Cambia a B manteniendo ficha de A abierta. 5. Intenta URL de entidad A con campaña B. 6. Busca organización publicada si existe y abre ficha.

**Resultado esperado.** Refresh/history coherentes; al salir de A se cierra/invalida su ficha y no hay fallback cross-campaign. Si entidad no existe en B, no se resuelve en A por accidente. Abrir organización no reubica el mapa.

**Evidencia.** URLs públicas sin datos privados, historial esperado y ausencia de fallback.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-DEG-01 — Offline/degraded sin caída de producción (C)

**Objetivo.** El atlas público es usable desde snapshot mientras admin falla cerrado.

**Precondiciones.** Entorno local, fixture o bloqueo de red en navegador de QA, sin provocar caída real de producción; snapshot v3 disponible.

**Pasos.** 1. Con sesión de QA controlada simula indisponibilidad pública/backend. 2. Refresca y usa catálogo, búsqueda, filtro y ficha sobre el snapshot. 3. Busca/abre organización del snapshot si hay alguna. 4. Intenta acceder a guardar admin y observa bloqueo, sin enviar mutaciones. 5. Revierte simulación y recarga.

**Resultado esperado.** Contenido público de snapshot utilizable, admin mutador bloqueado; no aparecen solicitudes/notas ni Master privados en snapshot. Una organización se abre sin pan/zoom ni marker. Si el snapshot no contiene organizaciones, registrar N/A para esa subcomprobación; nunca crear datos de producción.

**Evidencia.** Estado degraded/offline, ficha pública y botones inactivos, sin datos sensibles.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-RESP-01 — Responsive (P)

**Objetivo.** Usabilidad administrativa de pequeño a gran viewport.

**Precondiciones.** DevTools o dispositivos equivalentes, cuenta autorizada, sin guardar cambios.

**Pasos.** En cada ancho de la matriz, inspecciona banner, login, lista admin, editor, relaciones y moderación; desplázate verticalmente, prueba teclado y botón de cerrar.

| Ancho | Banner/login | Lista/editor | Relaciones/moderación |
| --- | --- | --- | --- |
| 320 px | [ ] | [ ] | [ ] |
| 390 px | [ ] | [ ] | [ ] |
| 430 px | [ ] | [ ] | [ ] |
| Desktop (>=1024 px) | [ ] | [ ] | [ ] |

**Resultado esperado.** Sin overflow horizontal funcional, botones críticos alcanzables, etiquetas legibles, controles/confirmaciones no tapados y contexto admin visible incluso con campaña distinta de la pública.

**Evidencia.** Capturas sin datos privados de 320/390/430/desktop y anotación del primer control bloqueado, si lo hay.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-A11Y-01 — Accesibilidad manual (P)

**Objetivo.** Operar las funciones principales sin ratón ni depender solo del color.

**Precondiciones.** Navegador con teclado; opciones forced colors/reduced motion cuando disponibles.

**Pasos.** 1. Navega con Tab/Shift+Tab y activa Administrar con Enter/Espacio. 2. Inspecciona foco inicial en login, etiquetas y errores asociados. 3. Abre/cierra confirmación de descarte o moderación con Escape/Cancelar sin mutar y observa restauración de foco. 4. Cambia campaña y verifica regiones de estado/aria-live (opcional lector de pantalla). 5. Prueba forced colors y prefers-reduced-motion cuando sea viable. 6. Distingue iconos/estados sin depender solo del color.

**Resultado esperado.** Orden y foco útiles; estados/cambios anunciables, confirmaciones comprensibles, labels explícitos y controles operables. No declarar pasada una prueba de lector de pantalla que no se hizo.

**Evidencia.** Secuencia de foco, modo de visualización y resultado de anuncio si efectivamente comprobado.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

### QA-SEC-01 — Seguridad observable (P/C)

**Objetivo.** Revisión negativa de fugas visibles, no pentest ni auditoría SQL.

**Precondiciones.** Navegación anónima, usuario no admin y cuenta autorizada en escenarios separados.

**Pasos.** 1. En anónimo verifica ausencia de bandeja, CRUD y lectura Master. 2. En no admin comprueba mutaciones inaccesibles. 3. Observa errores normalizados sin SQL ni constraints. 4. Examina UI y URL: no tokens administrativos ni service-role; no copies valores en evidencia. 5. Tras logout/switch, vuelve a buscar fichas de campaña anterior o Master. 6. En fixture simula revocación e inspecciona limpieza.

**Resultado esperado.** Sin controles operativos de escritura para anon/no admin, sin secretos en superficies visibles y sin contenido Master o cross-campaign después de transición.

**Evidencia.** Lista de comprobaciones con afirmación «sin filtración visible» y capturas redactadas.

**Resultado:** [ ] PASS [ ] FAIL [ ] BLOCKED [ ] N/A · Evidencia/observaciones/issue: __________________

## 4. Checklist de release gate y findings

Transcribe el estado de cada ID de la sección 3. Una línea sin evidencia permanece BLOCKED. El **quick smoke no reemplaza** esta checklist; MAP-072 debe decidir el gate con estos IDs y sus findings abiertos.

| ID estable | Garantía crítica | Carril | Estado / evidencia / issue |
| --- | --- | --- | --- |
| QA-AUTH-01 | Acceso, logout y foco | P | __________________ |
| QA-AUTH-02 | Autorización/expiración segura | P/C | __________________ |
| QA-CAMP-01 | Banner y roster A/B | P | __________________ |
| QA-CAMP-02 | Cambio limpio sin contaminación | P | __________________ |
| QA-CAMP-03 | Dirty cancelar | P | __________________ |
| QA-CAMP-04 | Dirty descartar | P | __________________ |
| QA-CAMP-05 | Rollback del cambio fallido | C | __________________ |
| QA-CAT-01 | Taxonomía, alias y geografía global | M | __________________ |
| QA-CAT-02 | Bloqueos y borrado excepcional | M | __________________ |
| QA-ENTITY-01 | Tipos espaciales y geometría | M | __________________ |
| QA-ENTITY-02 | Draft/publish/archive y visibilidad | M | __________________ |
| QA-ORG-01 | Organization no cartográfica | P/M | __________________ |
| QA-ROSTER-01 | Roster same-campaign | P/M | __________________ |
| QA-DISP-01 | Dispositions del roster | P/M | __________________ |
| QA-ASSOC-01 | Player associations | P/M | __________________ |
| QA-REL-01 | Relación genérica orientada | P/M | __________________ |
| QA-REL-02 | Archivadas y cross-campaign | P/M | __________________ |
| QA-REQ-01 | Bandeja, nota, rechazo | P/M | __________________ |
| QA-REQ-02 | Conversión una sola vez | M | __________________ |
| QA-REQ-03 | Nota dirty y switch | P | __________________ |
| QA-PUBLIC-01 | Público A / admin B | P | __________________ |
| QA-MASTER-01 | Master purge y switch | P/C | __________________ |
| QA-NAV-01 | Search, links, historia | P | __________________ |
| QA-DEG-01 | Snapshot offline, admin bloqueado | C | __________________ |
| QA-RESP-01 | 320/390/430/desktop | P | __________________ |
| QA-A11Y-01 | Teclado, foco, avisos y contraste | P | __________________ |
| QA-SEC-01 | Seguridad observable | P/C | __________________ |

**Resumen de sesión:** PASS ____ · FAIL ____ · BLOCKED ____ · N/A ____.

**Findings relevantes (ID, severidad, pasos, entorno/build, URL evidencia sin secretos):** ________________________________________________

**Decisión de QA manual:** [ ] sin regresiones importantes visibles [ ] bloqueada por findings [ ] incompleta/BLOCKED. **Revisor / fecha:** __________________.

## 5. Regeneración, límites y referencias

Desde la raíz del repositorio ejecuta:

~~~sh
node scripts/generate-admin-qa-pdf.mjs
node scripts/generate-admin-qa-pdf.mjs --check
~~~

El primer comando regenera **docs/map-071-admin-qa-guide.pdf** exclusivamente desde **docs/map-071-admin-qa-guide.md**. El segundo compara bytes y falla si el PDF versionado está desactualizado. No necesita navegador, aplicación propietaria, red ni dependencia adicional al bundle. El PDF usa tipografía estándar incrustada por referencia (Helvetica/Helvetica-Bold), texto seleccionable y páginas A4 con numeración; el Markdown conserva la fuente editorial.

**Límites de ejecución:** la guía documenta casos manuales, no acredita haberlos ejecutado ni autoriza mutaciones. Si no existen organizaciones, relaciones históricas o solicitudes de prueba, marca BLOCKED/N/A con motivo. No se requiere manipular datos reales, detener Supabase ni producir capturas de contenido Master. Un cambio futuro de contenido de campañas puede modificar las expectativas del roster actual sin cambiar el contrato multicampaña.

**Documentación de contraste:** [Auth](admin-auth.md), [Catálogo](admin-catalog.md), [Entidades](admin-map-entities.md), [Moderación](admin-public-request-moderation.md), [Separación de campañas](map-068-campaign-separation.md), [Organizaciones](map-069-nonspatial-organizations.md), [UX multicampaña](map-070-multicampaign-admin-ux.md), [Seguridad](security.md) y [Despliegue](deployment-and-rollback.md).

**Atlas público:** https://eduyube.github.io/castigo-divino-map/ — cualquier checklist de aprobación v1.1.1 pertenece a MAP-072, no a este documento.
