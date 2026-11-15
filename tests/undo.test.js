const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, ROOT } = require('./load');
const plain = v => JSON.parse(JSON.stringify(v));

function setup() {
  const app = loadApp({ now: '2026-11-14T09:00:00+07:00' });
  app.run(`
    globalThis.__toasts = []; globalThis.__confirms = [];
    flashToast = (msg, ok, action) => { __toasts.push({ msg, ok, action }); };
    openConfirm = o => { __confirms.push(o); };
    render = () => {}; initForm = () => {}; renderThresholds = () => {}; renderBriefingCard = () => {};
    state = freshState();
    state.entries = ['a', 'b', 'c'].map((n, i) => ({ id: n, date: '2026-11-10', amount: 10 + i, category: 'อาหาร', updatedAt: '2026-11-10T00:00:00.000Z' }));
  `);
  return app;
}
const stored = app => JSON.parse(app.store.get('spendTrackerState') || 'null');
// loadApp returns { ctx, run, store }
test('delete then undo restores the same entry at the same index', async () => {
  const app = setup();
  const orig = app.run('state.entries[1]');
  await app.run('askDeleteEntry("b")');
  assert.equal(app.run('state.entries.length'), 2);
  assert.equal(stored(app).entries.length, 2);
  const last = app.run('__toasts[__toasts.length - 1]');
  assert.equal(last.msg, 'ลบแล้ว');
  assert.equal(last.action.label, 'เลิกทำ');
  await last.action.onClick();
  assert.equal(app.run('state.entries.length'), 3);
  assert.equal(app.run('state.entries[1]'), orig);
  assert.equal(app.run('state.entries[1].updatedAt'), '2026-11-10T00:00:00.000Z');
  assert.deepEqual(stored(app).entries.map(e => e.id), ['a', 'b', 'c']);
  await last.action.onClick();   // second tap must not duplicate
  assert.equal(app.run('state.entries.length'), 3);
});

test('askDeleteEntry runs afterDelete and ignores unknown ids', async () => {
  const app = setup();
  app.run('globalThis.__after = 0');
  await app.run('askDeleteEntry("zzz", () => __after++)');
  assert.equal(app.run('__after'), 0);
  assert.equal(app.run('state.entries.length'), 3);
  await app.run('askDeleteEntry("a", () => __after++)');
  assert.equal(app.run('__after'), 1);
});

test('a deleted slip entry is still a duplicate when the slip comes again', () => {
  const app = setup();
  const text = fs.readFileSync(path.join(ROOT, 'tests/fixtures/slips/kplus-qr-shop.txt'), 'utf8');
  const r = app.run(`(() => {
    const st = freshState();
    const items = [{ id: 1, source: 'kplus', photo_at: '2026-11-14T08:00:00Z', text: ${JSON.stringify(text)} }];
    const p1 = planSlipItems(items, st);
    applySlipPlan(st, p1);
    const n1 = st.entries.length;
    st.entries = st.entries.filter(e => !e.slipRef);
    const p2 = planSlipItems(items, st);
    return { n1, again: p2.entries.length, dup: p2.skipped.duplicate };
  })()`);
  assert.deepEqual(plain(r), { n1: 1, again: 0, dup: 1 });
});

test('restoreState puts the old state back and saves it', async () => {
  const app = setup();
  app.run('globalThis.__prev = state; state = freshState()');
  await app.run('restoreState(__prev, "เลิกทำแล้ว")');
  assert.equal(app.run('state === __prev'), true);
  assert.equal(stored(app).entries.length, 3);
  assert.equal(app.run('__toasts[__toasts.length - 1].msg'), 'เลิกทำแล้ว');
});

test('clearAllData copy follows the online backup state', () => {
  const app = setup();
  const desc = cfg => {
    app.run(`cloudLoadConfig = () => (${JSON.stringify(cfg)}); cbWhen = () => 'วันนี้ 09:00'; __confirms.length = 0; clearAllData()`);
    return app.run('__confirms[0].desc');
  };
  assert.equal(desc({ enabled: true, lastOkAt: '2026-11-14T01:00:00Z', dirty: false }), 'กู้คืนได้จากสำรองออนไลน์ ล่าสุด วันนี้ 09:00');
  assert.equal(desc({ enabled: true, lastOkAt: '2026-11-14T01:00:00Z', dirty: true }), 'ที่แก้ล่าสุดยังไม่ได้สำรองออนไลน์ ส่งออกไฟล์ก่อนดีกว่า');
  assert.equal(desc({ enabled: true }), 'ที่แก้ล่าสุดยังไม่ได้สำรองออนไลน์ ส่งออกไฟล์ก่อนดีกว่า');
  assert.equal(desc(null), 'ล้างแล้วเอากลับมาไม่ได้ ส่งออกไฟล์สำรองก่อนดีกว่า');
});

test('clearAllData undo restores the state and writes the key', async () => {
  const app = setup();
  await app.run('saveData()');
  app.run('cloudLoadConfig = () => null; clearAllData()');
  app.run('__confirms[0].onConfirm()');
  assert.equal(app.run('state.entries.length'), 0);
  assert.equal(app.store.has('spendTrackerState'), false);
  const t = app.run('__toasts[__toasts.length - 1]');
  assert.equal(t.msg, 'ล้างข้อมูลแล้ว');
  await t.action.onClick();
  assert.equal(app.run('state.entries.length'), 3);
  assert.equal(stored(app).entries.length, 3);
});

test('debt sub-label and card block copy', () => {
  const app = setup();
  assert.equal(app.run(`wealthDebtSub({ kind: 'statement', meta: { configured: true } })`), 'ประมาณ รวมรอบที่ยังไม่ตัด');
  assert.equal(app.run(`wealthDebtSub({ kind: 'statement', meta: { configured: false } })`), 'ประมาณ ยังไม่ได้จ่าย');
});
