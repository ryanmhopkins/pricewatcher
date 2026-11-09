-- Keep a durable, idempotent review queue for payment risk events.
create table if not exists public.billing_risk_events (
  event_id text primary key,
  event_type text not null check (event_type in (
    'charge.refunded',
    'charge.dispute.created',
    'radar.early_fraud_warning.created'
  )),
  stripe_customer_id text,
  stripe_charge_id text,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  event_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists billing_risk_events_unreviewed_idx
  on public.billing_risk_events (received_at desc)
  where reviewed_at is null;

alter table public.billing_risk_events enable row level security;
revoke all on public.billing_risk_events from anon, authenticated;
