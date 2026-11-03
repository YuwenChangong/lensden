-- Non-overwriting baseline adoption of the reviewed five-purpose quota RPC.
-- Existing matches: metadata assertions only. Missing on clean replay: create.
-- Normal migration tooling records this version only after a successful commit.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '8s';
DO $adopt$
DECLARE
  expected_body constant text := $baseline_body$
DECLARE
  v_now timestamptz := pg_catalog.now();
  v_window_seconds integer;
  v_max_attempts integer;
  v_upload_scope boolean := false;
  v_external_video_daily_bytes boolean := false;
  v_lock_material text;
  v_current_count bigint;
  v_current_bytes numeric;
BEGIN
  IF p_user_id IS NULL OR p_user_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rate-limit identity is required';
  END IF;

  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rate-limit IP hash is invalid';
  END IF;

  IF p_bytes IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rate-limit bytes are required';
  END IF;

  CASE p_purpose
    WHEN 'post_create' THEN
      v_max_attempts := 10;
      v_window_seconds := 3600;
      IF p_bytes <> 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'post_create bytes must be zero';
      END IF;
    WHEN 'comment_create' THEN
      v_max_attempts := 60;
      v_window_seconds := 3600;
      IF p_bytes <> 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'comment_create bytes must be zero';
      END IF;
    WHEN 'circle_create' THEN
      v_max_attempts := 5;
      v_window_seconds := 86400;
      IF p_bytes <> 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'circle_create bytes must be zero';
      END IF;
    WHEN 'post_media_upload' THEN
      v_max_attempts := 10;
      v_window_seconds := 3600;
      v_upload_scope := true;
      IF p_bytes < 1 OR p_bytes > 157286400 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'post media bytes are invalid';
      END IF;
    WHEN 'external_video_upload' THEN
      v_max_attempts := 10;
      v_window_seconds := 3600;
      v_upload_scope := true;
      v_external_video_daily_bytes := true;
      IF p_bytes < 1 OR p_bytes > 157286400 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'external video bytes are invalid';
      END IF;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rate-limit purpose is invalid';
  END CASE;

  -- Every current invocation has exactly one quota scope. Both external-video
  -- constraints use this same shared-IP lock, so their deterministic lock
  -- order is this one acquisition before any count, sum, or insert.
  IF v_upload_scope THEN
    v_lock_material := 'openglasshub:forum-rate-limit:v1:upload-ip:' || p_ip_hash;
  ELSE
    v_lock_material := 'openglasshub:forum-rate-limit:v1:user:' || p_purpose || ':' || p_user_id::text;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock_material, 0));

  IF v_upload_scope THEN
    SELECT pg_catalog.count(*)
      INTO v_current_count
      FROM public.forum_upload_attempts
      WHERE purpose IN ('post_media_upload', 'external_video_upload')
        AND ip_hash = p_ip_hash
        AND created_at >= v_now - pg_catalog.make_interval(secs => v_window_seconds);
  ELSE
    SELECT pg_catalog.count(*)
      INTO v_current_count
      FROM public.forum_upload_attempts
      WHERE purpose = p_purpose
        AND user_id = p_user_id
        AND created_at >= v_now - pg_catalog.make_interval(secs => v_window_seconds);
  END IF;

  IF v_current_count >= v_max_attempts THEN
    RETURN QUERY SELECT false, 'RATE_LIMITED'::text;
    RETURN;
  END IF;

  -- The V1 external-video daily ledger is this table only. Once the runtime
  -- migration cuts over, every row for this purpose is an accepted reservation
  -- inserted here by this RPC. It remains charged even if later upload/media
  -- work fails; no cross-table read, reservation status, or cleanup exists.
  IF v_external_video_daily_bytes THEN
    SELECT COALESCE(pg_catalog.sum(bytes), 0::numeric)
      INTO v_current_bytes
      FROM public.forum_upload_attempts
      WHERE purpose = 'external_video_upload'
        AND ip_hash = p_ip_hash
        AND created_at >= v_now - INTERVAL '24 hours';

    IF v_current_bytes > 314572800 - p_bytes THEN
      RETURN QUERY SELECT false, 'RATE_LIMITED'::text;
      RETURN;
    END IF;
  END IF;

  -- A function call is atomic in its caller transaction. Both external-video
  -- limits have passed under the same lock before this one accepted-row insert.
  -- Validation, permission, timeout, or insert failure rolls back the call and
  -- releases the transaction lock without recording an accepted attempt.
  INSERT INTO public.forum_upload_attempts (user_id, ip_hash, bytes, purpose, created_at)
  VALUES (p_user_id, p_ip_hash, p_bytes, p_purpose, v_now);

  RETURN QUERY SELECT true, 'ALLOWED'::text;
