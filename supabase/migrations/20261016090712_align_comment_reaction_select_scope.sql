-- Align only the legacy SELECT branch; preserve its identity and all write rules.
-- Production release dependency: run BEFORE 20261015072723 restores SELECT.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '8s';
SET LOCAL search_path = pg_catalog, public;
DO $align$
DECLARE
  accessible pg_catalog.pg_policy%ROWTYPE;
  legacy pg_catalog.pg_policy%ROWTYPE;
  expected_roles oid[];
  expected_using constant text := 'can_access_public_comment_read_target(comment_id)';
  legacy_using constant text := '(EXISTS(SELECT1FROMcommentscWHERE((c.id=comment_reactions.comment_id)AND(c.status=''published''::comment_status))))';
BEGIN
  SELECT array_agg(oid ORDER BY oid) INTO expected_roles
    FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated');
  IF cardinality(expected_roles)<>2 OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid=pg_catalog.to_regclass('public.comment_reactions')
      AND relrowsecurity AND NOT relforcerowsecurity
      AND relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres')
  ) THEN RAISE EXCEPTION 'REACTION_ALIGNMENT_TABLE_DRIFT'; END IF;
  SELECT * INTO accessible FROM pg_catalog.pg_policy
    WHERE polrelid='public.comment_reactions'::regclass
      AND polname='comment_reactions_select_accessible';
  IF NOT FOUND OR accessible.polcmd<>'r' OR NOT accessible.polpermissive
    OR (SELECT array_agg(x ORDER BY x) FROM unnest(accessible.polroles) x)
       IS DISTINCT FROM expected_roles
    OR pg_catalog.pg_get_expr(accessible.polqual,accessible.polrelid)<>expected_using
    OR accessible.polwithcheck IS NOT NULL
  THEN RAISE EXCEPTION 'REACTION_ALIGNMENT_ACCESSIBLE_DRIFT'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policy
    WHERE polrelid='public.comment_reactions'::regclass AND polcmd IN ('r','*')
      AND polname NOT IN ('comment_reactions_select_accessible','comment_reactions_select_public'))
  THEN RAISE EXCEPTION 'REACTION_ALIGNMENT_UNREVIEWED_POLICY'; END IF;
  SELECT * INTO legacy FROM pg_catalog.pg_policy
    WHERE polrelid='public.comment_reactions'::regclass
      AND polname='comment_reactions_select_public';
  -- Canonical clean databases already have only the accessible branch.
  IF NOT FOUND THEN RETURN; END IF;
  IF legacy.polcmd<>'r' OR NOT legacy.polpermissive
    OR (SELECT array_agg(x ORDER BY x) FROM unnest(legacy.polroles) x)
       IS DISTINCT FROM expected_roles
    OR legacy.polwithcheck IS NOT NULL
    OR (pg_catalog.pg_get_expr(legacy.polqual,legacy.polrelid)<>expected_using
      AND pg_catalog.regexp_replace(pg_catalog.pg_get_expr(legacy.polqual,legacy.polrelid),
          '[[:space:]]','','g')<>legacy_using)
  THEN RAISE EXCEPTION 'REACTION_ALIGNMENT_LEGACY_DRIFT'; END IF;
  IF pg_catalog.pg_get_expr(legacy.polqual,legacy.polrelid)<>expected_using THEN
    ALTER POLICY comment_reactions_select_public ON public.comment_reactions
      USING (public.can_access_public_comment_read_target(comment_id));
  END IF;
END
$align$;
COMMIT;
