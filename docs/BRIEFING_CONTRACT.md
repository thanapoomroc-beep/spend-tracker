# Briefing contract

Contract version: 1

This file is the source of truth for the personal-finance part of the morning briefing. The briefing job lives outside this repo. Copy this file into its prompt or task instructions, and copy it again whenever the version changes. Both sides check `contract_version` in the response against the version above.

The numbers and triggers are computed by code (on the phone, and for prices on the server). The model only explains them. It never computes, estimates or invents a figure.

## How to call

```
GET https://<vercel-host>/api/briefing
Authorization: Bearer <BRIEFING_TOKEN>
```

- `<vercel-host>` and `<BRIEFING_TOKEN>` are secrets of the briefing job. Neither is stored in this repo.
- The token is separate from the app's token. It can read but not upload, and the app's token cannot read here.
- No `Origin` header is needed (server to server).
- Responses: `200` with the JSON below, `401` wrong or revoked token, `404 {"error":"no_payload"}` when the app has never uploaded, `503 {"error":"storage_down"}`.
- Treat anything other than `200` as "no personal data today": do not write a personal section and do not guess.

## Response (schema_version 1)

`200` body = the stored payload (the version refreshed by the morning price run when there is one, otherwise the uploaded one) plus three fields:

```json
{
  "contract_version": 1,
  "stale": false,
  "schema_version": 1,
  "personal_as_of": "2026-11-03",
  "uploaded_at": "2026-11-03T08:12:00+07:00",
  "thresholds": {
    "emergencyMonthsTarget": 6, "savingsRateTarget": 0.2, "maxSingleHoldingPct": 20, "bigMovePct": 7,
    "bigMoveMinWeightPct": 5, "drawdownPct": 5, "spendPaceTolerancePct": 15, "fxExposureWatchPct": 50
  },
  "freshness": { "prices_as_of": "2026-11-03T06:00:00+07:00", "stale_items": 0, "oldest_manual_days": 12 },
  "health": {
    "change_1d_pct": -0.4,
    "change_30d_pct": 1.8,
    "change_30d_split": { "market_pct": 0.9, "flows_pct": 0.9 },
    "savings_rate_month": 0.24,
    "savings_rate_3m": 0.21,
    "cash_runway_months": 5.0,
    "debt_to_assets": 0.39,
    "fx_exposure_pct": 4.7,
    "drawdown_from_90d_high_pct": 1.2
  },
  "investable_share_pct": 72.5,
  "investable_other_pct": 0,
  "allocation": [{ "class": "CASH", "pct": 27.5 }, { "class": "SET", "pct": 30.1 }],
  "holdings": [
    { "symbol": "PTT", "type": "th_stock", "class": "SET", "currency": "THB", "weight_pct": 11.4,
      "price_at_upload": 41, "diversified": false, "change_1d_pct": 2.9 }
  ],
  "fx_at_upload": { "USD": 33.73 },
  "spending": { "month_progress_pct": 10, "pace": "ahead", "over_budget_categories": ["อาหาร"] },
  "upcoming": [{ "type": "card", "label": "บัตร KBank", "due_in_days": 3 }],
  "trip": { "name": "ทริปจีน", "day": 3, "days": 7, "budget_used_pct": 55 },
  "goals": [],
  "triggers": [
    { "id": "T1", "severity": "watch", "text_th": "เงินสำรองพอใช้ 5.0 เดือน (เป้า 6)",
      "metric": "cash_runway_months", "value": 5.0, "threshold": 6 }
  ],
  "amounts": null
}
```

Added by the endpoint:

| Field | Meaning |
|---|---|
| `contract_version` | Always `1` for this file. If it is not `1`, stop and tell the owner the contract is out of date. |
| `stale` | `true` when `personal_as_of` is older than one day (Bangkok date). Prices may still be fresh. |
| `freshness.prices_as_of` | When the morning run last fetched prices. `personal_as_of` is when the phone last sent its own figures. They are separate. |
| `markets` | Computed by the morning run: `SET`, `SP500`, `NDX`, `USDTHB`, `GOLD`, `BTC`, each `{ label, close, change_pct, session, source, proxy? }` or `null` when its source failed, plus `as_of`. `session` is the date of that close; `proxy` names an ETF used in place of the index. Use these figures for market moves instead of looking them up. A `null` entry is left out of the message. |

Field notes:

