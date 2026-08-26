begin;

-- MAP-027 deliberately transferred the moderation RPC to a dedicated NOLOGIN
-- role. PostgreSQL only allows an owner (or a member of the owning role) to
-- CREATE OR REPLACE that function. Give the migration principal temporary role
-- membership so the following MAP-053 security migration can evolve the RPC
-- without changing its owner or widening its runtime EXECUTE surface.
grant atlas_public_request_moderator to current_user;

commit;
