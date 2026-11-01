const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load');
const plain = v => JSON.parse(JSON.stringify(v));   // objects built inside the vm have another realm's prototypes

const TODAY = '2026-11-01';
const T = '2026-10-30T10:00:00+07:00';
const acc = (id, name, group, extra) => Object.assign({ id, name, group, archived: false, sortOrder: 1, updatedAt: T, deleted: false }, extra || {});
const bal = (id, accountId, date, value) => ({ id, accountId, date, value, updatedAt: T, deleted: false });
const hold = (id, accountId, assetType, symbol, units, cost, currency, extra) => Object.assign({ id, accountId, assetType, symbol, units, cost, currency: currency || 'THB', updatedAt: T, deleted: false }, extra || {});
const price = (price, currency, at, source) => ({ price, currency: currency || 'THB', at: at || TODAY, source: source || 'manual' });

// ROADMAP v4 checklist item 2.
function scenario() {
  const w = {
    accounts: [acc('bank', 'กสิกร', 'cash'), acc('inv', 'พอร์ต', 'invest'), acc('prop', 'บ้าน', 'invest')],
    balances: [bal('b1', 'bank', '2026-10-30', 200000), bal('b2', 'prop', '2026-10-01', 3000000)],
    holdings: [
      hold('h1', 'inv', 'th_stock', 'PTT', 1000, 30000),
      hold('h2', 'inv', 'foreign_stock', 'VOO', 10, 4000, 'USD'),
      hold('h3', 'inv', 'fund', 'KFUND', 8000, 90000)
    ],
    liabilities: [{ id: 'l1', name: 'สินเชื่อบ้าน', date: '2026-10-30', balance: 1200000, updatedAt: T, deleted: false }],
    debtOverrides: {},
    priceCache: { 'th_stock:PTT': price(34), 'foreign_stock:VOO': price(500, 'USD'), 'fund:KFUND': price(12.5) },
    fxCache: { USD: { thb: 33, at: TODAY, source: 'manual' } }
  };
  const car = { id: 'car', name: 'ผ่อนรถ', amount: 8000, group: 'financing', startMonth: '2025-01', totalTerms: 43 };
  const kbank = { id: 'kbank', name: 'บัตรเครดิต KBANK', archived: false, cardType: 'statement', statementDay: 25, dueDay: 5, updatedAt: T };
  const entries = [{ id: 'e1', date: '2026-09-20', amount: 12400, category: 'ช้อปปิ้ง', note: '', paymentMethod: 'kbank' }];
  const derivedInput = { fixedItems: [car], mKey: '2026-11', methods: [kbank], entries, payments: [], today: TODAY };
  return { w, derivedInput, car };
}
function summary(run, w, derivedInput) {
  return plain(run(`(() => { const w = ${JSON.stringify(w)}; return wealthSummary(w, derivedDebts(${JSON.stringify(derivedInput)}), '${TODAY}'); })()`));
}

test('valuation example: assets 3,499,000, debts 1,372,400, net 2,126,600', () => {
  const { run } = loadApp();
  const { w, derivedInput } = scenario();
  const s = summary(run, w, derivedInput);
  assert.equal(s.assets, 3499000);
  assert.equal(s.debtTotal, 1372400);
  assert.equal(s.net, 2126600);
  assert.equal(s.cashTotal, 200000);
  assert.equal(s.investTotal, 3299000);
  const inv = s.invest.find(a => a.id === 'inv');
  assert.equal(inv.value, 299000);
  assert.equal(inv.hasHoldings, true);
  assert.equal(inv.holdingCount, 3);
  assert.equal(inv.cost, 4000 * 33 + 30000 + 90000);
  assert.equal(inv.pl, 299000 - (30000 + 132000 + 90000));
  const byKey = Object.fromEntries(inv.holdings.map(h => [h.key, h.value]));
  assert.deepEqual(byKey, { 'th_stock:PTT': 34000, 'foreign_stock:VOO': 165000, 'fund:KFUND': 100000 });
  const debt = Object.fromEntries(s.debts.map(d => [d.id, d]));
  assert.equal(debt['inst:car'].balance, 160000);
  assert.equal(debt['inst:car'].auto, true);
  assert.equal(debt['card:kbank'].balance, 12400);
  assert.equal(debt['liab:l1'].balance, 1200000);
  assert.equal(debt['liab:l1'].auto, false);
});

