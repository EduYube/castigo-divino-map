# El Atlas de los Nuevos Dioses

Aplicación web pública de **El Atlas de los Nuevos Dioses** para explorar Faerûn mediante mapa interactivo, campañas, búsqueda, filtros, capas, pines/regiones, fichas públicas, notas y solicitudes. La administración usa Supabase Auth y autorización PostgreSQL/RLS separada de la experiencia pública.

## v1.1

URL pública:

`https://eduyube.github.io/castigo-divino-map/`

**v1.1 (1.1.0)** consolida el trabajo de MAP-053 a MAP-065 sobre el baseline v1.0. Añade dominio multicampaña, selector y aislamiento por campaña, roster/asociaciones/disposiciones, clustering y spiderfy, geometría persistente y regiones, ficha desktop bajo el mapa, notas públicas con autoría declarada, misiones/peligros con lifecycle y control de capas.

MAP-066 es el gate de publicación: ensaya de forma reproducible la migración completa v1.0→v1.1 sin recreación manual, revalida seguridad/Modo Máster/multicampaña, ejecuta la regresión funcional y accesible acumulada, verifica versionado y mantiene rollback frontend + correcciones de DB forward-only.

El frontend es estático y se publica con GitHub Pages. El catálogo público se lee mediante la Data API de Supabase usando únicamente la URL del proyecto y una clave `sb_publishable_*`; si Supabase no responde, la aplicación conserva una instantánea pública versionada y entra en modo degradado de solo lectura.

Documentación principal:

