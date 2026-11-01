const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load');
const plain = v => JSON.parse(JSON.stringify(v));

const NOW = '2026-11-01T10:00:00+07:00';
const T = '2026-10-30T10:00:00+07:00';
const hold = (id, assetType, symbol, currency) => ({ id, accountId: 'inv', assetType, symbol, units: 10, cost: 100, currency: currency || 'THB', updatedAt: T, deleted: false });
const TOKEN = 'secret-token-123';

// An app with wealth data, a configured service and a mock fetch. `handler(url, init)` returns { status, body } or throws.
function setup(handler, holdings) {
  const app = loadApp({ now: NOW });
  const calls = [];
  app.ctx.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r = await handler(url, init);
    return { status: r.status, json: async () => { if (r.bad) throw new Error('bad json'); return r.body; } };
  };
  app.ctx.AbortController = AbortController;
  app.ctx.setTimeout = setTimeout; app.ctx.clearTimeout = clearTimeout;
  app.run(`state.accounts = [{ id:'inv', name:'พอร์ต', group:'invest', archived:false, sortOrder:1, updatedAt:'x', deleted:false }];
    state.holdings = ${JSON.stringify(holdings || [hold('a', 'th_stock', 'ptt'), hold('b', 'gold', 'x'), hold('c', 'foreign_stock', 'VOO', 'USD')])};`);
  app.run(`savePriceConfig('http://localhost:9999', '${TOKEN}')`);
  return { app, calls };
}
const OK = { at: NOW, prices: {
  'th_stock:PTT': { price: 35, currency: 'THB', thb: 35, at: '2026-11-01T09:00:00+07:00', source: 'yahoo' },
  'gold:GOLD': { price: 62000, currency: 'THB', thb: 62000, at: '2026-11-01T09:30:00+07:00', source: 'goldtraders' },
  'foreign_stock:VOO': { price: 500, currency: 'USD', thb: 16500, at: '2026-10-31T21:00:00Z', source: 'twelvedata' }
}, fx: { USD: { thb: 33, at: '2026-10-31T12:00:00Z', source: 'frankfurter' } }, errors: {} };

test('request body: unique items, gold is GOLD, fx for every foreign currency, normalised address', () => {
  const { run } = loadApp();
  const hs = [hold('a', 'th_stock', 'PTT'), hold('b', 'th_stock', 'ptt'), hold('c', 'gold', 'whatever'), hold('d', 'gold', 'other'),
    hold('e', 'foreign_stock', 'VOO', 'USD'), hold('f', 'foreign_stock', 'IWDA', 'EUR'), Object.assign(hold('g', 'crypto', 'BTC'), { deleted: true })];
  const body = plain(run(`buildPriceRequest(${JSON.stringify(hs)})`));
  assert.deepEqual(body.items.map(i => i.type + ':' + i.symbol), ['th_stock:PTT', 'gold:GOLD', 'foreign_stock:VOO', 'foreign_stock:IWDA']);
  assert.deepEqual(body.fx.sort(), ['EUR', 'USD']);
  assert.equal(run(`normalizePriceUrl('https://x.vercel.app/')`), 'https://x.vercel.app');
  assert.equal(run(`normalizePriceUrl('https://x.vercel.app/api/prices')`), 'https://x.vercel.app');
  assert.equal(run(`normalizePriceUrl('http://localhost:8800')`), 'http://localhost:8800');
  assert.equal(run(`normalizePriceUrl('http://example.com')`), '');
  assert.equal(run(`normalizePriceUrl('nonsense')`), '');
});

