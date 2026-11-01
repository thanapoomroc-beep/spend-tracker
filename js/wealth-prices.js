/* ---------- Live prices (W2): the only network code of the wealth tab ---------- */
// Talks to the owner's own price service (address + token live in localStorage['spendTrackerPriceService'], never in `state`,
// so they never reach the backup export). Every failure is silent: existing prices are never cleared.
const PRICE_SERVICE_KEY = 'spendTrackerPriceService';
const PRICE_TIMEOUT_MS = 10000;
const PRICE_AUTO_AFTER_MS = 6 * 3600 * 1000;       // auto-fetch when the oldest auto price is older than this
const PRICE_RETRY_AFTER_MS = 30 * 60 * 1000;       // ...but never twice within this, so a source that stays down is not hammered
let priceInFlight = null;
let priceLastAttempt = 0;
let priceStatus = { kind: 'idle', at: null, failed: [] };   // kind: idle | running | ok | partial | fail

/* ---------- Config ---------- */
// Returns the normalised base address, or '' when it is not usable (https only; plain http only for localhost, for testing).
function normalizePriceUrl(raw){
  let u;
  try{ u = new URL(String(raw || '').trim()); }catch(e){ return ''; }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if(!(u.protocol === 'https:' || (u.protocol === 'http:' && local))) return '';
  return u.origin + u.pathname.replace(/\/+$/, '').replace(/\/api\/prices$/, '');
}
function loadPriceConfig(){
  try{
    const c = JSON.parse(localStorage.getItem(PRICE_SERVICE_KEY) || 'null');
    if(c && typeof c.url === 'string' && typeof c.token === 'string'){
      const url = normalizePriceUrl(c.url);
      if(url && c.token) return { url, token: c.token };
    }
  }catch(e){}
  return null;
}
function savePriceConfig(url, token){
  try{ localStorage.setItem(PRICE_SERVICE_KEY, JSON.stringify({ url, token })); return true; }catch(e){ return false; }
}
function clearPriceConfig(){ try{ localStorage.removeItem(PRICE_SERVICE_KEY); }catch(e){} }

/* ---------- Pure helpers ---------- */
// Unique { type, symbol } of the live holdings (gold is always "GOLD") and every foreign currency they use.
function buildPriceRequest(holdings){
  const seen = new Set(), items = [], fx = new Set();
  wLive(holdings).forEach(h => {
    const symbol = h.assetType === 'gold' ? 'GOLD' : h.symbol;
    const key = priceKey(h.assetType, symbol);
    if(!seen.has(key)){ seen.add(key); items.push({ type: h.assetType, symbol }); }
    if(h.currency && h.currency !== 'THB') fx.add(h.currency);
  });
  return { items: items.slice(0, 50), fx: [...fx].slice(0, 10) };
}
// The auto price of a key: the entry itself, or the one kept underneath a manual price. null when there is none.
function autoPriceOf(entry){
  if(!entry) return null;
  if(entry.source === 'manual') return entry.auto || null;
  return entry.price > 0 ? entry : null;
}
// True when some holding has no auto price or its auto price is older than 6 h.
function needsPriceFetch(holdings, priceCache, nowMs){
  return wLive(holdings).some(h => {
    const a = autoPriceOf(priceCache[priceKey(h.assetType, h.assetType === 'gold' ? 'GOLD' : h.symbol)]);
    if(!a) return true;
    const t = Date.parse(a.at);
    return !isFinite(t) || nowMs - t > PRICE_AUTO_AFTER_MS;
  });
}
// Writes a service response into the caches. Manual prices keep winning (setAutoPrice files the fetched one underneath).
// Returns { updated: n, failed: [keys that came back in errors] }.
function applyPriceResponse(priceCache, fxCache, resp){
  let updated = 0;
  const prices = resp && typeof resp.prices === 'object' && resp.prices ? resp.prices : {};
  Object.keys(prices).forEach(k => {
    const p = prices[k];
    if(!/^(th_stock|foreign_stock|fund|gold|crypto):.+/.test(k) || !p || !(p.price > 0) || typeof p.currency !== 'string' || !/^[A-Z]{3}$/.test(p.currency) || typeof p.at !== 'string' || !p.at) return;
    setAutoPrice(priceCache, k, p.price, p.currency, p.at);
    updated++;
  });
  const fx = resp && typeof resp.fx === 'object' && resp.fx ? resp.fx : {};
  Object.keys(fx).forEach(c => {
    const f = fx[c];
    if(!/^[A-Z]{3}$/.test(c) || c === 'THB' || !f || !(f.thb > 0) || typeof f.at !== 'string' || !f.at) return;
    const old = fxCache[c];
    // A rate the owner typed in after the service's quote time stays.
    if(old && old.source === 'manual' && Date.parse(old.at) >= Date.parse(f.at)) return;
    fxCache[c] = { thb: f.thb, at: f.at, source: 'auto' };
    updated++;
  });
  const failed = resp && typeof resp.errors === 'object' && resp.errors ? Object.keys(resp.errors).filter(k => !k.startsWith('fx:')) : [];
  return { updated, failed };
}

