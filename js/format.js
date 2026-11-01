const ICON_X = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';

function fmt(n){
  return '฿' + Math.round(n).toLocaleString('en-US');
}
function round2(n){ return Math.round((n + Number.EPSILON) * 100) / 100; }
// Foreign amounts: narrow symbol, no trailing zeros (¥300 for JPY, 12.5元 for CNY, which takes a 元 suffix).
const curFmtCache = {};
function fmtCur(n, cur){
  if(!cur || cur === 'THB') return fmtExact(n);
  if(cur === 'CNY') return Number(n).toLocaleString('en-US', { maximumFractionDigits:2 }) + '元';
  try{
    const f = curFmtCache[cur] || (curFmtCache[cur] = new Intl.NumberFormat('th-TH', { style:'currency', currency:cur, currencyDisplay:'narrowSymbol', minimumFractionDigits:0, maximumFractionDigits: ZERO_DECIMAL.includes(cur) ? 0 : 2 }));
    return f.format(n);
  }catch(e){ return cur + ' ' + n; }
}
function curInfo(code){ return CURRENCIES.find(c => c.code === code) || { code, sym:code, name:code }; }
function roundSig(x, n){ return x > 0 && isFinite(x) ? Number(x.toPrecision(n)) : 0; }
function monthKey(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}
function monthLabelStr(d){
  return d.toLocaleString('th-TH',{month:'long', year:'numeric'});
}
// Label for "the month being viewed": เดือนนี้ for the current month, otherwise short month + BE year.
function viewedMonthWord(){
  return monthKey(currentMonth) === monthKey(new Date()) ? 'เดือนนี้' : thaiMonthYear(monthKey(currentMonth));
}
// Toast date: year only when it is not the current year.
function fmtToastDate(str){
  const d = parseISODate(str);
  const o = { day:'numeric', month:'short' };
  if(d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return d.toLocaleDateString('th-TH', o);
}
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
/* ---------- Categories (F1) ---------- */
function findCat(name){ return state.categories.find(c => c.name === name); }
function activeCats(){ return state.categories.filter(c => !c.archived); }
function catSlot(name){ const c = findCat(name); return c ? c.slot : null; }
// Colour follows the category's stored slot, never its rank. Unknown names and slot-less categories are neutral.
function categoryColor(name){
  const s = catSlot(name);
  return s === null || s === undefined ? NEUTRAL_COLOR : SLOT_COLORS[s];
}
// Charts group every category without a colour slot under `อื่นๆ`.
function chartGroup(name){ return catSlot(name) === null || catSlot(name) === undefined ? 'อื่นๆ' : name; }
function colouredCatsBySlot(){ return state.categories.filter(c => c.slot !== null).sort((a,b)=> a.slot - b.slot); }
// Trip categories share names with normal ones (อาหาร, ช้อปปิ้ง, อื่นๆ), so every normal-category check ignores trip entries.
function categoryUsed(name){ return state.entries.some(e => !e.tripId && e.category === name); }

/* ---------- Trips: lookups ---------- */
function findTrip(id){ return id ? state.trips.find(t => t.id === id) : undefined; }
function activeTrip(){ return findTrip(state.activeTripId) || null; }
function tripCatColor(name){ const i = TRIP_CATS.indexOf(name); return i >= 0 && i < SLOT_COLORS.length ? SLOT_COLORS[i] : NEUTRAL_COLOR; }
function entryColor(e){ return e.tripId ? tripCatColor(e.category) : categoryColor(e.category); }
function dayNum(iso){ const p = String(iso).split('-'); return Math.round(Date.UTC(+p[0], (+p[1]||1) - 1, +p[2]||1) / 86400000); }
function tripEntriesOf(id){ return state.entries.filter(e => e.tripId === id); }
function tripFundingOf(e){ const t = findTrip(e.tripId); return t ? t.funding : 'savings'; }
// Trips still worth linking a booking to (not yet over).
function linkableTrips(){ const today = todayISO(); return state.trips.filter(t => t.endDate >= today); }
function tripDates(t){ return `${fmtThaiDate(t.startDate)} ถึง ${fmtThaiDate(t.endDate)}`; }
function sortedTrips(){ return state.trips.slice().sort((a,b)=> a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0); }
function firstFreeSlot(){
  const used = new Set(state.categories.map(c => c.slot));
  for(let i = 0; i < SLOT_COLORS.length; i++) if(!used.has(i)) return i;
  return null;
}
function ensureSelectedCategory(){
  const act = activeCats();
  if(!act.some(c => c.name === selectedCategory)) selectedCategory = act.length ? act[0].name : '';
}

function initForm(){
  document.getElementById('entryDate').value = todayISO();
  formSig = null; entryKind = 'trip'; entryLink = '';
  renderForm();      // chips, payment, trip toggle and the rest of the entry form
  renderSettingsForm();
}

// One-line summary of the collapsed date/note fields.
function updateDateSummary(){
  const d = document.getElementById('entryDate').value;
  const note = document.getElementById('entryNote').value.trim();
  let t = (!d || d === todayISO()) ? 'วันนี้' : fmtThaiDate(d);
  if(note) t += ' (มีโน้ต)';
  if(!activeTrip() && entryLink && findTrip(entryLink)) t += ' (ผูกทริป)';
  document.getElementById('dateSummary').textContent = t;
  document.getElementById('dateHint').textContent = note ? '' : 'เพิ่มโน้ต/เปลี่ยนวัน';
}
function openSettings(focusIncome){
  goTab('settings', { keepScroll:true });
  const el = document.getElementById('setIncome');
  if(focusIncome){
    el.scrollIntoView({ block:'center' });
    el.focus({ preventScroll:true });
  }else{
    window.scrollTo(0, 0);
  }
}
function goToday(){
  currentMonth = new Date(); currentMonth.setDate(1);
  render();
}
function focusAmount(){
  goTab('today', { keepScroll:true });
  const el = document.getElementById('entryAmount');
  el.scrollIntoView({ block:'center' });
  el.focus({ preventScroll:true });
}
// The "ดูทั้งหมด" button on วันนี้ and the budget alert both look at the current calendar month.
function showAllEntriesTab(){
  if(activeTrip()){ openTripPage(activeTrip().id, document.getElementById('recentAllBtn')); return; }
  currentMonth = new Date(); currentMonth.setDate(1);
  render();
  goTab('entries');
}
function openBudgetOverview(){
  currentMonth = new Date(); currentMonth.setDate(1);
  render();
  goTab('overview');
}
function openBudgetSettings(){
  goTab('settings', { keepScroll:true });
  document.getElementById('budgetSettings').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block:'start' });
}

