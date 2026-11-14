const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, ROOT } = require('./load');
const plain = v => JSON.parse(JSON.stringify(v));

const fx = n => fs.readFileSync(path.join(ROOT, 'tests/fixtures/slips', n + '.txt'), 'utf8');
const SHOP = fx('kplus-qr-shop'), PERSON = fx('kplus-transfer-person'), TOPS = fx('kplus-qr-tops'), REPAY = fx('kplus-ttb-repay');
const item = (id, text) => ({ id, source: 'kplus', photo_at: '2026-11-14T08:00:00Z', text, created_at: '2026-11-14T08:01:00Z' });
// A valid slip with its own ref, so a batch of them never de-duplicates.
const uniq = i => TOPS.replace('AQR04617', 'AQR' + String(10000 + i).slice(1)).replace('Tops\n', 'Shop' + i + '\n');

// server: { list: [responses...] | fn, guess: fn(body) -> {status, body}, ack: fn }
function setup(server = {}, opts = {}) {
  const log = [], calls = [], toasts = [];
  const fetch = async (url, init) => {
    const p = url.replace('http://localhost:9', '');
    const body = JSON.parse(init.body);
    calls.push({ path: p, body, auth: init.headers.Authorization });
    log.push(p + (body.op ? ':' + body.op : ''));
    let r;
    if (p === '/api/slip-inbox' && body.op === 'list') r = server.list ? server.list(body) : { status: 200, body: { items: [] } };
    else if (p === '/api/slip-inbox') r = server.ack ? server.ack(body) : { status: 200, body: { deleted: body.ids.length } };
    else r = server.guess ? server.guess(body) : { status: 200, body: { guesses: [] } };
    return { ok: r.status < 300, status: r.status, json: async () => r.body };
  };
  const app = loadApp({ fetch, now: '2026-11-14T09:00:00+07:00' });
  app.ctx.__log = log; app.ctx.__toasts = toasts;
  if (opts.config !== false) app.store.set('spendTrackerPriceService', JSON.stringify({ url: 'http://localhost:9', token: 'tok' }));
  app.run(`
    state = freshState();
    state.slipSettings.enabled = ${opts.enabled === false ? 'false' : 'true'};
    ${opts.ai === false ? 'state.slipSettings.aiGuess = false;' : ''}
    var __saveOk = true;
    saveData = async () => { __log.push('save'); return __saveOk; };
    render = () => { __log.push('render'); };
    flashToast = (m, ok, a) => { __toasts.push({ m, ok, label: a && a.label, onClick: a && a.onClick }); };
  `);
  return { app, log, calls, toasts, st: () => plain(app.run('state')) };
}

test('not enabled, not configured or offline: no fetch', async () => {
  let s = setup({}, { enabled: false });
  assert.equal((await s.app.run('slipPull({ manual: true })')).reason, 'off');
  s = setup({}, { config: false });
  assert.equal((await s.app.run('slipPull()')).reason, 'noconfig');
  s = setup();
  s.app.run('navigator.onLine = false');
  assert.equal((await s.app.run('slipPull()')).reason, 'offline');
  assert.equal(s.calls.length, 0);
});

test('list, save, ack in that order; entries added and toast shows the review count', async () => {
  const s = setup({ list: () => ({ status: 200, body: { items: [item(11, SHOP), item(12, PERSON)] } }) }, { ai: false });
  const r = await s.app.run('slipPull()');
  assert.equal(r.ok, true);
  assert.deepEqual(s.log.filter(x => x !== 'render'), ['/api/slip-inbox:list', 'save', '/api/slip-inbox:ack']);
  assert.deepEqual(s.calls[1].body, { op: 'ack', ids: [11, 12] });
  assert.equal(s.calls[0].auth, 'Bearer tok');
  assert.equal(s.st().entries.length, 2);
  assert.equal(s.toasts.length, 1);
  assert.equal(s.toasts[0].m, 'เพิ่มจากสลิป 2 รายการ รอตรวจ 2');
  assert.equal(s.toasts[0].label, 'ตรวจ');
  const status = JSON.parse(s.app.store.get('spendTrackerSlip'));
  assert.equal(status.lastAdded, 2); assert.equal(status.lastError, '');
});