test('gold: 15.244 g at 40,000 per baht is 40,000; a holding in baht is not converted', () => {
  const { run } = loadApp();
  const w = { accounts: [acc('g', 'ทอง', 'invest')], balances: [], liabilities: [], debtOverrides: {}, fxCache: {},
    holdings: [hold('g1', 'g', 'gold', 'GOLD', 15.244, 38000, 'THB', { unit: 'gram' }), hold('g2', 'g', 'gold', 'GOLD', 2, 70000, 'THB', { unit: 'baht' })],
    priceCache: { 'gold:GOLD': price(40000) } };
  const s = summary(run, w, { fixedItems: [], mKey: '2026-11', methods: [], entries: [], payments: [], today: TODAY });
  const rows = s.invest[0].holdings;
  assert.equal(rows[0].value, 40000);
  assert.equal(rows[1].value, 80000);
  assert.equal(s.assets, 120000);
});

test('an override replaces the derived debt (it does not add to it) and clearing goes back', () => {
  const { run } = loadApp();
  const { w, derivedInput } = scenario();
  w.debtOverrides = { 'card:kbank': { balance: 10000, date: '2026-10-31', updatedAt: T }, 'inst:car': { balance: 150000, date: '2026-10-31', updatedAt: T } };
  let s = summary(run, w, derivedInput);
  assert.equal(s.debtTotal, 10000 + 150000 + 1200000);
  const k = s.debts.find(d => d.id === 'card:kbank');
  assert.equal(k.overridden, true);
  assert.equal(k.derivedBalance, 12400);
  w.debtOverrides = {};
  s = summary(run, w, derivedInput);
  assert.equal(s.debtTotal, 1372400);
});

test('derived debts: TTB owed, KBANK before the day is set, payments ahead of a statement, ended installment, zero balances hidden', () => {
  const { run } = loadApp();
  const ttb = { id: 'ttb', name: 'บัตรเครดิต TTB', archived: false, cardType: 'repay' };
  const kb = { id: 'kbank', name: 'บัตรเครดิต KBANK', archived: false, cardType: 'statement' };
  const entries = [
    { id: 'a', date: '2026-10-10', amount: 5000, paymentMethod: 'ttb' },
    { id: 'b', date: '2026-10-11', amount: 2000, paymentMethod: 'kbank' }
  ];
  const pays = [{ id: 'p', methodId: 'ttb', date: '2026-10-20', amount: 1500 }];
  const done = { id: 'x', name: 'จบแล้ว', amount: 1000, group: 'financing', startMonth: '2025-01', totalTerms: 12 };
  const last = { id: 'y', name: 'งวดสุดท้าย', amount: 1000, group: 'financing', startMonth: '2026-04', totalTerms: 8 };
  const d = plain(run(`derivedDebts(${JSON.stringify({ fixedItems: [done, last], mKey: '2026-11', methods: [ttb, kb], entries, payments: pays, today: TODAY })})`));
  const by = Object.fromEntries(d.map(x => [x.id, x]));
  assert.equal(by['card:ttb'].balance, 3500);
  assert.equal(by['card:ttb'].name, 'ค้างโอนคืน TTB');
  assert.equal(by['card:kbank'].balance, 2000);            // statement day not set yet: running total
  assert.equal(by['inst:x'], undefined);                   // ended
  assert.equal(by['inst:y'].balance, 0);                   // last term: nothing left, kept as a candidate
  // zero balances do not show as debt rows
  const s = plain(run(`wealthSummary({accounts:[],balances:[],holdings:[],liabilities:[],debtOverrides:{},priceCache:{},fxCache:{}}, ${JSON.stringify(d)}, '${TODAY}')`));
  assert.deepEqual(s.debts.map(x => x.id).sort(), ['card:kbank', 'card:ttb']);
  // a KBANK payment made ahead of the statement lowers the debt
  const kc = Object.assign({}, kb, { statementDay: 25, dueDay: 5 });
  const d2 = plain(run(`derivedDebts(${JSON.stringify({ fixedItems: [], mKey: '2026-11', methods: [kc], entries: [{ id: 'c', date: '2026-10-28', amount: 3000, paymentMethod: 'kbank' }], payments: [{ id: 'q', methodId: 'kbank', date: '2026-10-30', amount: 3000 }], today: TODAY })})`));
  assert.equal(d2[0].balance, 0);
});

