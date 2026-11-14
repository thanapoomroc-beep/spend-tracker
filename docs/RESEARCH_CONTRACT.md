# Weekly research contract

Contract version: 1 (agreed with the owner 2026-11-14)

This file is the source of truth for the owner's weekly stock research. It runs as its own scheduled task, separate from the morning briefing (`docs/BRIEFING_CONTRACT.md`). The task lives outside this repo and reads this file from GitHub on each run, so edits take effect with a push.

## Setup (owner, outside this repo)

- Platform: a Claude cloud scheduled task on claude.ai, like the morning briefing.
- Model: **Claude Opus 5.5** (`claude-opus-5-5`). Choose it in the task's model picker.
- Schedule: every **Saturday 08:00 Asia/Bangkok**. Both the Thai and US markets are closed, and Friday's closes are final.
- Skill: `equity-action-research` must be uploaded to claude.ai as a custom skill, with code execution on, because it runs `scripts/gate_calc.py`.
- Delivery: one LINE message through the same Zapier action as the briefing.
- Secrets: `<vercel-host>` and `<BRIEFING_TOKEN>` are the same as the briefing's. `<RESEARCH_TOKEN>` is a separate secret set in Vercel for this task only (it reads and writes research results, nothing else). All three live only in the task, never in this repo.
- First run: check once that the task can send an authenticated `POST` (the briefing only sends `GET`). If it cannot, the message still goes to LINE; only the memory between weeks is lost.

## Input

```
GET https://<vercel-host>/api/briefing
Authorization: Bearer <BRIEFING_TOKEN>
```

Same endpoint, response and status handling as `docs/BRIEFING_CONTRACT.md`. With anything other than `200`, send one line, `สัปดาห์นี้ไม่มีข้อมูลพอร์ต`, and stop. If `contract_version` is not `1`, stop and tell the owner the contract is out of date.

From the payload, use only:

- `holdings[]` where `type` is `th_stock` or `foreign_stock` **and** `diversified` is `false`. These are single stocks. Funds, ETFs, gold and crypto are out of scope.
- `holdings[].weight_pct`, `symbol`, `currency`, `price_at_upload`.
- `thresholds.maxSingleHoldingPct` as the position limit for portfolio fit (G7).
- `personal_as_of`, `stale`, `amounts` (normally `null`).

A Thai stock's symbol is the SET ticker (for example `PTT`). A foreign stock's symbol is its exchange ticker. Use the payload's `symbol` exactly as given.

### Previous runs

```
GET https://<vercel-host>/api/research?limit=2
Authorization: Bearer <RESEARCH_TOKEN>
```

Returns `{ "contract_version": 1, "runs": [newest first] }`; `runs` can be empty. Use the newest run whose `run_date` is before today to say what changed. If the call fails, carry on without it and do not mention it.

## Method

For every in-scope holding, run the `equity-action-research` skill in **portfolio-aware action** mode, one stock at a time:

- The disclosed portfolio is the stock's `weight_pct` of investable assets and the `maxSingleHoldingPct` limit. Nothing else is known. Do not ask for or infer baht amounts, account names or other holdings.
- Look up current prices, filings and estimates yourself, following the skill's evidence rules. `price_at_upload` is only a cross-check, not the current price.
- Apply the gates literally. If the evidence is not there, the result is `unresolved`, not a guess.
- If there are more than 8 in-scope stocks, analyse the 8 with the highest `weight_pct` and list the rest by symbol as `สัปดาห์นี้ยังไม่ได้วิเคราะห์`.

The action may be any of the skill's results: `เริ่มซื้อ` (initiate), `ซื้อเพิ่ม` (add), `ถือ` (hold), `รอ` (wait), `ทบทวนลด` (trim review), `ทบทวนขาย` (exit review). Buy/sell wording and price zones are allowed (owner decision 2026-11-14).

## Output