test('nothing waiting: toast offers undo and undo removes the entries but the keys stay handled', async () => {
  const rule = 'state.slipSettings.receivers["tops"] = { name:"Tops", action:"expense", category:"อาหาร", updatedAt:"2026-11-01T00:00:00.000Z" };';
  const s = setup({ list: () => ({ status: 200, body: { items: [item(1, TOPS)] } }) });
  s.app.run(rule);
  await s.app.run('slipPull()');
  assert.equal(s.toasts[0].m, 'เพิ่มจากสลิป 1 รายการ');
  assert.equal(s.toasts[0].label, 'เลิกทำ');
  assert.equal(s.st().entries.length, 1);
  await s.toasts[0].onClick();
  assert.equal(s.st().entries.length, 0);
  assert.equal(s.st().slipSettings.handled.length, 1);
});

test('a rule-made card repayment is mentioned in the toast', async () => {
  const s = setup({ list: () => ({ status: 200, body: { items: [item(1, REPAY)] } }) });
  s.app.run('state.slipSettings.receivers["mrs. malee jaidee"] = { name:"x", action:"repay", methodId:"ttb", updatedAt:"2026-11-01T00:00:00.000Z" };');
  await s.app.run('slipPull()');
  assert.equal(s.toasts[0].m, 'บันทึกโอนคืนบัตร ฿9,204');
  assert.equal(s.st().cardPayments.length, 1);
});

test('no toast when nothing was added', async () => {
  const s = setup();
  const r = await s.app.run('slipPull()');
  assert.equal(r.ok, true);
  assert.equal(s.toasts.length, 0);
  assert.deepEqual(s.log, ['/api/slip-inbox:list']);
});

test('one pull at a time, and a 2 minute gap unless manual', async () => {
  const s = setup({ list: () => ({ status: 200, body: { items: [] } }) });
  const a = s.app.run('slipPull()'), b = s.app.run('slipPull()');
  assert.equal(a, b);
  await a;
  assert.equal(s.calls.length, 1);
  assert.equal((await s.app.run('slipPull()')).reason, 'throttled');
  assert.equal(s.calls.length, 1);
  await s.app.run('slipPull({ manual: true })');
  assert.equal(s.calls.length, 2);
});

test('save failure: no ack, nothing left in memory, status says why', async () => {
  const s = setup({ list: () => ({ status: 200, body: { items: [item(1, SHOP)] } }) });
  s.app.run('__saveOk = false');
  const r = await s.app.run('slipPull()');
  assert.equal(r.ok, false);
  assert.ok(!s.log.includes('/api/slip-inbox:ack'));
  assert.equal(s.st().entries.length, 0);
  assert.equal(s.st().slipSettings.handled.length, 0);
  assert.equal(JSON.parse(s.app.store.get('spendTrackerSlip')).lastError, 'บันทึกในเครื่องไม่ได้');
  assert.equal(s.toasts.length, 0);
});

test('pagination stops when fewer than 50 come back, and after 4 loops', async () => {
  let n = 0;
  const page = () => Array.from({ length: 50 }, () => { n++; return item(n, uniq(n)); });
  let s = setup({ list: (() => { let k = 0; return () => ({ status: 200, body: { items: ++k === 1 ? page() : [item(900, uniq(900))] } }); })() }, { ai: false });
  await s.app.run('slipPull()');
  assert.equal(s.log.filter(x => x === '/api/slip-inbox:list').length, 2);
  assert.equal(s.st().entries.length, 51);
  n = 0;
  s = setup({ list: () => ({ status: 200, body: { items: page() } }) }, { ai: false });
  await s.app.run('slipPull()');
  assert.equal(s.log.filter(x => x === '/api/slip-inbox:list').length, 4);
  assert.equal(s.log.filter(x => x === '/api/slip-inbox:ack').length, 4);
  assert.equal(s.st().entries.length, 200);
});

test('401: status error, no state change, no save', async () => {
  const s = setup({ list: () => ({ status: 401, body: { error: 'unauthorized' } }) });
  const before = JSON.stringify(s.st());
  const r = await s.app.run('slipPull()');
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(s.st()), before);
  assert.ok(!s.log.includes('save'));
  assert.equal(JSON.parse(s.app.store.get('spendTrackerSlip')).lastError, 'token ไม่ถูกต้อง');
});

test('503 storage_down and a network failure map to plain Thai', async () => {
  let s = setup({ list: () => ({ status: 503, body: { error: 'storage_down' } }) });
  await s.app.run('slipPull()');
  assert.equal(JSON.parse(s.app.store.get('spendTrackerSlip')).lastError, 'เซิร์ฟเวอร์ใช้งานไม่ได้ชั่วคราว');
  s = setup({ list: () => { throw new Error('offline'); } });
  await s.app.run('slipPull()');
  assert.equal(JSON.parse(s.app.store.get('spendTrackerSlip')).lastError, 'ติดต่อเซิร์ฟเวอร์ไม่ได้');
});

