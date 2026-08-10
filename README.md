# PriceWatcher — zero-dependency MVP

Single-purpose Micro-SaaS: watch SaaS pricing pages and surface pricing-relevant changes.

## Current architecture
- Public marketing site and authenticated static dashboard hosted by Vercel.
- Supabase Postgres stores monitors, snapshots, and detected changes.
- `pricewatcher-api` Supabase Edge Function performs privileged database operations and pricing-page checks.
- Database tables have RLS enabled with no public policies; direct anon/browser table access is blocked.
- `pricewatcher-cron` Supabase Edge Function performs scheduled batch checks and rate-limits repeated invocations.
- Supabase `pg_cron` runs the daily check at 13:00 UTC.
- Supabase Auth provides account access; Stripe Checkout and the customer portal provide subscription billing.

## MVP behavior
- Add competitor + pricing URL.
- First snapshot is captured immediately.
- Daily scheduled check rechecks every monitor.
- Pricing-relevant text is normalized and hashed.
- Changed content creates a line-level added/removed diff.
- Manual “Check now” is available from the dashboard.

## Current limitations
Email notifications, teams, browser rendering, queues, and advanced anti-noise rules are not yet included.

## Operations
The public site is served at `/`, while the authenticated dashboard is served at `/app`. Some JavaScript-heavy pricing pages may eventually need a browser-rendering scraper. Add email notifications once a transactional email provider and domain are configured.
