-- SEPARATE OFFLINE PROPOSAL ONLY. Not executed, tested or a formal migration.
-- Must NOT accompany the copy-claim proposal without its own approval.
-- NOT VALID preserves existing rows for reads, NOT for UPDATE: updating a legacy
-- tmp video (even is_cover only) fails. Legacy update compatibility is BLOCKED.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '8s';

-- Additive constraint, not replacement of provenance functions or RLS policies.
-- Includes staff/service writes; does not restrict canonical Supabase fallback.
-- No existing object or media reference is rewritten, removed or recovered.
ALTER TABLE public.post_media
  ADD CONSTRAINT post_media_no_new_tmp_video
  CHECK (
    kind IS DISTINCT FROM 'video'
    OR (storage_path IS NOT NULL AND pg_catalog.left(storage_path, 4) <> 'tmp/')
  ) NOT VALID;

COMMIT;
