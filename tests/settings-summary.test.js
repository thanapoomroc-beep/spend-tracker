const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load');

const NOW = '2026-11-16T10:00:00+07:00';
function app(setup){
  const a = loadApp({ now: NOW });
  a.run('state = freshState();');
  if(setup) a.run(setup);
  return a;
}
const ctxOf = (a, extra) => a.run(`Object.assign({ month:'2026-11', today:'2026-11-16', lastExportAt:'', priceOn:false, priceAt:0, slip:{on:false}, cloud:{on:false}, briefing:{on:false} }, ${JSON.stringify(extra || {})})`);
function sums(a, extra){
  a.run('globalThis.__c = ' + JSON.stringify(ctxOf(a, extra)));
  return JSON.parse(a.run('JSON.stringify(settingsSummaries(state, __c))'));
}

test('empty fresh state', () => {
  const a = app('state.monthlySettings = {}; state.budgetSettings = {};');
  const s = sums(a);
  assert.equal(s.income.text, 'ยังไม่ได้ตั้ง');
  assert.equal(s.budget.text, 'ยังไม่ได้ตั้ง');
  assert.equal(s.trips.text, 'ยังไม่มี');
  assert.equal(s.export.text, 'ยังไม่เคยสำรองในเครื่องนี้');
  assert.equal(s.price.text, 'ยังไม่ได้ตั้ง');
  assert.equal(s.slip.text, 'ปิดอยู่');
  assert.equal(s.cloud.text, 'ปิดอยู่');
  assert.equal(s.briefing.text, 'ปิดอยู่');
  assert.equal(s.thresholds.text, 'ค่าเริ่มต้น');
  assert.match(s.category.text, /^\d+ หมวด$/);
  assert.match(s.payment.text, /^\d+ ช่องทาง/);
  Object.values(s).forEach(v => assert.ok(!v.warn));
});

test('income, fixed items and budgets', () => {
  const a = app(`state.monthlySettings['2026-11'] = { income: 50000, updatedAt: nowISO(), fixedItems: [
    { id:'a', name:'ผ่อน', amount:100, group:'financing' }, { id:'b', name:'x', amount:1, group:'subscription' }, { id:'c', name:'y', amount:1, group:'subscription' }] };
    state.budgetSettings['2026-10'] = { 'อาหาร': 5000, 'การเดินทาง': 0, 'หายไป': 100 };`);
  const s = sums(a);
  assert.equal(s.income.text, 'ตั้งแล้ว');
  assert.equal(s.financing.text, '1 รายการ');
  assert.equal(s.subscription.text, '2 รายการ');
  assert.equal(s.budget.text, 'ตั้งไว้ 1 หมวด');   // carried forward, zero and unknown category ignored
  assert.ok(!/฿|\d{3,}/.test(s.income.text + s.budget.text));
});

test('archived categories and payments, card count', () => {
  const a = app(`state.categories[0].archived = true; state.categories[1].archived = true;
    state.paymentMethods.forEach(m => { if(m.id === 'cash') m.archived = true; });`);
  const total = a.run('state.categories.length');
  const s = sums(a);
  assert.equal(s.category.text, `${total - 2} หมวด ซ่อนไว้ 2`);
  const pays = a.run('activePays().length'), cards = a.run('activePays().filter(isCardMethod).length');
  assert.equal(s.payment.text, `${pays} ช่องทาง` + (cards ? ` บัตร ${cards} ใบ` : ''));
  assert.ok(cards >= 1);
});

test('active trip name is shown as plain text, else a count', () => {
  const a = app(`state.trips = [{ id:'t1', name:'<b>x</b>', startDate:'2026-11-01', endDate:'2026-11-09' }, { id:'t2', name:'เก่า', startDate:'2026-01-01', endDate:'2026-01-09' }];`);
  assert.equal(sums(a).trips.text, '2 ทริป');
  a.run(`state.activeTripId = 't1'`);
  assert.equal(sums(a).trips.text, 'กำลังเที่ยว <b>x</b>');
});