test('success: auto prices stored, fx auto, manual price kept, snapshot written, status ok', async () => {
  const { app, calls } = setup(() => ({ status: 200, body: OK }));
  app.run(`setManualPrice(state.priceCache, 'th_stock:PTT', 36, 'THB', '2026-11-01T08:00:00+07:00')`);
  const st = plain(await app.run(`refreshPrices()`));
  assert.equal(st.kind, 'ok');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://localhost:9999/api/prices');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer ' + TOKEN);
  assert.deepEqual(calls[0].body, { items: [{ type: 'th_stock', symbol: 'ptt' }, { type: 'gold', symbol: 'GOLD' }, { type: 'foreign_stock', symbol: 'VOO' }], fx: ['USD'] });
  const c = plain(app.run('state.priceCache'));
  assert.equal(c['th_stock:PTT'].source, 'manual');           // manual still wins
  assert.equal(c['th_stock:PTT'].price, 36);
  assert.equal(c['th_stock:PTT'].auto.price, 35);             // the fetched one sits underneath
  assert.equal(c['gold:GOLD'].source, 'auto');
  assert.equal(c['foreign_stock:VOO'].price, 500);            // native price, not baht
  const fx = plain(app.run('state.fxCache'));
  assert.deepEqual(fx.USD, { thb: 33, at: '2026-10-31T12:00:00Z', source: 'auto' });
  assert.equal(plain(app.run(`Object.keys(state.snapshots)`)).length, 1);
});

test('per-item errors keep the old prices and report the affected keys; fx errors are not item failures', async () => {
  const resp = { at: NOW, prices: { 'gold:GOLD': OK.prices['gold:GOLD'] }, fx: {}, errors: { 'th_stock:PTT': 'source_down', 'foreign_stock:VOO': 'source_down', 'fx:USD': 'source_down' } };
  const { app } = setup(() => ({ status: 200, body: resp }));
  app.run(`setAutoPrice(state.priceCache, 'th_stock:PTT', 34, 'THB', '2026-10-31T09:00:00Z');
    setAutoPrice(state.priceCache, 'foreign_stock:VOO', 480, 'USD', '2026-10-31T09:00:00Z');
    setManualFx(state.fxCache, 'USD', 32, '2026-10-30T09:00:00Z')`);
  const st = plain(await app.run(`refreshPrices()`));
  assert.equal(st.kind, 'partial');
  assert.deepEqual(st.failed.sort(), ['foreign_stock:VOO', 'th_stock:PTT']);
  const c = plain(app.run('state.priceCache'));
  assert.equal(c['th_stock:PTT'].price, 34);
  assert.equal(c['foreign_stock:VOO'].price, 480);
  assert.equal(c['gold:GOLD'].price, 62000);
  assert.equal(plain(app.run('state.fxCache')).USD.thb, 32);
});

test('a manual fx rate newer than the service quote is kept, an older one is replaced', () => {
  const { run } = loadApp();
  const out = plain(run(`(() => {
    const fx = { USD: { thb: 32, at: '2026-11-01T08:00:00Z', source: 'manual' }, EUR: { thb: 30, at: '2026-10-01T08:00:00Z', source: 'manual' } };
    applyPriceResponse({}, fx, { prices: {}, fx: { USD: { thb: 33, at: '2026-10-31T12:00:00Z' }, EUR: { thb: 38, at: '2026-10-31T12:00:00Z' } } });
    return fx;
  })()`));
  assert.equal(out.USD.thb, 32);
  assert.equal(out.EUR.thb, 38); assert.equal(out.EUR.source, 'auto');
});

test('failures leave state untouched: offline, timeout, 401, 403, 404, 500, bad JSON', async () => {
  const cases = [['offline', () => { throw new TypeError('fetch failed'); }, 'network'], ['401', () => ({ status: 401, body: {} }), 'token'], ['403', () => ({ status: 403, body: {} }), 'origin'],
    ['404', () => ({ status: 404, body: {} }), 'address'], ['500', () => ({ status: 500, body: {} }), 'network'], ['json', () => ({ status: 200, bad: true }), 'network'], ['shape', () => ({ status: 200, body: { nope: 1 } }), 'network']];
  for (const [name, h, reason] of cases) {
    const { app } = setup(h);
    app.run(`setAutoPrice(state.priceCache, 'gold:GOLD', 61000, 'THB', '2026-10-31T09:00:00Z')`);
    const before = JSON.stringify(app.run('state'));
    const st = plain(await app.run(`refreshPrices()`));
    assert.equal(st.kind, 'fail', name);
    assert.equal(st.reason, reason, name);
    assert.equal(JSON.stringify(app.run('state')), before, name);
  }
  // timeout: a fetch that only ends when it is aborted
  const { app } = setup(() => new Promise(() => {}));
  app.ctx.fetch = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
  const t0 = Date.now();
  const r = plain(await app.run(`requestPrices(loadPriceConfig(), { items: [], fx: [] }, 40)`));
  assert.deepEqual(r, { ok: false, reason: 'network' });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(plain(await app.run(`testPriceService('http://localhost:9999', 'x')`)).ok, false);
});

