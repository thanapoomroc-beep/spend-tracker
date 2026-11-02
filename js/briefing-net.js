/* ---------- Briefing upload (v5, 2.8.0): device status, network, scheduler. No DOM. ---------- */
// Sends the payload built by health-core.js to {price service}/api/briefing when the owner turned it on (state.wealthSettings.briefingEnabled).
// Reuses the price service's address + token (loadPriceConfig). Every failure is silent: a result object, never a throw.
// Upload status lives in localStorage['spendTrackerBriefing'] { lastOkAt, lastError, lastHash }, never in `state`, so it never reaches the export file.
const BRIEFING_KEY = 'spendTrackerBriefing';
const BRIEFING_TIMEOUT_MS = 15000;
const BRIEFING_MAX_BYTES = 64 * 1024;
// Timings are `let` so a browser test can shorten them from the console; the app never changes them.
let BRIEFING_DEBOUNCE_MS = 30000;            // wait this long after a save
let BRIEFING_MIN_GAP_MS = 10 * 60 * 1000;    // at most one upload per this
let BRIEFING_OPEN_WAIT_MS = 3000;            // after opening the app / coming back online
let BRIEFING_REFRESH_MS = 60 * 60 * 1000;    // upload again after this even if nothing changed
let briefingTimer = null, briefingInFlight = null, briefingLastTry = 0;

/* ---------- Device status ---------- */
function briefingLoadStatus(){
  try{
    const c = JSON.parse(localStorage.getItem(BRIEFING_KEY) || 'null');
    if(c && typeof c === 'object' && !Array.isArray(c)) return c;
  }catch(e){}
  return {};
}
function briefingSaveStatus(patch){
  try{
    localStorage.setItem(BRIEFING_KEY, JSON.stringify(Object.assign({}, briefingLoadStatus(), patch)));
    return true;
  }catch(e){ return false; }
}

/* ---------- Pure rules ---------- */
// Why an automatic upload must not run now, or null. in: { enabled, priceCfg, online, empty }
function briefingSkipReason(o){
  if(!o.enabled) return 'off';
  if(!o.priceCfg) return 'nocfg';
  if(!o.online) return 'offline';
  if(o.empty) return 'empty';
  return null;
}
// How long to wait before uploading: at least waitMs, and never sooner than minGapMs after the last attempt.
function briefingDelay(now, lastTry, waitMs, minGapMs){
  return Math.max(waitMs, (lastTry || 0) + minGapMs - now);
}
// On open and after saves: upload when nothing was ever sent, the last upload is over an hour old, or the payload changed.
function briefingShouldUpload(nowMs, lastOkAt, lastHash, curHash, refreshMs){
  const ok = lastOkAt ? Date.parse(lastOkAt) : NaN;
  if(!isFinite(ok)) return true;
  if(nowMs - ok > refreshMs) return true;
  return lastHash !== curHash;
}
function briefingReasonText(reason){
  return reason === 'token' ? 'รหัสบริการไม่ถูก' : reason === 'origin' ? 'บริการไม่รับแอปนี้' : reason === 'storage' ? 'บริการเก็บข้อมูลยังไม่พร้อม' :
    reason === 'too_large' ? 'ข้อมูลใหญ่เกินไป' : reason === 'rejected' ? 'บริการไม่รับข้อมูลชุดนี้' : reason === 'nocfg' ? 'ต้องตั้งค่าบริการราคาก่อน' : 'ติดต่อไม่ได้';
}

