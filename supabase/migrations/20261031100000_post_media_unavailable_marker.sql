-- Nullable metadata preserves legacy identity and allows reversible unavailability.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '8s';
ALTER TABLE public.post_media ADD COLUMN unavailable_at timestamptz;
COMMENT ON COLUMN public.post_media.unavailable_at IS
  'Confirmed media unavailability observation; preserves the original media reference.';
COMMIT;
