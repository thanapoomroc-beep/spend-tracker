# Spend Tracker — project guide for Claude

Personal Thai expense tracker PWA for one owner on iPhone (Home Screen app). Product truth lives in `PRODUCT.md`; read it first. Reply to the owner in Thai.

Live: https://thanapoomroc-beep.github.io/spend-tracker/ (GitHub Pages, repo `thanapoomroc-beep/spend-tracker`, branch `main`, served from repo root).

This folder is a git clone of that repo (`origin/main`). Commit and push from here; GitHub Pages deploys `main` automatically. `.gitignore` keeps local working files (`.impeccable/`, `v1-original.html`) out of the repo.

## How work is done here (always follow)

1. **Plan with skills before any code.**
   - **impeccable** for every UI/UX task: run its `context` step, then the fitting command (`shape` for new features/flows, `critique` for reviews, `colorize`/`layout`/`clarify`/`delight`/`polish` etc. for refinements). For `critique`, run its two assessments as separate sub-agents and finish with its questions.
   - **dataviz** before touching any chart, chart colour or palette; run its `validate_palette.js` instead of judging colours by eye.
   - **svg-designer** for icons/illustrations.
   - **scrutinize** on the plan *against the real code* before handing it off: trace the code paths it touches, list blockers/majors with `file:line`, and fold the fixes into the task. Show the owner the brief + scrutinize findings.
2. **Ask the owner** only for decisions that are genuinely theirs (product/visual choices); offer a recommended option.
3. **Implementation goes to a Sonnet sub-agent** (`model: sonnet`), never done inline for anything non-trivial. The prompt must be self-contained: files and line hints, the agreed design, the scrutinize fixes, hard constraints (below), "back up first", version bump, a concrete test checklist with numbers to verify, and "do NOT commit or push". Large features may be split into rounds; continue the same agent for follow-up rounds so it keeps its context.
4. **Verify independently** (main session) before reporting: rerun the tests, measure, look at screenshots. Report results honestly, including what was not tested.
5. **Push only when the owner says "push".** Then confirm the Pages build and check the live files/version.

## Keeping this file current

Update CLAUDE.md as the last step of a work round, in the same commit as the code, so it always matches what is live. Update it when:
1. A version ships or a phase finishes — refresh "Roadmap status" (done / next).
2. The owner makes a lasting decision — colours, terms, display formats (e.g. CNY as 元), feature behaviour (e.g. TTB repayments with no reminder).
3. The code structure changes — e.g. after the file split, record which code lives where and that new files go into the SW `ASSETS` list.
4. A new rule or constraint appears — e.g. a new data field that `migrateState()` must handle, a new no-go.
5. A costly gotcha is found — e.g. the Browser pane can't run service workers, iOS canvas text alignment, the npm cache permission issue.
6. The way of working changes — skills added/dropped, steps in the workflow.

Don't add: small bug fixes, single copy tweaks, in-progress task details, or anything already obvious from the code or git history. When the owner states a new lasting rule mid-task, add it right away.

## Hard constraints

