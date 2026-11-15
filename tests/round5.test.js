const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, ROOT } = require('./load');
const plain = v => JSON.parse(JSON.stringify(v));

function toastApp() {
  const app = loadApp({ now: '2026-11-14T09:00:00+07:00' });
  app.run(`
    globalThis.__el = { children: [], className: '', textContent: '', classList: { add() {}, remove() {}, toggle() {} },
      appendChild(c) { this.children.push(c); return c; } };
    const mkEl = () => ({ textContent: '', className: '', addEventListener() {}, setAttribute() {} });
    document.getElementById = () => __el;
    document.createElement = mkEl;
  `);
  return app;
}

test('flashToast without srExtra is unchanged (one span, no sr-only)', () => {
  const app = toastApp();
  app.run(`flashToast('จดแล้ว ฿50', true)`);
  const kids = plain(app.run('__el.children'));
  assert.equal(kids.length, 1);
  assert.equal(kids[0].textContent, 'จดแล้ว ฿50');
});

test('flashToast srExtra adds a sr-only span after the visible text, visible text unchanged', () => {
  const app = toastApp();
  app.run(`flashToast('จดแล้ว ฿50', true, null, 'วันนี้ใช้ได้อีก ฿3,100')`);
  const kids = plain(app.run('__el.children'));
  assert.equal(kids.length, 2);
  assert.equal(kids[0].textContent, 'จดแล้ว ฿50');
  assert.equal(kids[1].className, 'sr-only');
  assert.ok(kids[1].textContent.includes('วันนี้ใช้ได้อีก ฿3,100'));
});

test('compareTableRows: cumulative, current month cut at upto, prior month days past its length are null', () => {
  const app = loadApp({ now: '2026-11-14T09:00:00+07:00' });
  const cur = [10, 0, 5, 7, 0];            // 5 days
  const prev = [1, 2, 3];                  // 3 days
  const rows = plain(app.run(`compareTableRows(${JSON.stringify(cur)}, ${JSON.stringify(prev)}, 3)`));
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(r => r.cur), [10, 10, 15, null, null]);
  assert.deepEqual(rows.map(r => r.prev), [1, 3, 6, null, null]);
  assert.deepEqual(rows.map(r => r.day), [1, 2, 3, 4, 5]);
  const none = plain(app.run(`compareTableRows(${JSON.stringify(cur)}, ${JSON.stringify(prev)}, 0)`));
  assert.ok(none.every(r => r.cur === null));
});

test('isEmptyMonthFigures: no income and no non-trip entries', () => {
  const app = loadApp({ now: '2026-11-14T09:00:00+07:00' });
  assert.equal(app.run('isEmptyMonthFigures({ income: 0, entries: [], tripEntries: [] })'), true);
  assert.equal(app.run('isEmptyMonthFigures({ income: 0, entries: [], tripEntries: [{}] })'), true);
  assert.equal(app.run('isEmptyMonthFigures({ income: 30000, entries: [] })'), false);
  assert.equal(app.run('isEmptyMonthFigures({ income: 0, entries: [{}] })'), false);
  app.run(`state = freshState(); state.entries = [];`);
  assert.equal(app.run('isEmptyMonthFigures(monthFigures(new Date(2026, 10, 1)))'), true);
});

test('wealth amounts are hidden by default and the old storage key is no longer read', () => {
  const app = loadApp({ now: '2026-11-14T09:00:00+07:00' });
  assert.equal(app.run('wealthHidden'), true);
  const src = fs.readFileSync(path.join(ROOT, 'js/wealth-ui.js'), 'utf8');
  assert.ok(!/localStorage\.(get|set)Item\(WEALTH_HIDE_KEY/.test(src));
});

test('showWealthTab re-hides only when coming from another tab', () => {
  const app = loadApp({ now: '2026-11-14T09:00:00+07:00' });
  app.run(`wealthTouchSnapshot = () => {}; renderWealth = () => {}; maybeAutoRefreshPrices = () => {}; wealthHidden = false;`);
  app.run('showWealthTab(false)');
  assert.equal(app.run('wealthHidden'), false);
  app.run('showWealthTab(true)');
  assert.equal(app.run('wealthHidden'), true);
  app.run('wealthHidden = false; showWealthTab()');
  assert.equal(app.run('wealthHidden'), true);
});
