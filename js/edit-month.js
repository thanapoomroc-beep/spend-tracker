/* ---------- Edit sheet ---------- */
let editOpenerList = 'entryList';
let editTripId = '', editCur = 'THB', editRate = 1, editSplit = 1, editOverridden = false;
function editTripObj(){ return findTrip(editTripId) || null; }
function openEdit(id, listId){
  const e = state.entries.find(x => x.id === id);
  if(!e) return;
  editingId = id;
  editOpenerList = listId || 'entryList';
  editCategory = e.category;
  editPayment = e.paymentMethod && findPay(e.paymentMethod) ? e.paymentMethod : '';
  editTripId = e.tripId || '';
  editCur = e.currency || 'THB'; editRate = e.rate || 1; editSplit = e.splitCount || 1; editOverridden = !!e.amountOverridden;
  document.getElementById('editDate').value = e.date;
  document.getElementById('editAmount').value = e.amount;
  document.getElementById('editOrig').value = e.tripId ? e.originalAmount : '';
  document.getElementById('editNote').value = e.note || '';
  document.getElementById('editError').textContent = '';
  renderEditTrip();
  renderEditPay();
  document.getElementById('editModalOverlay').style.display = 'flex';
  document.getElementById('editAmount').focus();
}
// Shows or hides the trip-only fields and rebuilds the chips and link select for the current trip choice.
function renderEditTrip(){
  const t = editTripObj();
  document.getElementById('editTripFields').hidden = !t;
  document.getElementById('editAmountLab').textContent = t ? 'ยอดบาทส่วนของคุณ' : 'จำนวนเงิน';
  if(t) document.getElementById('editOrigLab').textContent = `ยอดเต็มบิล (${editCur === 'THB' ? 'บาท' : editCur + ' ' + curInfo(editCur).sym})`;
  document.getElementById('editSplitN').value = editSplit;
  document.getElementById('editOverTag').hidden = !(t && editOverridden);
  document.getElementById('editTitle').innerHTML = 'แก้ไขรายการ' + (t ? `<span class="trip-badge">✈︎ ${escapeHtml(t.name)}</span>` : '');
  const e = state.entries.find(x => x.id === editingId);
  const list = linkableTrips();
  if(e && e.tripId && !list.some(x => x.id === e.tripId) && findTrip(e.tripId)) list.push(findTrip(e.tripId));
  if(t && !list.some(x => x.id === t.id)) list.push(t);
  const sel = document.getElementById('editLink');
  document.getElementById('editLinkWrap').hidden = !list.length;
  sel.innerHTML = '<option value="">ไม่ผูก</option>' + list.map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}</option>`).join('');
  sel.value = editTripId;
  renderEditChips();
}
function onEditLinkChange(){
  const v = document.getElementById('editLink').value;
  const amountEl = document.getElementById('editAmount');
  const baht = parseFloat(amountEl.value) || 0;
  if(v){
    const t = findTrip(v);
    if(!t) return;
    if(!editTripId){
      // a normal entry moves into the trip: its baht amount is the whole bill in baht
      editCur = 'THB'; editRate = 1; editSplit = 1; editOverridden = false;
      document.getElementById('editOrig').value = baht || '';
    }else if(editCur !== 'THB' && editCur !== t.currency){
      editCur = 'THB'; editRate = 1; editSplit = 1; editOverridden = false;
      document.getElementById('editOrig').value = baht || '';
    }
    editTripId = v;
    if(!TRIP_CATS.includes(editCategory)) editCategory = 'อื่นๆ';
  }else{
    editTripId = '';
    editCurSplitReset();
    editCategory = '';   // the owner picks a normal category
  }
  document.getElementById('editError').textContent = '';
  renderEditTrip();
}
function editCurSplitReset(){ editCur = 'THB'; editRate = 1; editSplit = 1; editOverridden = false; }
function editRecalc(){
  const orig = parseFloat(document.getElementById('editOrig').value);
  if(orig > 0) document.getElementById('editAmount').value = round2(orig * editRate / editSplit);
  editOverridden = false;
  document.getElementById('editOverTag').hidden = true;
  document.getElementById('editError').textContent = '';
}
function onEditAmountInput(){
  document.getElementById('editError').textContent = '';
  if(editTripId){ editOverridden = true; document.getElementById('editOverTag').hidden = false; }
}
function setEditSplit(n){
  n = parseInt(n, 10);
  editSplit = n >= 1 ? Math.min(n, 50) : 1;
  document.getElementById('editSplitN').value = editSplit;
  editRecalc();
}
function closeEdit(){
  const id = editingId;
  editingId = null;
  document.getElementById('editModalOverlay').style.display = 'none';
  // Return focus to the row that opened the dialog (if it still exists).
  setTimeout(()=>{
    const row = [...document.querySelectorAll('#' + editOpenerList + ' .entry-row')].find(r => r.dataset.id === id);
    if(row) row.querySelector('.entry-main').focus();
  }, 0);
}
async function saveEdit(){
  const e = state.entries.find(x => x.id === editingId);
  if(!e){ closeEdit(); return; }
  const dateVal = document.getElementById('editDate').value;
  const amount = parseFloat(document.getElementById('editAmount').value);
  const err = document.getElementById('editError');
  if(editTripId){
    const orig = parseFloat(document.getElementById('editOrig').value);
    if(!(orig > 0)){ err.textContent = 'ใส่ยอดเต็มบิลก่อน'; return; }
  }
  if(!amount || amount <= 0){ err.textContent = 'ใส่จำนวนเงินก่อน'; return; }
  if(!dateVal){ err.textContent = 'เลือกวันที่ก่อน'; return; }
  if(!editCategory){ err.textContent = 'เลือกหมวดก่อน'; return; }
  e.date = dateVal;
  e.amount = amount;
  e.category = editCategory;
  e.note = document.getElementById('editNote').value.trim();
  if(editTripId){
    e.tripId = editTripId; e.currency = editCur; e.rate = editRate; e.splitCount = editSplit;
    e.originalAmount = parseFloat(document.getElementById('editOrig').value);
    e.amountOverridden = editOverridden;
  }else{
    ['tripId','currency','originalAmount','splitCount','rate','amountOverridden'].forEach(k => delete e[k]);
  }
  if(editPayment && findPay(editPayment)) e.paymentMethod = editPayment; else delete e.paymentMethod;
  e.updatedAt = nowISO();
  await saveData();
  const d = parseISODate(dateVal);
  currentMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  closeEdit();
  render();
  if(dateVal.slice(0,7) !== monthKey(new Date())) flashToast(`จดแล้ว วันที่ ${fmtToastDate(dateVal)}`, true);
}
function askDeleteEditing(){
  if(editingId) askDeleteEntry(editingId, closeEdit);
}

document.addEventListener('keydown', ev=>{
  if(ev.key === 'Tab' && document.getElementById('infoModalOverlay').style.display !== 'none'){
    ev.preventDefault();
    document.getElementById('infoOkBtn').focus();   // the only control in the dialog
    return;
  }
  if(ev.key !== 'Escape') return;
  if(document.getElementById('infoModalOverlay').style.display !== 'none') closeInfo();
  else if(document.getElementById('confirmModalOverlay').style.display !== 'none') closeConfirm();
  else if(document.getElementById('tripModalOverlay').style.display !== 'none') closeTripModal();
  else if(document.getElementById('tripSheetOverlay').style.display !== 'none') closeTripSheet();
  else if(document.getElementById('editModalOverlay').style.display !== 'none') closeEdit();
  else if(tripPageId) tripPageBack();
});

function shiftMonth(delta){
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth()+delta, 1);
  render();
}

// THE choke point for monthly maths: entriesForMonth() is the owner's normal spending and never includes trip entries.
function allEntriesForMonth(d){
  const key = monthKey(d);
  return state.entries.filter(e => e.date.slice(0,7) === key);
}
function entriesForMonth(d){ return allEntriesForMonth(d).filter(e => !e.tripId); }
function tripEntriesForMonth(d){ return allEntriesForMonth(d).filter(e => e.tripId); }

// Income, fixed items, normal spending and trip money for one month. A trip funded from income comes off คงเหลือ.
function monthFigures(d){
  const eff = getEffectiveSettings(monthKey(d));
  const entries = entriesForMonth(d), tripEntries = tripEntriesForMonth(d);
  const income = eff.income || 0;
  const fixed = eff.fixedItems.reduce((s,i)=> s + (i.amount||0), 0);
  const variable = entries.reduce((s,e)=> s + e.amount, 0);
  const tripTotal = tripEntries.reduce((s,e)=> s + e.amount, 0);
  const tripFromIncome = tripEntries.filter(e => tripFundingOf(e) === 'income').reduce((s,e)=> s + e.amount, 0);
  return { eff, entries, tripEntries, income, fixed, variable, tripTotal, tripFromIncome, remaining: income - fixed - variable - tripFromIncome };
}

function fixedTotal(mKey){
  return getEffectiveSettings(mKey).fixedItems.reduce((s,i)=> s + (i.amount||0), 0);
}

/* ---------- Render ---------- */
function render(){
  renderToday();
  renderMonthViews();
}

// วันนี้ is always the current calendar month and never reads currentMonth.
function renderToday(){
  const now = new Date();
  const mKeyStr = monthKey(now);
  const fig = monthFigures(now);
  const monthEntries = sortEntries(fig.entries);
  const { income, remaining, variable } = fig;
  const trip = activeTrip();

  document.body.classList.toggle('travel', !!trip);
  renderHeader(now);
  renderTripBanner(trip);
  renderRepeat(!!trip);
  if(trip) renderTripHero(trip, normalDailyAllowance(fig, now)); else renderHero(income, remaining, variable, monthEntries);
  renderDueCard(!!trip);
  renderBudgetAlert(getEffectiveBudgets(mKeyStr), monthEntries, !!trip);
  // Until income is set the hero CTA is the only primary button (normal mode only).
  const secondary = !trip && !(income > 0);
  document.getElementById('addEntryBtn').classList.toggle('secondary', secondary);
  document.getElementById('kbSaveBtn').classList.toggle('secondary', secondary);

  const RECENT = 5;
  const list = trip ? sortEntries(tripEntriesOf(trip.id)) : monthEntries;
  renderEntryList(document.getElementById('recentList'), list, RECENT, false, true);
  document.getElementById('recentTitle').textContent = trip ? 'รายการทริปล่าสุด' : 'รายการล่าสุด';
  document.getElementById('recentEmptyTxt').textContent = trip ? 'ยังไม่มีรายการในทริปนี้' : 'ยังไม่มีรายการเดือนนี้';
  document.getElementById('recentEmpty').style.display = list.length === 0 ? 'block' : 'none';
  document.getElementById('recentAllBtn').style.display = list.length ? '' : 'none';
  document.getElementById('recentCount').textContent = list.length ? (trip ? `ทริป ${list.length} รายการ` : `เดือนนี้ ${list.length} รายการ`) : '';
}

