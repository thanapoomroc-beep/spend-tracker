const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load');
const plain = v => JSON.parse(JSON.stringify(v));   // objects built inside the vm have another realm's prototypes

const NOW = '2026-11-12T10:00:00+07:00';
const TODAY = '2026-11-12';
const T = '2026-11-10T10:00:00+07:00';
const acc = (id, name, group) => ({ id, name, group, archived: false, sortOrder: 1, updatedAt: T, deleted: false });
const bal = (id, accountId, date, value) => ({ id, accountId, date, value, updatedAt: T, deleted: false });
const hold = (id, accountId, assetType, symbol, units, currency, extra) => Object.assign({ id, accountId, assetType, symbol, units, cost: 0, currency: currency || 'THB', updatedAt: T, deleted: false }, extra || {});
const px = (price, currency) => ({ price, currency: currency || 'THB', at: '2026-11-12T03:00:00.000Z', source: 'auto' });
const entry = (id, date, amount, category, extra) => Object.assign({ id, date, amount, category: category || 'อาหาร', note: '', updatedAt: T }, extra || {});

// A realistic phone: income 50,000, fixed 18,000 (rent 10,000 + car 8,000), Aug-Oct spending 12,000 each, 15,000 so far in Nov (day 12).
function fixture(over) {
  const monthly = [];
  ['2026-08', '2026-09', '2026-10'].forEach(m => { monthly.push(entry('v' + m, m + '-05', 12000, 'ช้อปปิ้ง')); });
  const st = {
    monthlySettings: { '2026-07': { income: 50000, updatedAt: T, fixedItems: [
      { id: 'rent', name: 'ค่าเช่า', amount: 10000, group: 'subscription', dueDay: 15 },
      { id: 'car', name: 'ผ่อนรถ', amount: 8000, group: 'financing', startMonth: '2025-01', totalTerms: 43, dueDay: 28 }] } },
    budgetSettings: { '2026-07': { อาหาร: 5000, ช้อปปิ้ง: 20000 } },
    entries: monthly.concat([entry('n1', '2026-11-03', 6000, 'อาหาร', { note: 'โน้ตลับสุดยอด-7731' }), entry('n2', '2026-11-08', 9000, 'ช้อปปิ้ง')]),
    accounts: [acc('bank', 'บัญชีลับ-กสิกร', 'cash'), acc('inv', 'พอร์ตลับ', 'invest'), acc('prop', 'ที่ดินลับ', 'invest')],
    balances: [bal('b1', 'bank', '2026-11-01', 150000), bal('b2', 'prop', '2026-10-20', 100000)],
    holdings: [hold('h1', 'inv', 'th_stock', 'PTT', 5000), hold('h2', 'inv', 'foreign_stock', 'VOO', 10, 'USD', { diversified: true }), hold('h3', 'inv', 'fund', 'KFUND', 8000)],
    priceCache: { 'th_stock:PTT': px(34), 'foreign_stock:VOO': px(500, 'USD'), 'fund:KFUND': px(12.5) },
    fxCache: { USD: { thb: 33, at: TODAY, source: 'auto' } }
  };
  return Object.assign(st, over || {});
}
function setup(over, opts) {
  const app = loadApp(Object.assign({ now: NOW }, opts || {}));
  app.run(`state = migrateState(${JSON.stringify(Object.assign({}, fixture(over)))})`);
  return app;
}
const TH = { emergencyMonthsTarget: 6, savingsRateTarget: 0.2, maxSingleHoldingPct: 20, bigMovePct: 7, bigMoveMinWeightPct: 5, drawdownPct: 5, spendPaceTolerancePct: 15, fxExposureWatchPct: 50 };
const ids = list => list.map(t => t.id);

