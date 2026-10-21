-- INFRA #210: explicit Data API exposure for objects created by postgres.
-- Forward-only; existing table/column/RPC ACLs and all RLS policies remain intact.
-- Supabase 2026-10-30 behavior: creation alone must never expose an object.
-- REVOKE ALL also removes legacy TRUNCATE/REFERENCES/TRIGGER defaults from
-- *future* tables for service_role, without changing any existing object.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

-- PostgreSQL 17 applies built-in PUBLIC EXECUTE to functions globally.
-- A schema-local REVOKE cannot remove a globally granted default.
-- This owner-level revoke is needed for a fresh function probe to be safe;
-- it affects FUTURE functions created by postgres in other schemas as well,
-- not existing functions. Their migrations must explicitly grant EXECUTE.
-- Reference: PostgreSQL ALTER DEFAULT PRIVILEGES documentation.
alter default privileges for role postgres
  revoke execute on functions from public;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;

-- Do not grant on ALL TABLES/FUNCTIONS: existing explicit grants are already
-- established by the historical migrations and checked by 042 below.
-- RLS and grants remain separate barriers. No canonical data is changed.
