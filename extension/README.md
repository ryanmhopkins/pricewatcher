# PlanSentry Chrome extension (Manifest V3 MVP)

This Manifest V3 side-panel extension is the PlanSentry product. It uses PlanSentry's Supabase accounts and backend, while plans and billing are managed at plansentry.com. Clicking the pinned toolbar icon opens the persistent Chrome side panel.

## Load locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `extension` directory.
4. Open a public pricing page and select the PlanSentry toolbar button.

## Extension experience

- Sign in with an existing PlanSentry account.
- Track the current pricing page immediately or optionally give it a custom name.
- Open a public pricing page, then use the quick-add field or current-page action to select the exact prices to track.
- Search a compact list of tracked pages and glance at freshness or unreviewed changes.
- Hover, focus, or select a page to reveal its latest structured prices and two contextual actions.
- Detect the current HTTP(S) page and add it with an optional name or tag.
- Visit any tracked pricing page directly from the sidebar.
- Respect the backend's existing authentication, ownership checks, and subscription limits.

PlanSentry uses `activeTab` access only after the user invokes it on a page. It does not request blanket access to browsing activity or every website.