One message titled `📊 วิเคราะห์หุ้นประจำสัปดาห์`, written in Thai, following `CLAUDE.md`'s copy rules (short, natural, `วันละ`/`เดือนละ` style, no `·`/`—` chaining).

1. One line of data freshness: `ราคา ณ {date}`, and if `stale` is `true`, `ข้อมูลพอร์ต ณ {personal_as_of}`.
2. One block per stock, highest `weight_pct` first:
   - `{SYMBOL} {action}`. Add `(เปลี่ยนจาก {old action})` when the previous run had a different action for the same symbol, or `(ใหม่)` when it was not in the previous run.
   - Price zone with numbers: `ราคาตอนนี้ {p}` and the zone it is in (`ถูกมาก` / `น่าสนใจ` / `ราคาเหมาะสม` / `แพง` / `เก็งกำไร`), with the bear/base/bull values in the stock's currency.
   - One sentence on why, the main gate that decided it.
   - `จะเปลี่ยนความเห็นถ้า…` one sentence.
   - The sources on the next lines (filing or data page URLs).
3. If a symbol from the previous run is no longer held, one line `{SYMBOL} ไม่ได้ถือแล้ว`.
4. Last line: `เป็นงานวิจัยประกอบการตัดสินใจ ไม่ใช่คำแนะนำการลงทุนส่วนบุคคล`

Rules:

- **Every number has a source and a date.** Prices, valuations and zones come from the skill's cited evidence and its Python calculations. Never fill a figure from memory.
- **No baht amounts for the owner's money** unless `amounts` is present. Weights are fine.
- **An unresolved stock says so.** Write `{SYMBOL} ข้อมูลไม่พอ` with the missing item, instead of an action.
- **Length:** at most 90 Thai words per stock, URLs not counted.
- **Privacy:** same as the briefing. The payload has no account names, notes or amounts by design.

## Save the run

After the LINE message is sent, store the result so next week's run and the app can use it:

```
POST https://<vercel-host>/api/research
Authorization: Bearer <RESEARCH_TOKEN>
Content-Type: application/json

{ "op": "put", "run": {
  "contract_version": 1, "run_date": "2026-11-21", "model": "claude-opus-5-5",
  "items": [ {
    "symbol": "PTT", "type": "th_stock", "currency": "THB",
    "action": "hold", "zone": "fair",
    "price": 37.25, "price_as_of": "2026-11-20",
    "bear": 30, "base": 38, "bull": 45,
    "reason_th": "…", "change_view_th": "…",
    "sources": ["https://…"], "conviction": "moderate"
  } ],
  "skipped": ["SCB"]
} }
```

- `run_date` is today's Bangkok date. A second run on the same day replaces the first.
- `action`: `initiate` (เริ่มซื้อ), `add` (ซื้อเพิ่ม), `hold` (ถือ), `wait` (รอ), `trim_review` (ทบทวนลด), `exit_review` (ทบทวนขาย), `insufficient` (ข้อมูลไม่พอ).
- `zone`: `high_mos` (ถูกมาก), `attractive` (น่าสนใจ), `fair` (ราคาเหมาะสม), `demanding` (แพง), `speculative` (เก็งกำไร). The server recomputes it from `price` and `bear`/`base`/`bull` with the skill's zone formula, so send the numbers the skill computed.
- `bear` < `base` < `bull`, per share, in `currency` (ISO code; London prices in `GBP`, not pence). `price` and all three values are required unless `action` is `insufficient`.
- `reason_th` and `change_view_th` at most 240 characters each, plain text. `sources` at most 5 `https://` URLs. At most 20 items.
- The response is `{ "ok": true, "run_date", "stored", "dropped": [symbols] }`. An item that breaks these rules is dropped and named in `dropped`. If the call fails, do not retry more than once and do not mention it in the LINE message.

## Changing this contract

A change to the input fields or the output layout raises `Contract version`. Owner-agreed wording changes keep the version and are dated in this file.
