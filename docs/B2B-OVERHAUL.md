# PlanSentry B2B overhaul — implementation brief

Status: proposed changes on feature branch; do not merge without verification.

## Positioning
PlanSentry is a competitive pricing and packaging intelligence workspace for SaaS product, growth, and pricing teams. The Chrome extension is an optional capture assistant, not the entire product.

## Product principles
1. Evidence first: show the exact previous and current value, source URL, observation time, and snapshot for every material alert.
2. Trust before AI: avoid unsupported interpretation, mark ambiguous changes for review.
3. Actionable overview: new changes, failed checks, coverage, and competitor comparison above decorative charts.
4. Fast activation: sign up → add public pricing URL → first snapshot → configure notifications.
5. Professional accessibility: keyboard navigation, visible focus, responsive tables, AA contrast, reduced motion, explicit empty/error/loading states.

## Information architecture
- Overview: monitoring health, recent material changes, review queue
- Competitors: searchable directory, individual competitor profile and snapshots
- Changes: filtered feed, before/after evidence, review and dismiss
- Compare: normalized plan/feature matrix with source and freshness labels
- Alerts: email/webhook destinations, thresholds, digest frequency
- Settings: workspace, team (future), usage, billing, security

## Initial scope (P0)
- Test production onboarding, first capture, recurring check, alert delivery, and cancellation.
- Audit Supabase RLS, SSRF/redirect checks, edge-function authentication, secrets, and billing webhook verification.
- Add reliable monitoring success/error instrumentation; distinguish blocked/unsupported pages.
- Reconcile marketing homepage and dashboard with one B2B product promise.
- Test mobile layout, keyboard navigation, focus, empty/error states.

## Next scope (P1)
- Rebuild overview, directory, change details, and comparison matrix using shared tokens.
- Add change severity, review status, false-positive feedback and digest controls.
- Add trial-to-paid funnel instrumentation without sending customer pricing-page content to analytics.

## Design system
- Light default; optional dark.
- Neutral background and white panels; one restrained blue accent.
- Type: system sans, tabular numbers for prices; 8px spacing scale.
- Compact, readable tables; persistent left navigation on desktop, collapsible navigation on small screens.
- Reuse interaction patterns from Linear, Stripe Dashboard, Attio, and Mobbin research; avoid copying assets.

## Billing guardrails
- Dedicated PlanSentry Stripe account holds the approved Growth $19 monthly and Business $49 monthly prices.
- Free allows 3 monitors, Growth 25, and Business 100. Legacy Pro subscribers retain their prior allowance.
- No unlimited-monitor promise before cost measurements.
- Preserve current customer entitlements; test checkout, webhook idempotency, portal, upgrades, downgrades, and cancellation in test mode before live.

## Release gates
- Pricing copy may be published while paid checkout remains disabled. Enable live checkout only after the subscription lifecycle is verified end to end.
- Confirm existing account and monitoring data remain intact.
- No secrets in commits, PRs, or logs.
- Pilot with 5 paying organizations and monitor check-success rate, false-positive rate, activation, and retention.
