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
- **Static, offline-first, zero third-party network:** no build step, no framework, no backend, no CDN, no web fonts. Chart.js 4.5.0 is self-hosted at `vendor/chart.umd.js` (unmodified; SRI sha384-iU8HYtnGQ8Cy4zl7gbNMOhsDTTKX02BTXptVP/vqAWIaTfM7isw76iyZCsjL2eVi). `grep -c "https://" index.html sw.js` must stay 0. The app is used in mainland China on filtered networks. Planned exception (agreed 2026-10-18, extended 2026-10-30, not built yet): wealth W2/W3 may call our own price function and sync endpoint, v5 our briefing payload endpoint, and v3b our slip endpoints. All calls are on demand, and every failure falls back silently to local data. Nothing else gets network access.
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

Planned refactor (next, before phase 4): split into `css/` + classic-script `js/` files and add `tests/`; keep it build-free and update the SW `ASSETS` list.

## Testing

- Local server: `python3 -m http.server 8765` in this folder (stop it afterwards).
- The in-app Browser pane is fine for layout/logic checks at 375×812 but **cannot register service workers** (it logs a known "unknown error occurred when fetching the script"). Test offline / hanging-network / update behaviour with headless Chrome via puppeteer-core (`/Applications/Google Chrome.app`); npm needs `--cache` pointed at a scratch dir because `~/.npm` has a permissions problem.
- Seed realistic demo data for tests and restore the owner's localStorage exactly afterwards.

## Roadmap status

Done: v2 (rev 2), v3a (custom categories, installments, due dates, stacked trend, search), 4-tab layout, theme, natural copy, PWA 2.2.0, payment methods 2.3.0 (เงินสด, บัตรเครดิต TTB, บัตรเครดิต KBANK), trips & travel mode 2.4.0. The owner is back from the China trip (2026-10-30), so feature work is open again. Next, in order: the file split, phase 4 card bills, wealth tracking W1–W4, v5 briefing integration, v3b slip reading + iOS Shortcut. `ROADMAP.md` (rev 4) is the owner's long-form spec; this section wins where they differ.

North Star (ROADMAP rev 3+): the owner's existing morning briefing (kept private, outside this repo) should also answer "กระทบเราอย่างไร / ควรทำอะไร" from a compact summary of the owner's finances. Numbers and triggers are computed by code; the LLM only explains. `ไม่มีอะไรต้องทำวันนี้` is the normal answer. Every figure carries `as_of` and `source`; never scrape bank or broker sites.

