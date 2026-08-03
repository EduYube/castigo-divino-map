# Acuerdo de trabajo

## Fuente de verdad

GitHub es la fuente de verdad permanente del proyecto. El código vive en el repositorio; las tareas en Issues; los cambios revisables en pull requests; el estado resumido en `docs/project-status.md`; y las decisiones arquitectónicas en ADR.

Las conversaciones de ChatGPT son espacios de trabajo. Ninguna decisión importante debe existir únicamente en un chat.

## Chat de dirección

El chat `00 — Dirección del proyecto` se usa para alcance, prioridades, bloqueos, decisiones transversales, estado general y selección de la siguiente Issue. No se usa normalmente para implementar una Issue completa.

## Un chat por Issue

Antes de empezar una Issue nueva, el asistente debe indicar que hay que crear un chat nuevo dentro del proyecto de ChatGPT.

Formato del título:

`MAP-XXX — Título breve`

El asistente proporcionará el título exacto y un prompt inicial autosuficiente. No puede crear chats por sí mismo.

## Cuándo separar un chat

También se avisará cuando el contexto sea demasiado grande, se inicie una investigación independiente, se mezclen dirección e implementación, o comience una fase distinta.

## Gestión del estado

El asistente crea y mantiene `docs/project-status.md`. Cada modificación real debe anunciarse en el chat con este formato:

```text
============================================================
ACTUALIZACIÓN DE LA DOCUMENTACIÓN DEL ESTADO DEL PROYECTO
============================================================

Archivo modificado:
docs/project-status.md

Cambios realizados:
- ...

Motivo:
...
```

## Cierre de una Issue

Una Issue solo se considera terminada cuando corresponda:

- criterios de aceptación cumplidos;
- pruebas ejecutadas;
- CI en verde;
- documentación sincronizada;
- pull request integrada o lista para integrar;
- Issue actualizada o cerrada;
- estado del proyecto revisado;
- siguiente Issue identificada.

El cierre debe incluir resumen, archivos afectados, pruebas, estado de Issue y PR, deuda pendiente, siguiente Issue y prompt de traspaso.

## Autonomía operativa

El asistente puede crear y modificar archivos, Issues, ramas, pull requests, pruebas, workflows, documentación y backlog; cerrar tareas completadas; eliminar archivos obsoletos recuperables; y fusionar cambios cuando cumplan los criterios acordados.

Requiere confirmación antes de eliminar el repositorio, hacerlo público, reescribir `master`, hacer force push sobre ramas compartidas, publicar secretos de campaña, introducir servicios de pago o cambiar sustancialmente el alcance o arquitectura.

## Convenciones

- Código y nombres técnicos: inglés.
- Issues y documentación funcional: castellano.
- Rama principal actual: `master`.
- Rama por Issue: `agent/map-XXX-descripcion`.
- Una pull request por unidad de trabajo.
- Desarrollo individual.
- Los cambios relevantes deben vincularse a una Issue.
