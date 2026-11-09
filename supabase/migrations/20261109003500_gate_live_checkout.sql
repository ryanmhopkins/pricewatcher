-- Keep live checkout closed until the payment and entitlement flow is verified.
alter table public.stripe_webhook_config
  add column if not exists plansentry_checkout_enabled boolean not null default false;
