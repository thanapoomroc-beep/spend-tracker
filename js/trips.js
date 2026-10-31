/* ---------- Travel mode: banner, suggestion, trip hero ---------- */
function tripDayText(t, today){
  if(today < t.startDate) return `อีก ${dayNum(t.startDate) - dayNum(today)} วันออกเดินทาง`;
  if(today > t.endDate) return 'ทริปจบแล้ว';
  return `วันที่ ${dayNum(today) - dayNum(t.startDate) + 1}/${dayNum(t.endDate) - dayNum(t.startDate) + 1}`;
}
function suggestionTrip(today){
  return state.trips.filter(t => t.startDate <= today && today <= t.endDate).sort((a,b)=> a.startDate < b.startDate ? -1 : 1)[0] || null;
}
function suggestDismissedForToday(){
  if(suggestDismissedToday) return true;
  try{ return localStorage.getItem(TRIP_SUGGEST_KEY) === todayISO(); }catch(e){ return false; }
}
function renderTripBanner(trip){
  const today = todayISO();
  const banner = document.getElementById('tripBanner');
  const sug = document.getElementById('tripSuggest');
  banner.hidden = !trip;
  if(trip){
    const day = tripDayText(trip, today);
    document.getElementById('tbName').textContent = '✈\uFE0E ' + trip.name;
    document.getElementById('tbDay').textContent = day;
    document.getElementById('tripBannerMain').setAttribute('aria-label', `โหมดท่องเที่ยว ${trip.name} ${day} ดูสรุปทริป`);
  }
  const st = !trip ? suggestionTrip(today) : null;
  const show = !!st && !suggestDismissedForToday();
  sug.hidden = !show;
  if(show){
    document.getElementById('tripSuggestTxt').textContent = `อยู่ในช่วง${st.name} เปิดโหมดท่องเที่ยวไหม?`;
    sug.dataset.id = st.id;
  }
}
// What the normal monthly allowance is right now (same maths as the normal hero), for the muted line in the trip hero.
function normalDailyAllowance(fig, now){
  if(!(fig.income > 0) || fig.remaining < 0) return null;
  const today = todayISO();
  const todaySpent = fig.entries.filter(e => e.date === today).reduce((s,e)=> s + e.amount, 0);
  const daysLeft = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate() - now.getDate() + 1;
  return (fig.remaining + todaySpent) / daysLeft;
}

