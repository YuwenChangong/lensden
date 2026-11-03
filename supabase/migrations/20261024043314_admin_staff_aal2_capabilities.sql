-- Local candidate only. Production execution requires separate reviewed approval.
-- Restrict privileged staff branches, not ordinary ownership or public reads.
-- Preserve function OIDs, owners and ACLs; do not rewrite Storage policies.
do $$
declare
  target text;
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated' and (rolsuper or rolbypassrls)) then
    raise exception 'STAFF_AAL2_AUTHENTICATED_ROLE_UNSAFE';
  end if;
  foreach target in array array[
    'public.admin_circle_purge_preview_v1(uuid)', 'public.admin_purge_circle_v1(uuid)',
    'public.qa_grant_admin_role(uuid)', 'public.qa_revoke_admin_role(uuid)'
  ] loop
    if to_regprocedure(target) is not null
       and (has_function_privilege('authenticated', to_regprocedure(target), 'EXECUTE')
            or has_function_privilege('anon', to_regprocedure(target), 'EXECUTE')) then
      raise exception 'STAFF_AAL2_PRIVILEGED_RPC_GRANT_DRIFT';
    end if;
  end loop;
  if not exists (
    select 1 from pg_catalog.pg_proc
    where oid = to_regprocedure('public.is_moderator_or_admin()')
      and prosecdef and provolatile = 's' and prorettype = 'boolean'::regtype
      and proowner = 'postgres'::regrole and prolang = (select oid from pg_catalog.pg_language where lanname = 'sql')
      and proconfig = array['search_path=public']::text[]
      and regexp_replace(lower(prosrc), '[[:space:]]', '', 'g') =
        'selectcoalesce((selectpublic.current_user_role()in(''moderator'',''admin'')),false);'
  ) then
    raise exception 'STAFF_AAL2_BASELINE_DRIFT';
  end if;
  if to_regprocedure('public.is_catalog_admin()') is not null and not exists (
    select 1 from pg_catalog.pg_proc
    where oid = to_regprocedure('public.is_catalog_admin()')
      and prosecdef and provolatile = 's' and prorettype = 'boolean'::regtype
      and proowner = 'postgres'::regrole and prolang = (select oid from pg_catalog.pg_language where lanname = 'sql')
      and proconfig = array['search_path=public']::text[]
      and regexp_replace(lower(prosrc), '[[:space:]]', '', 'g') =
        'selectcoalesce((selectpublic.current_user_role()=''admin''),false);'
  ) then
    raise exception 'CATALOG_AAL2_BASELINE_DRIFT';
  end if;
end;
$$;

create or replace function public.is_moderator_or_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select public.current_user_role() in ('moderator', 'admin'))
    and (select auth.jwt()->>'aal') = 'aal2',
    false
  );
$$;

-- Catalog remains on hold. Only patch this capability if it already exists;
-- never introduce the held schema or new EXECUTE privileges incidentally.
do $$
begin
  if to_regprocedure('public.is_catalog_admin()') is not null then
    execute $ddl$
      create or replace function public.is_catalog_admin()
      returns boolean
      language sql stable security definer
      set search_path = public
      as $body$
        select coalesce(
          (select public.current_user_role() = 'admin')
          and (select auth.jwt()->>'aal') = 'aal2',
          false
        );
      $body$;
    $ddl$;
  end if;
end;
$$;
