/* ---------- Encrypted online backup (W3): crypto, device config, network, auto-backup scheduler. No DOM. ---------- */
// One device, one passphrase. The state is encrypted on the phone (PBKDF2-SHA256 -> AES-GCM 256) and the service stores an opaque blob.
// The derived key (not the passphrase) is kept in localStorage['spendTrackerCloudBackup'], never in `state`, so it never reaches the export file.
// Talks to the price service's address + token (loadPriceConfig). Every failure is silent: a result object, never a throw.
const CLOUD_KEY = 'spendTrackerCloudBackup';
const BEFORE_RESTORE_KEY = 'spendTrackerBeforeRestore';   // a copy of the state taken just before a restore replaces it
const CLOUD_ITER = 600000;
const CLOUD_TIMEOUT_MS = 20000;
// Timings are `let` so a browser test can shorten them from the console; the app never changes them.
let CLOUD_DEBOUNCE_MS = 20000;            // wait this long after the last save
let CLOUD_MIN_GAP_MS = 10 * 60 * 1000;    // at most one upload per this
let CLOUD_OPEN_WAIT_MS = 3000;            // after opening the app / coming back online
let cloudTimer = null, cloudInFlight = null, cloudLastTry = 0, cloudSeq = 0;

/* ---------- Base64 + crypto ---------- */
function cloudB64(bytes){
  let s = '';
  for(let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function cloudUnb64(str){
  const s = atob(str), out = new Uint8Array(s.length);
  for(let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function cloudDeriveKey(pass, salt, iter){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pass).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function cloudKeyToB64(key){ return cloudB64(new Uint8Array(await crypto.subtle.exportKey('raw', key))); }
function cloudImportKey(keyB64){ return crypto.subtle.importKey('raw', cloudUnb64(keyB64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
// New passphrase on this device: a fresh salt, returns what the device config stores.
async function cloudSetupKey(pass){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await cloudDeriveKey(pass, salt, CLOUD_ITER);
  return { keyB64: await cloudKeyToB64(key), salt: cloudB64(salt), iter: CLOUD_ITER };
}
// A fresh IV every time; the key and salt are reused.
async function cloudEncrypt(plain, key, saltB64, iter){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  return JSON.stringify({ v: 1, kdf: 'pbkdf2-sha256', iter, salt: saltB64, iv: cloudB64(iv), ct: cloudB64(ct) });
}
function cloudParseBlob(blob){
  try{
    const b = JSON.parse(blob);
    if(b && b.v === 1 && b.kdf === 'pbkdf2-sha256' && Number.isInteger(b.iter) && b.iter >= 1 && b.iter <= 2000000 &&
       typeof b.salt === 'string' && typeof b.iv === 'string' && typeof b.ct === 'string') return b;
  }catch(e){}
  return null;
}
// { ok:true, text } | { ok:false, reason:'format'|'key' }. Never throws.
async function cloudDecrypt(blob, key){
  const b = cloudParseBlob(blob);
  if(!b) return { ok: false, reason: 'format' };
  try{
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: cloudUnb64(b.iv) }, key, cloudUnb64(b.ct));
    return { ok: true, text: new TextDecoder().decode(pt) };
  }catch(e){
    return { ok: false, reason: 'key' };
  }
}
// Restore on a device without the key: derive it from the passphrase and the blob's own salt. Also returns what to store to keep backing up.
async function cloudDecryptWithPassphrase(blob, pass){
  const b = cloudParseBlob(blob);
  if(!b) return { ok: false, reason: 'format' };
  let key;
  try{ key = await cloudDeriveKey(pass, cloudUnb64(b.salt), b.iter); }catch(e){ return { ok: false, reason: 'format' }; }
  const r = await cloudDecrypt(blob, key);
  if(!r.ok) return r;
  return { ok: true, text: r.text, keyB64: await cloudKeyToB64(key), salt: b.salt, iter: b.iter };
}

/* ---------- Device config ---------- */
// { enabled, keyB64, salt, iter, lastOkAt, lastOkId, lastError, dirty } or null.
function cloudLoadConfig(){
  try{
    const c = JSON.parse(localStorage.getItem(CLOUD_KEY) || 'null');
    if(c && typeof c === 'object' && typeof c.keyB64 === 'string' && typeof c.salt === 'string' && Number.isInteger(c.iter)) return c;
  }catch(e){}
  return null;
}
function cloudSaveConfig(patch){
  try{
    let cur = null;
    try{ cur = JSON.parse(localStorage.getItem(CLOUD_KEY) || 'null'); }catch(e){}
    localStorage.setItem(CLOUD_KEY, JSON.stringify(Object.assign({}, cur && typeof cur === 'object' ? cur : {}, patch)));
    return true;
  }catch(e){ return false; }
}
function cloudClearConfig(){ try{ localStorage.removeItem(CLOUD_KEY); }catch(e){} }
function cloudIsOn(){ const c = cloudLoadConfig(); return !!(c && c.enabled); }

/* ---------- Pure rules ---------- */
// "Empty" = nothing the owner entered. Such a state (fresh install, after ล้างข้อมูล) must never replace a real backup automatically.
function cloudStateIsEmpty(st){
  return !st || (!(Array.isArray(st.entries) && st.entries.length) && !(Array.isArray(st.accounts) && st.accounts.length));
}
// Why an automatic upload must not run now, or null. in: { cfg, priceCfg, online, empty }
function cloudSkipReason(o){
  if(!o.cfg || !o.cfg.enabled) return 'off';
  if(!o.priceCfg) return 'nocfg';
  if(!o.online) return 'offline';
  if(o.empty) return 'empty';
  return null;
}
// How long to wait before uploading: at least waitMs, and never sooner than minGapMs after the last attempt.
function cloudDelay(now, lastTry, waitMs, minGapMs){
  return Math.max(waitMs, (lastTry || 0) + minGapMs - now);
}

/* ---------- Network ---------- */
// One POST to {url}/api/backup. Resolves { ok:true, data } or { ok:false, reason }:
//   'nocfg' | 'token' (401) | 'origin' (403) | 'too_large' (413) | 'not_found' (404 + error) | 'storage' (503) | 'network' (anything else)
async function cloudRequest(op, body){
  const cfg = loadPriceConfig();
  if(!cfg) return { ok: false, reason: 'nocfg' };
  let timer = null;
  try{
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if(ctrl) timer = setTimeout(() => ctrl.abort(), CLOUD_TIMEOUT_MS);
    const res = await fetch(cfg.url + '/api/backup', {
      method: 'POST', cache: 'no-store',
      headers: { 'Authorization': 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ op }, body || {})), signal: ctrl ? ctrl.signal : undefined
    });
    if(res.status === 401) return { ok: false, reason: 'token' };
    if(res.status === 403) return { ok: false, reason: 'origin' };
    if(res.status === 413) return { ok: false, reason: 'too_large' };
    if(res.status === 503) return { ok: false, reason: 'storage' };
    if(res.status === 404){
      let j = null;
      try{ j = await res.json(); }catch(e){}
      return { ok: false, reason: j && j.error === 'not_found' ? 'not_found' : 'network' };
    }
    if(res.status !== 200) return { ok: false, reason: 'network' };
    const data = await res.json();
    if(!data || typeof data !== 'object') return { ok: false, reason: 'network' };
    if(op === 'put' && !(data.id >= 0)) return { ok: false, reason: 'network' };
    if(op === 'list' && !Array.isArray(data.items)) return { ok: false, reason: 'network' };
    if(op === 'get' && typeof data.blob !== 'string') return { ok: false, reason: 'network' };
    return { ok: true, data };
  }catch(e){
    return { ok: false, reason: 'network' };
  }finally{
    if(timer) clearTimeout(timer);
  }
}
function cloudReasonText(reason){
  return reason === 'token' ? 'รหัสบริการไม่ถูก' : reason === 'origin' ? 'บริการไม่รับแอปนี้' : reason === 'storage' ? 'บริการสำรองยังไม่พร้อม' :
    reason === 'too_large' ? 'ข้อมูลใหญ่เกินไป' : reason === 'nocfg' ? 'ต้องตั้งค่าบริการราคาก่อน' : reason === 'crypto' ? 'เข้ารหัสไม่ได้' : 'ติดต่อไม่ได้';
}

/* ---------- Backup run + scheduler ---------- */
function cloudAppVersion(){
  try{ return (document.querySelector('meta[name="app-version"]') || {}).content || '0'; }catch(e){ return '0'; }
}
// Encrypts the current state and uploads it. Resolves { ok:true, at, id } | { ok:false, reason, skipped? }. Never throws.
// Skips (no error recorded) when off, offline or the state is empty. Only one runs at a time.
function cloudRunBackup(){
  if(cloudInFlight) return cloudInFlight;
  cloudInFlight = cloudRunInner().catch(() => ({ ok: false, reason: 'network' })).finally(() => { cloudInFlight = null; });
  return cloudInFlight;
}
async function cloudRunInner(){
  const cfg = cloudLoadConfig();
  const skip = cloudSkipReason({ cfg, priceCfg: loadPriceConfig(), online: typeof navigator === 'undefined' || navigator.onLine !== false, empty: cloudStateIsEmpty(state) });
  if(skip){
    if(skip === 'nocfg') cloudSaveConfig({ lastError: 'nocfg' });
    cloudNotifyUi();
    return { ok: false, reason: skip, skipped: true };
  }
  cloudLastTry = Date.now();
  const seq = cloudSeq;
  let blob;
  try{
    blob = await cloudEncrypt(JSON.stringify(state), await cloudImportKey(cfg.keyB64), cfg.salt, cfg.iter);
  }catch(e){
    cloudSaveConfig({ lastError: 'crypto' });
    cloudNotifyUi();
    return { ok: false, reason: 'crypto' };
  }
  const r = await cloudRequest('put', { blob, app: cloudAppVersion() });
  if(r.ok){
    const at = typeof r.data.at === 'string' && isFinite(Date.parse(r.data.at)) ? r.data.at : new Date().toISOString();
    cloudSaveConfig({ lastOkAt: at, lastOkId: r.data.id, lastError: null, dirty: cloudSeq !== seq });   // saved again while uploading: still dirty
    cloudNotifyUi();
    return { ok: true, at, id: r.data.id };
  }
  cloudSaveConfig({ lastError: r.reason });
  cloudNotifyUi();
  return { ok: false, reason: r.reason };
}
function cloudNotifyUi(){ if(typeof cloudUiRefresh === 'function') cloudUiRefresh(); }

function cloudSchedule(waitMs){
  if(typeof setTimeout !== 'function') return;
  clearTimeout(cloudTimer);
  const c = cloudLoadConfig(), ok = c && c.lastOkAt ? Date.parse(c.lastOkAt) : 0;   // the last upload may be from an earlier session
  cloudTimer = setTimeout(cloudAutoRun, cloudDelay(Date.now(), Math.max(cloudLastTry, isFinite(ok) ? ok : 0), waitMs, CLOUD_MIN_GAP_MS));
}
async function cloudAutoRun(){
  cloudTimer = null;
  const c = cloudLoadConfig();
  if(!c || !c.enabled || !c.dirty) return;
  const r = await cloudRunBackup();
  const after = cloudLoadConfig();
  if(!after || !after.enabled || !after.dirty) return;
  if(r.ok) cloudSchedule(CLOUD_DEBOUNCE_MS);              // changed during the upload
  else if(!r.skipped) cloudSchedule(CLOUD_MIN_GAP_MS);    // failed: try again later while the app stays open
}
// Called by saveData() after every successful save (core.js checks with typeof).
function onCloudSaved(){
  cloudSeq++;
  const c = cloudLoadConfig();
  if(!c || !c.enabled) return;
  if(!c.dirty) cloudSaveConfig({ dirty: true });
  cloudSchedule(CLOUD_DEBOUNCE_MS);
}
// App opened, tab visible again, or back online: upload if something is waiting.
function cloudOnOpen(){
  const c = cloudLoadConfig();
  if(c && c.enabled && c.dirty) cloudSchedule(CLOUD_OPEN_WAIT_MS);
}
