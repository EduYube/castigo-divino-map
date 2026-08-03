# Configuración del GitHub Project

Proyecto: `El Atlas de los Nuevos Dioses`

La conexión actual puede administrar repositorio e Issues, pero no campos ni vistas de GitHub Projects. Esta configuración se aplica manualmente una vez.

## Campos

- Status: Backlog, Ready, In progress, In review, Blocked, Done
- Priority: P0, P1, P2, P3
- Type: Research, Feature, Content, Chore, Bug, Documentation
- Area: Map, Data, Search, UI, Quality, Delivery, Governance
- Estimate: 1, 2, 3, 5, 8
- Target: Foundation, Beta 0.1, Post-beta

## Vistas

1. **Backlog** — tabla, agrupada por Status, ordenada por Priority.
2. **Beta 0.1** — tablero, filtro `Target: Beta 0.1`.
3. **Roadmap** — roadmap agrupado por Area.
4. **Bloqueos** — tabla, filtro `Status: Blocked`.
5. **Trabajo actual** — tablero, filtro de estados Ready a In review.

## Automatizaciones recomendadas

- Nuevo elemento → Backlog.
- Issue reabierta → Ready.
- Pull request vinculada → In review.
- Issue cerrada → Done.

## Convención de títulos

`MAP-XXX — Verbo y resultado`

Los números visibles de Issue de GitHub no sustituyen al identificador MAP incluido en el título.
