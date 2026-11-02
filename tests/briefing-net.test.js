const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load');
const plain = v => JSON.parse(JSON.stringify(v));

const NOW = '2026-11-12T10:00:00+07:00';
const T = '2026-11-10T10:00:00+07:00';
const withData = `state.entries = [{ id:'e1', date:'2026-11-02', amount:55, category:'อาหาร', note:'x', updatedAt:'x' }];
  state.accounts = [{ id:'a', name:'ลับ', group:'cash', archived:false, sortOrder:1, updatedAt:'${T}', deleted:false }];
  state.balances = [{ id:'b', accountId:'a', date:'2026-11-01', value:90000, updatedAt:'${T}', deleted:false }];`;

// A loaded app with a configured price service and a mock fetch. handler(url, init) -> { status, body }.
function setup(handler, on) {
  const app = loadApp({ now: NOW });
  const calls = [];
  app.ctx.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r = await handler(url, init, calls);
    return { status: r.status, json: async () => r.body };
  };
  app.run(`savePriceConfig('http://localhost:9999', 'tok-1')`);
  app.run(withData);
  if (on !== false) app.run('state.wealthSettings.briefingEnabled = true');
  return { app, calls };
}
const ok = { status: 200, body: { at: '2026-11-12T03:00:01.000Z' } };

test('scheduling rules are pure: skip reasons, delay, upload-or-not', () => {
  const { run } = loadApp();
  const skip = o => run(`briefingSkipReason(${JSON.stringify(o)})`);
  const base = { enabled: true, priceCfg: { url: 'u' }, online: true, empty: false };
  assert.equal(skip(base), null);
  assert.equal(skip(Object.assign({}, base, { enabled: false })), 'off');
  assert.equal(skip(Object.assign({}, base, { priceCfg: null })), 'nocfg');
  assert.equal(skip(Object.assign({}, base, { online: false })), 'offline');
  assert.equal(skip(Object.assign({}, base, { empty: true })), 'empty');
  // 30 s debounce, but never sooner than 10 min after the last try
  assert.equal(run('briefingDelay(1000000, 0, 30000, 600000)'), 30000);
  assert.equal(run('briefingDelay(1000000, 900000, 30000, 600000)'), 500000);
  assert.equal(run('briefingDelay(1000000, 1000000, 3000, 600000)'), 600000);
  // on open: never sent, older than an hour, or the payload changed
  const H = 3600000, now = Date.parse(NOW);
  const up = (okAt, last, cur) => run(`briefingShouldUpload(${now}, ${JSON.stringify(okAt)}, ${JSON.stringify(last)}, ${JSON.stringify(cur)}, ${H})`);
  assert.equal(up(null, null, 'a'), true);
  assert.equal(up(new Date(now - 30 * 60000).toISOString(), 'a', 'a'), false);
  assert.equal(up(new Date(now - 30 * 60000).toISOString(), 'a', 'b'), true);
  assert.equal(up(new Date(now - H).toISOString(), 'a', 'a'), false);        // exactly an hour is not over an hour
  assert.equal(up(new Date(now - H - 1000).toISOString(), 'a', 'a'), true);
  assert.equal(up('garbage', 'a', 'a'), true);
});

test('HTTP statuses map to reasons; the request is POST {op:"put", payload} with the bearer token', async () => {
  const cases = [[401, 'token'], [403, 'origin'], [400, 'rejected'], [413, 'too_large'], [503, 'storage'], [500, 'network'], [404, 'network']];
  for (const [status, reason] of cases) {
    const { app, calls } = setup(() => ({ status, body: {} }));
    const r = plain(await app.run('briefingRequest({ schema_version: 1 })'));
    assert.deepEqual(r, { ok: false, reason }, String(status));
    assert.equal(calls.length, 1);
  }
  const { app, calls } = setup(() => ok);
  const r = plain(await app.run('briefingRequest({ schema_version: 1 })'));
  assert.deepEqual(r, { ok: true, at: '2026-11-12T03:00:01.000Z' });
  assert.equal(calls[0].url, 'http://localhost:9999/api/briefing');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok-1');
  assert.deepEqual(calls[0].body, { op: 'put', payload: { schema_version: 1 } });
});