test('remainingFinancing matches the "เหลืออีก" figure of installmentText', () => {
  const { run } = loadApp();
  const item = { id: 'c', name: 'ผ่อนรถ', amount: 8000, group: 'financing', startMonth: '2025-01', totalTerms: 43 };
  const rem = run(`remainingFinancing(${JSON.stringify(item)}, '2026-11')`);
  assert.equal(rem, 160000);
  assert.ok(run(`installmentText(${JSON.stringify(item)}, '2026-11')`).includes('เหลืออีก ' + run(`fmt(${rem})`)));
  assert.equal(run(`remainingFinancing(${JSON.stringify(item)}, '2024-12')`), 0);   // not started
  assert.equal(run(`remainingFinancing(${JSON.stringify(item)}, '2028-09')`), 0);   // ended
  assert.equal(run(`remainingFinancing(${JSON.stringify(item)}, '2028-07')`), 0);   // last term: 0 left
  assert.equal(run(`remainingFinancing({ amount: 5 }, '2026-11')`), 0);             // no terms
});

test('price layer: manual wins over auto until cleared, auto never overwrites manual', () => {
  const { run } = loadApp();
  const out = plain(run(`(() => {
    const c = {}, k = 'th_stock:PTT', r = [];
    setAutoPrice(c, k, 34, 'THB', '2026-10-31');
    r.push(effectivePrice(c, k));
    setManualPrice(c, k, 36, 'THB', '2026-11-01');
    r.push(effectivePrice(c, k));
    r.push(setAutoPrice(c, k, 35, 'THB', '2026-11-01'));      // a fetch while a manual price exists
    r.push(effectivePrice(c, k));
    r.push(clearManualPrice(c, k));
    r.push(effectivePrice(c, k));
    const c2 = {}; setManualPrice(c2, k, 40, 'THB', '2026-11-01');
    r.push(clearManualPrice(c2, k), effectivePrice(c2, k), clearManualPrice(c2, k));
    return r;
  })()`));
  assert.equal(out[0].price, 34); assert.equal(out[0].source, 'auto');
  assert.equal(out[1].price, 36); assert.equal(out[1].source, 'manual');
  assert.equal(out[2], false);
  assert.equal(out[3].price, 36);
  assert.equal(out[4], 'restored');
  assert.equal(out[5].price, 35); assert.equal(out[5].source, 'auto');
  assert.equal(out[6], 'removed'); assert.equal(out[7], null); assert.equal(out[8], 'none');
});

test('stale boundaries: price 5 days ok / 6 stale, FX 3 / 4, balance 45 / 46', () => {
  const { run } = loadApp();
  const st = (stamp, lim) => run(`isStale('${stamp}', '${TODAY}', ${lim})`);
  assert.equal(st('2026-10-27', 5), false); assert.equal(st('2026-10-26', 5), true);
  assert.equal(st('2026-10-29', 3), false); assert.equal(st('2026-10-28', 3), true);
  assert.equal(st('2026-09-17', 45), false); assert.equal(st('2026-09-16', 45), true);
  assert.equal(run(`isStale(null, '${TODAY}', 5)`), false);
  // through the summary
  const { w } = scenario();
  w.priceCache['th_stock:PTT'] = price(34, 'THB', '2026-10-26');
  w.balances[0].date = '2026-09-16';
  const s = summary(run, w, { fixedItems: [], mKey: '2026-11', methods: [], entries: [], payments: [], today: TODAY });
  assert.equal(s.cash[0].stale, true);
  const inv = s.invest.find(a => a.id === 'inv');
  assert.equal(inv.stale, true);
  assert.equal(inv.holdings.find(h => h.key === 'th_stock:PTT').stale, true);
  assert.equal(inv.holdings.find(h => h.key === 'fund:KFUND').stale, false);
  w.fxCache.USD.at = '2026-10-28';
  const s2 = summary(run, w, { fixedItems: [], mKey: '2026-11', methods: [], entries: [], payments: [], today: TODAY });
  assert.equal(s2.invest.find(a => a.id === 'inv').holdings.find(h => h.key === 'foreign_stock:VOO').stale, true);
});