/* ---------- Metrics on the fixture ---------- */
test('metrics on the fixture: rates, runway, debt, FX, top holding, allocation', () => {
  const { run } = setup();
  const c = plain(run('healthCompute(state, new Date())'));
  const h = c.health;
  assert.equal(h.savings_rate_month, 0.4);       // (50000 - 18000 - 12000) / 50000
  assert.equal(h.savings_rate_3m, 0.4);
  assert.equal(h.cash_runway_months, 5);          // 150000 / 30000 outflow
  assert.equal(h.debt_to_assets, 0.234);          // car: 8000 x 20 terms left = 160000 over 685000
  assert.equal(h.fx_exposure_pct, 24.1);          // VOO 165000 / 685000
  assert.equal(h.change_1d_pct, null);
  assert.equal(h.change_30d_pct, null);
  assert.equal(h.drawdown_from_90d_high_pct, null);
  assert.equal(c.top_single_holding_symbol, 'PTT');   // VOO and the fund are diversified
  assert.equal(c.top_single_holding_pct, 31.8);
  const pf = c.portfolio;
  assert.equal(pf.investable_share_pct, 78.1);
  const w = pf.holdings.reduce((s, x) => s + x.weight_pct, 0) + pf.investable_other_pct;
  assert.ok(Math.abs(w - 100) < 1e-9, 'weights + other = ' + w);
  const a = pf.allocation.reduce((s, x) => s + x.pct, 0);
  assert.ok(Math.abs(a - 100) < 0.2, 'allocation = ' + a);
  assert.deepEqual(pf.allocation.map(x => x.class), ['CASH', 'SET', 'US', 'FUND', 'OTHER']);
  assert.deepEqual(plain(pf.fx_at_upload), { USD: 33 });
  assert.equal(pf.holdings.find(x => x.symbol === 'VOO').currency, 'USD');
  assert.equal(pf.holdings.find(x => x.symbol === 'VOO').price_at_upload, 500);
  assert.equal(pf.holdings.find(x => x.symbol === 'KFUND').diversified, true);
  assert.equal(pf.holdings.find(x => x.symbol === 'PTT').diversified, false);
});

test('fixture triggers: runway, concentration and spending pace fire; nothing else', () => {
  const { run } = setup();
  const c = plain(run('healthCompute(state, new Date())'));
  assert.deepEqual(ids(c.triggers), ['T1', 'T2', 'T5']);
  const t1 = c.triggers[0], t5 = c.triggers[2];
  assert.equal(t1.severity, 'watch'); assert.equal(t1.value, 5); assert.equal(t1.threshold, 6);
  assert.equal(t1.text_th, 'เงินสำรองพอใช้ 5.0 เดือน (เป้า 6)');
  assert.equal(t5.severity, 'watch'); assert.equal(t5.value, 17.2);      // 15000 vs 32000 x 12/30 = 12800
  assert.deepEqual(c.spending.over_budget_categories, ['อาหาร']);
  assert.equal(c.spending.month_progress_pct, 40);
  assert.equal(c.spending.pace, 'ahead');
});

test('the ROADMAP v4 example: only T1 among the money triggers (runway 5.0 < 6)', () => {
  const { run } = setup({ entries: fixture().entries.filter(e => e.id.startsWith('v')) });
  const c = plain(run('healthCompute(state, new Date())'));
  assert.ok(!ids(c.triggers).includes('T5'));
  assert.ok(ids(c.triggers).includes('T1'));
});

test('missing data gives null metrics and fires nothing', () => {
  const app = loadApp({ now: NOW });
  const c = plain(app.run('healthCompute(freshState(), new Date())'));
  Object.keys(c.health).forEach(k => assert.equal(c.health[k], null, k));
  assert.deepEqual(c.triggers, []);
  assert.deepEqual(c.portfolio.allocation, []);
  assert.equal(c.top_single_holding_pct, null);
  // One complete month is not enough for the 3-month figures.
  const { run } = setup({ entries: [entry('a', '2026-10-05', 12000, 'ช้อปปิ้ง')] });
  const d = plain(run('healthCompute(state, new Date())')).health;
  assert.equal(d.savings_rate_month, 0.4);
  assert.equal(d.savings_rate_3m, null);
  assert.equal(d.cash_runway_months, null);
});