Phase 4 card bills, as agreed with the owner:
- **บัตรเครดิต TTB** is billed to someone else's account and the owner transfers money back later: no statement cycle, just a running `ค้างโอนคืน ฿X` (TTB spend since the last repayment) and a `โอนคืนแล้ว` action that records a repayment (partial allowed, history kept, no expense created). No reminder or banner.
- **บัตรเครดิต KBANK** is the owner's own card: Round 2 B4 statement cycles, due-date banner with `ประมาณ ฿X`, `จ่ายแล้ว`, `.ics` reminder. Until the statement/due days are entered show the running total since first use; once entered, compute cycles back to the card's first use (don't drop cycles before the configuration date).

Wealth tracking (5th tab `ทรัพย์สิน`, piggy-bank icon), as agreed with the owner 2026-10-18. Mockup: https://claude.ai/artifact/DuW1eDQUoZRc2YGL3hRAVh (private to the owner).
- Main question: "รวยขึ้นไหม". Hero = net worth with monthly change and a line chart; groups เงินในบัญชี / เงินลงทุน / หนี้; eye button hides every amount as `฿••••`.
- Debts are derived automatically (car-loan installments, TTB `ค้างโอนคืน`, KBANK unpaid) and tagged `อัตโนมัติ`; the owner can override with a real balance and go back to the app's value.
- Investments hold line items: asset type (หุ้นไทย, หุ้นต่างประเทศ, กองทุน, ทอง, คริปโต), symbol, units, cost, currency. Value = units × latest price; show P/L per item and per account. Prices are entered manually in one "อัปเดตราคา" sheet for the whole account.
- Architecture is local-first: the iPhone stays the source of truth and works fully offline.
  - Data: `accounts`, `holdings`, `priceCache` {symbol → price, currency, at, source manual|auto; a manual override wins}, daily `snapshots` of net worth. Every record has `updatedAt` (needed for sync).
  - Price function: a single Vercel function `POST /api/prices` in a separate private repo. API keys live in Vercel env vars, never in this public repo. It returns native price + THB, caches 15 min, returns partial results when a source fails, and accepts only our origin + a personal token entered in settings.
  - Sources: Yahoo Finance for Thai `.BK` and foreign stocks (unofficial; Finnhub/Twelve Data as fallback), SEC Thailand API for fund NAV (free key), the Thai gold-traders association site for 96.5% gold (scraped, most fragile), Bitkub public API for crypto in THB (CoinGecko fallback), Frankfurter for FX.
  - Supabase is used only as an encrypted backup/sync store. The client encrypts with the owner's passphrase so the server never sees amounts, and merges per record by `updatedAt`. Never make the app depend on Supabase being online (blocked in China; free projects pause after 7 idle days). Prices stay on Vercel, not Supabase.
- Phases (after the file split and phase 4):
  - W1+W2 ship together as one release (owner decision 2026-10-31: no manual-only release). It contains the wealth tab per the mockup (holdings, snapshots), the Vercel price function, a `ดึงราคาล่าสุด` button, and auto-fetch on open when online and prices are older than 6 h. Build it in two sub-agent rounds (tab + maths first, then fetching). Manual price entry stays as the fallback for offline use and failed sources. The owner sets up Vercel and keys before the release.
  - W3: encrypted Supabase backup/sync.
  - W4: push alerts (due dates, big price moves) driven only by the non-amount v5 payload and the morning price refresh. Net-worth snapshots stay on the phone (taken on open) because the server can't read encrypted data.
  - A share-sheet backup export to iCloud Drive comes before W3 and can slot in any time.

v5 briefing integration, as agreed with the owner 2026-10-30 (local-first):
- The phone computes the briefing payload (ROADMAP B5.1 schema: percentages, ratios, symbols, day counts, triggers T1–T10) with the same pure functions as the wealth tab, on open and after saves, and uploads it on demand when online. It also sends each holding's symbol, weight % and the price it was valued at. The server never receives raw data.
- Baht amounts are left out unless the owner turns on `briefingShareAmounts`.
- **Morning price refresh on the server (agreed 2026-10-30):** a daily Vercel cron in the same private repo as `/api/prices` runs before the briefing.
  - It fetches prices and FX for the uploaded symbols and re-weights holdings by the price ratio.
  - It recomputes only the price-driven parts: per-holding and portfolio 1-day change, weights, and triggers T2/T3/T8. The price part of T7 is also recomputed.
  - Spending, runway, savings and goals stay as the phone last sent them.
  - The payload carries `prices_as_of` (server) and `personal_as_of` (phone) separately.
  - The server learns symbols and weights, never amounts. The payload and feedback are stored on Vercel too (not Supabase).
  - The app may reuse these morning prices on open instead of fetching its own.
- The briefing reads the latest payload with a revocable token scoped to `briefing`. If `personal_as_of` is older than one day, it says the personal data is old.
- `docs/BRIEFING_CONTRACT.md` in this repo is the prompt contract. No briefing code, news sources, prompts or tokens go in this repo.
- Feedback (`มีประโยชน์` / `ไม่จำเป็น` / `ทำตามแล้ว`) is written by the app and read back on open.
- v3b changes under this model: the iOS Shortcut can't insert rows into encrypted sync. It drops slips into a server inbox, and the app pulls the inbox, parses it and adds `รอตรวจ` entries. `supabase-js` (if used) is self-hosted like Chart.js.