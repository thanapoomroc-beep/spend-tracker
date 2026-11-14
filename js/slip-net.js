/* Slip inbox pull (v3b, 2.10.0): device status, network, scheduling. No DOM except through render()/flashToast().
   Reuses the price service's address + token (loadPriceConfig). Every failure is silent apart from the status.
   Status lives in localStorage['spendTrackerSlip'] { lastPullAt, lastError, lastAdded, lastSkipped, aiUnavailable }, never in `state`. */
const SLIP_STATUS_KEY = 'spendTrackerSlip';
const SLIP_TIMEOUT_MS = 10000;
const SLIP_AI_TIMEOUT_MS = 20000;            // the server itself waits up to 15 s for the model
const SLIP_MIN_GAP_MS = 2 * 60 * 1000;
const SLIP_PAGE = 50;
const SLIP_MAX_LOOPS = 4;
let slipInFlight = null, slipLastAttempt = 0;

/* ---------- Device status ---------- */
function slipLoadStatus(){
  try{
    const c = JSON.parse(localStorage.getItem(SLIP_STATUS_KEY) || 'null');
    if(c && typeof c === 'object' && !Array.isArray(c)) return c;
  }catch(e){}
  return {};
}
function slipSaveStatus(patch){
  try{ localStorage.setItem(SLIP_STATUS_KEY, JSON.stringify(Object.assign({}, slipLoadStatus(), patch))); }catch(e){}
  if(typeof slipUiRefresh === 'function'){ try{ slipUiRefresh(); }catch(e){} }
}
function slipReasonText(reason){
  switch(reason){
    case 'offline': return 'ไม่มีเน็ต';
    case 'unauthorized': return 'token ไม่ถูกต้อง';
    case 'storage_down': return 'เซิร์ฟเวอร์ใช้งานไม่ได้ชั่วคราว';
    case 'timeout': return 'เซิร์ฟเวอร์ตอบช้าเกินไป';
    case 'save_failed': return 'บันทึกในเครื่องไม่ได้';
    case 'network': return 'ติดต่อเซิร์ฟเวอร์ไม่ได้';
    default: return 'เซิร์ฟเวอร์มีปัญหา ลองใหม่ภายหลัง';
  }
}
function slipIsOn(){ return !!(state.slipSettings && state.slipSettings.enabled === true); }

/* ---------- Network ---------- */
async function slipPost(cfg, path, body, timeoutMs){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || SLIP_TIMEOUT_MS);
  try{
    const resp = await fetch(cfg.url + path, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    let data = null;
    try{ data = await resp.json(); }catch(e){}
    if(resp.ok) return { ok: true, data };
    const code = data && typeof data.error === 'string' ? data.error : '';
    const reason = resp.status === 401 ? 'unauthorized' : (code === 'storage_down' || code === 'ai_unavailable') ? code : resp.status === 503 ? 'storage_down' : 'server';
    return { ok: false, reason, status: resp.status };
  }catch(e){
    return { ok: false, reason: ctrl.signal.aborted ? 'timeout' : 'network' };
  }finally{
    clearTimeout(timer);
  }
}

/* ---------- Pull ---------- */
// Returns a promise of { ok, reason?, added?, ... }. One pull at a time; non-manual pulls wait SLIP_MIN_GAP_MS between attempts.
function slipPull(opts){
  opts = opts || {};
  if(slipInFlight) return slipInFlight;
  if(!slipIsOn()) return Promise.resolve({ ok: false, reason: 'off' });
  const cfg = loadPriceConfig();
  if(!cfg) return Promise.resolve({ ok: false, reason: 'noconfig' });
  if(typeof navigator !== 'undefined' && navigator.onLine === false){
    if(opts.manual) slipSaveStatus({ lastError: slipReasonText('offline') });
    return Promise.resolve({ ok: false, reason: 'offline' });
  }
  if(!opts.manual && Date.now() - slipLastAttempt < SLIP_MIN_GAP_MS) return Promise.resolve({ ok: false, reason: 'throttled' });
  slipLastAttempt = Date.now();
  slipInFlight = slipPullRun(cfg).then(r => { slipInFlight = null; return r; }, e => { slipInFlight = null; return { ok: false, reason: 'server' }; });
  return slipInFlight;
}