test('the current month never counts as a complete month', () => {
  const { run } = setup({ entries: [entry('a', '2026-11-05', 99999, 'ช้อปปิ้ง'), entry('b', '2026-10-05', 12000, 'ช้อปปิ้ง'), entry('c', '2026-09-05', 12000, 'ช้อปปิ้ง')] });
  const h = plain(run('healthCompute(state, new Date())')).health;
  assert.equal(h.savings_rate_3m, 0.4);   // only Oct and Sep
});

test('trip entries count in outflow (runway) and trips funded from income reduce the savings rate', () => {
  const trips = [{ id: 't1', name: 'ทริป', currency: 'CNY', thbPerUnit: 5, startDate: '2026-10-01', endDate: '2026-10-07', budget: 0, funding: 'income', createdAt: T, updatedAt: T }];
  const e = fixture().entries.concat([entry('tt', '2026-10-03', 10000, 'ที่พัก', { tripId: 't1', currency: 'THB', rate: 1, originalAmount: 10000, splitCount: 1 })]);
  const { run } = setup({ trips, entries: e });
  const h = plain(run('healthCompute(state, new Date())')).health;
  // Oct: remaining 20000 - 10000 = 10000 -> 0.2; Aug and Sep 0.4 -> mean 0.333
  assert.equal(h.savings_rate_3m, 0.333);
  assert.equal(h.cash_runway_months, hRound(150000 / ((30000 + 30000 + 40000) / 3), 1));
});
function hRound(n, d) { const f = Math.pow(10, d); return Math.round(n * f) / f; }

test('only non-diversified holdings count as concentration; the flag follows the sheet default', () => {
  const { run } = setup({ holdings: [hold('h1', 'inv', 'th_stock', 'PTT', 5000, 'THB', { diversified: true }), hold('h3', 'inv', 'fund', 'KFUND', 8000)] });
  const c = plain(run('healthCompute(state, new Date())'));
  assert.equal(c.top_single_holding_pct, 0);
  assert.equal(c.top_single_holding_symbol, null);
  assert.ok(!ids(c.triggers).includes('T2'));
});

test('30-day change splits market from flows; drawdown ignores deposits', () => {
  const snaps = {
    '2026-10-10': { assets: 600000, debts: 160000, net: 440000, holdings: [{ key: 'th_stock:PTT', units: 5000, unitTHB: 34 }] },
    '2026-10-20': { assets: 600000, debts: 160000, net: 440000, holdings: [{ key: 'th_stock:PTT', units: 5000, unitTHB: 40 }] }
  };
  const { run } = setup({ snapshots: snaps });
  const h = plain(run('healthCompute(state, new Date())')).health;
  // now: net = 685000 - 160000 = 525000; base = 2026-10-10 (33 days old)
  assert.equal(h.change_30d_pct, 19.3);                         // 85000 / 440000
  assert.equal(h.change_30d_split.market_pct, 0);               // PTT is 34 now, as on 10-10
  assert.equal(h.change_30d_split.flows_pct, 19.3);
  // The market-only level: 440000 -> +30000 (34 -> 40) -> -30000 (40 -> 34 now): a drawdown from the 10-20 high.
  assert.equal(h.drawdown_from_90d_high_pct, hRound(30000 / 470000 * 100, 1));
});

/* ---------- Triggers at, just below and just above the threshold ---------- */
const trig = (m, th) => plain(loadApp().run(`healthTriggers(${JSON.stringify(m)}, ${JSON.stringify(Object.assign({}, TH, th || {}))})`));
const fired = (m, id, th) => trig(m, th).filter(t => t.id === id);

