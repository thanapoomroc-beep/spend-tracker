# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person (the owner), on an iPhone, using the app added to the Home Screen. Logs each expense right after paying, often one-handed and on the move. Checks a monthly overview occasionally and edits settings about once a month.

## Product Purpose

A personal Thai-language expense tracker whose core question is "วันนี้ใช้ได้อีกเท่าไหร่" (how much can I still spend today), so spending never exceeds the income left after fixed monthly items. Success: logging takes seconds, and the daily answer is always one glance away.

## Positioning

A daily allowance that stays stable through the day (today's spending is added back before dividing), built on per-month carry-forward settings for income, fixed items (financing / subscriptions), installments with term windows, due dates, and category budgets.

## Operating Context

- Single static `index.html` on GitHub Pages; PWA with a service worker for offline use.
- Data lives only in `localStorage['spendTrackerState']` on the device; backup is JSON export/import. iPhone Safari and the Home Screen app have separate storage.
- Cross-device sync (Supabase), slip reading and an iOS Shortcut are planned for v3b (see ROADMAP).

## Capabilities and Constraints

- Plain HTML/CSS/JS, no build step, no framework. Chart.js 4.5.0 from jsDelivr with SRI.
- All UI text in Thai. Terminology: `รายการประจำ` (fixed items), `งบ` (category budgets only), `รายได้`, `คงเหลือ`.
- Data changes are additive only; old backups must keep importing (`migrateState()`).
- Mobile-first at 375px: no horizontal scroll, inputs ≥ 16px, touch targets ≥ 44px.

## Product Principles

1. Logging a spend must be the fastest thing in the app.
2. The daily answer comes first; analysis is secondary and on demand.
3. Never lose the user's data; every structural change migrates.
4. One concept, one Thai term, everywhere.
5. Colour is never the only signal; status colours are reserved for status.

## Accessibility & Inclusion

WCAG 2.1 AA: labelled controls, 44px targets, pinch-zoom allowed, dialogs with role="dialog", keyboard and VoiceOver operable.