test('last export and price times are absolute', () => {
  const a = app();
  assert.equal(sums(a, { lastExportAt: '2026-11-16T14:02:00+07:00' }).export.text, 'สำรองล่าสุด วันนี้ 14:02');
  assert.equal(sums(a, { lastExportAt: '2026-11-15T09:00:00+07:00' }).export.text, 'สำรองล่าสุด เมื่อวาน');
  assert.equal(sums(a, { lastExportAt: '2026-11-12T09:00:00+07:00' }).export.text, 'สำรองล่าสุด 12 พ.ย.');
  assert.equal(sums(a, { lastExportAt: '2025-11-12T09:00:00+07:00' }).export.text, 'สำรองล่าสุด 12 พ.ย. 2568');
  assert.equal(sums(a, { priceOn: true }).price.text, 'เชื่อมต่อแล้ว');
  assert.equal(sums(a, { priceOn: true, priceAt: Date.parse('2026-11-12T09:00:00+07:00') }).price.text, 'เชื่อมต่อแล้ว ราคาล่าสุด 12 พ.ย.');
});

test('online sections: off, on, time, warn', () => {
  const a = app();
  let s = sums(a, { slip: { on: true } });
  assert.equal(s.slip.text, 'เปิดอยู่');
  s = sums(a, { slip: { on: true, lastPullAt: '2026-11-16T08:05:00+07:00' }, cloud: { on: true, lastOkAt: '2026-11-15T20:00:00+07:00' }, briefing: { on: true, lastOkAt: '2026-11-16T09:30:00+07:00' } });
  assert.equal(s.slip.text, 'เปิดอยู่ ดึงล่าสุด วันนี้ 08:05');
  assert.equal(s.cloud.text, 'เปิดอยู่ สำรองล่าสุด เมื่อวาน');
  assert.equal(s.briefing.text, 'เปิดอยู่ ส่งล่าสุด วันนี้ 09:30');
  s = sums(a, { slip: { on: true, err: 'x' }, cloud: { on: true, err: 'network' }, briefing: { on: true, err: 'network' } });
  assert.deepEqual([s.slip, s.cloud, s.briefing], [{ text: 'ดึงไม่ได้', warn: true }, { text: 'สำรองไม่ได้', warn: true }, { text: 'ส่งไม่ได้', warn: true }]);
  s = sums(a, { cloud: { on: false, err: 'network' } });   // an old error never shows on a switched-off feature
  assert.equal(s.cloud.text, 'ปิดอยู่');
});

test('thresholds: count changed ones, reset returns to default', () => {
  const a = app();
  assert.equal(sums(a).thresholds.text, 'ค่าเริ่มต้น');
  a.run('state.wealthSettings.bigMovePct = 9');
  assert.equal(sums(a).thresholds.text, 'ปรับไว้ 1 ข้อ');
  a.run('state.wealthSettings.drawdownPct = 9');
  assert.equal(sums(a).thresholds.text, 'ปรับไว้ 2 ข้อ');
  a.run('HEALTH_THRESHOLD_KEYS.forEach(k => { state.wealthSettings[k] = WEALTH_SETTINGS_DEFAULTS[k]; })');
  assert.equal(sums(a).thresholds.text, 'ค่าเริ่มต้น');
});

test('monthChangeGap: first, gap, ok, none', () => {
  const a = loadApp({ now: NOW });
  const g = (snaps, today) => a.run(`monthChangeGap(${JSON.stringify(snaps)}, '${today}')`);
  const snap = { net: 1, holdings: [] };
  assert.equal(g({}, '2026-11-16'), null);
  assert.equal(g({ '2026-11-16': snap }, '2026-11-16'), 'first');
  assert.equal(g({ '2026-11-02': snap, '2026-11-16': snap }, '2026-11-16'), 'first');
  assert.equal(g({ '2026-09-30': snap, '2026-11-16': snap }, '2026-11-16'), 'gap');
  assert.equal(g({ '2026-09-30': snap }, '2026-11-16'), 'gap');
  assert.equal(g({ '2026-10-31': snap, '2026-11-16': snap }, '2026-11-16'), null);
  assert.equal(g({ '2025-12-31': snap, '2026-01-05': snap }, '2026-01-20'), null);   // year boundary
});