- Every `*_pct` is a percentage from 0 to 100 with one decimal. `savings_rate_*` and `debt_to_assets` are ratios from 0 to 1 with three decimals (`0.21` means 21%).
- Any metric can be `null` when there is not enough data. Never fill it in. A trigger never fires on a `null`.
- `holdings[].weight_pct` is the holding's share of the investable total. Together with `investable_other_pct` (balance-only investment accounts) it adds up to 100. `diversified: true` marks funds and ETFs, which are not counted as one-name concentration.
- `allocation[]` is the share of all assets by class: `CASH`, `SET`, `US`, `FUND`, `GOLD`, `CRYPTO`, `OTHER`.
- `change_1d_pct` is `null` in the phone's upload. The morning run fills it in. T3 and T8 can only appear in a refreshed payload.
- `spending.pace` is `ahead`, `on_track`, `behind`, or `null` (before day 8 of the month, or no income set).
- `upcoming[]` holds card bills and fixed items due in the next 7 days. `due_in_days` is negative when overdue.
- `holdings[].liquid` is `true` only on holdings the owner flagged as near-cash (for example SGOV). It is additive and absent otherwise (added 2026-11-03, still version 1). These holdings are already inside `cash_runway_months`.
- `trip` is `null` when no trip mode is on. `goals` is always `[]` in version 1.
- `amounts` is `null` unless the owner turned on sharing. When present it holds `net_worth`, `liquid`, `liabilities`, `upcoming_thb` as whole baht. Otherwise the payload contains no baht amount at all. Unit prices (`price_at_upload`, `fx_at_upload`) are not amounts.
- `text_th` of a trigger is already written in Thai. Use it as the basis for the sentence rather than rewording the numbers.

### Triggers

| id | Meaning | Severity |
|---|---|---|
| T1 | Cash runway below `emergencyMonthsTarget` (below 3 months is `act`) | `watch` / `act` |
| T2 | A non-diversified holding is over `maxSingleHoldingPct` of investable | `watch` |
| T3 | A holding of at least `bigMoveMinWeightPct` moved at least `bigMovePct` in one day | `info` |
| T4 | Net worth (market part only) is at least `drawdownPct` below its 90-day high | `watch` |
| T5 | Month spending is ahead of pace by more than `spendPaceTolerancePct` after day 7 (`act` when the month is already over income) | `watch` / `act` |
| T6 | A card bill is due within 3 days or late, and unpaid | `act` |
| T7 | Stale prices or FX, or a manual figure older than 45 days | `info` |
| T8 | `fx_exposure_pct` over `fxExposureWatchPct` and the baht moved at least 2% in 7 days | `info` |
| T9 | `savings_rate_3m` below `savingsRateTarget` | `watch` |
| T11 | A held stock's price moved into a different zone than in the weekly research (run at most 14 days old). Fires once per new zone, computed by the morning run. Extra fields `zone`, `zone_at_research`, `run_date`. `watch` for `high_mos`, `attractive` or `speculative`, otherwise `info` (added 2026-11-14, still version 1) | `watch` / `info` |

T10 (goals) is not in version 1.

## Output rules

Revised 2026-11-02 (owner decision; additive, still version 1). The personal part is one message titled `🎯 กระทบเรา`, written in Thai, in this order:

1. `ตลาดที่เราถือ` one compact line built only from `markets` (direction and `change_pct` of each non-null entry; say the `session` date when it is not today's).
2. News bullets: each is what happened (short) + how it affects the owner, with the source URL on the next line.
3. `ควรทำอะไร` what to check.

Rules:

- **Link news to the owner only when it is real.** A news item may be tied to the owner's finances only if it names a held `symbol`, that symbol's sector (only a sector the company is actually in), a market present in `allocation`, a currency in `fx_at_upload` / the holdings' `currency`, or a fired trigger. Otherwise write nothing about the owner for that item. Do not guess sectors for symbols you cannot place.
- **Cover every holding.** Look for news on every symbol in `holdings` (index funds and ETFs by their index or asset class). For a holding with `change_1d_pct` at or beyond ±3, find and give the reason, or say none was found.
- **Cite every bullet.** Each news bullet ends with the symbol, market, currency or trigger id in square brackets, for example `[PTT]`, `[US]`, `[USD]` or `[T1]`. A bullet without a citation must not be written. With no qualifying news, write one line `วันนี้ไม่มีข่าวเฉพาะของหุ้นที่ถือ`.
- **At most 3 actions.** Each item in `ควรทำอะไร` is tied to a trigger with severity `act` or `watch` and cites it (`[T6]`). Phrase it as a short action, for example `ทบทวน…`, `ตรวจ…`, `โอน… ก่อนวันที่…`. Since 2026-11-14 (owner decision) an action may also say to buy, add, trim or sell.
- **Nothing to do is a normal answer.** With no `act` or `watch` trigger, write exactly `ไม่มีอะไรต้องทำวันนี้` under `ควรทำอะไร`. Do not invent a task to fill the section.
- **Never invent numbers.** State a figure only if it is in the payload or in the news source. Do not compute new percentages, projections or baht amounts. Without `amounts`, never mention a baht amount for the owner's money.
- **Stale data.** If `stale` is `true`, say once that the personal data is old, with `personal_as_of` as the date. If `freshness.stale_items > 0`, add one line `ข้อมูลบางส่วนเก่า (ณ {date})` where `{date}` is `personal_as_of`.
- **Length.** The whole personal part is at most 220 Thai words, URLs not counted.
- **Privacy.** The payload has no account names, notes or amounts by design. Do not ask for more and do not infer them.

## Changing this contract

A breaking change to the schema or the rules raises `Contract version`. Additive fields (such as `markets`) and layout revisions agreed with the owner keep the version and are dated in this file. The app (`js/health-core.js`), the Vercel endpoint and the briefing job must all be updated to the new version together.
