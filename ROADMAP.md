# Spend Tracker → Personal Intelligence — Roadmap (v1 → v5) · rev 5

## เป้าหมายปลายทาง (North Star)

ไม่ใช่ news feed อีกตัว และไม่ใช่ dashboard การเงินอีกตัว แต่คือ **morning briefing เดียว** ที่รวมข่าวภายนอกเข้ากับข้อมูลการเงินของตัวเอง แล้วตอบ 3 คำถาม:

1. **เกิดอะไรขึ้น?** — ข่าวโลก ข่าวไทย AI โอกาสธุรกิจ ความเคลื่อนไหวพอร์ต (มีแล้ว: morning briefing ปัจจุบัน)
2. **กระทบเราอย่างไร?** — ตีความผ่านพอร์ต สินทรัพย์ หนี้ รายจ่าย และเป้าหมายของเรา
3. **ควรทำอะไร?** — เฉพาะเมื่อมีเหตุจริง; `ไม่มีอะไรต้องทำ` เป็นคำตอบปกติ

ทางไปถึง: **Spend Tracker คือขาข้อมูลส่วนตัว** (รายจ่าย/รายได้/หนี้ผ่อน/บัตร) → **v4 เพิ่มสินทรัพย์ พอร์ต หนี้สิน และ net worth** โดยเก็บและคำนวณบน iPhone (local-first) → **v5 ให้มือถือสรุปบริบทการเงินเป็น % แล้วส่งเข้า morning briefing ที่มีอยู่**

### หลักการออกแบบที่ทุกเวอร์ชันต้องเคารพ
- **ข้อมูลเชื่อถือได้ก่อน personalization.** ตัวเลขทุกตัวต้องมี `as_of` และ `source`; ถ้าข้อมูลเก่าเกินกำหนดต้องบอกว่าเก่า ไม่ใช่แสดงเหมือนสด
- **ตัวเลขคำนวณด้วยโค้ด (deterministic) — LLM แค่อธิบาย.** การตัดสินว่า "มีเรื่องต้องสนใจ" มาจาก rule/threshold ที่ตั้งไว้ ไม่ใช่ให้ LLM เดาเชื่อมข่าวกับพอร์ต
- **Automate เฉพาะสิ่งที่เปลี่ยนบ่อยและดึงได้เสถียร** (ราคาหุ้น/กองทุน, FX, รายจ่ายรายวัน). สิ่งที่เปลี่ยนช้า (เงินฝาก, อสังหา, ยอดหนี้) กรอกเองเดือนละครั้งพอ — ห้าม scrape เว็บธนาคาร
- **Privacy โดย default.** ข้อมูลที่ออกจากมือถือไปหา LLM เป็นสัดส่วน/อัตราส่วน ไม่ใช่ยอดเงินจริง เว้นแต่เจ้าของเปิดเอง; ข้อมูลที่ sync ขึ้น Supabase เข้ารหัสจากมือถือ เซิร์ฟเวอร์อ่านยอดเงินไม่ได้
- **Local-first.** iPhone คือข้อมูลหลัก ทั้งแอปรายจ่ายและแท็บทรัพย์สินใช้ได้ offline โดยไม่ต้อง login; การเรียกเน็ตทุกครั้ง (ราคา, sync, briefing, สลิป) ทำเมื่อจำเป็น และถ้าล้มให้กลับไปใช้ข้อมูลในเครื่องเงียบๆ
- **วัดผลจากการตัดสินใจ ไม่ใช่จำนวนข้อมูล.** ถ้า 3 เดือนแล้ว briefing ไม่เคยทำให้ตัดสินใจต่างไป แปลว่ายังเป็นแค่ dashboard

## สรุปภาพรวม (Thai overview)

| เวอร์ชัน | สถานะ | ธีม | ต้องมี backend? | บทบาทต่อ North Star |
|---|---|---|---|---|
| v1 | ✅ ใช้งานอยู่ | บันทึกรายจ่าย + รายการประจำรายเดือน + กราฟ | ไม่ | ข้อมูลรายจ่าย |
| v2 รอบ 1 (2.1) | ✅ เสร็จ (`V2_ROUND1_SPEC.md`) | แก้บั๊กวันที่, PWA offline, แก้ไข/ยืนยันลบ, ช่องทางจ่าย, **ทริป + โหมดท่องเที่ยว** | ไม่ | รายจ่ายทริป + funding (เงินเก็บ/รายได้) |
| v2 รอบ 2 (2.2) | ✅ เสร็จ ยกเว้น B4 รอบบิลบัตร → phase 4 (`V2_SPEC.md`) | "วันนี้ใช้ได้อีก", งบรายหมวด, **แจ้งเตือนวันจ่ายบัตร**, layout, a11y, สีกราฟ | ไม่ | ยอดบัตรค้างจ่าย = หนี้ระยะสั้น |
| v3a | ✅ เสร็จ | หมวดกำหนดเอง, **งวดผ่อน**, **วันตัดเงิน**, กราฟแนวโน้ม, ค้นหา | ไม่ | ยอดผ่อนคงเหลือ = หนี้สิน; รายการที่จะตัดเงิน |
| แยกไฟล์ (2.4.1) | ✅ เสร็จ | แยก `css/` + `js/` + `tests/` (ไม่มี build) | ไม่ | ให้ `wealth-core.js` ทดสอบได้ |
| phase 4 บัตร (2.5.0) | ✅ เสร็จ | TTB `ค้างโอนคืน` + KBANK รอบบิล/วันครบกำหนด | ไม่ | ยอดบัตรค้างจ่าย = หนี้ระยะสั้น |
| v4 | 🔨 W1+W2 เสร็จ (2.6.0) ถัดไป W3 | **Wealth (แท็บ `ทรัพย์สิน`): บัญชี พอร์ต หนี้สิน net worth ตัวชี้วัดสุขภาพการเงิน** | W2 ราคา (Vercel), W3 sync เข้ารหัส (Supabase) | ข้อมูลส่วนตัวครบ = ฐานของ personalization |
| v5 | 🎯 | **ต่อเข้า morning briefing: triggers + บริบทการเงินแบบสรุป (คำนวณบนมือถือ)** | เก็บ payload อย่างเดียว | ตอบ "กระทบเราอย่างไร / ควรทำอะไร" |
| v3b | 📋 ถัดไป (2.10.0) | สลิปอัตโนมัติ: Shortcut อ่านสลิปใหม่ตอนปิดแอปธนาคาร ส่งข้อความเข้า inbox แอปดึงมาเป็น `รอตรวจ` | inbox บน Vercel | ลดการพิมพ์เอง |