test('a bad 200, a thrown fetch, a missing service or an oversize body never throw', async () => {
  let { app } = setup(() => ({ status: 200, body: { nope: 1 } }));
  assert.deepEqual(plain(await app.run('briefingRequest({})')), { ok: false, reason: 'network' });
  ({ app } = setup(() => { throw new Error('offline'); }));
  assert.deepEqual(plain(await app.run('briefingRequest({})')), { ok: false, reason: 'network' });
  const bare = loadApp({ now: NOW });
  assert.deepEqual(plain(await bare.run('briefingRequest({})')), { ok: false, reason: 'nocfg' });
  let calls;
  ({ app, calls } = setup(() => ok));
  const r = plain(await app.run(`briefingRequest({ pad: 'x'.repeat(70000) })`));
  assert.deepEqual(r, { ok: false, reason: 'too_large' });
  assert.equal(calls.length, 0);
});

test('run: one POST, status stored on the device only, unchanged data is not sent again, force sends', async () => {
  const { app, calls } = setup(() => ok);
  const r = plain(await app.run('briefingRun()'));
  assert.deepEqual(r, { ok: true, at: '2026-11-12T03:00:01.000Z' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.op, 'put');
  assert.equal(calls[0].body.payload.schema_version, 1);
  const st = JSON.parse(app.store.get('spendTrackerBriefing'));
  assert.equal(st.lastOkAt, '2026-11-12T03:00:01.000Z');
  assert.equal(st.lastError, null);
  assert.equal(st.lastHash, app.run('briefingPayloadHash(buildBriefingPayload(state, new Date()))'));
  assert.ok(!app.run('JSON.stringify(state)').includes('lastHash'));       // never in the export
  const again = plain(await app.run('briefingRun()'));
  assert.equal(again.unchanged, true);
  assert.equal(calls.length, 1);
  await app.run('briefingRun({ force: true })');
  assert.equal(calls.length, 2);
  app.run('state.wealthSettings.drawdownPct = 9');                          // the payload changed
  await app.run('briefingRun()');
  assert.equal(calls.length, 3);
});

test('run: failures are recorded and never throw; switching off or going offline skips quietly', async () => {
  const { app, calls } = setup(() => ({ status: 401, body: {} }));
  const r = plain(await app.run('briefingRun()'));
  assert.deepEqual(r, { ok: false, reason: 'token' });
  assert.equal(JSON.parse(app.store.get('spendTrackerBriefing')).lastError, 'token');
  app.run('state.wealthSettings.briefingEnabled = false');
  const off = plain(await app.run('briefingRun()'));
  assert.deepEqual(off, { ok: false, reason: 'off', skipped: true });
  app.run('state.wealthSettings.briefingEnabled = true; navigator.onLine = false');
  assert.equal(plain(await app.run('briefingRun()')).reason, 'offline');
  app.run('navigator.onLine = true; state.entries = []; state.accounts = []');
  assert.equal(plain(await app.run('briefingRun()')).reason, 'empty');
  assert.equal(calls.length, 1);
});

test('saving schedules an upload only while the switch is on', () => {
  const { app } = setup(() => ok, false);
  let timers = 0;
  app.ctx.setTimeout = () => { timers++; return timers; };
  app.run('onBriefingSaved()');
  assert.equal(timers, 0);
  app.run('state.wealthSettings.briefingEnabled = true; onBriefingSaved()');
  assert.equal(timers, 1);
  app.run('briefingOnOpen()');
  assert.equal(timers, 2);
});

test('saveData calls both hooks', async () => {
  const { app } = setup(() => ok);
  app.run('globalThis.__hits = []; onCloudSaved = () => __hits.push("cloud"); onBriefingSaved = () => __hits.push("briefing");');
  await app.run('saveData()');
  assert.deepEqual(plain(app.run('__hits')), ['cloud', 'briefing']);
});
