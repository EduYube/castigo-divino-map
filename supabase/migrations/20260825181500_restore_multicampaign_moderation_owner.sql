begin;

-- The temporary membership exists only to let the migration principal evolve
-- the function still owned by atlas_public_request_moderator. Remove it as soon
-- as the replacement has completed; runtime ownership and ACLs remain exactly
-- on the dedicated NOLOGIN role introduced by MAP-027.
revoke atlas_public_request_moderator from current_user;

commit;
