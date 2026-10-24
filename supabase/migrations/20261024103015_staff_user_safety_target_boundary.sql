-- Candidate only. Apply after the bound staff-AAL2 capability migration,
-- preferably in the same reviewed transaction. No historical rows are rewritten.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.user_safety_states'::regclass
      and relrowsecurity and relowner = 'postgres'::regrole
  ) or not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.user_safety_events'::regclass
      and relrowsecurity and relowner = 'postgres'::regrole
  ) or not exists (
    select 1 from pg_proc where oid = 'public.is_moderator_or_admin()'::regprocedure
      and prosecdef and provolatile = 's' and proowner = 'postgres'::regrole
      and prolang = (select oid from pg_language where lanname = 'sql')
      and proconfig = array['search_path=public']::text[]
      and regexp_replace(lower(prosrc), '[[:space:]]', '', 'g') =
        'selectcoalesce((selectpublic.current_user_role()in(''moderator'',''admin''))and(selectauth.jwt()->>''aal'')=''aal2'',false);'
  ) then
    raise exception 'USER_SAFETY_AAL2_BASELINE_REQUIRED';
  end if;
  if to_regprocedure('public.enforce_user_safety_target_boundary()') is not null then
    raise exception 'USER_SAFETY_BOUNDARY_ALREADY_PRESENT';
  end if;
  if pg_has_role('authenticated', 'postgres', 'MEMBER') or pg_has_role('authenticated', 'service_role', 'MEMBER')
     or pg_has_role('anon', 'postgres', 'MEMBER') or pg_has_role('anon', 'service_role', 'MEMBER') then
    raise exception 'USER_SAFETY_UNSAFE_ROLE_MEMBERSHIP';
  end if;
end;
$$;

-- API mutations use the caller's authenticated client. Keep state INSERT/UPDATE
-- and event INSERT; no business path needs anonymous/service writes or deletion.
revoke insert, update, delete, truncate, references, trigger
  on public.user_safety_states, public.user_safety_events from public, anon, service_role;
revoke delete, truncate, references, trigger on public.user_safety_states from authenticated;
revoke update, delete, truncate, references, trigger on public.user_safety_events from authenticated;

create function public.enforce_user_safety_target_boundary()
returns trigger
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  target_role text;
  profile record;
begin
  -- No current_user=postgres bypass: SECURITY DEFINER changes current_user.
  -- JWT identity survives definer RPCs; role comes only from protected profiles.
  if tg_op = 'DELETE' or (tg_table_name = 'user_safety_events' and tg_op <> 'INSERT') then
    raise exception 'USER_SAFETY_DESTRUCTIVE_WRITE_FORBIDDEN' using errcode = '42501';
  end if;
  if actor is null or (auth.jwt()->>'role') is distinct from 'authenticated'
     or (auth.jwt()->>'aal') is distinct from 'aal2' or new.user_id = actor then
    raise exception 'USER_SAFETY_ACTOR_FORBIDDEN' using errcode = '42501';
  end if;

  -- Lock both role rows in UUID order so a concurrent role update cannot change
  -- the authorization target between this check and commit.
  for profile in
    select id, role from public.profiles where id in (actor, new.user_id) order by id for share
  loop
    if profile.id = actor then actor_role := profile.role::text;
    else target_role := profile.role::text;
    end if;
  end loop;
  if not coalesce(
    (actor_role = 'moderator' and target_role = 'user')
    or (actor_role = 'admin' and target_role in ('user', 'moderator')), false
  ) then
    raise exception 'USER_SAFETY_TARGET_FORBIDDEN' using errcode = '42501';
  end if;

  if tg_table_name = 'user_safety_states' then
    if tg_op = 'UPDATE' then
      if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
        raise exception 'USER_SAFETY_IDENTITY_IMMUTABLE' using errcode = '42501';
      end if;
    else
      new.created_at := statement_timestamp();
    end if;
    if new.updated_by is distinct from actor then
      raise exception 'USER_SAFETY_ACTOR_ATTRIBUTION_FORBIDDEN' using errcode = '42501';
    end if;
  else
    if new.actor_id is distinct from actor then
      raise exception 'USER_SAFETY_ACTOR_ATTRIBUTION_FORBIDDEN' using errcode = '42501';
    end if;
    new.created_at := statement_timestamp();
  end if;
  return new;
end;
$$;
alter function public.enforce_user_safety_target_boundary() owner to postgres;
revoke all on function public.enforce_user_safety_target_boundary() from public, anon, authenticated, service_role;

create trigger trg_user_safety_states_target_boundary
before insert or update or delete on public.user_safety_states
for each row execute function public.enforce_user_safety_target_boundary();
create trigger trg_user_safety_events_target_boundary
before insert or update or delete on public.user_safety_events
for each row execute function public.enforce_user_safety_target_boundary();

-- Reject inherited or column-level grants that the table REVOKEs did not close.
do $$
declare
  role_name text;
  target regclass;
begin
  foreach role_name in array array['anon', 'service_role'] loop
    foreach target in array array['public.user_safety_states'::regclass, 'public.user_safety_events'::regclass] loop
      if has_table_privilege(role_name, target, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         or exists (select 1 from pg_attribute where attrelid = target and attnum > 0 and not attisdropped
           and has_column_privilege(role_name, target, attnum, 'INSERT,UPDATE,REFERENCES')) then
        raise exception 'USER_SAFETY_EFFECTIVE_WRITE_GRANT_DRIFT';
      end if;
    end loop;
  end loop;
  if has_table_privilege('authenticated', 'public.user_safety_states', 'DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('authenticated', 'public.user_safety_events', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or exists (select 1 from pg_attribute where attrelid = 'public.user_safety_events'::regclass
       and attnum > 0 and not attisdropped and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE,REFERENCES')) then
    raise exception 'USER_SAFETY_EFFECTIVE_WRITE_GRANT_DRIFT';
  end if;
end;
$$;