test('month change splits market from flows (PTT 34 to 35 plus a 10,000 deposit)', () => {
  const { run } = loadApp();
  const out = plain(run(`(() => {
    const base = ${JSON.stringify(scenario().w)};
    const sum = w => wealthSummary(w, [], '2026-11-01');
    const a = buildSnapshot(sum(base));
    const w2 = JSON.parse(JSON.stringify(base));
    w2.priceCache['th_stock:PTT'].price = 35;
    w2.balances.push({ id: 'b9', accountId: 'bank', date: '2026-11-01', value: 210000, updatedAt: 'z', deleted: false });
    const b = buildSnapshot(sum(w2));
    const snaps = { '2026-10-31': a, '2026-11-01': b };
    return { stored: monthChange(snaps, '2026-11-01'), live: monthChange({ '2026-10-31': a }, '2026-11-01', b), none: monthChange({ '2026-11-01': b }, '2026-11-01'), noPrev: monthChange({ '2026-09-30': a }, '2026-11-01', b) };
  })()`));
  assert.equal(out.stored.market, 1000);
  assert.equal(out.stored.flows, 10000);
  assert.equal(out.stored.change, 11000);
  assert.deepEqual(out.live, out.stored);
  assert.equal(out.none, null);       // no snapshot in the previous month yet
  assert.equal(out.noPrev, null);     // the last one is two months back
});

test('snapshots: one per day (idempotent), holdings keyed with price-unit quantities, month series', () => {
  const { run } = loadApp();
  const out = plain(run(`(() => {
    const w = ${JSON.stringify(scenario().w)};
    const g = { id: 'gg', accountId: 'inv', assetType: 'gold', symbol: 'GOLD', units: 15.244, cost: 0, currency: 'THB', unit: 'gram', updatedAt: 'x', deleted: false };
    w.holdings.push(g); w.priceCache['gold:GOLD'] = { price: 40000, currency: 'THB', at: '2026-11-01', source: 'manual' };
    const snap = buildSnapshot(wealthSummary(w, [], '2026-11-01'));
    const snaps = {};
    const first = upsertSnapshot(snaps, '2026-11-01', snap), second = upsertSnapshot(snaps, '2026-11-01', JSON.parse(JSON.stringify(snap)));
    snaps['2026-08-31'] = { assets: 1, debts: 0, net: 100, holdings: [] };
    snaps['2026-08-15'] = { assets: 1, debts: 0, net: 90, holdings: [] };
    snaps['2026-10-30'] = { assets: 1, debts: 0, net: 150, holdings: [] };
    return { first, second, keys: Object.keys(snaps).length, gold: snap.holdings.find(h => h.key === 'gold:GOLD'), series: monthSeries(snaps, 12), cut: monthSeries(snaps, 2) };
  })()`));
  assert.equal(out.first, true); assert.equal(out.second, false);
  assert.equal(out.gold.units, 1); assert.equal(out.gold.unitTHB, 40000);
  assert.deepEqual(out.series.map(p => [p.month, p.net, p.change]), [['2026-08', 100, null], ['2026-10', 150, 50], ['2026-11', out.series[2].net, out.series[2].net - 150]]);
  assert.equal(out.cut.length, 2);
  assert.equal(out.cut[0].change, null);
});

test('migrateState: a 2.5.0 backup (no wealth fields) imports with empty wealth, nothing else changes', () => {
  const { run } = loadApp({ now: '2026-11-01T05:00:00Z' });
  const old = {
    schemaVersion: 3, monthlySettings: { '2026-10': { income: 30000, fixedItems: [{ id: 'f', name: 'ผ่อนรถ', amount: 8000, group: 'financing' }], updatedAt: 'x' } },
    budgetSettings: {}, budgetUpdatedAt: {}, entries: [{ id: 'a', date: '2026-10-13', amount: 120, category: 'อาหาร', note: '' }],
    paymentMethods: [{ id: 'cash', name: 'เงินสด', archived: false, cardType: '', updatedAt: 'x' }], cardPayments: [], trips: []
  };
  const out = plain(run(`migrateState(${JSON.stringify(old)})`));
  ['accounts', 'balances', 'holdings', 'liabilities'].forEach(k => assert.deepEqual(out[k], []));
  ['debtOverrides', 'priceCache', 'fxCache', 'snapshots'].forEach(k => assert.deepEqual(out[k], {}));
  assert.equal(out.entries.length, 1);
  assert.equal(plain(run('freshState()')).accounts.length, 0);
  assert.deepEqual(plain(run('freshState()')).snapshots, {});
});

