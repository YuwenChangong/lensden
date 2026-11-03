-- The forward privilege reconciliation revoked this API's intended access.
-- Restore only columns used by comment reads and the existing self-like toggle.
-- Existing RLS still requires a published comment/post and visible active circle;
-- writes still require auth.uid() = user_id. No UPDATE or service-role grant.
begin;
grant select (comment_id, user_id) on public.comment_reactions to anon;
grant select (id, comment_id, user_id, reaction_type) on public.comment_reactions to authenticated;
grant insert (comment_id, user_id, reaction_type) on public.comment_reactions to authenticated;
grant delete on public.comment_reactions to authenticated;
commit;
