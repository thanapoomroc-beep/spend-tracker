/* Settings summaries (2.13.0): one muted line under each ตั้งค่า section title. Counts and states only, never baht amounts.
   settingsSummaries(st, ctx) is DOM-free (ctx carries every device-only value). The month functions it calls read the global `state`, which is `st` in the app. */
const LAST_EXPORT_KEY = 'spendTrackerLastExport';   // device-only ISO string; never in state, the export or the cloud backup
const SS_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const SS_KEYS = ['income', 'financing', 'subscription', 'budget', 'category', 'payment', 'trips', 'export', 'price', 'slip', 'cloud', 'briefing', 'thresholds'];

// Absolute so it never goes stale on an open tab: "วันนี้ 14:02" / "เมื่อวาน" / "12 พ.ย." (+ year when not this year).
function ssWhen(iso, today){
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  const a = ageDays(iso, today);
  if(a === 0) return 'วันนี้ ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  if(a === 1) return 'เมื่อวาน';
  let s = d.getDate() + ' ' + SS_MONTHS[d.getMonth()];
  if(String(d.getFullYear()) !== String(today).slice(0, 4)) s += ' ' + (d.getFullYear() + 543);
  return s;
}
function ssCount(n, word, none){ return n > 0 ? n + ' ' + word : none; }
// Switch-style sections: off, on, or on with an error (warn).
function ssOnline(c, today, doneWord, failText){
  if(!c || !c.on) return { text: 'ปิดอยู่' };
  if(c.err) return { text: failText, warn: true };
  let t = 'เปิดอยู่';
  if(c.at){ const w = ssWhen(c.at, today); if(w) t += ' ' + doneWord + ' ' + w; }
  return { text: t };
}

function settingsSummaries(st, ctx){
  const today = ctx.today, mKey = ctx.month;
  const out = {};
  const raw = getRawSettings(mKey);
  out.income = { text: raw.income > 0 ? 'ตั้งแล้ว' : 'ยังไม่ได้ตั้ง' };
  const items = getEffectiveSettings(mKey).fixedItems;
  const nFin = items.filter(i => i.group === 'financing').length, nSub = items.length - nFin;
  out.financing = { text: ssCount(nFin, 'รายการ', 'ยังไม่มี') };
  out.subscription = { text: ssCount(nSub, 'รายการ', 'ยังไม่มี') };

  const active = st.categories.filter(c => !c.archived), names = new Set(active.map(c => c.name));
  const bud = getEffectiveBudgets(mKey);
  const nBud = Object.keys(bud).filter(k => bud[k] > 0 && names.has(k)).length;
  out.budget = { text: nBud > 0 ? 'ตั้งไว้ ' + nBud + ' หมวด' : 'ยังไม่ได้ตั้ง' };
  const nArch = st.categories.length - active.length;
  out.category = { text: active.length + ' หมวด' + (nArch > 0 ? ' ซ่อนไว้ ' + nArch : '') };

  const pays = st.paymentMethods.filter(m => !m.archived), nCard = pays.filter(isCardMethod).length;
  out.payment = { text: pays.length + ' ช่องทาง' + (nCard > 0 ? ' บัตร ' + nCard + ' ใบ' : '') };

  const trip = st.activeTripId ? st.trips.find(t => t.id === st.activeTripId) : null;
  out.trips = { text: trip ? 'กำลังเที่ยว ' + trip.name : ssCount(st.trips.length, 'ทริป', 'ยังไม่มี') };

  const ex = ctx.lastExportAt ? ssWhen(ctx.lastExportAt, today) : '';
  out.export = { text: ex ? 'สำรองล่าสุด ' + ex : 'ยังไม่เคยสำรองในเครื่องนี้' };

  if(ctx.priceOn){
    let t = 'เชื่อมต่อแล้ว';
    if(ctx.priceAt){ const w = ssWhen(new Date(ctx.priceAt).toISOString(), today); if(w) t += ' ราคาล่าสุด ' + w; }
    out.price = { text: t };
  }else out.price = { text: 'ยังไม่ได้ตั้ง' };

  out.slip = ssOnline(ctx.slip && { on: ctx.slip.on, err: ctx.slip.err, at: ctx.slip.lastPullAt }, today, 'ดึงล่าสุด', 'ดึงไม่ได้');
  out.cloud = ssOnline(ctx.cloud && { on: ctx.cloud.on, err: ctx.cloud.err, at: ctx.cloud.lastOkAt }, today, 'สำรองล่าสุด', 'สำรองไม่ได้');
  out.briefing = ssOnline(ctx.briefing && { on: ctx.briefing.on, err: ctx.briefing.err, at: ctx.briefing.lastOkAt }, today, 'ส่งล่าสุด', 'ส่งไม่ได้');

  const ws = st.wealthSettings || {};
  const nTh = HEALTH_THRESHOLD_KEYS.filter(k => ws[k] !== undefined && ws[k] !== WEALTH_SETTINGS_DEFAULTS[k]).length;
  out.thresholds = { text: nTh > 0 ? 'ปรับไว้ ' + nTh + ' ข้อ' : 'ค่าเริ่มต้น' };
  return out;
}

function ssLoadLastExport(){
  try{ return localStorage.getItem(LAST_EXPORT_KEY) || ''; }catch(e){ return ''; }
}
function noteExportDone(){
  try{ localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString()); }catch(e){}
  renderSettingsSummaries();
}
function ssGatherCtx(){
  const slip = slipLoadStatus(), cloud = cloudLoadConfig() || {}, br = briefingLoadStatus();
  return {
    month: monthKey(currentMonth), today: todayISO(), lastExportAt: ssLoadLastExport(),
    priceOn: !!loadPriceConfig(), priceAt: newestAutoPriceMs(),
    slip: { on: slipIsOn(), lastPullAt: slip.lastPullAt, err: slip.lastError },
    cloud: { on: !!cloud.enabled, lastOkAt: cloud.lastOkAt, err: cloud.lastError },
    briefing: { on: briefingIsOn(), lastOkAt: br.lastOkAt, err: br.lastError }
  };
}
const SS_WARN_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>';
function renderSettingsSummaries(){
  if(typeof document === 'undefined') return;
  try{ ssPaint(settingsSummaries(state, ssGatherCtx())); }catch(e){}
}
function ssPaint(sums){
  SS_KEYS.forEach(k => {
    const el = document.getElementById('sum-' + k);
    if(!el) return;
    const s = sums[k];
    el.textContent = '';
    el.classList.toggle('warn', !!s.warn);
    if(s.warn) el.insertAdjacentHTML('beforeend', SS_WARN_ICON);
    el.appendChild(document.createTextNode(s.text));
  });
}