/* ---------- Tabs ---------- */
const TABS = ['today','entries','overview','wealth','settings'];
const MONTH_NAV_HTML = `<button type="button" class="secondary icon-btn" onclick="shiftMonth(-1)" aria-label="เดือนก่อนหน้า"><svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
    <div class="month-center">
      <div class="month-label" aria-live="polite"></div>
      <button type="button" class="pill today-pill" onclick="goToday()" style="display:none;">กลับมาเดือนนี้</button>
    </div>
    <button type="button" class="secondary icon-btn" onclick="shiftMonth(1)" aria-label="เดือนถัดไป"><svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button>`;
let activeTab = null;
const scrollPos = {};
function reducedMotion(){ return matchMedia('(prefers-reduced-motion:reduce)').matches; }
function tabFromHash(){
  const h = location.hash.replace(/^#/, '');
  return TABS.includes(h) ? h : 'today';
}
// Shows one panel. Saves the old tab's scroll first (hiding it changes the page height), restores the new tab's.
function applyTab(name, opts){
  opts = opts || {};
  if(activeTab) scrollPos[activeTab] = window.scrollY;
  activeTab = name;
  TABS.forEach(t=>{
    const panel = document.getElementById('panel-' + t);
    const btn = document.getElementById('tabbtn-' + t);
    panel.hidden = t !== name;
    if(t === name) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
  });
  if(!opts.keepScroll) window.scrollTo(0, scrollPos[name] || 0);
  if(name === 'overview'){
    // Charts built while the panel was hidden have no size yet.
    resizeCharts();
    requestAnimationFrame(resizeCharts);
  }
  if(name === 'wealth') showWealthTab();
}
function resizeCharts(){
  [compareChart, pieChart, trendChart].forEach(c=>{ if(c){ try{ c.resize(); }catch(e){} } });
}
function goTab(name, opts){
  if(!TABS.includes(name)) name = 'today';
  if(tripPageId){
    // leaving the trip page through the tab bar (or any jump): show the chosen tab, drop the #trip hash
    closeTripPage({ restore:false });
    try{ history.replaceState(null, '', '#' + name); }catch(e){}
    if(name === activeTab){ window.scrollTo(0, 0); return; }
    applyTab(name, opts);
    return;
  }
  if(name === activeTab){
    if(!(opts && opts.keepScroll)) window.scrollTo({ top:0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    return;
  }
  applyTab(name, opts);
  if(tabFromHash() !== name || (location.hash === '' && name !== 'today')) location.hash = name;
}