END;
$baseline_body$;
  existing_count integer;
  target pg_catalog.pg_proc%ROWTYPE;
  owner_id oid;
  service_id oid;
BEGIN
  SELECT oid INTO owner_id FROM pg_catalog.pg_roles WHERE rolname='postgres';
  SELECT oid INTO service_id FROM pg_catalog.pg_roles WHERE rolname='service_role';
  IF owner_id IS NULL OR service_id IS NULL
    OR pg_catalog.to_regclass('public.forum_upload_attempts') IS NULL THEN
    RAISE EXCEPTION 'RATE_LIMIT_BASELINE_DEPENDENCY_MISSING';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ('user_id','uuid'),('ip_hash','text'),('purpose','text'),
      ('bytes','bigint'),('created_at','timestamp with time zone')) required(name,kind)
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid='public.forum_upload_attempts'::regclass
        AND a.attname=required.name AND NOT a.attisdropped
        AND pg_catalog.format_type(a.atttypid,a.atttypmod)=required.kind)
  ) THEN RAISE EXCEPTION 'RATE_LIMIT_BASELINE_DEPENDENCY_DRIFT'; END IF;
  SELECT count(*) INTO existing_count
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='consume_forum_rate_limit';
  IF existing_count=0 THEN
    EXECUTE 'CREATE FUNCTION public.consume_forum_rate_limit(
      p_user_id uuid,p_ip_hash text,p_purpose text,p_bytes bigint)
      RETURNS TABLE(allowed boolean,decision text)
      LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
      SET search_path=pg_catalog,public,pg_temp
      SET lock_timeout=''1s'' SET statement_timeout=''3s'' AS '
      || pg_catalog.quote_literal(expected_body);
    ALTER FUNCTION public.consume_forum_rate_limit(uuid,text,text,bigint) OWNER TO postgres;
    REVOKE ALL ON FUNCTION public.consume_forum_rate_limit(uuid,text,text,bigint) FROM PUBLIC,anon,authenticated;
    GRANT EXECUTE ON FUNCTION public.consume_forum_rate_limit(uuid,text,text,bigint) TO service_role;
    existing_count := 1;
  END IF;
  SELECT * INTO target FROM pg_catalog.pg_proc
    WHERE oid=pg_catalog.to_regprocedure('public.consume_forum_rate_limit(uuid,text,text,bigint)');
  IF NOT FOUND OR existing_count<>1 THEN
    RAISE EXCEPTION 'RATE_LIMIT_BASELINE_DRIFT: identity or overload';
  END IF;
  IF target.proowner<>owner_id OR NOT target.prosecdef OR target.proleakproof
    OR target.proisstrict OR target.provolatile<>'v' OR target.proparallel<>'u'
    OR target.prokind<>'f' OR NOT target.proretset OR target.pronargdefaults<>0
    OR target.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
    OR pg_catalog.pg_get_function_identity_arguments(target.oid)<>
      'p_user_id uuid, p_ip_hash text, p_purpose text, p_bytes bigint'
    OR pg_catalog.pg_get_function_result(target.oid)<>'TABLE(allowed boolean, decision text)'
    OR (SELECT array_agg(x ORDER BY x) FROM unnest(target.proconfig) x) IS DISTINCT FROM
      ARRAY['lock_timeout=1s','search_path=pg_catalog, public, pg_temp','statement_timeout=3s']
    OR replace(target.prosrc,chr(13)||chr(10),chr(10)) <>
      replace(expected_body,chr(13)||chr(10),chr(10))
  THEN RAISE EXCEPTION 'RATE_LIMIT_BASELINE_DRIFT: implementation or security'; END IF;
  IF NOT pg_catalog.has_function_privilege('service_role',target.oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('anon',target.oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated',target.oid,'EXECUTE')
    OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(target.proacl,
      pg_catalog.acldefault('f',target.proowner))) a
      WHERE a.grantee NOT IN (owner_id,service_id) OR a.grantor<>owner_id
        OR a.privilege_type<>'EXECUTE' OR a.is_grantable)
  THEN RAISE EXCEPTION 'RATE_LIMIT_BASELINE_DRIFT: execute ACL'; END IF;
END
$adopt$;
COMMIT;