ลำดับและ dependency:
- **แยกไฟล์ → phase 4 บัตร → v4 (W1+W2 → W3) → v5 → v3b (W4 ตัดออก 2026-11-02)**
- v4 ไม่พึ่ง Supabase: W1 ทำงานในเครื่องล้วน ใช้ข้อมูล v3a F2/F3 และ phase 4 ถ้ามี (ถ้าไม่มีให้ข้ามส่วนนั้นได้โดยไม่ error)
- v5 พึ่ง v4 (`wealth-core.js`) และ morning briefing ที่ใช้งานอยู่
- v3b ทำหลังสุด และใช้ sync เข้ารหัสของ v4 W3 แทน S1 เดิม

วิธีทำงานกับ Claude Code: ทำตามขั้นตอนใน `CLAUDE.md` (วางแผนด้วย skill → scrutinize → ให้ Sonnet sub-agent ลงมือ → ตรวจเอง → push เมื่อเจ้าของสั่ง) ถ้า CLAUDE.md กับไฟล์นี้ขัดกัน ให้ยึด CLAUDE.md

### สิ่งที่เปลี่ยนใน rev 5 (สลิปอัตโนมัติ, 2026-11-11)
- v3b เขียนใหม่: ไม่ต้องกด share เอง automation ทำงานตอนปิด K PLUS / ttb touch แล้วหาสลิปใหม่ในอัลบั้ม ไม่มีก็จบเงียบๆ
- อ่านข้อความบนมือถือ (Extract Text) ส่งแค่ข้อความเข้า `/api/slip` แอปแยกยอดเอง ไม่ใช้ Claude อ่านรูป ไม่มี Edge Function, OTP, Supabase Auth
- รายการจากสลิปนับเข้ายอดทันที ติดป้าย `รอตรวจ` ช่องทางจ่าย `เงินสด`
- ตัด S1–S3 เดิมทิ้ง

### สิ่งที่เปลี่ยนใน rev 4 (local-first, 2026-10-30)
- เปลี่ยนลำดับเป็น แยกไฟล์ → phase 4 → v4 → v5 → v3b; อัปเดตสถานะ (v2, v3a เสร็จแล้ว)
- v4 เขียนใหม่เป็น local-first ตามที่ตกลงกันเมื่อ 18 ต.ค.: แท็บ `ทรัพย์สิน`, ข้อมูลอยู่ใน `spendTrackerState`, ราคาผ่าน Vercel `/api/prices`, Supabase เป็นแค่ sync เข้ารหัส (W3), มีทองและคริปโต; ตัดตารางและ cron ฝั่งเซิร์ฟเวอร์
- v5: มือถือคำนวณ payload และ trigger เอง แล้วส่งขึ้นไปเก็บบน Vercel; เซิร์ฟเวอร์ดึงราคาเองทุกเช้า 06:00 แล้วคำนวณใหม่เฉพาะส่วนที่ขึ้นกับราคา (รู้แค่ชื่อหุ้นกับสัดส่วน % ไม่รู้ยอดเงิน)
- v3b: S1 ถูกแทนด้วย v4 W3; Shortcut ส่งสลิปเข้า inbox ให้แอปดึงมาเอง; `supabase-js` ต้อง self-host (ห้ามใช้ CDN)
- แก้สี neutral ให้ตรงกับที่ใช้จริง

### สิ่งที่เปลี่ยนใน rev 3 (เป้าหมาย personal intelligence)
- เพิ่ม **North Star** + หลักการออกแบบ ด้านบน
- เพิ่ม **v4 Wealth foundation** และ **v5 Briefing integration**
- v3b: `api_tokens` เพิ่มคอลัมน์ `scope` (`slip` / `briefing`) เพื่อให้ briefing อ่านข้อมูลได้ด้วย token แยก ไม่ใช้ token เดียวกับ Shortcut
- v3b: ระบุว่า S1 เป็น prerequisite ของ v4 (S2/S3 เลื่อนได้)
- v5: prompt contract อยู่ที่ `docs/BRIEFING_CONTRACT.md` เป็นต้นฉบับ; morning brief อยู่นอก repo นี้ (private) และเชื่อมผ่าน API เท่านั้น
- Later ideas: ย้าย "แจ้งเตือน push" และ "นำเข้า e-statement" มาผูกกับ v4/v5

### สิ่งที่เปลี่ยนใน rev 2 (จากการรีวิว)
- v3b: เปลี่ยน sync จาก "เก็บทั้งก้อนเป็น jsonb" → **ตารางแถวละรายการ** (ป้องกันข้อมูลหายเมื่อ 2 เครื่อง/Shortcut เขียนพร้อมกัน)
- v3b: เปลี่ยน login จาก magic link → **รหัส OTP 6 หลัก** (magic link เปิดใน Safari ไม่ใช่แอปบน Home Screen)
- v2: การ์ดใหญ่ใช้ "วันนี้ใช้ได้อีก" + "ใช้ได้วันละ" (ตัวเลขไม่ลดทุกครั้งที่จด), เลิกใช้คำว่า "งบ" กับรายได้, งบรายหมวดเก็บแยกจากรายได้, SW ไม่พังถ้า CDN ล่ม, แก้ accessibility, สีกราฟชุดใหม่ที่ผ่าน colour-blind check
- v3a: กติกาสีสำหรับหมวดที่สร้างเอง (สูงสุด 6 สี + "อื่นๆ")

---

## v1 — Shipped (baseline, for reference)

Single-file `index.html`, Thai UI, dark theme, Chart.js 4.5.0 via jsDelivr, data in `localStorage['spendTrackerState']`.

1. Expense entry form: date, amount, category (`<select>`, 7 fixed categories), optional note.
2. Per-month settings with carry-forward (`monthlySettings["YYYY-MM"]`): income + fixed items. A month uses the latest settings at or before it; editing a month forks its own copy.
3. Fixed items in two groups: `financing` and `subscription`; add/delete with confirm modal.
4. Month navigation.
5. Summary cards: fixed, variable, remaining.
6. Doughnut: financing / subscription / each category.
7. 6-month trend bar (total spend).
8. Entries table with delete.
9. Backup: export/import JSON (with migration from old `settings` shape), clear all.
10. Save indicator; Home Screen meta tags (not a full PWA).

v1 data shape:
```json
{
  "monthlySettings": {
    "2026-10": { "income": 30000,
      "fixedItems": [{ "id": "…", "name": "ผ่อนรถ", "amount": 8000, "group": "financing" }] }
  },
  "entries": [{ "id": "…", "date": "2026-10-13", "amount": 120, "category": "อาหาร", "note": "" }]
}
```

---

## v2 — Specified (full instructions in `V2_SPEC.md`)

- Fixes: UTC date bug, income card, confirm + edit entries, real PWA (CDN-failure-safe SW), Thai dates, accessibility (labels, 44px targets, zoom, contrast, dialogs), validated chart palette (doughnut shows one neutral `รายการประจำ` slice + categories).
- Features: hero card (`วันนี้ใช้ได้อีก` / `ใช้ได้วันละ`, pace hint from day 3), faster entry (big amount, category chips, remembered category), category budgets.
- Data added: top-level `budgetSettings: { "YYYY-MM": { [category]: number } }` (carry-forward, independent of `monthlySettings`).
- Terminology: `รายการประจำ` (fixed), `งบ` (category budgets only), `รายได้`, `คงเหลือ`.

