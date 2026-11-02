const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load');

const NOW = '2026-11-02T10:00:00+07:00';
const PASS = 'correct horse battery';
const NOTE = 'ข้าวมันไก่ลับสุดยอด-note-7731';
const withData = `state.entries = [{ id:'e1', date:'2026-11-02', amount:55, category:'อาหาร', note:'${NOTE}', updatedAt:'x' }];`;

// A loaded app with a configured price service and a mock fetch. handler(url, init) -> { status, body }.
function setup(handler) {
  const app = loadApp({ now: NOW });
  const calls = [];
  app.ctx.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r = await handler(url, init, calls);
    return { status: r.status, json: async () => r.body };
  };
  app.run(`savePriceConfig('http://localhost:9999', 'tok-1')`);
  return { app, calls };
}
async function enable(app, pass) {
  const k = await app.run(`cloudSetupKey(${JSON.stringify(pass || PASS)})`);
  app.run(`cloudSaveConfig(${JSON.stringify(Object.assign({ enabled: true, lastOkAt: null, lastOkId: null, lastError: null, dirty: true }, k))})`);
  return k;
}

test('blob format and roundtrip', async () => {
  const { app } = setup(() => ({ status: 500, body: {} }));
  const k = await enable(app);
  assert.equal(k.iter, 600000);
  const blob = await app.run(`(async () => cloudEncrypt('{"hello":"โลก"}', await cloudImportKey(cloudLoadConfig().keyB64), cloudLoadConfig().salt, cloudLoadConfig().iter))()`);
  const b = JSON.parse(blob);
  assert.deepEqual(Object.keys(b), ['v', 'kdf', 'iter', 'salt', 'iv', 'ct']);
  assert.equal(b.v, 1); assert.equal(b.kdf, 'pbkdf2-sha256'); assert.equal(b.iter, 600000);
  assert.equal(Buffer.from(b.salt, 'base64').length, 16);
  assert.equal(Buffer.from(b.iv, 'base64').length, 12);
  assert.ok(!blob.includes('โลก') && !blob.includes('hello'));
  const out = await app.run(`(async () => (await cloudDecrypt(${JSON.stringify(blob)}, await cloudImportKey(cloudLoadConfig().keyB64))).text)()`);
  assert.equal(out, '{"hello":"โลก"}');
});

test('a fresh IV for every backup; key and salt stay', async () => {
  const { app } = setup(() => ({ status: 500, body: {} }));
  await enable(app);
  const two = await app.run(`(async () => { const c = cloudLoadConfig(), key = await cloudImportKey(c.keyB64);
    return [await cloudEncrypt('x', key, c.salt, c.iter), await cloudEncrypt('x', key, c.salt, c.iter)]; })()`);
  const [a, b] = two.map(JSON.parse);
  assert.notEqual(a.iv, b.iv); assert.notEqual(a.ct, b.ct); assert.equal(a.salt, b.salt);
});

test('wrong passphrase fails cleanly; right one (new device path) yields the same key as the stored one', async () => {
  const { app } = setup(() => ({ status: 500, body: {} }));
  const k = await enable(app);
  const blob = await app.run(`(async () => cloudEncrypt('secret', await cloudImportKey(cloudLoadConfig().keyB64), cloudLoadConfig().salt, cloudLoadConfig().iter))()`);
  const bad = await app.run(`cloudDecryptWithPassphrase(${JSON.stringify(blob)}, 'wrong passphrase')`);
  assert.equal(bad.ok, false); assert.equal(bad.reason, 'key');
  const good = await app.run(`cloudDecryptWithPassphrase(${JSON.stringify(blob)}, ${JSON.stringify(PASS)})`);
  assert.equal(good.ok, true); assert.equal(good.text, 'secret');
  assert.equal(good.keyB64, k.keyB64);
  assert.equal(good.salt, k.salt); assert.equal(good.iter, 600000);
  // a different stored key cannot open it either
  const other = await app.run(`(async () => { const s = await cloudSetupKey('another passphrase!'); return cloudDecrypt(${JSON.stringify(blob)}, await cloudImportKey(s.keyB64)); })()`);
  assert.deepEqual(JSON.parse(JSON.stringify(other)), { ok: false, reason: 'key' });
});