test('T1: below the target fires (watch), below 3 is act, the target itself and null do not', () => {
  assert.equal(fired({ runway: 6 }, 'T1').length, 0);
  assert.equal(fired({ runway: 6.1 }, 'T1').length, 0);
  assert.equal(fired({ runway: null }, 'T1').length, 0);
  assert.equal(fired({ runway: 5.9 }, 'T1')[0].severity, 'watch');
  assert.equal(fired({ runway: 3 }, 'T1')[0].severity, 'watch');
  const act = fired({ runway: 2.9 }, 'T1')[0];
  assert.equal(act.severity, 'act'); assert.equal(act.metric, 'cash_runway_months'); assert.equal(act.value, 2.9); assert.equal(act.threshold, 6);
});
test('T2: strictly over the limit, never for a diversified holding', () => {
  const hs = w => [{ symbol: 'PTT', weight_pct: w, diversified: false }];
  assert.equal(fired({ holdings: hs(19.9) }, 'T2').length, 0);
  assert.equal(fired({ holdings: hs(20) }, 'T2').length, 0);
  const t = fired({ holdings: hs(20.1) }, 'T2')[0];
  assert.equal(t.severity, 'watch'); assert.equal(t.value, 20.1);
  assert.equal(fired({ holdings: [{ symbol: 'VOO', weight_pct: 60, diversified: true }] }, 'T2').length, 0);
  assert.equal(fired({ holdings: hs(25) }, 'T2', { maxSingleHoldingPct: 30 }).length, 0);
});
test('T3: weight at least the minimum and a 1-day move of at least the limit, either direction', () => {
  const hs = (w, c) => [{ symbol: 'PTT', weight_pct: w, diversified: false, change_1d_pct: c }];
  assert.equal(fired({ holdings: hs(5, 6.9) }, 'T3').length, 0);
  assert.equal(fired({ holdings: hs(5, 7) }, 'T3').length, 1);
  assert.equal(fired({ holdings: hs(5, 7.1) }, 'T3')[0].severity, 'info');
  assert.equal(fired({ holdings: hs(5, -7) }, 'T3').length, 1);
  assert.equal(fired({ holdings: hs(4.9, 20) }, 'T3').length, 0);
  assert.equal(fired({ holdings: hs(5, null) }, 'T3').length, 0);
  assert.match(fired({ holdings: hs(10, -8.2) }, 'T3')[0].text_th, /−8\.2%/);
});
test('T4: a drawdown of at least the limit', () => {
  assert.equal(fired({ drawdown: 4.9 }, 'T4').length, 0);
  assert.equal(fired({ drawdown: 5 }, 'T4').length, 1);
  assert.equal(fired({ drawdown: 5.1 }, 'T4')[0].severity, 'watch');
  assert.equal(fired({ drawdown: null }, 'T4').length, 0);
});
test('T5: only after day 7, watch when ahead of pace by more than the tolerance, act when คงเหลือ is negative', () => {
  const sp = (day, ahead, remaining, income) => ({ spend: { day, income: income === undefined ? 50000 : income, remaining, aheadPct: ahead } });
  assert.equal(fired(sp(7, 90, 100), 'T5').length, 0);          // day 7 is still too early
  assert.equal(fired(sp(7, 90, -5), 'T5').length, 0);           // even for a negative balance
  assert.equal(fired(sp(8, 14.9, 100), 'T5').length, 0);
  assert.equal(fired(sp(8, 15, 100), 'T5').length, 0);          // exactly the tolerance
  const w = fired(sp(8, 15.1, 100), 'T5')[0];
  assert.equal(w.severity, 'watch'); assert.equal(w.value, 15.1); assert.equal(w.threshold, 15);
  assert.equal(fired(sp(8, null, 100), 'T5').length, 0);
  const a = fired(sp(8, 40, -1), 'T5')[0];
  assert.equal(a.severity, 'act');
  assert.equal(fired(sp(20, 10, -1, 0), 'T5').length, 0);       // no income set: nothing to compare with
});
test('T6: a card bill due within 3 days or late, never later', () => {
  const c = off => ({ cards: [{ name: 'บัตร KBANK', off }] });
  assert.equal(fired(c(4), 'T6').length, 0);
  const t3 = fired(c(3), 'T6')[0];
  assert.equal(t3.severity, 'act'); assert.equal(t3.text_th, 'บัตร KBANK ครบกำหนดอีก 3 วัน');
  assert.equal(fired(c(0), 'T6')[0].text_th, 'บัตร KBANK ครบกำหนดวันนี้');
  assert.equal(fired(c(-2), 'T6')[0].text_th, 'บัตร KBANK เลยกำหนด 2 วัน');
  assert.equal(fired({ cards: [] }, 'T6').length, 0);
});
test('T7: stale prices, or a manual figure older than 45 days', () => {
  const f = (s, o) => ({ freshness: { stale_items: s, oldest_manual_days: o } });
  assert.equal(fired(f(0, 45), 'T7').length, 0);
  assert.equal(fired(f(0, null), 'T7').length, 0);
  assert.equal(fired(f(0, 46), 'T7')[0].severity, 'info');
  assert.equal(fired(f(1, 3), 'T7')[0].metric, 'stale_items');
  assert.equal(fired(f(0, 46), 'T7')[0].metric, 'oldest_manual_days');
});
test('T8: FX exposure over the watch level and the baht moved at least 2% in 7 days', () => {
  assert.equal(fired({ fxExposure: 50, fxMove7d: 3 }, 'T8').length, 0);
  assert.equal(fired({ fxExposure: 50.1, fxMove7d: 1.9 }, 'T8').length, 0);
  assert.equal(fired({ fxExposure: 50.1, fxMove7d: 2 }, 'T8').length, 1);
  assert.equal(fired({ fxExposure: 50.1, fxMove7d: -2.5 }, 'T8')[0].severity, 'info');
  assert.equal(fired({ fxExposure: 80, fxMove7d: null }, 'T8').length, 0);   // the phone has no FX history: the server owns this one
});
test('T9: 3-month savings rate below the target', () => {
  assert.equal(fired({ savings3m: 0.2 }, 'T9').length, 0);
  assert.equal(fired({ savings3m: 0.201 }, 'T9').length, 0);
  const t = fired({ savings3m: 0.199 }, 'T9')[0];
  assert.equal(t.severity, 'watch'); assert.equal(t.threshold, 0.2); assert.match(t.text_th, /19\.9%/);
  assert.equal(fired({ savings3m: null }, 'T9').length, 0);
});
test('triggers come out in id order with the agreed fields; thresholds are read from the settings', () => {
  const out = trig({ runway: 2, savings3m: 0.1, drawdown: 9, fxExposure: 90, fxMove7d: 5, freshness: { stale_items: 2 } });
  assert.deepEqual(ids(out), ['T1', 'T4', 'T7', 'T8', 'T9']);
  out.forEach(t => assert.deepEqual(Object.keys(t), ['id', 'severity', 'text_th', 'metric', 'value', 'threshold']));
  assert.deepEqual(ids(trig({ runway: 5 }, { emergencyMonthsTarget: 4 })), []);
});