---

## v3a — Client-only upgrades (no backend)

### Global rules for v3a
- Same hard constraints as `V2_SPEC.md` §0 (storage key, additive data only, old backups import, Thai UI, 375px, inputs ≥16px, try/catch storage, terminology).
- Keep v2 accessibility rules: labelled inputs, 44px targets, dialogs with `role="dialog"`, colour never the only signal.
- Extend `migrateState()` for every new field; add top-level `schemaVersion: 3` (absent = v1/v2).
- Bump SW `CACHE` to `spend-tracker-v3`.
- Reuse existing components (cards, chips, `openConfirm`, modals).
- Forward-compatibility for v4: keep F2's remaining-amount maths and F3's next-due-date maths as **pure exported helpers** (`remainingFinancing(item, mKey)`, `nextDueDate(item, today)`) — v4 reuses them for liabilities and v5 for upcoming payments.
- Add `updatedAt` (ISO string) to every entry, every `monthlySettings[m]`, every `budgetSettings[m]`, and every category whenever it is created/changed (migration: `"1970-01-01T00:00:00Z"`). Not used yet in v3a, but v3b sync depends on it — adding it now avoids a second migration.

### Colour rules (apply to F1, F4 and all charts)
- The categorical palette is the 6 validated hue slots from `V2_SPEC.md` A8, in fixed order:
  `#d95926, #3987e5, #199e70, #c98500, #d55181, #9085e9`.
- Neutrals: `อื่นๆ` = `#C3C6CC`; `รายการประจำ` = `#80838A`.
- Status colours (`--green`, `--amber`, `--red`) are reserved for status (budget bars, hero) and never used as a category colour.
- **Max 6 coloured categories.** Each category stores its slot. A new category takes the first free slot; if all 6 are taken it gets the neutral `อื่นๆ` colour and is grouped under `อื่นๆ` in charts (it still appears by name in tables, chips, tooltips and budgets). Colour follows the category, never its rank — filtering or reordering must not repaint categories.
- Never generate new hues.

### F1. Custom categories
Data:
- Top-level `categories: [{ name, slot, archived, updatedAt }]` where `slot` is 0–5 or `null` (= neutral/อื่นๆ). Migration seeds from the v2 category list in order (slots 0–5; `อื่นๆ` → `null`) plus any unknown category name found in entries (`slot: null`).
- Entries keep storing the category **name** (string) for compatibility with old exports.
- Replace hard-coded category lists/colours with functions reading `state.categories`.

UI (Settings → new section `หมวดหมู่`):
- Rows: colour dot (tap → choose a free slot or neutral), name input (`aria-label="ชื่อหมวด"`), ▲▼ reorder (44px, `aria-label="เลื่อนขึ้น"/"เลื่อนลง"`), archive/delete.
- `+ เพิ่มหมวดหมู่`. Names unique and non-empty; inline error `มีหมวดชื่อนี้แล้ว`.
- **Rename**: confirm `เปลี่ยนชื่อ "X" เป็น "Y" ในทุกรายการ?` → updates `categories`, every entry with the old name, and every `budgetSettings` key; bump `updatedAt` on everything changed.
- **Delete**: if unused → delete. If used → only `ซ่อนหมวดนี้` (archive): hidden from chips and budget settings, still shown in history and charts.

Acceptance: rename `อาหาร` → `กินข้าว` updates old entries, charts and budgets; archived category still shows in old tables; a 7th coloured category falls back to neutral.

### F2. Installment terms (งวดผ่อน)
Data (financing items only, optional): `startMonth: "YYYY-MM"`, `totalTerms: number`.
Derived: `endMonth = startMonth + totalTerms − 1`; `termNo(mKey) = monthsBetween(startMonth, mKey) + 1`.

Logic: in `getEffectiveSettings(mKey)`, exclude an item with both fields set when `mKey < startMonth` or `mKey > endMonth`. Items without the fields behave as before.

UI:
- Financing row: toggle `ระบุงวด` → `เริ่มเดือน` (`<input type="month">`) + `จำนวนงวด`.
- Under the row: `งวดที่ 14/48 · จบ ก.ย. 2570 · ยอดผ่อนที่เหลือ ฿272,000` (amount × terms remaining after this month).
- Card `ผ่อนชำระ` (only if any active installment): each item with a progress bar (`termNo / totalTerms`, `role="progressbar"`) + the same text.

Acceptance: startMonth 2026-01, 12 terms → counted in Dec 2026, gone in Jan 2027, unaffected before Jan 2026.

### F3. Due dates + upcoming payments
Data: optional `dueDay: 1–31` on any fixed item; if > days in month, use the last day.

UI:
- Settings row: `ตัดวันที่` number input.
- Card `กำลังจะตัดเงิน` (current month view only): items due within the next 7 days incl. today, wrapping into next month. Row text: `วันนี้ · Netflix · ฿419` or `อีก 2 วัน · Spotify · ฿149`. Hidden when empty.
- Subscription section: `ค่าสมาชิกรวมต่อปี ฿X` (sum × 12).
- Note: this is an in-app reminder only. Push notifications need a server (possible later with v3b + Web Push on iOS 16.4+ Home Screen apps); out of scope here.

Acceptance: on 28 Oct, Spotify dueDay 2 → `อีก 5 วัน · Spotify`; dueDay 31 in November → 30 Nov.

### F4. Richer trend chart
- **Stacked bar** per month: bottom segment `รายการประจำ` (`#80838A`), then one segment per coloured category (fixed slot order), then `อื่นๆ` (neutral) on top. 2px gap between segments (`borderColor` = panel colour, `borderWidth` 2), 4px rounded top corners on the top segment only.
- **Income** as a line on the **same y-axis** (both are baht — never add a second axis): 2px, `--text` colour, dashed, ≥8px point markers.
- Toggle above chart: `6 เดือน` / `12 เดือน` (two-button segmented control, 44px; remember in `localStorage['spendTrackerTrendRange']`).
- Tooltip: every segment + month total + income, text in text colours.
- Tapping a bar navigates to that month.
- Legend always present (≥2 series); on mobile place it below the chart, wrapping.
- Provide a text alternative: a collapsible `ดูเป็นตาราง` table (month × category totals) under the chart.

### F5. Search & filter entries
- Above the table: search input (`ค้นหาโน้ตหรือหมวด`, labelled), category filter chips (multi-select; `ทั้งหมด` resets; `aria-pressed`), toggle `ค้นหาทุกเดือน`.
- Result line (`aria-live="polite"`): `พบ 12 รายการ · รวม ฿3,450`; empty: `ไม่พบรายการที่ตรงกัน`.
- Filtering affects only the table. Debounce 150 ms; case-insensitive `includes` on trimmed strings.

