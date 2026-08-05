# ADR 0002 — Usar Supabase desde el navegador con clave publicable y RLS autoritativa

- Estado: Aceptada
- Fecha: 2026-08-04
- Issue: MAP-013 / #32

## Contexto

GitHub Pages solo puede servir una aplicación estática. La Beta 0.2 necesita lectura pública sin login y escritura para un único administrador. Supabase permite conectar un navegador a Data API y Auth con una clave publicable, siempre que PostgreSQL aplique Row Level Security.

Una clave publicable es recuperable desde cualquier bundle. Una clave secreta o la clave heredada `service_role` tiene privilegios elevados y puede eludir RLS. Ocultar botones o rutas administrativas en el frontend tampoco impide llamadas manuales.

## Decisión

El frontend creará un cliente Supabase con:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY`;
- sesión de usuario cuando el administrador se autentique.

La clave publicable se considera pública. No concede permisos por sí misma: una petición sin sesión opera como `anon`; una petición con sesión opera como `authenticated`.

RLS y las restricciones SQL serán la barrera definitiva. Todas las tablas expuestas tendrán RLS y grants mínimos. La lectura pública se limitará a filas publicadas.

La autenticación administrativa usará correo y contraseña con registro público deshabilitado. Estar autenticado no bastará para escribir. Una lista blanca `private.admin_users` y una función segura `private.is_admin()` identificarán al administrador autorizado en las políticas.

La clave `sb_secret_...`, `service_role`, contraseñas, tokens de gestión y sesiones nunca se incluirán en el navegador, repositorio, Pages o artefactos.

## Consecuencias positivas

- Mantiene GitHub Pages sin introducir un servidor propio.
- Permite lectura pública directa y autenticación administrativa.
- Centraliza autorización en PostgreSQL y resiste manipulación del cliente.
- La clave visible puede rotarse sin tratarla como secreto.
- Un usuario Auth creado por error no obtiene permisos administrativos.

## Consecuencias negativas

- La corrección de las políticas RLS es crítica.
- La sesión de una SPA es accesible a JavaScript y aumenta el impacto de XSS.
- Cada tabla, vista, relación y RPC necesita pruebas positivas y negativas.
- La disponibilidad del flujo administrativo depende de Supabase.

## Alternativas consideradas

### Incluir `service_role` en el frontend

Rechazada. Elude RLS y convertiría cualquier visitante en operador privilegiado.

### Autorizar solo ocultando controles

Rechazada. El navegador es manipulable y las llamadas pueden reproducirse fuera de la UI.

### Autorizar por `raw_user_meta_data`

Rechazada. El usuario puede modificar ese espacio de metadata y no es adecuado para autorización.

### Construir un backend propio

Rechazada para Beta 0.2. Aumentaría operación y despliegue sin aportar una necesidad que Supabase + RLS no cubra.

### Considerar administrador a cualquier usuario autenticado

Rechazada. Un alta accidental, anónima o futura obtendría permisos de escritura.

## Condiciones de revisión

- se añade más de un rol administrativo;
- se introducen jugadores autenticados;
- se requiere acceso privado a notas de campaña;
- la aplicación deja GitHub Pages y adopta un backend con cookies HTTP-only;
- se detecta una limitación de RLS que exija una API intermedia.

## Fuentes oficiales

- <https://supabase.com/docs/guides/getting-started/api-keys>
- <https://supabase.com/docs/guides/database/postgres/row-level-security>
- <https://supabase.com/docs/guides/auth>
