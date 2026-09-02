-- MAP-064 phase 1: extend the existing functional entity class dimension.
-- Keep this enum-only migration separate because PostgreSQL does not permit newly
-- added enum values to be used safely by constraints/functions until commit.

begin;

alter type public.entity_type add value if not exists 'mission' after 'location';
alter type public.entity_type add value if not exists 'hazard' after 'mission';

commit;