test('AI: only unknown learnable receivers are sent, with active categories; guesses apply', async () => {
  const s = setup({
    list: () => ({ status: 200, body: { items: [item(1, SHOP), item(2, TOPS)] } }),
    guess: body => ({ status: 200, body: { guesses: body.items.map(i => ({ id: i.id, category: 'อาหาร', confidence: 'high' })) } })
  });
  s.app.run('state.slipSettings.receivers["tops"] = { name:"Tops", action:"ignore", updatedAt:"2026-11-01T00:00:00.000Z" }; state.categories.find(c => c.name === "ช้อปปิ้ง").archived = true;');
  await s.app.run('slipPull()');
  const g = s.calls.find(c => c.path === '/api/slip-guess');
  assert.equal(g.body.items.length, 1);
  assert.deepEqual(Object.keys(g.body.items[0]).sort(), ['amount', 'id', 'receiver', 'source']);
  assert.equal(g.body.items[0].receiver, 'เชลฟ์ สมูทตี้');
  assert.equal(g.body.items[0].amount, 124);
  assert.ok(!g.body.categories.includes('ช้อปปิ้ง'));
  assert.ok(g.body.categories.includes('อาหาร'));
  const e = s.st().entries[0];
  assert.equal(e.category, 'อาหาร'); assert.equal(e.aiGuess, true); assert.equal(e.needsReview, true);
  assert.equal(s.toasts.length, 1);   // the toast came from the pull, not from the guess
  // order: the toast data is fixed before the AI call
  assert.ok(s.log.indexOf('/api/slip-guess') > s.log.indexOf('/api/slip-inbox:ack'));
});

test('AI: ai_unavailable sets the flag and a later success clears it', async () => {
  let mode = 'down';
  const s = setup({
    list: () => ({ status: 200, body: { items: [item(1, SHOP)] } }),
    guess: body => mode === 'down' ? { status: 503, body: { error: 'ai_unavailable' } } : { status: 200, body: { guesses: [] } }
  });
  await s.app.run('slipPull()');
  assert.equal(JSON.parse(s.app.store.get('spendTrackerSlip')).aiUnavailable, true);
  assert.equal(s.st().entries[0].aiGuess, undefined);
  mode = 'up';
  s.app.run('state.entries = []; state.slipSettings.handled = [];');
  await s.app.run('slipPull({ manual: true })');
  assert.equal(JSON.parse(s.app.store.get('spendTrackerSlip')).aiUnavailable, false);
});

test('AI: other failures are silent and the entries stay as they are', async () => {
  const s = setup({ list: () => ({ status: 200, body: { items: [item(1, SHOP)] } }), guess: () => ({ status: 502, body: { error: 'ai_failed' } }) });
  const r = await s.app.run('slipPull()');
  assert.equal(r.ok, true);
  assert.equal(s.st().entries[0].category, 'อื่นๆ');
  assert.equal(JSON.parse(s.app.store.get('spendTrackerSlip')).lastError, '');
});

test('AI: a guess is not applied to an entry the owner edited in between', async () => {
  let app;
  const s = setup({
    list: () => ({ status: 200, body: { items: [item(1, SHOP)] } }),
    guess: body => {
      app.run(`state.entries[0].updatedAt = '2026-11-14T10:00:00.000Z'`);   // the owner touched it while the request ran
      return { status: 200, body: { guesses: body.items.map(i => ({ id: i.id, category: 'อาหาร', confidence: 'high' })) } };
    }
  });
  app = s.app;
  await app.run('slipPull()');
  const e = s.st().entries[0];
  assert.equal(e.category, 'อื่นๆ'); assert.equal(e.aiGuess, undefined);
});

test('AI: no call when the switch is off', async () => {
  const s = setup({ list: () => ({ status: 200, body: { items: [item(1, SHOP)] } }) }, { ai: false });
  await s.app.run('slipPull()');
  assert.ok(!s.calls.some(c => c.path === '/api/slip-guess'));
});

test('no https:// literal in the new files', () => {
  for (const f of ['js/slip-core.js', 'js/slip-net.js', 'js/slip-ui.js']) assert.ok(!/https:\/\//.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f);
});