### v3a test checklist
1. Import v1 and v2 backups → migrate; `categories` seeded with correct slots; `updatedAt` filled; nothing lost.
2. F1 rename/archive/reorder; 7th coloured category falls back to neutral; reordering doesn't repaint; export→import keeps categories.
3. F2 boundary months; remaining amount correct.
4. F3 wrap-around; dueDay 31 in 30-day month.
5. F4 stack totals equal summary cards; one y-axis; 6/12 toggle persists; table view matches.
6. F5 search across months; totals correct.
7. A11y: all new controls labelled, 44px, keyboard/VoiceOver operable.
8. No console errors; no horizontal scroll at 375px; offline works.

---

## v3b — Slip inbox via iOS Shortcut (rev 5, 2026-11-11)

> Owner decisions 2026-11-11:
> - No share-sheet step. A Personal Automation runs when **K PLUS** or **ttb touch** is closed, finds new slips in that app's Photos album, and does nothing when there are none.
> - The slip is read **on the phone** (iOS `Extract Text from Image`). Only the text leaves the phone; images never do. No Claude/Anthropic call, no Edge Functions, no Supabase Auth or OTP.
> - Slip entries **count at once** (they are already spent) and carry a `รอตรวจ` tag until the owner checks them.
> - Payment method: the existing `เงินสด` (`cash`).
> - This replaces S1–S3 of rev 4. Sync stays the encrypted W3 backup.

### Flow
1. Shortcut `ส่งสลิป` (one shortcut; input: `source` = `kplus` or `ttb`, plus the album name). Two Personal Automations call it: "When K PLUS is closed" and "When ttb touch is closed", both `Run Immediately`, `Notify When Run` off.
2. Read `slip-last-<source>.txt` from iCloud Drive › Shortcuts (an ISO time). Missing → now − 10 min.
3. `Find Photos`: album = the bank's album, Date Added is after that time, sort by Date Added (oldest first), limit 5. None → stop (no network call).
4. For each photo: `Extract Text from Image` → `POST {service}/api/slip` with `Authorization: Bearer <SLIP_TOKEN>` and JSON `{ "source": "kplus", "text": "…", "photo_at": "<the photo's date, Format Date → ISO 8601>" }`.
   - Response is not `{ "ok": true }` (offline, 4xx/5xx) → stop **without** moving the marker, so the next run retries.
   - Otherwise write that photo's Date Added to `slip-last-<source>.txt`.
5. No notification. The app reports what it added.

### Server (private repo `spend-tracker-prices`)
- Table `slip_inbox` in `supabase/schema.sql`:
  - `id bigint identity pk`, `created_at timestamptz default now()`
  - `source text check (source in ('kplus','ttb'))`, `photo_at timestamptz`
  - `text text not null` (≤ 4000 chars), `text_hash text not null unique`
  - RLS on, no policies.
- `POST /api/slip`, called by the Shortcut:
  - `Bearer SLIP_TOKEN` (new env var). `guard()` hard-codes `PRICE_TOKEN` (`lib/guard.js:31`), so give it a token option (default `PRICE_TOKEN`) instead of copying it. Return 500 `misconfigured` if `SLIP_TOKEN` equals `PRICE_TOKEN` or `BRIEFING_TOKEN`. `PRICE_TOKEN`/`BRIEFING_TOKEN` get 401 here, and `SLIP_TOKEN` gets 401 on every other endpoint.
  - No Origin header expected; a present, disallowed Origin gets 403. Body ≤ 16 KB.
  - `text_hash` = SHA-256 of the whitespace-normalised text. A known hash → 200 `{ ok: true, duplicate: true }`; a new row → 200 `{ ok: true }`. More than 200 rows waiting → 429 `{ error: 'inbox_full' }`.
  - After an insert, delete rows older than 14 days. The server never parses or logs the text.
- `POST /api/slip-inbox`, called by the app (same `guard` as `/api/prices`: `PRICE_TOKEN` + allowed origin):
  - `{ op: 'list' }` → `{ items: [{ id, created_at, source, photo_at, text }] }`, oldest first, max 50.
  - `{ op: 'ack', ids: [≤ 50 ints] }` → deletes them → `{ deleted: n }`.
- Errors, CORS, the 8 s Supabase timeout and `503 storage_down` follow `/api/backup`. Add tests (`tests/slip.test.mjs`), a `scripts/slip-check.sh` and a README section.
- Privacy: amounts, receiver names and the bank's masked account numbers sit in plain text on Supabase until the app pulls them (normally within minutes, at most 14 days). This is the one place the server sees amounts. Agreed when the inbox was planned in rev 4; restated here for the owner.

### App (2.10.0)
New files, all classic scripts in the shared global scope:
- `js/slip-core.js`: pure parse, dedupe and category guess. No DOM.
- `js/slip-net.js`: pull/ack and scheduling.
- `js/slip-ui.js`: review card, รายการ tag/filter, settings section.

Load order: `slip-core` and `slip-net` after `briefing-net`; `slip-ui` after `briefing-ui`. Each file gets a `<script … onerror>` tag and goes into `JS_FILES` in `sw.js`.

**Data (additive; `migrateState()` handles every field):**
- `entry.slipRef`: string, 1–80 chars, otherwise deleted. `entry.needsReview`: `true`, otherwise deleted.
- `state.slipSettings = { enabled: false, handled: [{ ref, at }], unreadable: [{ key, at, source, photoAt }] }`.
  - `handled` = every slip added or dismissed, newest 500, so a dismissed slip never returns.
  - `unreadable` = slips that couldn't be parsed, newest 20. The slip text itself is never stored.
- Status in localStorage `spendTrackerSlip` `{ lastPullAt, lastError, lastAdded }`, never in state.
- Uses the existing price-service URL + token (`spendTrackerPriceService`). No new secret in the app; `SLIP_TOKEN` lives only in the Shortcut.

