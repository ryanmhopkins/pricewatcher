-- Serialize checkout identity linking with subscription entitlement updates.
-- A late checkout event must never overwrite a verified paid plan with pending.
create or replace function public.link_plansentry_checkout(
  p_customer_id text,
  p_subscription_id text,
  p_user_id uuid,
  p_email text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement public.stripe_entitlements%rowtype;
begin
  insert into public.stripe_entitlements (
    stripe_customer_id, stripe_subscription_id, email, plan, subscription_status
  ) values (
    p_customer_id, p_subscription_id, p_email, 'free', 'pending'
  ) on conflict (stripe_customer_id) do nothing;

  select * into strict v_entitlement
  from public.stripe_entitlements
  where stripe_customer_id = p_customer_id
  for update;

  update public.user_accounts
  set stripe_customer_id = p_customer_id,
      stripe_subscription_id = coalesce(v_entitlement.stripe_subscription_id, p_subscription_id),
      stripe_price_id = v_entitlement.stripe_price_id,
      plan = v_entitlement.plan,
      subscription_status = v_entitlement.subscription_status,
      current_period_end = v_entitlement.current_period_end,
      updated_at = now()
  where (p_user_id is not null and user_id = p_user_id)
     or (p_user_id is null and stripe_customer_id = p_customer_id);
end;
$$;

revoke all on function public.link_plansentry_checkout(text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.link_plansentry_checkout(text,text,uuid,text) to service_role;
