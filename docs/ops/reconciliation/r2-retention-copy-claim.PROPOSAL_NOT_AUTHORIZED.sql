-- OFFLINE PROPOSAL ONLY. Not a formal migration; not executed or tested.
-- Application integration, independent review and separate migration approval
-- are required. Applying this table alone does NOT fix copy amplification.
-- One irreversible automatic copy opportunity per post, including failures.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '8s';

DO $precondition$
BEGIN
  IF current_user <> 'postgres'
    OR pg_catalog.to_regclass('public.posts') IS NULL
    OR pg_catalog.to_regclass('public.post_media') IS NULL
    OR pg_catalog.to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'RETENTION_CLAIM_DEPENDENCY_OR_OPERATOR_MISMATCH';
  END IF;
END;
$precondition$;

-- No IF NOT EXISTS, upsert, reset, lease expiry, cascading FK or automatic GC.
-- A deleted post/user must not silently release an already consumed claim.
CREATE TABLE public.post_media_r2_copy_claims (
  post_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  claim_id uuid NOT NULL UNIQUE DEFAULT pg_catalog.gen_random_uuid(),
  source_key text NOT NULL,
  mime_type text NOT NULL CHECK (
    mime_type IN ('video/mp4', 'video/webm', 'video/quicktime')
  ),
  retained_key text GENERATED ALWAYS AS (
    user_id::text || '/' || post_id::text || '/r2-retained-' || claim_id::text ||
    CASE mime_type
      WHEN 'video/mp4' THEN '.mp4'
      WHEN 'video/webm' THEN '.webm'
      WHEN 'video/quicktime' THEN '.mov'
    END
  ) STORED NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.statement_timestamp(),
  CONSTRAINT post_media_r2_claim_source CHECK (
    source_key ~ ('^tmp/' || user_id::text || '/' || post_id::text || '/[a-zA-Z0-9._-]{1,240}$')
    AND source_key NOT IN (
      'tmp/' || user_id::text || '/' || post_id::text || '/.',
      'tmp/' || user_id::text || '/' || post_id::text || '/..'
    )
  )
);

ALTER TABLE public.post_media_r2_copy_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media_r2_copy_claims FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.post_media_r2_copy_claims
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.post_media_r2_copy_claims TO authenticated;
GRANT INSERT (post_id, user_id, source_key, mime_type)
  ON TABLE public.post_media_r2_copy_claims TO authenticated;

CREATE POLICY post_media_r2_claim_select_self
  ON public.post_media_r2_copy_claims FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY post_media_r2_claim_insert_self
  ON public.post_media_r2_copy_claims FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_media_r2_copy_claims.post_id
        AND p.author_id = (SELECT auth.uid())
        AND p.status IN ('pending', 'published')
    )
  );

-- Reject unexpected default grants instead of inheriting a broader writer.
DO $acl$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c,
      LATERAL pg_catalog.aclexplode(c.relacl) a
    WHERE c.oid = 'public.post_media_r2_copy_claims'::regclass
      AND a.grantee NOT IN (
        c.relowner,
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
      )
  ) THEN
    RAISE EXCEPTION 'RETENTION_CLAIM_UNEXPECTED_DEFAULT_ACL';
  END IF;
END;
$acl$;
COMMIT;