- **Data safety:** everything is in `localStorage['spendTrackerState']`. Never rename the key. Data changes are additive only; every new field gets handled in `migrateState()`; old backups (v1 `settings` shape onward) must still import. Every localStorage access in try/catch. `entry.amount` is always baht (the owner's share).
- **Static, offline-first, zero third-party network:** no build step, no framework, no backend, no CDN, no web fonts. Chart.js 4.5.0 is self-hosted at `vendor/chart.umd.js` (unmodified; SRI sha384-iU8HYtnGQ8Cy4zl7gbNMOhsDTTKX02BTXptVP/vqAWIaTfM7isw76iyZCsjL2eVi). `grep -c "https://" index.html sw.js` must stay 0. The app is used in mainland China on filtered networks.
- **Service worker (`sw.js`):** stale-while-revalidate for every same-origin GET including navigation, 5 s network timeout, precache list `ASSETS` (add any new file there). On each release bump BOTH `<meta name="app-version">` in `index.html` and `VERSION` in `sw.js` to the same value.
- **Mobile:** 375px width, no horizontal scroll, inputs ≥ 16px, touch targets ≥ 44px, safe-area aware. On วันนี้ the save button (`#addEntryBtn`) must stay above the bottom tab bar at 375×812 — measure it after any change to that tab.
- **Accessibility:** labelled controls, radiogroups for chip/segment pickers, dialogs `role="dialog"` with focus management and Escape, colour never the only signal.

## Design system (keep consistent)

- Theme: near-black canvas `#0E0F11`, cards `#18191C`/`#222327`, borders `#2E3035`, text `#F2F2F4`/muted `#9A9CA3`. **Sand `#E8D3A8` = the UI accent** (primary buttons, selected chips/tabs) with dark text `#0E0F11`.
- Status colours are status-only: green `#5FB86B`, amber `#D9A441`, red `#E5726A` (small red text uses `--red-text`).
- **Ice cyan `#5CE1E6` is reserved for travel mode** (banner, ทริป toggle, trip hero tint, trip chart segment with diagonal hatch). Don't use it elsewhere.
- Category colours: 6 validated slots `#d95926 #3987e5 #199e70 #c98500 #d55181 #9085e9`; neutrals `อื่นๆ #C3C6CC`, `รายการประจำ #80838A`. Never generate new hues; colour follows the category, not its rank.
- Charts: recessive grid, one y-axis, 2px gaps, legends in text colours, doughnut total as an HTML overlay (iOS canvas text alignment is unreliable).
- App icon: allowance ring + ฿ (`icon.svg` → `icon-180/192/512.png`).

## Thai copy rules

Short, natural, like mainstream Thai apps. No `·`/`—` chaining facts inside sentences (`·` only as a separator in small muted metadata). Per-period amounts as `วันละ ฿X` / `เดือนละ ฿X`, never `฿X/วัน`. Confirm titles end with `ไหม?` and use short verb buttons. Avoid ไม่สามารถ / สำเร็จ / passive จะถูก. Terms: `รายการประจำ` (fixed items), `งบ` (category budgets only), `รายได้`, `คงเหลือ`, `ใช้จ่ายรายวัน`, `หมวด`. CNY is shown with a `元` suffix (e.g. `300元`); JPY keeps `¥`.

## App structure (single `index.html` today)

Four tabs via hash: `#today` (always the current month: hero, entry form, due card, recent), `#entries` (month list + search/filter), `#overview` (strip, budgets, payment breakdown, installments, charts), `#settings` (per-month settings, categories, payment methods, trips, budgets, backup). Trip summary page at `#trip/{id}`. Month-scoped views share `currentMonth`; วันนี้ never depends on it. `entriesForMonth()` returns non-trip entries only — trip entries are excluded from normal monthly maths; `คงเหลือ` subtracts only trips funded from income.

Planned refactor (after the China trip, before phase 4): split into `css/` + classic-script `js/` files and add `tests/`; keep it build-free and update the SW `ASSETS` list.

## Testing

- Local server: `python3 -m http.server 8765` in this folder (stop it afterwards).
- The in-app Browser pane is fine for layout/logic checks at 375×812 but **cannot register service workers** (it logs a known "unknown error occurred when fetching the script"). Test offline / hanging-network / update behaviour with headless Chrome via puppeteer-core (`/Applications/Google Chrome.app`); npm needs `--cache` pointed at a scratch dir because `~/.npm` has a permissions problem.
- Seed realistic demo data for tests and restore the owner's localStorage exactly afterwards.

## Roadmap status

Done: v2 (rev 2), v3a (custom categories, installments, due dates, stacked trend, search), 4-tab layout, theme, natural copy, PWA 2.2.0, payment methods 2.3.0 (เงินสด, บัตรเครดิต TTB, บัตรเครดิต KBANK), trips & travel mode 2.4.0. Next (after the China trip; until then bug fixes only): the file split, then phase 4 card bills, then wealth tracking (scope to be shaped with the owner), then v3b (Supabase sync, slip reading, iOS Shortcut — see the owner's ROADMAP).

Phase 4 card bills, as agreed with the owner:
- **บัตรเครดิต TTB** is billed to someone else's account and the owner transfers money back later: no statement cycle, just a running `ค้างโอนคืน ฿X` (TTB spend since the last repayment) and a `โอนคืนแล้ว` action that records a repayment (partial allowed, history kept, no expense created). No reminder or banner.
- **บัตรเครดิต KBANK** is the owner's own card: Round 2 B4 statement cycles, due-date banner with `ประมาณ ฿X`, `จ่ายแล้ว`, `.ics` reminder. Until the statement/due days are entered show the running total since first use; once entered, compute cycles back to the card's first use (don't drop cycles before the configuration date).
