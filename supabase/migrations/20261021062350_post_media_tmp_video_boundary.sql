-- Reject new lifecycle-expiring video bindings without invalidating legacy rows.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '8s';

DO $precondition$
BEGIN
  IF current_user <> 'postgres'
    OR pg_catalog.to_regclass('public.post_media') IS NULL THEN
    RAISE EXCEPTION 'TMP_VIDEO_GUARD_DEPENDENCY_OR_OPERATOR_MISMATCH';
  END IF;
END;
$precondition$;

CREATE FUNCTION public.guard_post_media_tmp_video_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.kind = 'video' AND pg_catalog.left(OLD.storage_path, 4) = 'tmp/' THEN
      -- Only non-identity metadata may change on grandfathered temporary videos.
      IF ROW(NEW.id, NEW.post_id, NEW.user_id, NEW.kind, NEW.storage_path)
        IS DISTINCT FROM ROW(OLD.id, OLD.post_id, OLD.user_id, OLD.kind, OLD.storage_path) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEGACY_TMP_VIDEO_IDENTITY_IMMUTABLE';
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.kind = 'video' AND pg_catalog.left(NEW.storage_path, 4) = 'tmp/' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'NEW_TMP_VIDEO_BINDING_REJECTED';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_post_media_tmp_video_binding()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER post_media_tmp_video_binding_guard
  BEFORE INSERT OR UPDATE ON public.post_media
  FOR EACH ROW EXECUTE FUNCTION public.guard_post_media_tmp_video_binding();
COMMIT;