// The trip budget maths in one place: used by the วันนี้ hero and the trip summary page.
function tripHeroModel(t, today){
  const list = tripEntriesOf(t.id);
  const spent = list.reduce((s,e)=> s + e.amount, 0);
  const todaySpent = list.filter(e => e.date === today).reduce((s,e)=> s + e.amount, 0);
  let label = '', cls = '', num = 0, dir = 'down', html = '';
  if(!(t.budget > 0)){
    label = 'ใช้ไปแล้ว'; num = spent; dir = 'up';
  }else if(today < t.startDate){
    label = 'ก่อนเดินทาง ใช้ไปแล้ว'; num = spent; dir = 'up';
    html = `จากงบ ${fmt(t.budget)}`;
  }else if(today > t.endDate){
    label = 'ใช้ทั้งหมด'; num = spent; dir = 'up';
    const diff = t.budget - spent;
    html = `จากงบ ${fmt(t.budget)} <span class="${diff >= 0 ? 'pos' : 'neg'}">${diff >= 0 ? 'เหลือ ' : 'เกิน '}${fmt(Math.abs(diff))}</span>`;
  }else{
    const daysLeft = dayNum(t.endDate) - dayNum(today) + 1;
    if(t.budget - spent < 0){
      label = 'เกินงบทริปแล้ว'; num = spent - t.budget; cls = 'neg';
      html = `ใช้ไปแล้ว ${fmt(spent)} จากงบ ${fmt(t.budget)}`;
    }else{
      // Stable for the whole day: today's spending is added back before dividing.
      const daily = (t.budget - spent + todaySpent) / daysLeft;
      const todayLeft = daily - todaySpent;
      if(todayLeft >= 0){ label = 'วันนี้ใช้ได้อีก'; num = todayLeft; cls = 'pos'; }
      else{ label = 'วันนี้ใช้เกินแล้ว'; num = Math.abs(todayLeft); cls = 'warn'; }
      html = `ใช้ได้วันละ ${fmt(daily)} อีก ${daysLeft} วัน`;
    }
  }
  return { label, num, cls, dir, html };
}
// Reuses the normal hero's DOM and ids, so the count-up and delta in heroFeedback keep working.
function renderTripHero(t, normalDaily){
  cancelAnimationFrame(heroAnimRaf);
  const card = document.getElementById('heroCard');
  const label = document.getElementById('heroLabel');
  const value = document.getElementById('heroValue');
  const wrap = document.getElementById('heroValueWrap');
  const sub = document.getElementById('heroSub');
  const sub2 = document.getElementById('heroSub2');
  const sub3 = document.getElementById('heroSub3');
  document.getElementById('heroMeter').style.display = 'none';
  document.getElementById('heroCta').style.display = 'none';
  document.getElementById('heroInfo').style.display = 'none';
  sub.innerHTML = ''; sub2.innerHTML = ''; sub3.innerHTML = '';
  value.style.display = ''; wrap.style.display = '';
  const m = tripHeroModel(t, todayISO());
  label.textContent = m.label;
  const { num, dir, cls, html } = m;
  value.textContent = fmt(num);
  heroShown = { label: label.textContent, num, dir };
  value.className = 'hero-value ' + cls;
  card.className = 'card hero trip-hero';
  sub.innerHTML = html;
  sub2.textContent = normalDaily === null ? '' : `เดือนนี้ใช้ได้วันละ ${fmt(normalDaily)}`;
}

/* ---------- Header: date + streak ---------- */
function renderHeader(now){
  const wd = now.toLocaleDateString('th-TH', { weekday:'long' }).replace(/^วัน/, '');
  const rest = now.toLocaleDateString('th-TH', { day:'numeric', month:'short' });
  document.getElementById('h-today').textContent = `${wd} ${rest}`;
  const days = new Set(state.entries.map(e => e.date));
  const run = (from)=>{
    let n = 0;
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    while(days.has(isoOf(d))){ n++; d.setDate(d.getDate() - 1); }
    return n;
  };
  const el = document.getElementById('streakLine');
  if(days.has(todayISO())){
    el.textContent = `จดติดกัน ${run(now)} วัน`;
  }else{
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const n = run(y);
    el.textContent = n >= 1 ? `จดติดกัน ${n} วัน จดวันนี้ต่อเลย` : '';
  }
}

/* ---------- Quick repeat (จดซ้ำ) ---------- */
// Same category, amount and note at least twice in the last 60 days; most often first, then most recent.
function repeatGroups(){
  const now = new Date();
  const cutoff = isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60));
  const today = todayISO();
  const map = new Map();
  state.entries.forEach(e=>{
    if(e.tripId || e.date < cutoff || e.date > today) return;
    const c = findCat(e.category);
    if(!c || c.archived) return;
    const note = String(e.note || '').trim();
    const k = JSON.stringify([e.category, e.amount, note]);
    let g = map.get(k);
    if(!g){ g = { category:e.category, amount:e.amount, note, count:0, last:'', pay:'' }; map.set(k, g); }
    g.count++;
    // most recent entry of the group decides the method (later in the list wins a same-day tie)
    if(e.date >= g.last){ g.last = e.date; g.pay = findPay(e.paymentMethod) ? e.paymentMethod : ''; }
  });
  return [...map.values()].filter(g => g.count >= 2)
    .sort((a,b)=> b.count - a.count || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0)).slice(0, 4);
}
function renderRepeat(travel){
  const row = document.getElementById('repeatRow');
  const groups = travel ? [] : repeatGroups();
  row.innerHTML = '';
  row.hidden = !groups.length;
  if(!groups.length) return;
  const lab = document.createElement('span');
  lab.className = 'rlabel';
  lab.setAttribute('aria-hidden', 'true');
  lab.textContent = 'จดซ้ำ';
  row.appendChild(lab);
  groups.forEach(g=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rchip';
    b.setAttribute('aria-label', `จดซ้ำ ${g.category} ${fmtExact(g.amount)}${g.note ? ' ' + g.note : ''}${g.pay ? ' จ่ายด้วย ' + payName(g.pay) : ''}`);
    b.innerHTML = `<span class="dot" style="background:${categoryColor(g.category)}" aria-hidden="true"></span><span class="rt">${escapeHtml(g.note || g.category)} ${fmtExact(g.amount)}</span>`;
    b.addEventListener('click', ()=> saveNewEntry({ date: todayISO(), amount: g.amount, category: g.category, note: g.note, paymentMethod: g.pay }, false));
    row.appendChild(b);
  });
}