- [`docs/project-status.md`](docs/project-status.md)
- [`docs/map-066-release.md`](docs/map-066-release.md)
- [`docs/deployment-and-rollback.md`](docs/deployment-and-rollback.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/security.md`](docs/security.md)
- [`docs/data-model.md`](docs/data-model.md)
- [`docs/admin-auth.md`](docs/admin-auth.md)
- [`docs/public-pin-requests.md`](docs/public-pin-requests.md)

La definición histórica de v1.0 permanece en [`docs/map-052-release.md`](docs/map-052-release.md), la evidencia de Beta 0.2 en [`docs/map-030-release.md`](docs/map-030-release.md), y los documentos/fixtures/migraciones con nombres Beta conservan su nomenclatura cuando forma parte de un contrato o de la historia del proyecto.

## Requisitos

- Node.js 22.12 o posterior.
- npm 10 o posterior.

```bash
npm ci
npx playwright install --with-deps chromium firefox webkit
```

## Desarrollo local

```bash
npm run dev
```

Build ordinario:

```bash
npm run build
npm run preview
```

Los builds ejecutan `npm run verify:release-version`, que exige coherencia entre `package.json`, `package-lock.json`, UI, smoke de Pages y estado documental.

## GitHub Pages

El modo `pages` deriva el nombre del repositorio y usa `/castigo-divino-map/` como base:

```bash
npm run build:pages
npm run verify:build
npm run test:e2e:pages
```

`tests/deployment/pages-smoke.spec.ts` puede ejecutarse contra el preview local o, cuando `PAGES_URL` está definido, contra la URL realmente publicada.

## Datos públicos y Supabase

El contrato estable de v1.1 separa:

- campaña y catálogo público por campaña;
- geografía física global compartida;
- estado editorial `draft | published | archived`;
- audiencia `public | master`;
- sesión administrativa autenticada y Modo Máster efímero;
- solicitudes públicas privadas para visitantes;
- notas públicas de jugador mediante RPC cerrada;
- snapshot público degradable de solo lectura.

La autoría de una nota pública de jugador identifica un personaje del roster declarado para la campaña, pero no equivale a un login criptográficamente verificado del jugador.

El navegador no usa credenciales privilegiadas. `service_role`, `sb_secret_*`, tokens de gestión, contraseñas de base de datos y connection strings con password están prohibidos en código, build, logs y artefactos.

La instantánea pública vive en:

`public/data/public-catalog.snapshot.json`

Comandos relacionados:

```bash
npm run snapshot:verify
npm run snapshot:verify:remote
npm run snapshot:generate
```

El workflow de Pages exige que la instantánea comprometida coincida exactamente con la proyección pública de Supabase antes de construir y desplegar.

## URLs públicas

La aplicación conserva el pathname de Pages y serializa estado mediante query string:

| Parámetro | Ejemplo | Significado |
|---|---|---|
| `campaign` | `campaign=castigo-divino` | campaña activa; la URL legacy sin parámetro sigue resolviendo la campaña inicial |
| `place` | `place=paso-de-demostracion` | lugar activo compatible con Beta 0.1 |
| `q` | `q=paso` | búsqueda pública |
| `category` | `category=lugares-destacados` | categoría repetible |
| `tag` | `tag=mountain-pass` | etiqueta repetible |
| `layers` | valor parcial canónico | capas visibles; se omite cuando todas están activas |
| `entity` | `entity=paso-de-demostracion` | ficha pública completa independiente |

No se requiere router de servidor ni reescritura de rutas. Back/Forward y reload conservan el estado público canónico.

## Mapa remoto

La imagen cartográfica se solicita exclusivamente a la fuente oficial remota:

`https://media.wizards.com/2015/images/dnd/resources/Sword-Coast-Map_LowRes.jpg`

El JPEG oficial no se almacena ni transforma en el repositorio, build, artefactos, releases o CDN propio. Si falla, la aplicación conserva controles, pines/regiones, fichas, búsqueda, filtros/capas y avisos legales sobre una superficie degradada.

## Calidad

El gate principal es GitHub Actions. Para reproducir las comprobaciones web:

```bash
npm run format:check
npm run verify:security
npm run verify:accessibility
npm run lint
npm run test
npm run build:pages
npm run verify:build
npm run report:build
npm run test:e2e
npm run test:e2e:pages
```

La validación de base de datos reconstruye Supabase local, parte también de baselines históricos, aplica migraciones, ejecuta lint SQL, pgTAP/RLS, Storage HTTP y concurrencia. MAP-066 incorpora el rehearsal transversal v1.0→v1.1:

```bash
npm run supabase:db:test:map066:upgrade
npm run supabase:db:validate
```

## CI y despliegue

`.github/workflows/ci.yml` valida cada PR hacia `master` y cada push a `master`. Tiene dos jobs obligatorios:

- **Build, quality and tests**: formato, credenciales, accesibilidad, lint, unitarios, versionado, snapshot, TypeScript/build Pages, auditoría, métricas, E2E y smoke local;
- **Supabase migrations, lint and RLS tests**: rebuild, rehearsals, migraciones, lint, pgTAP/RLS, Storage y concurrencia.

`.github/workflows/pages.yml` solo despliega automáticamente después de una CI verde sobre `master`. El workflow:

1. resuelve el SHA exacto validado;
2. verifica snapshot público contra Supabase;
3. reconstruye y audita `dist`;
4. ejecuta smoke local;
5. publica exclusivamente `dist` en GitHub Pages;
6. ejecuta smoke contra la URL publicada;
7. registra `github-pages/deployment` sobre el SHA desplegado.

Los valores `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` son configuración pública de navegador. Las Repository Variables pueden sobrescribir los valores públicos de producción documentados en el workflow; no se usan secretos privilegiados para Pages.

## Rollback

El rollback no reescribe `master` ni borra datos de producción. Ante una regresión de frontend:

1. identificar el último SHA publicado y validado;
2. crear una rama desde `master`;
3. revertir mediante `git revert`;
4. abrir y validar una PR nueva;
5. fusionar y dejar que CI + Pages desplieguen el revert;
6. verificar `github-pages/deployment` y el smoke publicado.

Las migraciones de base de datos son forward-only. No se renombran ni reescriben migraciones históricas ya aplicadas para alinear timestamps remotos. Si frontend y base quedan desalineados, se prioriza desplegar un frontend compatible o una migración correctiva nueva hacia delante que preserve datos e identidades.

Consulta [`docs/deployment-and-rollback.md`](docs/deployment-and-rollback.md) para el procedimiento coordinado, [`docs/map-066-release.md`](docs/map-066-release.md) para v1.1, [`docs/map-052-release.md`](docs/map-052-release.md) para el baseline histórico v1.0 y [`docs/map-030-release.md`](docs/map-030-release.md) para la evidencia histórica de Beta 0.2.

## Licencia y contenido de fans

El Atlas es contenido de fans no oficial. La aplicación enlaza la Política de contenido de fans y mantiene la atribución de la cartografía. Todo contenido público del repositorio, Issues, PRs, builds y snapshot debe considerarse publicable y no debe contener información privada de campaña ni credenciales.
