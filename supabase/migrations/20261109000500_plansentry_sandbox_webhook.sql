-- A separate signing secret lets Stripe's sandbox prove webhook delivery.
-- Sandbox events are acknowledged without changing production entitlements.
alter table public.stripe_webhook_config
  add column if not exists plansentry_sandbox_endpoint_id text,
  add column if not exists plansentry_sandbox_signing_secret text;