/* ---------- Trips: switch, picker sheet, create / edit ---------- */
let sheetOpener = null, tripModalOpener = null, editingTripId = null, tripFunding = 'savings';

async function setActiveTrip(id){
  state.activeTripId = id || null;
  entryKind = 'trip'; entryLink = '';
  await saveData();
  renderForm();
  render();
}
let tripSheetIds = null;   // null = the travel mode switch; an array = a picker of those trips for the summary page
function openTripSheet(ids){
  sheetOpener = document.activeElement;
  tripSheetIds = Array.isArray(ids) ? ids : null;
  document.getElementById('tripSheetTitle').textContent = tripSheetIds ? 'เลือกทริป' : 'โหมดท่องเที่ยว';
  document.getElementById('tripNewBtn').style.display = tripSheetIds ? 'none' : '';
  renderTripList();
  document.getElementById('tripSheetOverlay').style.display = 'flex';
  const first = document.querySelector('#tripList .tl-main') || document.getElementById('tripNewBtn');
  first.focus();
}
function closeTripSheet(restore){
  document.getElementById('tripSheetOverlay').style.display = 'none';
  if(restore !== false && sheetOpener && sheetOpener.focus) sheetOpener.focus();
  sheetOpener = null;
}
function renderTripList(){
  const ul = document.getElementById('tripList');
  ul.innerHTML = '';
  const trips = sortedTrips().filter(t => !tripSheetIds || tripSheetIds.includes(t.id));
  document.getElementById('tripSheetDesc').textContent = tripSheetIds ? 'ดูสรุปของทริปไหน' : (trips.length ? 'แตะชื่อเพื่อดูสรุป หรือกดเปิดเพื่อจดทริปนั้น' : 'ยังไม่มีทริป สร้างทริปแรกได้เลย');
  ul.style.display = trips.length ? '' : 'none';
  trips.forEach(t=>{
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" class="tl-main"><span class="tl-name">${escapeHtml(t.name)}</span><span class="tl-dates">${escapeHtml(tripDates(t))}</span></button>${tripSheetIds ? '' : `<button type="button" class="secondary tl-go" aria-label="เปิดโหมดท่องเที่ยว ${escapeHtml(t.name)}">เปิด</button>`}<button type="button" class="tl-edit" aria-label="แก้ไขทริป ${escapeHtml(t.name)}">${'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'}</button>`;
    li.querySelector('.tl-main').addEventListener('click', ()=>{ const op = sheetOpener; closeTripSheet(false); openTripPage(t.id, op); });
    const go = li.querySelector('.tl-go'); if(go) go.addEventListener('click', ()=>{ closeTripSheet(false); setActiveTrip(t.id); });
    li.querySelector('.tl-edit').addEventListener('click', ()=>{ const op = sheetOpener; closeTripSheet(false); openTripModal(t.id, op); });
    ul.appendChild(li);
  });
}

