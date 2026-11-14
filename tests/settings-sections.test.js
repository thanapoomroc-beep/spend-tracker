const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT } = require('./load');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const panel = html.slice(html.indexOf('<section class="tab-panel" id="panel-settings"'), html.indexOf('<section class="tab-panel" id="tripPage"'));
const count = id => (html.match(new RegExp(`\\sid="${id}"`, 'g')) || []).length;

test('every set-toggle starts collapsed and controls a hidden body', () => {
  const toggles = [...panel.matchAll(/<button type="button" class="set-toggle"([^>]*)>/g)];
  assert.equal(toggles.length, 13);
  toggles.forEach(m => {
    assert.match(m[1], /aria-expanded="false"/);
    const ctl = /aria-controls="([^"]+)"/.exec(m[1])[1];
    assert.match(html, new RegExp(`<div class="set-body" id="${ctl}" hidden>`));
    assert.equal(count(ctl), 1);
  });
});

test('13 sections in the agreed group order', () => {
  const titles = [...panel.matchAll(/<span class="ttl">([^<]+)<\/span>|<h2 class="set-group">([^<]+)<\/h2>/g)].map(m => m[1] || '#' + m[2]);
  assert.deepEqual(titles, [
    'รายได้', 'ผ่อน / ลงทุน', 'ค่าสมาชิกรายเดือน', 'งบแต่ละหมวด (ต่อเดือน)',
    '#ทั่วไป', 'หมวด', 'ช่องทางจ่าย', 'ทริปทั้งหมด', 'สำรองข้อมูล',
    '#ออนไลน์', 'ราคาอัตโนมัติ', 'สลิปอัตโนมัติ', 'สำรองออนไลน์', 'ส่งสรุปให้ briefing', 'เกณฑ์เตือน'
  ]);
  assert.ok(panel.indexOf('set-banner') < panel.indexOf('id="incomeSettings"'));
  assert.ok(panel.indexOf('footer-note') > panel.indexOf('id="thresholdsTitle"'));
  assert.ok(panel.includes('class="danger-zone"'));
});

test('heading ids stay on a section heading inside a set-sec card', () => {
  ['categorySettings', 'paymentSettings', 'budgetSettings', 'tripsSettings', 'priceSettings', 'slipSettingsTitle', 'cloudBackupTitle', 'briefingTitle', 'thresholdsTitle',
    'incomeSettings', 'financingSettings', 'subscriptionSettings', 'exportSettings'].forEach(id => {
    assert.equal(count(id), 1, id);
    assert.match(panel, new RegExp(`<div class="card set-sec"[^>]*>\\s*<h3 class="set-h" id="${id}">`));
  });
});

test('inner ids used by other files still exist exactly once', () => {
  ['setIncome', 'financingList', 'subscriptionList', 'subYearly', 'categoryList', 'archivedWrap', 'archivedList', 'newCatName', 'addCatBtn', 'catMsg',
    'payList', 'payArchWrap', 'payArchList', 'newPayName', 'addPayBtn', 'payMsg', 'budgetSettingsList', 'tripsSettingsList', 'tripsNewBtn',
    'priceUrl', 'priceToken', 'priceMsg', 'priceSaveBtn', 'priceTestBtn', 'priceClearBtn', 'slipSettingsBody', 'cloudBackupBody', 'briefingBody', 'thresholdsBody',
    'exportHint', 'importFile', 'settingsMonthLabel', 'appVersion'].forEach(id => assert.equal(count(id), 1, id));
});

// ---- behaviour with a tiny fake DOM ----
function fakeDom(n) {
  const mk = i => {
    const attrs = { 'aria-expanded': 'false', 'aria-controls': 'b' + i };
    return {
      id: 't' + i, top: i * 50, classList: { contains: c => c === 'set-toggle' },
      getAttribute: k => attrs[k], setAttribute: (k, v) => { attrs[k] = v; },
      getBoundingClientRect() { return { top: this.top }; }
    };
  };
  const btns = Array.from({ length: n }, (_, i) => mk(i));
  const bodies = btns.map((b, i) => ({ id: 'b' + i, hidden: true }));
  const byId = {};
  btns.forEach(b => { byId[b.id] = b; });
  bodies.forEach(b => { byId[b.id] = b; });
  const root = { querySelectorAll: () => btns };
  byId['panel-settings'] = root;
  return { btns, bodies, document: { getElementById: id => byId[id] || null } };
}
function loadSections(dom, scrolls) {
  const ctx = { document: dom.document, window: { scrollBy: (x, y) => scrolls.push(y) } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'settings-sections.js'), 'utf8'), ctx);
  return ctx;
}

test('openSettingsSection is an accordion and accepts body ids', () => {
  const dom = fakeDom(3); const ctx = loadSections(dom, []);
  assert.equal(ctx.openSettingsSection('t1'), true);
  assert.equal(dom.bodies[1].hidden, false);
  ctx.openSettingsSection('b2');
  assert.equal(dom.bodies[1].hidden, true);
  assert.equal(dom.bodies[2].hidden, false);
  assert.equal(dom.btns[2].getAttribute('aria-expanded'), 'true');
  assert.equal(ctx.openSettingsSection('nope'), false);
});

test('toggle closes the open section and compensates scroll', () => {
  const dom = fakeDom(3); const scrolls = [];
  const ctx = loadSections(dom, scrolls);
  ctx.toggleSettingsSection(dom.btns[0]);
  assert.equal(dom.bodies[0].hidden, false);
  dom.btns[2].top = 100;   // simulate layout shift after section 0 closes
  const orig = dom.btns[2].getBoundingClientRect;
  let call = 0;
  dom.btns[2].getBoundingClientRect = function () { return { top: call++ === 0 ? 100 : 60 }; };
  ctx.toggleSettingsSection(dom.btns[2]);
  assert.equal(dom.bodies[0].hidden, true);
  assert.deepEqual(scrolls, [-40]);
  ctx.toggleSettingsSection(dom.btns[2]);
  assert.equal(dom.bodies[2].hidden, true);
});

test('no id attribute in index.html appears more than once', () => {
  const seen = {};
  [...html.matchAll(/\sid="([^"]+)"/g)].forEach(m => { seen[m[1]] = (seen[m[1]] || 0) + 1; });
  const dupes = Object.keys(seen).filter(k => seen[k] > 1);
  assert.deepEqual(dupes, []);
});