test('only one request in flight; not configured or no holdings sends nothing', async () => {
  let release;
  const { app, calls } = setup(() => new Promise(r => { release = () => r({ status: 200, body: OK }); }));
  const p1 = app.run(`refreshPrices()`), p2 = app.run(`refreshPrices()`);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(calls.length, 1);
  assert.equal(app.run(`priceStatus.kind`), 'running');
  release();
  await Promise.all([p1, p2]);
  assert.equal(calls.length, 1);
  // not configured
  const b = setup(() => ({ status: 200, body: OK }));
  b.app.run(`clearPriceConfig()`);
  await b.app.run(`refreshPrices()`);
  b.app.run(`maybeAutoRefreshPrices()`);
  // no holdings
  const c = setup(() => ({ status: 200, body: OK }), []);
  await c.app.run(`refreshPrices()`);
  assert.equal(b.calls.length + c.calls.length, 0);
});

test('6-hour rule and the auto-fetch gate', async () => {
  const { run } = loadApp();
  const hs = JSON.stringify([hold('a', 'th_stock', 'PTT')]);
  const now = Date.parse('2026-11-01T10:00:00+07:00');
  const need = cache => run(`needsPriceFetch(${hs}, ${JSON.stringify(cache)}, ${now})`);
  const e = (at, source, extra) => Object.assign({ price: 34, currency: 'THB', at, source }, extra || {});
  assert.equal(need({}), true);                                                                          // no price
  assert.equal(need({ 'th_stock:PTT': e('2026-11-01T05:00:00+07:00', 'auto') }), false);                 // 5 h old
  assert.equal(need({ 'th_stock:PTT': e('2026-11-01T03:59:00+07:00', 'auto') }), true);                  // just over 6 h
  assert.equal(need({ 'th_stock:PTT': e('2026-11-01T09:00:00+07:00', 'manual') }), true);                // manual only: no auto price at all
  assert.equal(need({ 'th_stock:PTT': e('2026-11-01T09:00:00+07:00', 'manual', { auto: { price: 33, currency: 'THB', at: '2026-11-01T08:00:00+07:00' } }) }), false);
  // gate: online, configured, throttled after an attempt
  const { app, calls } = setup(() => ({ status: 200, body: OK }));
  app.run(`maybeAutoRefreshPrices()`);
  await app.run(`priceInFlight`);
  assert.equal(calls.length, 1);
  app.run(`priceStatus = { kind:'idle', at:null, failed:[] }; state.priceCache = {}`);
  app.run(`maybeAutoRefreshPrices()`);                    // needs prices again but the last attempt was seconds ago
  assert.equal(calls.length, 1);
  app.ctx.navigator.onLine = false;
  app.run(`priceLastAttempt = 0`);
  app.run(`maybeAutoRefreshPrices()`);
  assert.equal(calls.length, 1);                          // offline: no request
});

test('address and token never reach the backup export or state', () => {
  const { app } = setup(() => ({ status: 200, body: OK }));
  let exported = '';
  app.ctx.Blob = class { constructor(parts){ exported = parts[0]; } };
  app.ctx.URL = class extends URL { static createObjectURL() { return 'x'; } static revokeObjectURL() {} };
  app.ctx.document.createElement = () => ({ click() {}, style: {} });
  app.ctx.document.body = { appendChild() {}, removeChild() {} };
  app.run('exportData()');
  assert.ok(exported.length > 100);
  assert.ok(!exported.includes(TOKEN));
  assert.ok(!exported.includes('localhost:9999'));
  assert.ok(!exported.includes('spendTrackerPriceService'));
  assert.ok(app.store.get('spendTrackerPriceService').includes(TOKEN));
  assert.ok(!app.store.has('spendTrackerState') || !app.store.get('spendTrackerState').includes(TOKEN));
});