/* ---------- Network ---------- */
// One POST with a timeout. Never throws. Resolves { ok:true, data } or { ok:false, reason }:
//   reason: 'token' (401) | 'origin' (403) | 'address' (404) | 'network' (offline, timeout, anything else)
async function requestPrices(cfg, body, timeoutMs){
  let timer = null;
  try{
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if(ctrl) timer = setTimeout(() => ctrl.abort(), timeoutMs || PRICE_TIMEOUT_MS);
    const res = await fetch(cfg.url + '/api/prices', {
      method: 'POST', cache: 'no-store',
      headers: { 'Authorization': 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined
    });
    if(res.status === 401) return { ok: false, reason: 'token' };
    if(res.status === 403) return { ok: false, reason: 'origin' };
    if(res.status === 404) return { ok: false, reason: 'address' };
    if(res.status !== 200) return { ok: false, reason: 'network' };
    const data = await res.json();
    if(!data || typeof data !== 'object' || typeof data.prices !== 'object') return { ok: false, reason: 'network' };
    return { ok: true, data };
  }catch(e){
    return { ok: false, reason: 'network' };
  }finally{
    if(timer) clearTimeout(timer);
  }
}
function priceReasonText(reason){
  return reason === 'token' ? 'รหัสไม่ถูก' : reason === 'address' ? 'ที่อยู่ไม่ถูก' : reason === 'origin' ? 'บริการไม่รับแอปนี้' : 'ติดต่อไม่ได้';
}
// The settings "ทดสอบ" button: one gold item, nothing is stored.
async function testPriceService(url, token){
  const r = await requestPrices({ url, token }, { items: [{ type: 'gold', symbol: 'GOLD' }], fx: [] }, PRICE_TIMEOUT_MS);
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}

/* ---------- The refresh itself (state-backed) ---------- */
// Returns the status object. Only one request runs at a time; a second call gets the first one's promise.
function refreshPrices(opts){
  if(priceInFlight) return priceInFlight;
  const cfg = loadPriceConfig();
  const hs = wLive(state.holdings);
  if(!cfg || !hs.length) return Promise.resolve(priceStatus);
  priceLastAttempt = Date.now();
  priceStatus = { kind: 'running', at: priceStatus.at, failed: [] };
  if(typeof onPriceStatus === 'function') onPriceStatus();
  priceInFlight = (async () => {
    const req = buildPriceRequest(hs);
    const r = await requestPrices(cfg, req, PRICE_TIMEOUT_MS);
    if(r.ok){
      const out = applyPriceResponse(state.priceCache, state.fxCache, r.data);
      const asked = new Set(req.items.map(i => priceKey(i.type, i.symbol)));
      const failed = out.failed.filter(k => asked.has(k));
      priceStatus = { kind: failed.length ? 'partial' : 'ok', at: Date.now(), failed };
      if(out.updated) await wealthCommitQuiet();
    }else{
      priceStatus = { kind: 'fail', at: priceStatus.at, failed: [], reason: r.reason };
    }
    priceInFlight = null;
    if(typeof onPriceStatus === 'function') onPriceStatus();
    return priceStatus;
  })();
  return priceInFlight;
}
// Called when the wealth tab is shown or the app opens.
function maybeAutoRefreshPrices(){
  if(priceInFlight || !loadPriceConfig()) return;
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if(Date.now() - priceLastAttempt < PRICE_RETRY_AFTER_MS) return;
  if(!needsPriceFetch(state.holdings, state.priceCache, Date.now())) return;
  refreshPrices({ auto: true });
}