/* ---------- Payload ---------- */
const ALLOWED_BIG = new Set(['amounts', 'price_at_upload', 'fx_at_upload']);
function bigNumbers(v, path, out) {
  if (typeof v === 'number') { if (Math.abs(v) >= 1000 && !path.some(p => ALLOWED_BIG.has(p))) out.push(path.join('.') + '=' + v); }
  else if (Array.isArray(v)) v.forEach((x, i) => bigNumbers(x, path.concat(String(i)), out));
  else if (v && typeof v === 'object') Object.keys(v).forEach(k => bigNumbers(v[k], path.concat(k), out));
  return out;
}
test('default payload: schema, no names, notes, baht or big numbers; sharing adds only amounts', () => {
  const { run } = setup();
  const p = plain(run('buildBriefingPayload(state, new Date())'));
  assert.equal(p.schema_version, 1);
  assert.equal(p.personal_as_of, '2026-11-12');
  assert.equal(p.uploaded_at, '2026-11-12T10:00:00+07:00');
  assert.deepEqual(p.thresholds, TH);
  assert.deepEqual(p.goals, []);
  assert.equal(p.amounts, null);
  assert.equal(p.trip, null);
  const text = JSON.stringify(p);
  ['บัญชีลับ', 'พอร์ตลับ', 'ที่ดินลับ', 'โน้ตลับสุดยอด', '฿'].forEach(s => assert.ok(!text.includes(s), s));
  assert.deepEqual(bigNumbers(p, [], []), []);
  assert.deepEqual(p.upcoming.map(u => [u.type, u.label, u.due_in_days]), [['fixed', 'ค่าเช่า', 3]]);
  p.triggers.forEach(t => assert.ok(!/฿/.test(t.text_th)));

  run('state.wealthSettings.briefingShareAmounts = true');
  const q = plain(run('buildBriefingPayload(state, new Date())'));
  assert.deepEqual(Object.keys(q.amounts), ['net_worth', 'liquid', 'liabilities', 'upcoming_thb']);
  assert.equal(q.amounts.net_worth, 525000); assert.equal(q.amounts.liquid, 150000); assert.equal(q.amounts.liabilities, 160000);
  const rest = Object.assign({}, q, { amounts: null });
  assert.deepEqual(rest, p);
  const t2 = JSON.stringify(rest);
  ['บัญชีลับ', 'โน้ตลับสุดยอด'].forEach(s => assert.ok(!t2.includes(s)));
});