/* ---------- Network ---------- */
// One POST to {url}/api/briefing with { op:'put', payload }. Resolves { ok:true, at } or { ok:false, reason }:
//   'nocfg' | 'token' (401) | 'origin' (403) | 'rejected' (400) | 'too_large' (413 or over 64 KB) | 'storage' (503) | 'network' (anything else)
async function briefingRequest(payload){
  const cfg = loadPriceConfig();
  if(!cfg) return { ok: false, reason: 'nocfg' };
  const body = JSON.stringify({ op: 'put', payload });
  if(body.length > BRIEFING_MAX_BYTES) return { ok: false, reason: 'too_large' };
  let timer = null;
  try{
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if(ctrl) timer = setTimeout(() => ctrl.abort(), BRIEFING_TIMEOUT_MS);
    const res = await fetch(cfg.url + '/api/briefing', {
      method: 'POST', cache: 'no-store',
      headers: { 'Authorization': 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
      body, signal: ctrl ? ctrl.signal : undefined
    });
    if(res.status === 401) return { ok: false, reason: 'token' };
    if(res.status === 403) return { ok: false, reason: 'origin' };
    if(res.status === 400) return { ok: false, reason: 'rejected' };
    if(res.status === 413) return { ok: false, reason: 'too_large' };
    if(res.status === 503) return { ok: false, reason: 'storage' };
    if(res.status !== 200) return { ok: false, reason: 'network' };
    const data = await res.json();
    if(!data || typeof data.at !== 'string' || !isFinite(Date.parse(data.at))) return { ok: false, reason: 'network' };
    return { ok: true, at: data.at };
  }catch(e){
    return { ok: false, reason: 'network' };
  }finally{
    if(timer) clearTimeout(timer);
  }
}

/* ---------- Run + scheduler ---------- */
function briefingOnline(){ return typeof navigator === 'undefined' || navigator.onLine !== false; }
function briefingIsOn(){ return !!(state.wealthSettings && state.wealthSettings.briefingEnabled === true); }
function briefingNotifyUi(){ if(typeof briefingUiRefresh === 'function') briefingUiRefresh(); }
// Builds the payload and uploads it. opts.force skips the "nothing changed" rule (the ส่งตอนนี้ button).
// Resolves { ok:true, at } | { ok:false, reason, skipped? }. Never throws. Only one runs at a time.
function briefingRun(opts){
  if(briefingInFlight) return briefingInFlight;
  briefingInFlight = briefingRunInner(opts || {}).catch(() => ({ ok: false, reason: 'network' })).finally(() => { briefingInFlight = null; });
  return briefingInFlight;
}
async function briefingRunInner(opts){
  const skip = briefingSkipReason({ enabled: briefingIsOn(), priceCfg: loadPriceConfig(), online: briefingOnline(), empty: cloudStateIsEmpty(state) });
  if(skip){
    if(skip === 'nocfg') briefingSaveStatus({ lastError: 'nocfg' });
    briefingNotifyUi();
    return { ok: false, reason: skip, skipped: true };
  }
  let payload, hash;
  try{
    payload = buildBriefingPayload(state, new Date());
    hash = briefingPayloadHash(payload);
  }catch(e){
    briefingSaveStatus({ lastError: 'network' });
    briefingNotifyUi();
    return { ok: false, reason: 'network' };
  }
  const st = briefingLoadStatus();
  if(!opts.force && !briefingShouldUpload(Date.now(), st.lastOkAt, st.lastHash, hash, BRIEFING_REFRESH_MS)) return { ok: true, at: st.lastOkAt, unchanged: true };
  briefingLastTry = Date.now();
  const r = await briefingRequest(payload);
  if(r.ok){
    briefingSaveStatus({ lastOkAt: r.at, lastError: null, lastHash: hash });
    briefingNotifyUi();
    return { ok: true, at: r.at };
  }
  briefingSaveStatus({ lastError: r.reason });
  briefingNotifyUi();
  return { ok: false, reason: r.reason };
}
function briefingSchedule(waitMs){
  if(typeof setTimeout !== 'function') return;
  clearTimeout(briefingTimer);
  const st = briefingLoadStatus(), ok = st.lastOkAt ? Date.parse(st.lastOkAt) : 0;   // the last upload may be from an earlier session
  briefingTimer = setTimeout(briefingAutoRun, briefingDelay(Date.now(), Math.max(briefingLastTry, isFinite(ok) ? ok : 0), waitMs, BRIEFING_MIN_GAP_MS));
}
async function briefingAutoRun(){
  briefingTimer = null;
  if(!briefingIsOn()) return;
  const r = await briefingRun();
  if(!r.ok && !r.skipped) briefingSchedule(BRIEFING_MIN_GAP_MS);   // failed: try again later while the app stays open
}
// Called by saveData() after every successful save (core.js checks with typeof).
function onBriefingSaved(){
  if(briefingIsOn()) briefingSchedule(BRIEFING_DEBOUNCE_MS);
}
// App opened, tab visible again, or back online.
function briefingOnOpen(){
  if(briefingIsOn()) briefingSchedule(BRIEFING_OPEN_WAIT_MS);
}