test('garbage blobs are rejected without throwing', async () => {
  const { app } = setup(() => ({ status: 500, body: {} }));
  await enable(app);
  for (const bad of ['not json', '{}', '{"v":2}', JSON.stringify({ v: 1, kdf: 'pbkdf2-sha256', iter: 9e9, salt: 'a', iv: 'b', ct: 'c' })]) {
    const r = await app.run(`cloudDecryptWithPassphrase(${JSON.stringify(bad)}, 'x')`);
    assert.deepEqual(JSON.parse(JSON.stringify(r)), { ok: false, reason: 'format' });
  }
});

test('empty-state guard', () => {
  const { run } = loadApp();
  assert.equal(run(`cloudStateIsEmpty(freshState())`), true);
  assert.equal(run(`cloudStateIsEmpty({ entries: [], accounts: [{ id: 'a' }] })`), false);
  assert.equal(run(`cloudStateIsEmpty({ entries: [{ id: 'e' }], accounts: [] })`), false);
  assert.equal(run(`cloudStateIsEmpty(null)`), true);
});

test('skip reasons', () => {
  const { run } = loadApp();
  const r = o => run(`cloudSkipReason(${JSON.stringify(o)})`);
  const cfg = { enabled: true }, price = { url: 'x', token: 'y' };
  assert.equal(r({ cfg: null, priceCfg: price, online: true, empty: false }), 'off');
  assert.equal(r({ cfg: { enabled: false }, priceCfg: price, online: true, empty: false }), 'off');
  assert.equal(r({ cfg, priceCfg: null, online: true, empty: false }), 'nocfg');
  assert.equal(r({ cfg, priceCfg: price, online: false, empty: false }), 'offline');
  assert.equal(r({ cfg, priceCfg: price, online: true, empty: true }), 'empty');
  assert.equal(r({ cfg, priceCfg: price, online: true, empty: false }), null);
});

test('debounce / throttle: cloudDelay with an injected clock', () => {
  const { run } = loadApp();
  const d = (now, last, wait, gap) => run(`cloudDelay(${now}, ${last}, ${wait}, ${gap})`);
  assert.equal(d(1e6, 0, 20000, 600000), 20000);               // never tried: just the debounce
  assert.equal(d(1e6, 1e6 - 30000, 20000, 600000), 570000);    // tried 30 s ago: wait out the 10 min gap
  assert.equal(d(1e6, 1e6 - 700000, 20000, 600000), 20000);    // tried long ago: debounce only
});

test('saveData marks dirty and schedules; nothing happens while off', async () => {
  const { app } = setup(() => ({ status: 500, body: {} }));
  const timers = [];
  app.ctx.setTimeout = (fn, ms) => { timers.push(ms); return timers.length; };
  app.ctx.clearTimeout = () => {};
  await app.run(`saveData()`);
  assert.ok(!timers.includes(20000));                          // off: no backup timer (the toast has its own), no config
  assert.equal(app.run(`cloudLoadConfig()`), null);
  await enable(app);
  app.run(`cloudSaveConfig({ dirty: false })`);
  await app.run(`saveData()`);
  assert.equal(app.run(`cloudLoadConfig().dirty`), true);
  assert.equal(timers.at(-1), 20000);
  // an upload 3 minutes ago: the next one waits for the 10 minute gap
  app.run(`cloudSaveConfig({ lastOkAt: new Date(Date.now() - 180000).toISOString() })`);
  await app.run(`saveData()`);
  assert.equal(timers.at(-1), 420000);
});

test('backup upload: encrypted body, dirty cleared, status stored', async () => {
  const { app, calls } = setup((u, i) => ({ status: 200, body: { id: 7, at: '2026-11-02T03:00:00.000Z' } }));
  app.run(withData);
  await enable(app);
  const r = await app.run(`cloudRunBackup()`);
  assert.equal(r.ok, true); assert.equal(r.id, 7);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://localhost:9999/api/backup');
  assert.equal(calls[0].init.headers['Authorization'], 'Bearer tok-1');
  assert.equal(calls[0].body.op, 'put');
  assert.ok(typeof calls[0].body.app === 'string');
  assert.ok(!calls[0].body.blob.includes(NOTE) && !calls[0].body.blob.includes('อาหาร'));
  const c = app.run(`cloudLoadConfig()`);
  assert.equal(c.dirty, false); assert.equal(c.lastOkId, 7); assert.equal(c.lastError, null);
});