test('payload upcoming: fixed items and unpaid card bills within 7 days, with days counted from today', () => {
  const methods = [{ id: 'kbank', name: 'บัตรเครดิต KBANK', archived: false, cardType: 'statement', statementDay: 25, dueDay: 14, updatedAt: T }];
  const e = fixture().entries.concat([entry('k1', '2026-10-20', 5000, 'ช้อปปิ้ง', { paymentMethod: 'kbank' })]);
  const { run } = setup({ paymentMethods: methods, entries: e });
  const p = plain(run('buildBriefingPayload(state, new Date())'));
  const card = p.upcoming.find(u => u.type === 'card');
  assert.deepEqual(card, { type: 'card', label: 'บัตรเครดิต KBANK', due_in_days: 2 });
  assert.equal(p.upcoming.find(u => u.type === 'fixed').label, 'ค่าเช่า');       // rent is due on the 15th = 3 days
  assert.equal(p.upcoming.find(u => u.type === 'fixed').due_in_days, 3);
  const t6 = p.triggers.find(t => t.id === 'T6');
  assert.equal(t6.severity, 'act'); assert.equal(t6.value, 2);
  assert.ok(!JSON.stringify(p).includes('5000'));
  run('state.wealthSettings.briefingShareAmounts = true');
  const q = plain(run('buildBriefingPayload(state, new Date())'));
  assert.equal(q.amounts.upcoming_thb, 15000);                                    // rent 10000 + card 5000
});

test('active trip is summarised without amounts; payload hash ignores the upload time only', () => {
  const trips = [{ id: 't1', name: 'ทริปจีน', currency: 'CNY', thbPerUnit: 5, startDate: '2026-11-10', endDate: '2026-11-16', budget: 20000, funding: 'savings', createdAt: T, updatedAt: T }];
  const e = fixture().entries.concat([entry('tt', '2026-11-11', 11000, 'ที่พัก', { tripId: 't1', currency: 'THB', rate: 1, originalAmount: 11000, splitCount: 1 })]);
  const { run } = setup({ trips, activeTripId: 't1', entries: e });
  const p = plain(run('buildBriefingPayload(state, new Date())'));
  assert.deepEqual(p.trip, { name: 'ทริปจีน', day: 3, days: 7, budget_used_pct: 55 });
  const h1 = run('briefingPayloadHash(buildBriefingPayload(state, new Date()))');
  const h2 = run('briefingPayloadHash(Object.assign(buildBriefingPayload(state, new Date()), { uploaded_at: "x" }))');
  assert.equal(h1, h2);
  run('state.wealthSettings.maxSingleHoldingPct = 30');
  assert.notEqual(run('briefingPayloadHash(buildBriefingPayload(state, new Date()))'), h1);
});

