const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load');
const plain = v => JSON.parse(JSON.stringify(v));

function setup() {
  const app = loadApp({ now: '2026-11-14T09:00:00+07:00' });
  app.run(`
    state = freshState();
    state.categories = [
      { name: 'อาหาร', slot: 0 }, { name: 'เดินทาง', slot: 1 }, { name: 'กาแฟ', slot: null }, { name: 'ของใช้', slot: null }
    ];
    const mk = (id, cat, amt, extra) => Object.assign({ id, date: '2026-11-10', amount: amt, category: cat, paymentMethod: 'cash', updatedAt: '2026-11-10T00:00:00.000Z' }, extra || {});
    state.entries = [mk('a', 'อาหาร', 100), mk('b', 'เดินทาง', 50, { paymentMethod: 'kbank' }), mk('c', 'กาแฟ', 30), mk('d', 'ของใช้', 20), mk('e', 'อาหาร', 999, { tripId: 't1' })];
    globalThis.__nav = [];
    goTab = n => { __nav.push(n); };
    render = () => {};
  `);
  return app;
}

test('pieSlices: no fixed slice, no trip entries, อื่นๆ groups its categories', () => {
  const app = setup();
  const r = plain(app.run('pieSlices(state.entries)'));
  assert.deepEqual(r.labels, ['อาหาร', 'เดินทาง', 'อื่นๆ']);
  assert.deepEqual(r.values, [100, 50, 50]);
  assert.equal(r.total, 200);
  assert.ok(!r.labels.includes('รายการประจำ'));
  const other = r.slices.find(s => s.label === 'อื่นๆ');
  assert.deepEqual(plain(other.cats).sort(), ['กาแฟ', 'ของใช้'].sort());
  assert.equal(r.colors[0], app.run('categoryColor("อาหาร")'));
  assert.equal(r.colors[2], app.run('NEUTRAL_COLOR'));
});

test('pieSlices of nothing is empty', () => {
  const app = setup();
  const r = plain(app.run('pieSlices([])'));
  assert.deepEqual(r.slices, []);
  assert.equal(r.total, 0);
});

test('entry filter predicate respects filterPay', () => {
  const app = setup();
  app.run('filterPay = "kbank"');
  assert.deepEqual(plain(app.run('state.entries.filter(entryPassesFilters).map(e => e.id)')), ['b']);
  app.run('filterPay = "cash"');
  assert.equal(app.run('state.entries.filter(entryPassesFilters).length'), 4);
  app.run('filterPay = null');
  assert.equal(app.run('state.entries.filter(entryPassesFilters).length'), 5);
  assert.equal(app.run('filterActive()'), false);
  app.run('filterPay = "cash"');
  assert.equal(app.run('filterActive()'), true);
});

test('filterPay is dropped when the method no longer exists', () => {
  const app = setup();
  app.run('filterPay = "gone"; pruneFilters();');
  assert.equal(app.run('filterPay'), null);
});

test('openEntriesFiltered resets other filters and applies the given one', () => {
  const app = setup();
  app.run('filterText = "x"; searchAll = true; filterReview = true; filterCats = new Set(["อาหาร"]); filterPay = null;');
  app.run('openEntriesFiltered({ pay: "kbank" })');
  assert.equal(app.run('filterText'), '');
  assert.equal(app.run('searchAll'), false);
  assert.equal(app.run('filterReview'), false);
  assert.equal(app.run('filterCats.size'), 0);
  assert.equal(app.run('filterPay'), 'kbank');
  assert.deepEqual(plain(app.run('__nav')), ['entries']);
  app.run('openEntriesFiltered({ cats: ["กาแฟ", "ของใช้"] })');
  assert.equal(app.run('filterPay'), null);
  assert.deepEqual(plain(app.run('[...filterCats]')).sort(), ['กาแฟ', 'ของใช้'].sort());
});
