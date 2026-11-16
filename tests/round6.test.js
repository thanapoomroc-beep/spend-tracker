const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load');

const a = loadApp({ now: '2026-11-16T10:00:00+07:00' });
const pct = (snaps, mc) => a.run(`monthChangePct(${JSON.stringify(snaps)}, ${JSON.stringify(mc)})`);

test('monthChangePct: up, down, flat', () => {
  const snaps = { '2026-10-31': { net: 100000 } };
  assert.deepEqual({ ...pct(snaps, { from: '2026-10-31', change: 2100 }) }, { dir: 'up', pct: 2.1 });
  const d = pct(snaps, { from: '2026-10-31', change: -800 });
  assert.equal(d.dir, 'down'); assert.ok(Math.abs(d.pct - 0.8) < 1e-9);
  assert.equal(pct(snaps, { from: '2026-10-31', change: 20 }).dir, 'flat');
  assert.equal(pct(snaps, { from: '2026-10-31', change: 0 }).dir, 'flat');
});

test('monthChangePct: base <= 0 or missing gives direction only', () => {
  assert.deepEqual({ ...pct({ 'a': { net: 0 } }, { from: 'a', change: 500 }) }, { dir: 'up', pct: null });
  assert.deepEqual({ ...pct({ 'a': { net: -5000 } }, { from: 'a', change: -500 }) }, { dir: 'down', pct: null });
  assert.deepEqual({ ...pct({}, { from: 'zz', change: 500 }) }, { dir: 'up', pct: null });
  assert.deepEqual({ ...pct({}, null) }, { dir: 'flat', pct: null });
});

test('healthRowsOrdered: null values go last, stable otherwise', () => {
  const rows = [{ label: 'a', value: null }, { label: 'b', value: '1' }, { label: 'c', value: null }, { label: 'd', value: '2' }];
  const out = a.run(`healthRowsOrdered(${JSON.stringify(rows)}).map(r => r.label).join('')`);
  assert.equal(out, 'bdac');
});

test('hStatusPill uses the list words for every severity', () => {
  const w = s => a.run(`hStatusPill({ severity: '${s}' })`);
  assert.match(w('act'), />ต้องทำ</);
  assert.match(w('watch'), />ควรดู</);
  assert.match(w('info'), />ทราบไว้</);
  assert.equal(a.run('hStatusPill(null)'), '');
});

test('wmHtml masks with an aria-hidden mask and sr-only text; wm stays plain text', () => {
  a.run('wealthHidden = true;');
  assert.match(a.run("wmHtml('฿1')"), /aria-hidden="true">฿••••<\/span><span class="sr-only">ซ่อนอยู่<\/span>/);
  assert.equal(a.run("wm('฿1')"), '฿••••');
  a.run('wealthHidden = false;');
  assert.equal(a.run("wmHtml('฿1')"), '฿1');
});

test('entryRowEl renders no delete button', () => {
  a.run('state = freshState();');
  const html = a.run(`entryRowEl({ id:'x', category:'อาหาร', amount:50, date:'2026-11-16', note:'ยาวมาก' }, 'entryList', false).innerHTML`);
  assert.ok(!/class="del"/.test(html));
  assert.ok(!/ลบรายการ/.test(html));
});
