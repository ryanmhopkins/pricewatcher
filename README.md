# PriceWatcher — zero-dependency MVP

Single-purpose Micro-SaaS: watch SaaS pricing pages and surface pricing-relevant changes.

## Current architecture
- Static dashboard + lightweight Vercel API routes.
- Supabase Postgres stores monitors, snapshots, and detected changes.
- `pricewatcher-api` Supabase Edge Function performs privileged database operations and pricing-page checks.
- Database tables have RLS enabled with no public policies; direct anon/browser table access is blocked.
- `pricewatcher-cron` Supabase Edge Function performs scheduled batch checks and rate-limits repeated invocations.
- Supabase `pg_cron` runs the daily check at 13:00 UTC.
- No Vercel environment variables or npm dependencies are required for the private-beta build.

## MVP behavior
- Add competitor + pricing URL.
- First snapshot is captured immediately.
- Daily scheduled check rechecks every monitor.
- Pricing-relevant text is normalized and hashed.
- Changed content creates a line-level added/removed diff.
- Manual “Check now” is available from the dashboard.

## Deliberately not in v0.1
Authentication, billing, teams, email notifications, AI summaries, browser rendering, queues, and advanced anti-noise rules.

## Before public launch
Add authentication/workspace ownership and stricter multi-tenant authorization. Some JavaScript-heavy pricing pages will eventually need a browser-rendering scraper. Add email notifications once a transactional email provider/domain is configured.
