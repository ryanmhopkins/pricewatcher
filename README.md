# PlanSentry — competitor pricing and packaging intelligence

PlanSentry monitors public SaaS pricing pages and turns changes to prices, plans, packages, limits, features, and annual offers into structured competitive intelligence.

## Current architecture
- Public marketing site and authenticated static dashboard hosted by Vercel.
- Supabase Postgres stores monitors, snapshots, and detected changes.
- Supabase Edge Functions perform authenticated account operations, hardened page checks, scheduled monitoring, status reporting, email delivery, contact delivery, and signed screenshot access.
- Database tables have RLS enabled with no public policies; direct anon/browser table access is blocked.
- Supabase `pg_cron` runs the authenticated scheduler hourly; each monitor is checked when its configured cadence is due.
- Supabase Auth provides account access; Stripe Checkout and the customer portal provide subscription billing.

## Product behavior
- Add competitor + pricing URL.
- First snapshot is captured immediately.
- Scheduled and manual checks use SSRF protections, redirect validation, retry handling, challenge detection, and an optional browser-rendering fallback.
- Pricing-relevant text is normalized and hashed.
- Changed content creates structured price, plan, package, and annual-discount details plus line-level evidence.
- The dashboard includes competitor profiles, groups, tags, notes, a pricing matrix, visual history, thresholds, email alerts, webhooks, review state, health details, bulk actions, and JSON export.

## Plans
- Free: 3 monitors with daily or weekly schedules.
- Plus: up to 25 monitors with hourly through weekly schedules.
- Pro: unlimited monitors with hourly through weekly schedules.

## Operations
The public site is served at `/`, while the authenticated dashboard is served at `/app`. Operational health is available at `/status.html`. Production email is delivered from the verified `plansentry.com` domain, and subscriptions are managed through Stripe Checkout and the customer portal.
