# PriceWatcher — zero-dependency MVP

Single-purpose Micro-SaaS: watch SaaS pricing pages and alert when pricing-relevant content changes.

## Deploy
1. Create a Supabase project.
2. Run `supabase/schema.sql` in its SQL editor.
3. Push this folder to GitHub.
4. Import the repo into Vercel (Framework Preset: Other).
5. Add `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` environment variables.
6. Optional email alerts: add `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `ALERT_TO_EMAIL`.
7. Add `CRON_SECRET` in Vercel. Vercel sends it as a Bearer token to cron routes.

No npm install or build command is required.

## MVP behavior
- Add competitor + pricing URL.
- First snapshot is captured immediately.
- Daily cron rechecks every monitor.
- Only normalized pricing-relevant text is hashed.
- Changed content creates a line-level added/removed diff.
- Optional Resend email sends the detected diff.

## Deliberately not in v0.1
Authentication, billing, teams, AI summaries, browser rendering, queues, and advanced anti-noise rules.

## Before public launch
Add authentication/workspace ownership and SSRF protections. Some JS-heavy pricing pages will need a browser-rendering scraper later; the zero-dependency crawler is intentionally the fastest private-beta implementation.