test('Bangkok date and offset, whatever the phone zone is', () => {
  const { run } = loadApp({ now: '2026-11-02T18:30:00Z' });   // 01:30 on the 3rd in Bangkok
  assert.deepEqual(plain(run('healthBangkok(new Date())')), { day: '2026-11-03', iso: '2026-11-03T01:30:00+07:00' });
});

test('rounded shares add up to exactly 100', () => {
  const { run } = loadApp();
  [[33.34, 33.33, 33.33], [0.04, 99.96], [12.34, 56.78, 30.88], [100]].forEach(v => {
    const r = plain(run(`healthRoundShares(${JSON.stringify(v)}, 1)`));
    assert.ok(Math.abs(r.reduce((s, x) => s + x, 0) - 100) < 1e-9, JSON.stringify(r));
  });
});

/* ---------- Migration ---------- */
test('migrateState: old backups get default wealthSettings and holding diversified flags', () => {
  const { run } = loadApp();
  const old = { monthlySettings: {}, entries: [], accounts: [acc('inv', 'พอร์ต', 'invest')],
    holdings: [hold('a', 'inv', 'th_stock', 'PTT', 1), hold('b', 'inv', 'fund', 'KF', 1), hold('c', 'inv', 'fund', 'KG', 1, 'THB', { diversified: false }), hold('d', 'inv', 'th_stock', 'AOT', 1, 'THB', { diversified: true })] };
  const m = plain(run(`migrateState(${JSON.stringify(old)})`));
  assert.deepEqual(m.wealthSettings, { emergencyMonthsTarget: 6, savingsRateTarget: 0.2, maxSingleHoldingPct: 20, bigMovePct: 7, bigMoveMinWeightPct: 5, drawdownPct: 5, spendPaceTolerancePct: 15, fxExposureWatchPct: 50, briefingShareAmounts: false, briefingEnabled: false, goals: [] });
  assert.deepEqual(m.holdings.map(h => h.diversified), [false, true, false, true]);
  assert.deepEqual(plain(run('freshState()')).wealthSettings, m.wealthSettings);
  // v1 backups (settings shape) import too
  const v1 = plain(run(`migrateState(${JSON.stringify({ settings: { income: 1000, fixedItems: [] }, entries: [] })})`));
  assert.equal(v1.wealthSettings.briefingEnabled, false);
});
test('migrateState: bad settings fall back or clamp, switches only accept true, and a second pass changes nothing', () => {
  const { run } = loadApp();
  const bad = { monthlySettings: {}, entries: [], wealthSettings: { emergencyMonthsTarget: 'x', savingsRateTarget: 5, maxSingleHoldingPct: -3, bigMovePct: 9, bigMoveMinWeightPct: null, briefingShareAmounts: 'yes', briefingEnabled: true, goals: 'no', extra: 1 } };
  const m = plain(run(`migrateState(${JSON.stringify(bad)})`));
  const ws = m.wealthSettings;
  assert.equal(ws.emergencyMonthsTarget, 6);
  assert.equal(ws.savingsRateTarget, 0.9);
  assert.equal(ws.maxSingleHoldingPct, 5);
  assert.equal(ws.bigMovePct, 9);
  assert.equal(ws.bigMoveMinWeightPct, 5);
  assert.equal(ws.briefingShareAmounts, false);
  assert.equal(ws.briefingEnabled, true);
  assert.deepEqual(ws.goals, []);
  assert.ok(!('extra' in ws));
  assert.deepEqual(plain(run(`migrateState(${JSON.stringify(m)})`)), m);
});
