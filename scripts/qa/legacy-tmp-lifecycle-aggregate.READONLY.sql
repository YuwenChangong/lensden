-- Execute only under a fresh explicit Production read-only authorization.
-- $1 is a bounded text[] from the complete fixed bucket lifecycle response.
-- Literal left-prefix equality does not interpret %, _ or backslash as wildcards.
WITH legacy AS MATERIALIZED (
  SELECT m.storage_path,
    p.status = 'published' AND p.moderation_status = 'published' AS published,
    p.id IS NULL AS orphan
  FROM public.post_media m LEFT JOIN public.posts p ON p.id = m.post_id
  WHERE m.kind = 'video' AND left(m.storage_path, 4) = 'tmp/'
), prefixes AS (
  SELECT prefix, ordinal - 1 AS index
  FROM unnest($1::text[]) WITH ORDINALITY AS input(prefix, ordinal)
), matching AS (
  SELECT prefixes.index, count(legacy.storage_path) AS refs
  FROM prefixes LEFT JOIN legacy
    ON left(legacy.storage_path, length(prefixes.prefix)) = prefixes.prefix
  GROUP BY prefixes.index
)
SELECT (SELECT count(*) FROM legacy) AS total,
  (SELECT count(*) FROM legacy WHERE published) AS published,
  (SELECT count(*) FROM legacy WHERE orphan) AS orphan,
  coalesce((SELECT jsonb_agg(jsonb_build_object('index', index, 'refs', refs) ORDER BY index) FROM matching), '[]'::jsonb) AS matched;