async function slipPullRun(cfg){
  const undo = { entryIds: [], cardPaymentIds: [] };
  const skipped = { duplicate: 0, own: 0, ignore: 0 };
  let added = 0, waiting = 0, repaidCount = 0, repaidAmt = 0, error = '';
  const askAi = [];
  let changed = false;
  for(let i = 0; i < SLIP_MAX_LOOPS; i++){
    const r = await slipPost(cfg, '/api/slip-inbox', { op: 'list' });
    if(!r.ok){ error = r.reason; break; }
    const items = r.data && Array.isArray(r.data.items) ? r.data.items.slice(0, SLIP_PAGE) : [];
    if(!items.length) break;
    const before = JSON.stringify(state.slipSettings);
    const plan = planSlipItems(items, state);
    const u = applySlipPlan(state, plan);
    const ok = await saveData();
    if(ok === false){
      undoSlipPlan(state, u);                       // storage refused: keep memory equal to what is on disk, and do not ack
      state.slipSettings = JSON.parse(before);
      error = 'save_failed';
      break;
    }
    changed = true;
    u.entryIds.forEach(id => undo.entryIds.push(id));
    u.cardPaymentIds.forEach(id => undo.cardPaymentIds.push(id));
    added += plan.entries.length;
    waiting += plan.entries.filter(e => e.needsReview).length;
    repaidCount += plan.cardPayments.length;
    plan.cardPayments.forEach(p => { repaidAmt += p.amount; });
    ['duplicate', 'own', 'ignore'].forEach(k => { skipped[k] += plan.skipped[k]; });
    plan.askAi.forEach(id => askAi.push(id));
    const a = await slipPost(cfg, '/api/slip-inbox', { op: 'ack', ids: plan.ackIds });
    if(!a.ok){ error = a.reason; break; }           // rows come back next time and are skipped as duplicates
    if(items.length < SLIP_PAGE) break;
  }
  slipSaveStatus({ lastPullAt: new Date().toISOString(), lastError: error ? slipReasonText(error) : '', lastAdded: added, lastSkipped: skipped });
  if(changed) render();
  slipPullToast(added, waiting, repaidCount, repaidAmt, undo);
  if(askAi.length) await slipAiGuess(askAi);
  return { ok: !error, reason: error || undefined, added, waiting, repaid: repaidCount, skipped };
}

function slipPullToast(added, waiting, repaidCount, repaidAmt, undo){
  if(!added && !repaidCount) return;
  const repay = repaidCount ? `โอนคืนบัตร ${fmt(repaidAmt)}` : '';
  let msg, action;
  if(added){
    msg = `เพิ่มจากสลิป ${added} รายการ` + (waiting ? ` รอตรวจ ${waiting}` : '') + (repay ? ' ' + repay : '');
  }else{
    msg = 'บันทึก' + repay;
  }
  if(waiting){
    action = { label: 'ตรวจ', onClick: () => { if(typeof slipFocusCard === 'function') slipFocusCard(); } };
  }else{
    action = { label: 'เลิกทำ', onClick: async () => { undoSlipPlan(state, undo); await saveData(); render(); } };
  }
  flashToast(msg, true, action);
}

/* ---------- AI category guess (after the save, never blocks it) ---------- */
async function slipAiGuess(askIds){
  try{
    if(!state.slipSettings || state.slipSettings.aiGuess === false) return;
    const cfg = loadPriceConfig();
    if(!cfg) return;
    const ents = askIds.map(id => state.entries.find(e => e.id === id)).filter(e => e && e.needsReview).slice(0, 20);
    if(!ents.length) return;
    const categories = state.categories.filter(c => !c.archived && c.name.length <= 40).map(c => c.name).slice(0, 30);
    if(!categories.length) return;
    const snapshot = {};
    ents.forEach(e => { snapshot[e.id] = e.updatedAt; });
    const items = ents.map(e => ({ id: e.id, receiver: String(e.note || '').slice(0, 80), amount: e.amount, source: e.slipSource || 'kplus' }));
    const r = await slipPost(cfg, '/api/slip-guess', { items, categories }, SLIP_AI_TIMEOUT_MS);
    if(!r.ok){
      if(r.reason === 'ai_unavailable') slipSaveStatus({ aiUnavailable: true });
      return;
    }
    if(slipLoadStatus().aiUnavailable) slipSaveStatus({ aiUnavailable: false });
    const guesses = r.data && Array.isArray(r.data.guesses) ? r.data.guesses : [];
    if(applyAiGuesses(state, guesses, snapshot) > 0){
      await saveData();
      render();
    }
  }catch(e){}
}

/* ---------- Triggers ---------- */
// App opened or tab visible again (hooked in boot.js and slip-ui.js).
function slipOnOpen(){
  try{ slipPull(); }catch(e){}
}