**Parser `parseSlipText(text, source)`** → `{ ok, amount, date, time, receiver, ref, confidence }`:
- amount: the number after `จำนวน` / `จำนวนเงิน` / `Amount`, or before `บาท` / `THB`; `1,234.50` → 1234.5; must be > 0.
- date: Thai short months `ม.ค.`…`ธ.ค.` and full names, BE years `69` / `2569` → 2026, English months too; time `HH:MM`.
- ref: the token after `เลขที่รายการ` / `รหัสอ้างอิง` / `Ref` / `Transaction ID` (`[A-Za-z0-9]{8,}`). When there is no ref, the key is `h:{source}:{date}:{time}:{amount}`.
- receiver: per-bank rule from the fixtures (the name block after the sender, `ไปยัง`, `ถึง`, `To`).
- `ok` needs amount + date; otherwise the slip goes to `unreadable`.
- Fixtures: the OCR text of at least 6 real slips, with names and account numbers masked. 3 from K PLUS (incl. a QR payment to a shop) and 3 from ttb touch (incl. a transfer to the owner's own account and one TTB card repayment). Stored in `tests/fixtures/slips/*.txt`; tests in `tests/slip.test.js`.

**Pull (`slip-net.js`):**
- Runs on open (after the first render), on `visibilitychange` → visible, and from `ดึงตอนนี้`. One in-flight promise at a time (like `priceInFlight`, `wealth-prices.js:8`), so open + visible can never add a slip twice. At most every 2 min; only when online, `enabled` and the price service is configured. 10 s timeout. Every failure is silent apart from the status.
- For each item: parse.
  - Key already in `handled`, or an entry already has that `slipRef` → skip.
  - Otherwise add the entry `{ id, date: slip date, amount, category: guess, note: receiver || '', paymentMethod: 'cash' (only if it exists and is not archived), slipRef, needsReview: true, updatedAt }` and push the key to `handled`.
  - Slip entries are never trip entries.
- `saveData()` (`core.js:359`) swallows storage errors and returns nothing. Make it return `true`/`false` (existing callers ignore the value).
- One `saveData()`, then `ack` every listed id (duplicates and unreadable included), and only if the write to localStorage succeeded.
- Then `render()` and a toast `เพิ่มจากสลิป 2 รายการ` with the action `ตรวจ`, which scrolls to the review card.
- Category guess: the newest non-trip entry without `needsReview` whose note equals the receiver (trimmed, case-insensitive), if its category still exists and is not archived. Otherwise `อื่นๆ` if it exists and is not archived (the owner can rename or archive it), else the first active category.

**Review UI:**
- **วันนี้:** card `สลิปรอตรวจ` **below** the entry card (never above it: `#addEntryBtn` must stay above the tab bar at 375×812). Hidden when nothing waits. It shows in travel mode too.
  - Header `สลิปรอตรวจ 2 รายการ`.
  - Each row: receiver (or `ไม่มีชื่อผู้รับ`), muted metadata `11 พ.ย. 14:32 · K PLUS`, amount and category. Tapping the row opens the existing edit modal.
  - Row actions (44px):
    - `ถูกแล้ว` clears `needsReview`.
    - `ไม่ใช่รายจ่าย` opens confirm `ลบรายการนี้ไหม?`, then deletes the entry; the key stays in `handled`.
    - On every slip, when a `repay` card exists, also `โอนคืนบัตร` (the TTB card is repaid to someone else's account from either bank app): confirm `บันทึกเป็นโอนคืนบัตรไหม?`, then add a `cardPayments` row `{ methodId, date, amount }` and delete the entry.
  - `ถูกทั้งหมด` when 2 or more wait.
  - Unreadable slips (key `u:{server id}`): row `อ่านสลิปไม่ออก (K PLUS 14:32)` with `จดเอง` (focus the amount input, set the date) and `ปิด`.
- **Edit modal:** `saveEdit()` (`edit-month.js:96`) edits the entry in place, so `slipRef` survives; add `delete e.needsReview` there.
- **จดซ้ำ chips:** `repeatGroups()` (used by `trips.js:145`) skips `needsReview` entries.
- **รายการ tab:** rows get a `รอตรวจ` tag (text, not colour only), and `#filterChips` gets a `รอตรวจ` chip.
- **ตั้งค่า:** section `สลิปอัตโนมัติ` with:
  - an on/off switch, disabled with a hint until `ราคาอัตโนมัติ` is set up;
  - `ดึงล่าสุด 14:35`, or the last error in plain Thai;
  - `ดึงตอนนี้`;
  - a relative link to `docs/SHORTCUT_SETUP.md` (no `https://` in code).
- The briefing and health maths treat slip entries like any other entry.

**Docs:** `docs/SHORTCUT_SETUP.md` (Thai; the repo is public, so placeholders only, never the real URL or token): set up both bank apps to save slips to Photos, build the shortcut step by step, add both automations, and paste `SLIP_TOKEN` and the service URL.

### Owner actions
1. In K PLUS and ttb touch, turn on saving slips to Photos, and note each album's exact name.
2. Round 0 also checks, on the iPhone, which date filter `Find Photos` offers (Date Added, Creation Date, Date Taken) and that a slip saved by each bank app carries the save time. The marker uses that field.
3. Run a throwaway shortcut (`Find Photos` → `Extract Text` → `Copy to Clipboard`) on 6 slips and paste the text into chat, names masked. This is Round 0 and drives the parser.
4. In Vercel, add `SLIP_TOKEN` (32 random bytes) and redeploy. Run the new SQL in Supabase.

### Rounds
- **0.** Fixtures from the owner.
- **1.** Server in `spend-tracker-prices`, by a Sonnet agent.
- **2.** App 2.10.0: core + tests, net, UI, migration; same agent, two rounds.
- **3.** `SHORTCUT_SETUP.md`, then the owner runs it end to end on the iPhone.

### v3b test checklist
1. `node --test` passes. All 6 fixtures parse to the expected amount, date, time and ref; BE→CE is correct; a masked/garbled text → `ok: false`.
2. Dedupe:
   - Pulling the same inbox twice adds 0 the second time.
   - A dismissed slip that reappears in the inbox is not re-added.
   - Two photos of one slip (same ref, different text) add 1 entry.
3. Ack only after a successful save: with `localStorage.setItem` throwing, nothing is acked and nothing is lost.
4. Server:
   - `SLIP_TOKEN` works only on `/api/slip`; `PRICE_TOKEN` only on `/api/slip-inbox`; wrong → 401.
   - Duplicate text → `duplicate: true`. 201st waiting row → 429. Rows older than 14 days are purged.
5. Migration: v1, 2.4, 2.8.1 backups import; entries without slip fields are unchanged; an invalid `slipRef`/`needsReview` is removed.
6. วันนี้ at 375×812 with 3 waiting slips: `#addEntryBtn` stays above the tab bar (measure); no horizontal scroll; every action is ≥ 44px and labelled.
7. Travel mode on: the review card still shows; slip entries are not trip entries.
8. Offline or service down: no error banner, the app works, the status shows the reason, and the next pull retries.
9. `grep -c "https://" index.html sw.js css/*.css js/*.js` = 0; the version test passes at 2.10.0.
10. On the iPhone (owner): closing K PLUS without a transfer sends nothing; after a transfer, the entry appears within one open of the app; the marker file advances only on success.

---

## v4 — Wealth (local-first): accounts, investments, debts, net worth

> Goal: answer "รวยขึ้นไหม" and keep reliable personal data that v5 can summarise. Agreed with the owner 2026-10-18 (mockup: https://claude.ai/artifact/DuW1eDQUoZRc2YGL3hRAVh, private). Comes **after the file split and phase 4 card bills**, and before v3b.

> ⚠️ Owner actions:
> - Before the W1+W2 release: a separate **private** repo with one Vercel function `POST /api/prices`. API keys (SEC Thailand API, optional Finnhub/Twelve Data) go in Vercel env vars, never in this public repo. A personal token goes in app settings.
> - Before W3: a Supabase project (publishable key only in the client) and a sync passphrase that the owner remembers. It is not stored anywhere else.
> - List the accounts to track. Business assets are out of scope unless added as a manual `other` account.

### Global rules for v4
- **The iPhone is the source of truth.** The wealth tab works fully offline and without login. All data lives in `localStorage['spendTrackerState']` (additive fields, handled in `migrateState()`, old backups still import).
- Base currency THB. Every value carries `asOf` and `source`.
- All maths in pure, unit-tested functions in `js/wealth-core.js` (tests in `tests/`). v5 reuses the same module to build the briefing payload.
- Reuse v3a `remainingFinancing()` / `nextDueDate()` and the phase 4 card helpers (TTB `ค้างโอนคืน`, KBANK unpaid cycles). If that data is absent, the section is simply empty, never an error.
- Network only as listed in CLAUDE.md (our own price function and sync endpoint), on demand, failing silently back to local data.
- Charts follow the v3a colour rules. Bump `app-version` + SW `VERSION`, and add new files to `ASSETS`.

### Phases
- **W1+W2 ship as one release** (owner decision 2026-10-31). Build it in two rounds:
  - **W1** — the wealth tab (5th tab `ทรัพย์สิน`, piggy-bank icon) per the mockup: holdings, the `อัปเดตราคา` sheet, metrics and daily snapshots.
  - **W2** — the Vercel price function plus a `ดึงราคาล่าสุด` button. Auto-fetch on open when online and prices are older than 6 h. Manual prices remain the fallback (offline, failed source) and always win over auto.
  - Sources: Yahoo Finance for `.BK` and foreign stocks (Finnhub/Twelve Data fallback), SEC Thailand for fund NAV, the Thai gold-traders association for 96.5% gold (scraped, most fragile), Bitkub for crypto in THB (CoinGecko fallback), Frankfurter for FX.
  - The function returns native price + THB, caches for 15 min, returns partial results when a source fails, and accepts only our origin + token.
- **W3** — encrypted Supabase backup/sync. The client encrypts each record with the passphrase, so the server never sees amounts. Merge is per record by `updatedAt`, with tombstones. The app never depends on Supabase being online (free projects pause after 7 idle days).
- ~~**W4** — push alerts (due dates, big price moves) driven only by the non-amount v5 payload and the B5.1a morning refresh. Net-worth snapshots stay on the phone.~~ ตัดออกตามที่เจ้าของตัดสินใจ 2026-11-02
- Any time before W3: a share-sheet backup export to iCloud Drive.

### 4.1 Data model (sketch; final shape decided in the W1 shape step)
New top-level fields in `spendTrackerState`. Every record has `id`, `updatedAt` and `deleted` (tombstone, needed for W3):
- `accounts: [{ name, kind: 'cash'|'bank'|'brokerage'|'fund'|'retirement'|'other', currency, liquid, includeInNetWorth, archived, sortOrder }]`
- `balances: [{ accountId, asOf, value, note }]` — manual values; the latest `asOf` per account wins.
- `holdings: [{ accountId, assetType: 'th_stock'|'foreign_stock'|'fund'|'gold'|'crypto', symbol, units, avgCost, currency, diversified }]` — `diversified` (ETF/fund) excludes it from single-name concentration.
- `priceCache: { [symbol]: { price, currency, at, source: 'manual'|'auto' } }` — a manual override wins over auto.
- `liabilities: [{ name, kind: 'mortgage'|'loan'|'card'|'other', balance, asOf, interestRate, monthlyPayment, linkedId }]` — `linkedId` points at a derived debt (installment item or card) and **replaces** its estimate; clearing it goes back to the app's value.
- `wealthSettings` — thresholds and goals (see 4.4).
- `snapshots: { 'YYYY-MM-DD': { assets, liabilities, netWorth, liquid, breakdown, metrics } }` — written on app open, one per day (idempotent).

### 4.2 Valuation rules (in `wealth-core.js`)
- Holding value = `units × price × fx`. Price = `priceCache[symbol]`; FX = cached THB rate for that currency (THB = 1).
- **Stale** if a price is older than 5 calendar days, FX older than 3 days, or a manual balance older than 45 days. Stale values still count but are flagged everywhere they appear.
- **Liabilities** = manual `liabilities` plus derived debts not linked by a manual one, tagged `อัตโนมัติ`:
  - each active v3a F2 installment: `remainingFinancing(item, currentMonth)`, labelled `ประมาณจากงวดที่เหลือ (ไม่รวมดอกเบี้ย)`;
  - TTB `ค้างโอนคืน`;
  - KBANK closed unpaid cycle + open cycle running total, labelled `ประมาณ`.
- `assets` = accounts with `includeInNetWorth`; `liquid` = accounts with `liquid`; `netWorth = assets − liabilities`.
- **Change decomposition** between two snapshots: `market = Σ units_prev × (price_now×fx_now − price_prev×fx_prev)` over holdings held on both dates; `flows = ΔnetWorth − market`. Show both: a rising net worth from deposits is not investment performance.

### 4.3 App UI (Thai) — follows the mockup
- Hero: `มูลค่าสุทธิ ฿{netWorth}`, sub-line `เทียบเดือนก่อน {+฿x} (ตลาด {+฿a} · เงินเข้า-ออก {+฿b})`, muted `ข้อมูล ณ {date}`, and the line chart.
- The eye toggle (`aria-pressed`) masks every baht figure on the tab as `฿••••`, including tooltips and table views. Remember it in `localStorage['spendTrackerHideWealth']`.
- Groups `เงินในบัญชี` / `เงินลงทุน` / `หนี้`. Each row shows its value, `asOf`, and a `ข้อมูลเก่า` / `ราคาเก่า` badge when stale.
- Investments: P/L per item and per account. Prices for a whole account are updated in one `อัปเดตราคา` sheet. CSV import `symbol,assetType,units,avgCost` with a preview + `openConfirm` before replacing.
- Health card `สุขภาพการเงิน` (4.4): value + target + text status (`ผ่าน` / `ควรดู` / `ต่ำกว่าเป้า`). Colour is never the only signal.
- **Monthly update prompt**: from the 1st, a banner `อัปเดตยอดประจำเดือน: {n} บัญชีข้อมูลเก่า` opens one form with every stale manual account/liability, one input each, and `บันทึกทั้งหมด`. This is the main defence against data decay.
- `ดูเป็นตาราง` text alternative under every chart.

### 4.4 Metrics, goals and thresholds (`wealthSettings`)
Defaults (all editable in a `เป้าหมายและเกณฑ์` settings section):
```json
{
  "emergencyMonthsTarget": 6,
  "savingsRateTarget": 0.20,
  "maxSingleHoldingPct": 20,
  "bigMovePct": 7,
  "bigMoveMinWeightPct": 5,
  "drawdownPct": 5,
  "spendPaceTolerancePct": 15,
  "fxExposureWatchPct": 50,
  "briefingShareAmounts": false,
  "goals": []
}
```
Metrics (computed in `wealth-core.js`, stored in `snapshots[date].metrics`):
- `savingsRateMonth` = spend-tracker `คงเหลือ` ÷ `รายได้` for the last complete month; `savingsRate3m` = average of 3 complete months. Savings-funded trips are reported separately as `ใช้เงินเก็บกับทริป ฿X` (they reduce assets, not คงเหลือ).
- `cashRunwayMonths` = `liquid` ÷ average monthly outflow (fixed + variable + all trip entries) over the last 3 complete months.
- `debtToAssets` = liabilities ÷ assets.
- `topSingleHoldingPct` = largest **non-diversified** holding ÷ investable assets (brokerage + fund + retirement).
- `fxExposurePct` = non-THB assets ÷ assets.
- `drawdownFrom90dHighPct`, `change1dPct`, `change30dPct`.
- `upcoming7d` = v3a F3 due items + KBANK due date (phase 4) within 7 days. TTB has no due date.
- `goals`: `[{ id, name, target, targetDate, accountIds }]` → progress % and required monthly saving.

### v4 test checklist
1. Offline and never logged in: the wealth tab works fully; spend tracker unchanged.
2. Valuation example — bank ฿200,000 (liquid); SET `PTT` 1,000 @ ฿34; US `VOO` 10 @ $500, FX 33 (diversified); Thai fund 8,000 units @ NAV 12.5; property ฿3,000,000 (manual `other` account, not liquid); F2 car 8,000 × 20 remaining terms; KBANK closed cycle ฿12,400 unpaid; mortgage ฿1,200,000; average monthly outflow ฿40,000; `savingsRate3m` 21% →
   assets **฿3,499,000**; liabilities **฿1,372,400**; net worth **฿2,126,600**; investable ฿299,000; `topSingleHoldingPct` = PTT **11.4%** (VOO excluded as diversified); FX exposure 165,000/3,499,000 = **4.7%**; `cashRunwayMonths` 200,000/40,000 = **5.0**; `debtToAssets` **0.39**.
3. Linking a manual liability to the car's fixed item replaces (not adds to) the F2 estimate.
4. Decomposition: PTT 34 → 35 and a ฿10,000 bank deposit → market **+฿1,000**, flows **+฿10,000**.
5. Stale: a price 6 days old shows `ราคาเก่า`; a bank balance 50 days old appears in the monthly update form.
6. W2 price fetch fails or times out (or one source fails) → last cached prices are used, flagged stale, no error shown; a manual price is never overwritten by auto.
7. Opening the app twice the same day → one snapshot.
8. W3: the stored Supabase rows contain no readable amounts or names; offline edits on two devices merge by `updatedAt`; a wrong passphrase never overwrites local data.
8a. TTB `ค้างโอนคืน` and KBANK unpaid appear as `อัตโนมัติ` debts; an override replaces them and can be cleared back to the app's value.
9. `ซ่อนตัวเลข` masks every figure on the wealth view, including tooltips and the table view.
10. Unit tests for every `wealth-core.js` function; no secrets in repo; a11y and 375px rules as in v3a.

---

## v5 — Briefing integration: "What does it mean for me?"

> Goal: the existing morning briefing (news, Thai news, AI, business, portfolio) receives a compact, privacy-safe summary of Pun's finances plus **pre-computed triggers**, and answers: `เกิดอะไรขึ้น` · `กระทบเราอย่างไร` · `ควรทำอะไร`.
> **Local-first (agreed 2026-10-30):** the phone computes the payload and uploads it. The server never sees raw data (the W3 sync is encrypted). Its only computation is the morning price refresh (B5.1a), which uses symbols, weights and unit prices, never amounts.

### Global rules for v5
- Decisions about what matters are **deterministic triggers** (B5.2). The LLM explains and connects news to triggers/holdings; it does not invent impacts, numbers or recommendations.
- Default payload contains **percentages, ratios, symbols and day counts only**. Baht amounts are included only when `wealthSettings.briefingShareAmounts = true`.
- Two tokens: the app uploads with its own token; the briefing reads with a separate revocable token of `scope = 'briefing'` (created in Settings → `สร้างรหัสสำหรับ briefing`, shown once, only its hash stored). Store it only as a secret of the briefing job.
- `ไม่มีอะไรต้องทำวันนี้` is the expected output on most days.
- **Repo boundary.** The morning brief lives outside this repo (separate repo or scheduled task) and stays private. This repo (public via GitHub Pages) holds only the app, the payload builder in `js/`, and `docs/BRIEFING_CONTRACT.md`. The endpoint, payload store and morning cron live in the private Vercel repo next to `/api/prices` (not Supabase). Never add news sources, briefing prompts beyond the contract, tokens, or personal config here.

### B5.1 Briefing payload (built on the phone) + endpoint `briefing-context`
- The app builds the payload with `wealth-core.js` on open and after saves, and uploads it on demand when online (`PUT`, app token). Failure is silent; it retries next time.
- Besides the fields below, the upload includes, per holding, `price_at_upload` + `currency` (a unit price, not an amount) so the server can re-weight.
- The briefing calls `GET` with `Authorization: Bearer <briefing token>` (wrong scope or revoked → 401) and gets the latest stored payload. If `personal_as_of` is older than one day, the response adds `stale: true`.

### B5.1a Morning price refresh (server, Vercel cron)
- Runs daily at 06:00 Asia/Bangkok (after the US close, before the briefing). It uses the same source adapters as W2 `/api/prices`.
- For the symbols in the latest payload, it fetches prices and FX, then sets `weight_new ∝ weight × (price_now×fx_now) / (price_at_upload×fx_at_upload)`, normalised over investable assets.
- Recomputes only the price-driven fields:
  - `holdings[].change_1d_pct` and `weight_pct`
  - `allocation`
  - portfolio 1-day change = Σ weight × change
  - `freshness.prices_as_of`
  - triggers T2, T3, T8, and the price part of T7
- Everything else (spending, runway, savings, debt, goals, T1/T4/T5/T6/T9/T10) stays as the phone last sent it.
- A source failure keeps the previous price for that symbol and counts it in `freshness.stale_items`. It never blanks the payload.
- The app may pull these morning prices on open to fill `priceCache` (`source: 'auto'`; a manual price still wins).
- Payload:
```json
{
  "personal_as_of": "2026-11-03",
  "freshness": { "prices_as_of": "2026-11-03T06:00+07:00", "stale_items": 1, "oldest_manual_days": 38 },
  "health": {
    "change_1d_pct": -0.4, "change_30d_pct": 1.8,
    "change_30d_split": { "market_pct": 0.9, "flows_pct": 0.9 },
    "savings_rate_month": 0.24, "savings_rate_3m": 0.21,
    "cash_runway_months": 5.0, "debt_to_assets": 0.39,
    "fx_exposure_pct": 4.7, "drawdown_from_90d_high_pct": 1.2
  },
  "allocation": [{ "class": "SET", "pct": 1.0 }, { "class": "US", "pct": 4.7 }],
  "holdings": [{ "symbol": "PTT", "market": "SET", "weight_pct": 11.4, "change_1d_pct": 2.9, "diversified": false }],
  "spending": { "month_progress_pct": 10, "pace": "ahead|on_track|behind", "over_budget_categories": ["อาหาร"] },
  "upcoming": [{ "type": "card", "label": "บัตร KBank", "due_in_days": 3 }],
  "trip": { "name": "ทริปจีน", "day": 3, "days": 7, "budget_used_pct": 55 },
  "goals": [{ "name": "เงินสำรองฉุกเฉิน", "progress_pct": 83 }],
  "triggers": [{ "id": "T1", "severity": "watch", "text_th": "เงินสำรองพอใช้ 5.0 เดือน (เป้า 6)", "metric": "cash_runway_months", "value": 5.0, "threshold": 6 }],
  "amounts": null
}
```
`trip` is `null` when no trip is active; `amounts` is filled (net worth, liquid, liabilities, upcoming baht) only when sharing is enabled.

### B5.2 Triggers (deterministic, thresholds from 4.4)
| id | Rule | Severity |
|---|---|---|
| T1 | `cash_runway_months` < `emergencyMonthsTarget` (< 3 → act) | watch / act |
| T2 | non-diversified holding > `maxSingleHoldingPct` of investable | watch |
| T3 | holding with weight ≥ `bigMoveMinWeightPct` moved ≥ ±`bigMovePct` in 1 day | info |
| T4 | net worth ≥ `drawdownPct` below 90-day high (market component only) | watch |
| T5 | month spend ahead of pace by > `spendPaceTolerancePct` after day 7; `คงเหลือ` < 0 → act | watch / act |
| T6 | card or fixed item due within its remind window and unpaid | act |
| T7 | stale prices/FX or manual data > 45 days | info |
| T8 | `fx_exposure_pct` > `fxExposureWatchPct` and THB moved ≥ 2% in 7 days | info |
| T9 | `savings_rate_3m` < `savingsRateTarget` | watch |
| T10 | goal behind schedule (required monthly saving > 3-month average saving) | watch |

Unit-test each rule at, just below and just above its threshold.

### B5.3 Prompt contract for the briefing (`docs/BRIEFING_CONTRACT.md`)
Write this file in **this repo** as the source of truth (Thai output, English rules). Do not build any briefing code here — the owner copies the contract into the morning-brief system (its prompt or task instructions) and re-copies it whenever it changes. Include at the top a `Contract version: 1` line and the `briefing-context` response schema from B5.1, so both sides can be checked against the same version:
- Output exactly three sections: `เกิดอะไรขึ้น`, `กระทบเราอย่างไร`, `ควรทำอะไร`.
- Link a news item to personal finances **only** if it names a held symbol, its sector, a market in `allocation`, a currency in exposure, or relates to a fired trigger. Each sentence in `กระทบเราอย่างไร` cites the symbol or trigger id in brackets, e.g. `[PTT]`, `[T1]`.
- `ควรทำอะไร`: at most 3 items, each tied to an `act` or `watch` trigger, phrased as a check or review (`ทบทวน…`, `ตรวจ…`, `โอน… ก่อนวันที่…`) — never a buy/sell instruction. No act/watch triggers → `ไม่มีอะไรต้องทำวันนี้`.
- Never state a number that is not in the payload or the news source. If `freshness.stale_items > 0`, add one line `ข้อมูลบางส่วนเก่า (ณ {date})`.
- Whole personal section ≤ 150 words in Thai.

### B5.4 Feedback loop
- `briefing_log` per date: `{ date, triggers, actions, feedback: 'useful'|'noise'|'acted', note, updatedAt }`, stored next to the payload on Vercel (no amounts). The app reads it on open and keeps a local copy.
- `briefing-context` accepts `POST` with the same token to record `{ date, triggers, actions }` after the briefing is generated.
- Wealth tab: card `briefing เช้านี้` listing today's actions with buttons `มีประโยชน์` / `ไม่จำเป็น` / `ทำตามแล้ว` (44px, `aria-pressed`).
- After 90 days, a `สรุป 90 วัน` panel: number of days with actions, % marked `ทำตามแล้ว`, triggers most often marked `ไม่จำเป็น` (candidates for raising thresholds). This is the success measure: decisions changed, not data collected.

### v5 test checklist
1. Default payload contains no baht amounts or account names (assert by schema + a grep for `฿` and digits ≥ 4 in the default response); enabling sharing adds `amounts` only.
2. Tokens: the briefing token can read but not upload; the app token can't be used by the briefing; revoked → 401; neither works on the v3b slip endpoints.
3. Each trigger fires/does not fire around its threshold (unit tests); the v4 test-checklist example (item 2) fires none of T1–T10 except T1 (runway 5.0 < 6).
4. Prompt contract dry run (run in the morning-brief system, not this repo) with fixtures: a day with no act/watch triggers → `ไม่มีอะไรต้องทำวันนี้`; a news item about an unheld company → no personal-impact sentence; every impact sentence carries a citation.
5. App not opened for 2 days → prices still refreshed each morning; personal part returned with `stale: true` and the freshness line appears. Offline phone → no upload, no error.
6. Feedback buttons write `briefing_log`; the 90-day summary counts match.
7. Morning refresh: PTT weight 11.4% at ฿34 → price ฿37.4 (+10%), others unchanged → new weight 11.4×1.1 / (100 + 11.4×0.1) = **12.4%**; T3 fires (≥ 7% move, weight ≥ 5%). One source down → that symbol keeps yesterday's price and `stale_items` goes up by 1.

---

## Later ideas (not scheduled)
- (Web Push for due dates and `act` triggers was planned as v4 W4, which the owner dropped on 2026-11-02.)
- Import credit-card e-statements and broker statements (CSV/PDF) to update v4 balances with less manual entry.
- Email-alert ingestion via Zapier/Make → `add-from-slip`-style endpoint.
- Weekly/monthly long-form review (net worth trend, savings rate, goal progress) in addition to the daily briefing.
- Scenario check: "if X drops 20%" / "if income falls 30%" using v4 data.
- Multiple wallets; calendar heatmap.
