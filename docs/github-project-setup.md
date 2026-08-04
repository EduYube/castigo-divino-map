# Configuración del GitHub Project

Proyecto: `El Atlas de los Nuevos Dioses`

## Estado de configuración

Los campos personalizados y las vistas principales ya han sido creados manualmente en GitHub Projects.

La conexión de ChatGPT puede administrar el repositorio, las Issues, las ramas y las pull requests, pero actualmente no puede editar directamente los valores de los campos personalizados del Project. Para mantener una configuración reproducible se incluye el script:

```text
scripts/configure-github-project.sh
```

El script añade las Issues MAP-001 a MAP-011 al Project si todavía no están presentes y asigna todos sus campos de selección única.

## Campos

- Status: Backlog, Ready, In progress, In review, Blocked, Done
- Priority: P0, P1, P2, P3
- Type: Research, Feature, Content, Chore, Bug, Documentation
- Area: Map, Data, Search, UI, Quality, Delivery, Governance
- Estimate: 1, 2, 3, 5, 8
- Target: Foundation, Beta 0.1, Post-beta

Los colores de las opciones son una ayuda visual y no afectan a la automatización. Las descripciones son opcionales y no son necesarias para ejecutar el proyecto.

## Vistas

1. **Backlog** — tabla, agrupada por Status, ordenada por Priority.
2. **Beta 0.1** — tablero, filtro `Target: Beta 0.1`.
3. **Roadmap** — roadmap agrupado por Area.
4. **Bloqueos** — tabla, filtro `Status: Blocked`.
5. **Trabajo actual** — tablero, filtro de estados Ready a In review.

Durante la fase inicial, **Beta 0.1** y **Trabajo actual** pueden compartir contenido. La diferencia será útil cuando existan tareas de fases posteriores o un backlog mayor.

## Clasificación inicial

| Issue | Status | Priority | Type | Area | Estimate | Target |
|---|---|---|---|---|---:|---|
| MAP-001 | Done | P0 | Documentation | Governance | 3 | Foundation |
| MAP-002 | Ready | P0 | Research | Map | 3 | Beta 0.1 |
| MAP-003 | Ready | P0 | Chore | Quality | 5 | Beta 0.1 |
| MAP-004 | Backlog | P0 | Feature | Map | 8 | Beta 0.1 |
| MAP-005 | Backlog | P0 | Feature | Data | 5 | Beta 0.1 |
| MAP-006 | Backlog | P0 | Feature | UI | 8 | Beta 0.1 |
| MAP-007 | Backlog | P1 | Feature | Search | 5 | Beta 0.1 |
| MAP-008 | Backlog | P0 | Feature | Search | 5 | Beta 0.1 |
| MAP-009 | Backlog | P1 | Feature | UI | 3 | Beta 0.1 |
| MAP-010 | Backlog | P1 | Chore | Quality | 5 | Beta 0.1 |
| MAP-011 | Backlog | P0 | Chore | Delivery | 5 | Beta 0.1 |

## Aplicar la clasificación

Requisitos locales:

- GitHub CLI (`gh`).
- `jq`.
- Autenticación de GitHub CLI con acceso al repositorio y al Project.

Desde la raíz del repositorio:

```bash
gh auth refresh -s project
bash scripts/configure-github-project.sh
```

El script valida los nombres de todos los campos y opciones antes de modificar elementos. Puede volver a ejecutarse de forma segura para restaurar la clasificación acordada.

## Automatizaciones recomendadas

- Nuevo elemento → Backlog.
- Issue reabierta → Ready.
- Pull request vinculada → In review.
- Issue cerrada → Done.

## Convención de títulos

`MAP-XXX — Verbo y resultado`

Los números visibles de Issue de GitHub no sustituyen al identificador MAP incluido en el título.
