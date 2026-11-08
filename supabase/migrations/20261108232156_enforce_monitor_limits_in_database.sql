-- Enforce plan caps inside the insert transaction, including concurrent creates.
create schema if not exists billing_internal;
revoke all on schema billing_internal from public, anon, authenticated;

create or replace function billing_internal.enforce_monitor_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan text;
  v_limit integer;
  v_count integer;
begin
  if new.owner_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
  select plan into v_plan from public.user_accounts where user_id = new.owner_id;
  v_limit := case coalesce(v_plan, 'free')
    when 'pro' then null
    when 'growth' then 25
    when 'plus' then 25
    when 'business' then 100
    else 3
  end;
  if v_limit is null then return new; end if;

  select count(*) into v_count from public.monitors
    where owner_id = new.owner_id and id is distinct from new.id;
  if v_count >= v_limit then
    raise exception 'Monitor limit reached for current plan'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function billing_internal.enforce_monitor_limit() from public, anon, authenticated;
drop trigger if exists monitors_enforce_plan_limit on public.monitors;
create trigger monitors_enforce_plan_limit
before insert or update of owner_id on public.monitors
for each row execute function billing_internal.enforce_monitor_limit();
