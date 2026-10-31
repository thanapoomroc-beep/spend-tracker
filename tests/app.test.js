const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load');
const plain = v => JSON.parse(JSON.stringify(v));   // objects built inside the vm have another realm's prototypes

test('date helpers use local time, not UTC', () => {
  // 20:00 UTC on 28 Oct is already 29 Oct 03:00 in Bangkok.
  const { run } = loadApp({ now: '2026-10-28T20:00:00Z' });
  assert.equal(run('todayISO()'), '2026-10-29');
  assert.equal(run('pad2(7)'), '07');
  assert.equal(run('monthKey(new Date(2026, 0, 31))'), '2026-01');
  const d = run('parseISODate("2026-10-28")');
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 9, 28, 0]);
});

test('migrateState keeps a v1 backup intact and upgrades it to schema 3', () => {
  const { run } = loadApp({ now: '2026-10-28T05:00:00Z' });
  const v1 = {
    settings: { income: 30000, fixedItems: [{ id: 'f1', name: 'ผ่อนรถ', amount: 8000 }] },
    entries: [
      { id: 'a', date: '2026-10-13', amount: 120, category: 'อาหาร', note: '' },
      { id: 'b', date: '2026-10-14', amount: 380, category: 'ช้อปปิ้ง', note: 'x' }
    ]
  };
  const out = JSON.parse(JSON.stringify(run(`migrateState(${JSON.stringify(v1)})`)));
  assert.equal(out.schemaVersion, 3);
  assert.equal(out.entries.length, 2);
  assert.deepEqual(out.entries.map(e => e.amount), [120, 380]);
  assert.equal(out.settings, undefined);
  assert.equal(out.monthlySettings['2026-10'].income, 30000);
  assert.equal(out.monthlySettings['2026-10'].fixedItems[0].amount, 8000);
  assert.equal(out.monthlySettings['2026-10'].fixedItems[0].group, 'financing');
  const slots = out.categories.map(c => [c.name, c.slot]);
  assert.deepEqual(slots, [['อาหาร', 0], ['การเดินทาง', 1], ['สาธารณูปโภค', 2], ['ช้อปปิ้ง', 3], ['สุขภาพ', 4], ['บันเทิง', 5], ['อื่นๆ', null]]);
  assert.deepEqual(out.paymentMethods.map(p => p.id), ['cash', 'ttb', 'kbank']);
  assert.deepEqual(out.trips, []);
});

const SEED = {
  schemaVersion: 3,
  monthlySettings: { '2026-10': { income: 30000, fixedItems: [{ id: 'f', name: 'ผ่อนรถ', amount: 8000, group: 'financing' }] } },
  trips: [
    { id: 't1', name: 'จีน', currency: 'CNY', thbPerUnit: 5, startDate: '2026-10-20', endDate: '2026-10-25', funding: 'income' },
    { id: 't2', name: 'ญี่ปุ่น', currency: 'JPY', thbPerUnit: 0.25, startDate: '2026-10-26', endDate: '2026-10-28', funding: 'savings' }
  ],
  entries: [
    { id: 'e1', date: '2026-10-13', amount: 120, category: 'อาหาร' },
    { id: 'e2', date: '2026-10-14', amount: 380, category: 'ช้อปปิ้ง' },
    { id: 'e3', date: '2026-10-21', amount: 1000, category: 'อาหาร', tripId: 't1' },
    { id: 'e4', date: '2026-10-27', amount: 2000, category: 'ที่พัก', tripId: 't2' }
  ]
};
function seeded() {
  const app = loadApp({ now: '2026-10-28T05:00:00Z' });
  app.run(`state = migrateState(${JSON.stringify(SEED)})`);
  return app;
}

test('entriesForMonth excludes trip entries', () => {
  const { run } = seeded();
  assert.deepEqual(plain(run('entriesForMonth(new Date(2026, 9, 1))')).map(e => e.id), ['e1', 'e2']);
  assert.deepEqual(plain(run('tripEntriesForMonth(new Date(2026, 9, 1))')).map(e => e.id), ['e3', 'e4']);
  assert.equal(run('allEntriesForMonth(new Date(2026, 9, 1))').length, 4);
});

test('month figures: only the income-funded trip reduces คงเหลือ', () => {
  const { run } = seeded();
  const f = JSON.parse(JSON.stringify(run('(() => { const x = monthFigures(new Date(2026, 9, 1)); return { income:x.income, fixed:x.fixed, variable:x.variable, tripTotal:x.tripTotal, tripFromIncome:x.tripFromIncome, remaining:x.remaining }; })()')));
  assert.deepEqual(f, { income: 30000, fixed: 8000, variable: 500, tripTotal: 3000, tripFromIncome: 1000, remaining: 20500 });
});

test('installments count only inside their term window', () => {
  const { run } = loadApp({ now: '2026-10-28T05:00:00Z' });
  run(`state = migrateState({ monthlySettings: { '2025-01': { income: 0, fixedItems: [{ id:'i', name:'ผ่อน', amount: 1000, group:'financing', startMonth:'2026-01', totalTerms:12 }] } } })`);
  const count = m => run(`getEffectiveSettings('${m}').fixedItems.length`);
  assert.equal(count('2026-12'), 1);
  assert.equal(count('2026-01'), 1);
  assert.equal(count('2027-01'), 0);
  assert.equal(count('2025-12'), 0);
  assert.equal(run(`installmentInfo(getRawSettings('2026-12').fixedItems[0], '2026-12').left`), 0);
});

test('due dates: days away and month-end clamping', () => {
  const { run } = loadApp({ now: '2026-10-28T05:00:00Z' });
  run(`state = migrateState({ monthlySettings: { '2026-01': { income: 0, fixedItems: [
    { id:'a', name:'A', amount: 100, group:'subscription', dueDay: 2 },
    { id:'b', name:'B', amount: 200, group:'subscription', dueDay: 31 } ] } } })`);
  const oct28 = plain(run('upcomingPayments(new Date(2026, 9, 28))')).map(p => [p.name, p.off]);
  assert.deepEqual(oct28, [['B', 3], ['A', 5]]);   // B (31 Oct) is 3 days away, A (2 Nov) is 5
  const nov26 = plain(run('upcomingPayments(new Date(2026, 10, 26))')).map(p => [p.name, p.off]);
  assert.deepEqual(nov26, [['B', 4], ['A', 6]]);   // dueDay 31 in November resolves to Nov 30 (26 + 4); A is 2 Dec
});

test('formatting matches the UI', () => {
  const { run } = loadApp();
  assert.equal(run('fmtCur(300, "CNY")'), '300元');
  assert.equal(run('fmtCur(300, "JPY")'), '¥300');
  assert.equal(run('fmtCur(12.5, "THB")'), '฿12.5');
  assert.equal(run('fmt(1234.4)'), '฿1,234');
  assert.equal(run('fmt(1234.5)'), '฿1,235');
});
