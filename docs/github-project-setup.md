# Configuración del GitHub Project

Proyecto: `El Atlas de los Nuevos Dioses`

## Estado de configuración

Los campos personalizados y las vistas principales fueron creados manualmente. La conexión de ChatGPT administra repositorio, Issues, ramas y pull requests, pero no edita directamente campos personalizados o vistas de GitHub Projects.

La configuración reproducible vive en:

```text
scripts/configure-github-project.sh
scripts/configure-beta-0.2-project.sh
```

El primer script conserva la clasificación histórica de Beta 0.1. El segundo añade y clasifica MAP-013 a MAP-030.

## Campos

- Status: Backlog, Ready, In progress, In review, Blocked, Done
- Priority: P0, P1, P2, P3
- Type: Research, Feature, Content, Chore, Bug, Documentation
- Area: Map, Data, Search, UI, Quality, Delivery, Governance, Backend, Auth, Admin
- Estimate: 1, 2, 3, 5, 8
- Target: Foundation, Beta 0.1, Beta 0.2, Post-beta

Los colores son libres y las descripciones opcionales. Los nombres de campos y opciones sí deben coincidir exactamente con los scripts.

## Vistas

1. **Backlog** — tabla agrupada por Status y ordenada por Priority.
2. **Beta 0.1** — tablero con filtro `Target: Beta 0.1`.
3. **Beta 0.2** — tablero con filtro `Target: Beta 0.2`.
4. **Roadmap** — roadmap agrupado por Area.
5. **Bloqueos** — tabla con filtro `Status: Blocked`.
6. **Trabajo actual** — tablero con estados Ready, In progress e In review.

## Clasificación de Beta 0.2

| MAP | Issue | Status | Priority | Type | Area | Estimate | Target |
|---|---:|---|---|---|---|---:|---|
| MAP-013 | #32 | Ready | P0 | Research | Governance | 5 | Beta 0.2 |
| MAP-014 | #33 | Backlog | P0 | Feature | Backend | 8 | Beta 0.2 |
| MAP-015 | #34 | Backlog | P0 | Feature | Data | 8 | Beta 0.2 |
| MAP-016 | #35 | Backlog | P0 | Feature | Backend | 8 | Beta 0.2 |
| MAP-017 | #36 | Backlog | P0 | Feature | Auth | 5 | Beta 0.2 |
| MAP-018 | #37 | Backlog | P0 | Feature | Admin | 8 | Beta 0.2 |
| MAP-019 | #38 | Backlog | P0 | Feature | Admin | 8 | Beta 0.2 |
| MAP-020 | #39 | Backlog | P0 | Feature | Data | 5 | Beta 0.2 |
| MAP-021 | #40 | Backlog | P0 | Feature | Search | 5 | Beta 0.2 |
| MAP-022 | #41 | Backlog | P1 | Feature | Map | 5 | Beta 0.2 |
| MAP-023 | #42 | Backlog | P1 | Feature | UI | 3 | Beta 0.2 |
| MAP-024 | #43 | Backlog | P0 | Feature | UI | 5 | Beta 0.2 |
| MAP-025 | #44 | Backlog | P1 | Feature | UI | 3 | Beta 0.2 |
| MAP-026 | #45 | Backlog | P1 | Feature | UI | 5 | Beta 0.2 |
| MAP-027 | #46 | Backlog | P1 | Feature | Admin | 5 | Beta 0.2 |
| MAP-028 | #47 | Backlog | P0 | Chore | Data | 5 | Beta 0.2 |
| MAP-029 | #48 | Backlog | P0 | Chore | Quality | 8 | Beta 0.2 |
| MAP-030 | #49 | Backlog | P0 | Chore | Delivery | 5 | Beta 0.2 |

## Aplicar la clasificación

Requisitos locales:

- GitHub CLI (`gh`).
- Git Bash en Windows.
- Autenticación de GitHub CLI con scope `project`.

Desde la raíz del repositorio y dentro de Git Bash:

```bash
gh auth refresh -s project
git switch master
git pull origin master
./scripts/configure-beta-0.2-project.sh
```

El script valida campos y opciones antes de modificar el Project, añade las Issues si faltan y puede ejecutarse repetidamente.

## Automatizaciones recomendadas

- Nuevo elemento → Backlog.
- Issue reabierta → Ready.
- Pull request vinculada → In review.
- Issue cerrada → Done.

## Convención de títulos

`MAP-XXX — Verbo y resultado`

El número visible de Issue de GitHub no sustituye al identificador MAP del título.