test('empty state never uploads (fresh install, after clear)', async () => {
  const { app, calls } = setup(() => ({ status: 200, body: { id: 1, at: NOW } }));
  await enable(app);
  const r = await app.run(`cloudRunBackup()`);
  assert.equal(r.ok, false); assert.equal(r.reason, 'empty');
  assert.equal(calls.length, 0);
  assert.equal(app.run(`cloudLoadConfig().dirty`), true);
});

test('offline and unconfigured runs make no request', async () => {
  const { app, calls } = setup(() => ({ status: 200, body: { id: 1, at: NOW } }));
  app.run(withData);
  await enable(app);
  app.run(`navigator.onLine = false`);
  assert.equal((await app.run(`cloudRunBackup()`)).reason, 'offline');
  app.run(`navigator.onLine = true; clearPriceConfig()`);
  assert.equal((await app.run(`cloudRunBackup()`)).reason, 'nocfg');
  assert.equal(calls.length, 0);
});

test('cloudRequest status mapping', async () => {
  const table = [[401, undefined, 'token'], [403, undefined, 'origin'], [413, undefined, 'too_large'], [503, undefined, 'storage'],
    [404, { error: 'not_found' }, 'not_found'], [404, {}, 'network'], [500, {}, 'network'], [502, {}, 'network']];
  for (const [status, body, reason] of table) {
    const { app } = setup(() => ({ status, body }));
    const r = await app.run(`cloudRequest('get', { id: 3 })`);
    assert.deepEqual(JSON.parse(JSON.stringify(r)), { ok: false, reason }, `HTTP ${status}`);
  }
  // fetch throws -> network; no config -> nocfg
  const a = setup(() => { throw new Error('offline'); });
  assert.equal((await a.app.run(`cloudRequest('list')`)).reason, 'network');
  a.app.run(`clearPriceConfig()`);
  assert.equal((await a.app.run(`cloudRequest('list')`)).reason, 'nocfg');
  // malformed 200 bodies
  const m = setup(() => ({ status: 200, body: { nope: 1 } }));
  for (const op of ['put', 'list', 'get']) assert.equal((await m.app.run(`cloudRequest('${op}', {})`)).reason, 'network');
  // good bodies
  const g = setup((u, i, calls) => {
    const op = calls.at(-1).body.op;
    return { status: 200, body: op === 'list' ? { items: [{ id: 2, at: NOW, size: 10 }] } : op === 'get' ? { id: 2, at: NOW, blob: 'b' } : { id: 2, at: NOW } };
  });
  assert.equal((await g.app.run(`cloudRequest('list')`)).ok, true);
  assert.equal((await g.app.run(`cloudRequest('get', { id: 2 })`)).data.blob, 'b');
});

test('failed upload keeps dirty and records the reason', async () => {
  const { app } = setup(() => ({ status: 503, body: { error: 'storage_down' } }));
  app.run(withData);
  await enable(app);
  const r = await app.run(`cloudRunBackup()`);
  assert.equal(r.reason, 'storage');
  const c = app.run(`cloudLoadConfig()`);
  assert.equal(c.dirty, true); assert.equal(c.lastError, 'storage');
});

test('device config never lands in state or the export text', async () => {
  const { app } = setup(() => ({ status: 500, body: {} }));
  app.run(withData);
  const k = await enable(app);
  const json = app.run(`JSON.stringify(state, null, 2)`);
  assert.ok(!json.includes(k.keyB64) && !json.includes(k.salt) && !json.includes('keyB64') && !json.includes('spendTrackerCloudBackup'));
  assert.equal(app.run(`CLOUD_KEY`), 'spendTrackerCloudBackup');
  await app.run(`saveData()`);
  assert.ok(!app.store.get('spendTrackerState').includes(k.keyB64));
});