function syncRateLabels(){
  const code = document.getElementById('tripCur').value || 'CNY';
  document.getElementById('tripRateALab').textContent = `1 ${code} =`;
  document.getElementById('tripRateBUnit').textContent = code;
  const thb = code === 'THB';
  ['tripRateA','tripRateB'].forEach(id => { document.getElementById(id).disabled = thb; });
  if(thb){ document.getElementById('tripRateA').value = 1; document.getElementById('tripRateB').value = 1; }
}
// Two linked fields, one stored value: thbPerUnit is always what the first field shows.
function onRateA(){
  const v = parseFloat(document.getElementById('tripRateA').value);
  document.getElementById('tripRateB').value = v > 0 ? roundSig(1 / v, 3) : '';
  document.getElementById('tripRateErr').textContent = '';
}
function onRateB(){
  const v = parseFloat(document.getElementById('tripRateB').value);
  document.getElementById('tripRateA').value = v > 0 ? roundSig(1 / v, 4) : '';
  document.getElementById('tripRateErr').textContent = '';
}
function setTripFunding(f, focus){
  tripFunding = f === 'income' ? 'income' : 'savings';
  document.querySelectorAll('#tripFund button').forEach(b=>{
    const on = b.dataset.fund === tripFunding;
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
    if(on && focus) b.focus();
  });
  document.getElementById('tripFundHint').textContent = tripFunding === 'savings' ? 'เงินเก็บ ไม่หักจากคงเหลือของเดือน' : 'หักจากคงเหลือของเดือนที่จ่าย';
}
function openTripModal(id, opener){
  tripModalOpener = opener || document.activeElement;
  editingTripId = id || null;
  const t = findTrip(id);
  const used = t ? tripEntriesOf(t.id).length : 0;
  document.getElementById('tripModalTitle').textContent = t ? 'แก้ไขทริป' : 'สร้างทริป';
  document.getElementById('tripName').value = t ? t.name : '';
  const cur = document.getElementById('tripCur');
  cur.value = t ? t.currency : 'CNY';
  cur.disabled = used > 0;
  document.getElementById('tripCurHint').hidden = !(used > 0);
  document.getElementById('tripStart').value = t ? t.startDate : todayISO();
  document.getElementById('tripEnd').value = t ? t.endDate : todayISO();
  document.getElementById('tripRateA').value = t ? t.thbPerUnit : '';
  document.getElementById('tripRateB').value = t ? roundSig(1 / t.thbPerUnit, 3) : '';
  document.getElementById('tripBudget').value = t && t.budget > 0 ? t.budget : '';
  ['tripNameErr','tripDateErr','tripRateErr'].forEach(i => { document.getElementById(i).textContent = ''; });
  document.getElementById('tripName').removeAttribute('aria-invalid');
  setTripFunding(t ? t.funding : 'savings');
  document.getElementById('tripDeleteBtn').style.display = t ? '' : 'none';
  syncRateLabels();
  if(t && t.currency !== 'THB') document.getElementById('tripRateA').value = t.thbPerUnit;
  document.getElementById('tripModalOverlay').style.display = 'flex';
  document.getElementById('tripName').focus();
}
function closeTripModal(){
  document.getElementById('tripModalOverlay').style.display = 'none';
  const o = tripModalOpener; tripModalOpener = null;
  if(o && o.focus && document.body.contains(o)) o.focus();
}
async function saveTrip(){
  const name = document.getElementById('tripName').value.trim();
  const code = document.getElementById('tripCur').value;
  const start = document.getElementById('tripStart').value, end = document.getElementById('tripEnd').value;
  const rate = code === 'THB' ? 1 : parseFloat(document.getElementById('tripRateA').value);
  const budget = parseFloat(document.getElementById('tripBudget').value) || 0;
  let bad = null;
  const nameErr = document.getElementById('tripNameErr'), dateErr = document.getElementById('tripDateErr'), rateErr = document.getElementById('tripRateErr');
  nameErr.textContent = dateErr.textContent = rateErr.textContent = '';
  document.getElementById('tripName').removeAttribute('aria-invalid');
  if(!name){ nameErr.textContent = 'ใส่ชื่อทริปก่อน'; document.getElementById('tripName').setAttribute('aria-invalid','true'); bad = bad || document.getElementById('tripName'); }
  if(!start || !end){ dateErr.textContent = 'เลือกวันเริ่มและวันกลับก่อน'; bad = bad || document.getElementById(start ? 'tripEnd' : 'tripStart'); }
  else if(end < start){ dateErr.textContent = 'วันกลับต้องไม่ก่อนวันเริ่ม'; bad = bad || document.getElementById('tripEnd'); }
  if(!(rate > 0)){ rateErr.textContent = 'ใส่เรตก่อน'; bad = bad || document.getElementById('tripRateA'); }
  if(bad){ bad.focus(); return; }

  const stamp = nowISO();
  let t = findTrip(editingTripId), recalc = [], isNew = !t;
  if(t){
    const rateChanged = rate !== t.thbPerUnit;
    t.name = name; t.currency = code; t.startDate = start; t.endDate = end; t.budget = budget; t.funding = tripFunding;
    t.thbPerUnit = rate; t.updatedAt = stamp;
    if(rateChanged) recalc = tripEntriesOf(t.id).filter(e => e.currency === t.currency && e.currency !== 'THB' && !e.amountOverridden);
  }else{
    t = { id: 'trip-' + genId(), name, currency: code, thbPerUnit: rate, startDate: start, endDate: end, budget, funding: tripFunding, createdAt: stamp, updatedAt: stamp };
    state.trips.push(t);
  }
  await saveData();
  closeTripModal();
  const today = todayISO();
  if(isNew && start <= today && today <= end){ await setActiveTrip(t.id); }
  else{ renderForm(); render(); if(isNew) flashToast('สร้างทริปแล้ว', true); }
  if(recalc.length){
    openConfirm({
      title: 'คำนวณยอดบาทใหม่ไหม?',
      desc: `ใช้เรตใหม่กับรายการเดิม ${recalc.length} รายการ ยกเว้นรายการที่แก้ยอดบาทเอง`,
      confirmLabel: 'คำนวณใหม่',
      onConfirm: async ()=>{
        const st = nowISO();
        recalc.forEach(e=>{ e.rate = t.thbPerUnit; e.amount = round2(e.originalAmount * e.rate / e.splitCount); e.updatedAt = st; });
        await saveData();
        render();
      }
    });
  }
}
function askDeleteTrip(){
  const t = findTrip(editingTripId);
  if(!t) return;
  const n = tripEntriesOf(t.id).length;
  openConfirm({
    title: n ? `ลบทริปและรายการทั้งหมด ${n} รายการไหม?` : `ลบทริป "${t.name}" ไหม?`,
    desc: n ? `ทริป "${t.name}" ลบแล้วเอากลับมาไม่ได้` : 'ลบแล้วเอากลับมาไม่ได้',
    confirmLabel: 'ลบ',
    onConfirm: async ()=>{
      state.trips = state.trips.filter(x => x.id !== t.id);
      state.entries = state.entries.filter(e => e.tripId !== t.id);
      if(state.activeTripId === t.id) state.activeTripId = null;   // travel mode turns off
      if(entryLink === t.id) entryLink = '';
      if(tripPageId === t.id){ try{ history.replaceState(null, '', '#' + activeTab); }catch(e){} closeTripPage(); }
      closeTripModal();
      await saveData();
      renderForm();
      render();
    }
  });
}
function dismissSuggestion(){
  suggestDismissedToday = true;
  try{ localStorage.setItem(TRIP_SUGGEST_KEY, todayISO()); }catch(e){}
  renderTripBanner(activeTrip());
}