test('wealth data survives export, migrate and re-export unchanged; malformed records are dropped', () => {
  const { run } = loadApp({ now: '2026-11-01T05:00:00Z' });
  const { w } = scenario();
  const st = Object.assign(plain(run('freshState()')), w, {
    holdings: w.holdings.concat([hold('g', 'inv', 'gold', 'GOLD', 15.244, 0, 'THB', { unit: 'gram' })]),
    debtOverrides: { 'card:kbank': { balance: 5, date: '2026-10-31', updatedAt: T } },
    snapshots: { '2026-10-31': { assets: 10, debts: 2, net: 8, holdings: [{ key: 'th_stock:PTT', units: 1000, unitTHB: 34 }] } }
  });
  st.priceCache['th_stock:PTT'] = Object.assign(price(36), { auto: { price: 34, currency: 'THB', at: '2026-10-30T03:00:00.000Z' } });
  const json = JSON.stringify(st);
  const once = plain(run(`migrateState(JSON.parse(${JSON.stringify(json)}))`));
  const twice = plain(run(`migrateState(JSON.parse(${JSON.stringify(JSON.stringify(once))}))`));
  assert.deepEqual(twice, once);
  ['accounts', 'balances', 'holdings', 'liabilities', 'debtOverrides', 'priceCache', 'fxCache', 'snapshots'].forEach(k => assert.deepEqual(once[k], st[k], k));

  const bad = plain(run('freshState()'));
  Object.assign(bad, {
    accounts: [acc('ok', 'ดี', 'cash'), acc('x', '', 'cash'), acc('y', 'ผิด', 'weird'), acc('ok', 'ซ้ำ', 'cash'), null],
    balances: [bal('b', 'ok', '2026-10-01', 5), bal('c', 'nope', '2026-10-01', 5), bal('d', 'ok', 'bad-date', 5), bal('e', 'ok', '2026-10-01', NaN)],
    holdings: [hold('h', 'ok', 'th_stock', 'ptt', 5, 1), hold('i', 'ok', 'th_stock', 'PTT', -1, 1), hold('j', 'ok', 'nft', 'X', 1, 1), hold('k', 'ok', 'th_stock', 'AOT', 1, 1, 'usd')],
    debtOverrides: { 'inst:a': { balance: 1, date: '2026-10-01' }, junk: { balance: 1, date: '2026-10-01' }, 'card:b': { balance: -1, date: '2026-10-01' } },
    priceCache: { 'th_stock:PTT': price(0), 'fund:A': price(1), nokey: price(1) },
    fxCache: { USD: { thb: 33, at: 'x' }, THB: { thb: 1, at: 'x' }, usd: { thb: 1, at: 'x' }, EUR: { thb: -1, at: 'x' } },
    snapshots: { '2026-10-31': { assets: 1, debts: 0, net: 1 }, 'bad': { assets: 1, debts: 0, net: 1 }, '2026-10-30': { assets: 'x', debts: 0, net: 1 } }
  });
  const m = plain(run(`migrateState(${JSON.stringify(bad)})`));
  assert.deepEqual(m.accounts.map(a => a.id), ['ok']);
  assert.deepEqual(m.balances.map(b => b.id), ['b']);
  assert.deepEqual(m.holdings.map(h => [h.id, h.symbol, h.currency]), [['h', 'PTT', 'THB'], ['k', 'AOT', 'THB']]);
  assert.deepEqual(Object.keys(m.debtOverrides), ['inst:a']);
  assert.equal(m.debtOverrides['inst:a'].updatedAt, '1970-01-01T00:00:00Z');
  assert.deepEqual(Object.keys(m.priceCache), ['fund:A']);
  assert.deepEqual(Object.keys(m.fxCache), ['USD']);
  assert.deepEqual(Object.keys(m.snapshots), ['2026-10-31']);
});

test('a holding with no price or no FX rate is worth 0 and flagged, never an error', () => {
  const { run } = loadApp();
  const { w } = scenario();
  delete w.priceCache['th_stock:PTT'];
  delete w.fxCache.USD;
  const s = summary(run, w, { fixedItems: [], mKey: '2026-11', methods: [], entries: [], payments: [], today: TODAY });
  const inv = s.invest.find(a => a.id === 'inv');
  const by = Object.fromEntries(inv.holdings.map(h => [h.key, h]));
  assert.equal(by['th_stock:PTT'].missingPrice, true);
  assert.equal(by['foreign_stock:VOO'].missingFx, true);
  assert.equal(inv.value, 100000);
  assert.equal(inv.incomplete, true);
  const snap = plain(run(`buildSnapshot(${JSON.stringify(s)})`));
  assert.deepEqual(snap.holdings.map(h => h.key), ['fund:KFUND']);   // unpriced holdings stay out of the market split
});
