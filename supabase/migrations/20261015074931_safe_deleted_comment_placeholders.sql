-- Sanitized ancestry projection, NOT a new SELECT policy on deleted bodies.
-- Callers provide at most the visible page's IDs; each seed is independently
-- revalidated against published comment/post and canonical-public circle scope.
begin;
create function public.deleted_comment_placeholders(target_post_id uuid, visible_comment_ids uuid[])
returns table (id uuid, post_id uuid, parent_id uuid, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with recursive ancestors as (
    select c.parent_id as ancestor_id, array[c.id] as visited, 1 as depth
    from public.comments c
    join public.posts p on p.id = c.post_id
    where c.post_id = target_post_id
      and cardinality(visible_comment_ids) between 1 and 1000
      and c.id = any(visible_comment_ids)
      and c.status = 'published' and c.moderation_status = 'published'
      and p.status = 'published' and p.moderation_status = 'published'
      and public.can_access_public_circle(p.circle_id)
      and c.parent_id is not null
    union all
    select parent.parent_id, a.visited || parent.id, a.depth + 1
    from ancestors a
    join public.comments parent on parent.id = a.ancestor_id and parent.post_id = target_post_id
    where parent.status = 'deleted' and parent.moderation_status = 'published'
      and a.depth < 32 and not parent.id = any(a.visited)
  )
  select distinct parent.id, parent.post_id, parent.parent_id, parent.created_at, parent.updated_at
  from ancestors a
  join public.comments parent on parent.id = a.ancestor_id and parent.post_id = target_post_id
  where parent.status = 'deleted' and parent.moderation_status = 'published'
    and not parent.id = any(a.visited)
  order by parent.created_at, parent.id
  limit 1000;
$$;
revoke all on function public.deleted_comment_placeholders(uuid, uuid[]) from public, service_role;
grant execute on function public.deleted_comment_placeholders(uuid, uuid[]) to anon, authenticated;
commit;