/* ---------- Trip summary page (C6) ---------- */
let tripPageId = null, tripPageOpener = null, tripPageDirect = false;
function tripIdsInMonth(d){ return [...new Set(tripEntriesForMonth(d).map(e => e.tripId))].filter(findTrip); }
function openMonthTrips(opener){
  const ids = tripIdsInMonth(currentMonth);
  if(ids.length === 1) openTripPage(ids[0], opener);
  else if(ids.length) openTripSheet(ids);
}
// "23–29 ต.ค. 2569", spanning months or years when it has to.
function tripRangeText(t){
  const a = parseISODate(t.startDate), b = parseISODate(t.endDate);
  const mo = d => d.toLocaleDateString('th-TH', { month:'short' });
  const yr = d => String(d.getFullYear() + 543);
  if(t.startDate === t.endDate) return `${a.getDate()} ${mo(a)} ${yr(a)}`;
  if(a.getFullYear() !== b.getFullYear()) return `${a.getDate()} ${mo(a)} ${yr(a)}–${b.getDate()} ${mo(b)} ${yr(b)}`;
  if(a.getMonth() !== b.getMonth()) return `${a.getDate()} ${mo(a)}–${b.getDate()} ${mo(b)} ${yr(b)}`;
  return `${a.getDate()}–${b.getDate()} ${mo(b)} ${yr(b)}`;
}
function openTripPage(id, opener, fromHash){
  const t = findTrip(id);
  if(!t) return;
  if(tripPageId === id) return;
  if(tripPageId) closeTripPage({ restore:false });
  scrollPos[activeTab] = window.scrollY;
  tripPageOpener = opener && opener.focus ? opener : null;
  tripPageDirect = !!fromHash && !history.length ? true : !!fromHash;
  tripPageId = id;
  TABS.forEach(n => { document.getElementById('panel-' + n).hidden = true; });
  document.getElementById('tripPage').hidden = false;
  renderTripPage();
  window.scrollTo(0, 0);
  if(!fromHash && location.hash !== '#trip/' + id) location.hash = 'trip/' + id;
  document.getElementById('tpBack').focus({ preventScroll:true });
}
// opts.restore:false skips bringing the old tab and its scroll position back (the caller is switching tabs).
function closeTripPage(opts){
  if(!tripPageId) return;
  tripPageId = null;
  document.getElementById('tripPage').hidden = true;
  document.getElementById('panel-' + activeTab).hidden = false;
  if(!(opts && opts.restore === false)){
    window.scrollTo(0, scrollPos[activeTab] || 0);
    const o = tripPageOpener;
    if(o && document.body.contains(o)) o.focus({ preventScroll:true });
  }
  tripPageOpener = null;
  if(activeTab === 'overview'){ resizeCharts(); requestAnimationFrame(resizeCharts); }
}
// ‹ กลับ and Escape: go back in history when we pushed the hash, otherwise just close.
function tripPageBack(){
  if(!tripPageId) return;
  if(/^#trip\//.test(location.hash) && !tripPageDirect) history.back();
  else{
    try{ history.replaceState(null, '', '#' + activeTab); }catch(e){}
    closeTripPage();
  }
}
function syncFromHash(){
  const m = /^#trip\/(.+)$/.exec(location.hash);
  if(m){
    const id = decodeURIComponent(m[1]);
    if(findTrip(id)) openTripPage(id, null, true);
    else{ try{ history.replaceState(null, '', '#' + activeTab); }catch(e){} closeTripPage(); }
    return;
  }
  if(tripPageId) closeTripPage();
  const t = tabFromHash();
  if(t !== activeTab) applyTab(t);
}

function renderTripPage(){
  if(!tripPageId) return;
  const t = findTrip(tripPageId);
  if(!t){ closeTripPage(); return; }
  const $ = id => document.getElementById(id);
  const today = todayISO();
  const list = tripEntriesOf(t.id);
  const spent = list.reduce((s,e)=> s + e.amount, 0);
  $('tpTitle').textContent = t.name;
  $('tpDates').textContent = tripRangeText(t);
  // hero: same maths as วันนี้
  $('tpHero').hidden = !(t.budget > 0);
  if(t.budget > 0){
    const m = tripHeroModel(t, today);
    $('tpHeroLabel').textContent = m.label;
    $('tpHeroValue').textContent = fmt(m.num);
    $('tpHeroValue').className = 'hero-value ' + m.cls;
    $('tpHeroSub').innerHTML = m.html;
  }
  // stats
  const cells = [['รวม', fmt(spent)]];
  if(t.currency !== 'THB'){
    const local = list.filter(e => e.currency === t.currency).reduce((s,e)=> s + e.originalAmount / e.splitCount, 0);
    cells.push([`เป็น ${t.currency}`, '≈ ' + fmtCur(round2(local), t.currency)]);
  }
  if(today >= t.startDate){
    const total = dayNum(t.endDate) - dayNum(t.startDate) + 1;
    const elapsed = Math.min(total, dayNum(today) - dayNum(t.startDate) + 1);
    const inTrip = list.filter(e => e.date >= t.startDate && e.date <= t.endDate).reduce((s,e)=> s + e.amount, 0);
    cells.push(['เฉลี่ยวันละ', fmt(inTrip / elapsed)]);
  }
  const st = $('tpStats');
  st.style.gridTemplateColumns = `repeat(${cells.length},minmax(0,1fr))`;
  st.innerHTML = cells.map(c => `<div><span class="k">${escapeHtml(c[0])}</span><span class="v">${escapeHtml(c[1])}</span></div>`).join('');
  // budget bar
  $('tpBudgetCard').hidden = !(t.budget > 0);
  if(t.budget > 0){
    const ratio = spent / t.budget, pct = Math.round(ratio * 100);
    $('tpBudgetNums').textContent = `${fmt(spent)} / ${fmt(t.budget)}`;
    const fill = $('tpBudgetFill');
    fill.style.width = Math.min(ratio, 1) * 100 + '%';
    fill.className = ratio > 1 ? 'neg' : ratio >= 0.8 ? 'warn' : '';
    $('tpBudgetBar').setAttribute('aria-valuenow', String(Math.min(pct, 100)));
    $('tpBudgetBar').setAttribute('aria-valuetext', `ใช้ไป ${pct}%`);
    const foot = $('tpBudgetFoot');
    foot.className = 'budget-foot' + (ratio > 1 ? ' neg' : '');
    foot.textContent = `ใช้ไป ${pct}%`;
  }
  // by category
  const by = {};
  list.forEach(e => { by[e.category] = (by[e.category] || 0) + e.amount; });
  const rows = Object.keys(by).map(n => ({ n, sum: by[n] })).sort((a,b)=> b.sum - a.sum);
  const cb = $('tpCatBody');
  cb.innerHTML = '';
  $('tpCatCard').style.display = rows.length ? '' : 'none';
  rows.forEach(r=>{
    const li = document.createElement('li');
    li.innerHTML = `<div class="pb-head"><span class="nm"><span class="dot" style="background:${tripCatColor(r.n)}" aria-hidden="true"></span><span class="t">${escapeHtml(r.n)}</span></span><span class="amt">${fmt(r.sum)}</span><span class="pct">${spent > 0 ? Math.round(r.sum / spent * 100) : 0}%</span></div><div class="pb-bar" aria-hidden="true"><span class="cat" style="width:${rows[0].sum > 0 ? r.sum / rows[0].sum * 100 : 0}%"></span></div>`;
    cb.appendChild(li);
  });
  // by payment method: the same renderer as the monthly card
  renderPayBreakdown(list, { card: $('tpPayCard'), body: $('tpPayBody'), total: $('tpPayTotal') });
  // entries: after the trip, the trip days, then before the trip (newest first like everywhere else)
  const box = $('tripPageList');
  box.innerHTML = '';
  $('tpEmpty').style.display = list.length ? 'none' : 'block';
  $('tpCount').textContent = list.length ? `${list.length} รายการ` : '';
  const sorted = sortEntries(list);
  const groups = [
    { label:'หลังกลับ', items: sorted.filter(e => e.date > t.endDate) },
    { label:'', items: sorted.filter(e => e.date >= t.startDate && e.date <= t.endDate) },
    { label:'ก่อนเดินทาง', items: sorted.filter(e => e.date < t.startDate) }
  ];
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  groups.forEach(g=>{
    if(!g.items.length) return;
    if(g.label){
      const h = document.createElement('h3');
      h.className = 'tp-group';
      h.innerHTML = `<span>${g.label}</span><span>${fmt(g.items.reduce((s,e)=> s + e.amount, 0))}</span>`;
      box.appendChild(h);
    }
    let last = null;
    g.items.forEach(e=>{
      if(e.date !== last){
        last = e.date;
        const head = document.createElement('div');
        head.className = 'day-head';
        const word = e.date === today ? 'วันนี้ ' : e.date === isoOf(yest) ? 'เมื่อวาน ' : '';
        head.innerHTML = `<span>${escapeHtml(word + fmtThaiDate(e.date))}</span><span>${fmt(g.items.filter(x => x.date === e.date).reduce((s,x)=> s + x.amount, 0))}</span>`;
        box.appendChild(head);
      }
      box.appendChild(entryRowEl(e, 'tripPageList', true, true));
    });
  });
}

/* ---------- Trip CSV ---------- */
function csvField(v, guard){
  let s = v === undefined || v === null ? '' : String(v);
  if(guard && /^[=+\-@\t\r]/.test(s)) s = "'" + s;   // stop spreadsheets running a note as a formula
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function tripCsv(t){
  const rows = [['date','category','payment','note','currency','originalAmount','splitCount','rate','amountTHB']];
  tripEntriesOf(t.id).slice().sort((a,b)=> a.date < b.date ? -1 : a.date > b.date ? 1 : 0).forEach(e=>{
    rows.push([e.date, e.category, payName(e.paymentMethod), e.note || '', e.currency, e.originalAmount, e.splitCount, e.rate, e.amount]);
  });
  return '\uFEFF' + rows.map(r => r.map((v,i)=> csvField(v, i === 1 || i === 2 || i === 3)).join(',')).join('\r\n') + '\r\n';
}
function tripCsvName(t){
  const safe = t.name.replace(/[\\/:*?"<>|,;'\s]+/g, '-').replace(/^-+|-+$/g, '') || 'trip';
  return `trip-${safe}-${t.startDate}.csv`;
}
function exportTripCsv(){
  const t = findTrip(tripPageId);
  if(!t) return;
  const blob = new Blob([tripCsv(t)], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = tripCsvName(t);
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// settings: every trip, newest first
function renderTripsSettings(){
  const box = document.getElementById('tripsSettingsList');
  if(!box) return;
  box.innerHTML = '';
  const trips = sortedTrips();
  if(!trips.length){ box.innerHTML = '<div class="empty" style="padding:6px 0;">ยังไม่มีทริป</div>'; return; }
  const ul = document.createElement('ul');
  ul.className = 'trip-list';
  trips.forEach(t=>{
    const n = tripEntriesOf(t.id).length;
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" class="tl-main"><span class="tl-name">${escapeHtml(t.name)}</span><span class="tl-dates">${escapeHtml(tripRangeText(t))} · ${n} รายการ</span></button><button type="button" class="tl-edit" aria-label="แก้ไขทริป ${escapeHtml(t.name)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>`;
    const main = li.querySelector('.tl-main');
    main.addEventListener('click', ()=> openTripPage(t.id, main));
    const ed = li.querySelector('.tl-edit');
    ed.addEventListener('click', ()=> openTripModal(t.id, ed));
    ul.appendChild(li);
  });
  box.appendChild(ul);
}

