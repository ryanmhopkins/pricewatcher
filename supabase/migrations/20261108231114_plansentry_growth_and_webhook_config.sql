-- Preserve retired plans while accepting the new Growth entitlement.
alter table public.user_accounts drop constraint user_accounts_plan_check;
alter table public.user_accounts add constraint user_accounts_plan_check
  check (plan = any (array['free', 'plus', 'pro', 'growth', 'business']));

alter table public.stripe_entitlements drop constraint stripe_entitlements_plan_check;
alter table public.stripe_entitlements add constraint stripe_entitlements_plan_check
  check (plan = any (array['free', 'pro', 'growth', 'business']));

-- Keep the legacy webhook secret active for existing subscriptions.
alter table public.stripe_webhook_config add column if not exists plansentry_endpoint_id text;
alter table public.stripe_webhook_config add column if not exists plansentry_signing_secret text;
