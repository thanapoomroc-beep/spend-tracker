/* ---------- Entries ---------- */
function clearAmountError(){
  document.getElementById('amountError').textContent = '';
  document.getElementById('entryAmount').removeAttribute('aria-invalid');
}

// Amount as typed (up to 2 decimals) for toasts and the keyboard bar.
function fmtExact(n){
  return '฿' + Number(n).toLocaleString('en-US', { maximumFractionDigits:2 });
}

/* ---------- Entry form: trip or normal ---------- */
// '' = the normal form. In travel mode the ทริป/ปกติ toggle decides; otherwise a pre-trip booking can be linked from the details row.
function formTripId(){
  const t = activeTrip();
  if(t) return entryKind === 'trip' ? t.id : '';
  return entryLink && findTrip(entryLink) ? entryLink : '';
}
function formMode(){ return formTripId() ? 'trip' : 'normal'; }
function formTrip(){ return findTrip(formTripId()) || null; }
function formCategory(){ return formMode() === 'trip' ? selectedTripCategory : selectedCategory; }
function formCurrency(){ const t = formTrip(); return !t ? 'THB' : (entryBaht ? 'THB' : t.currency); }
function formRate(){ const t = formTrip(); return !t || formCurrency() === 'THB' ? 1 : t.thbPerUnit; }
// total = the whole bill in baht, share = the owner's part (what is stored as entry.amount)
function formAmounts(){
  const orig = parseFloat(document.getElementById('entryAmount').value) || 0;
  const rate = formRate();
  return { orig, total: round2(orig * rate), share: round2(orig * rate / entrySplit) };
}

function renderForm(){
  const t = activeTrip();
  if(entryLink && !findTrip(entryLink)) entryLink = '';
  const tid = formTripId();
  const sig = (t ? t.id : '-') + '|' + (t ? entryKind : '-') + '|' + (t ? '' : entryLink);
  if(sig !== formSig){
    formSig = sig;
    entryBaht = !t && !!tid;       // a linked pre-trip booking starts in baht; travel mode starts in the trip currency
    entrySplit = 1;
    loadLastPayment(tid ? 'trip' : 'normal');
  }
  // ทริป / ปกติ
  const kind = document.getElementById('kindSeg');
  kind.hidden = !t;
  kind.querySelectorAll('button').forEach(b=>{
    const on = b.dataset.kind === entryKind;
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  });
  // 元 | ฿ (the trip currency symbol, then baht)
  const seg = document.getElementById('curSeg');
  const trip = formTrip();
  const showCur = !!trip && trip.currency !== 'THB';
  seg.hidden = !showCur;
  seg.innerHTML = '';
  if(showCur){
    const opts = [{ code:trip.currency, label:curInfo(trip.currency).sym }, { code:'THB', label:'฿' }];
    if(!t) opts.reverse();
    opts.forEach(o=>{
      const on = (o.code === 'THB') === entryBaht;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'secondary';
      b.setAttribute('role','radio'); b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.setAttribute('aria-label', o.code === 'THB' ? 'บาท' : o.code + ' ' + curInfo(o.code).name);
      b.tabIndex = on ? 0 : -1;
      b.textContent = o.label;
      b.addEventListener('click', ()=> setEntryBaht(o.code === 'THB'));
      b.addEventListener('keydown', ev=>{ if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)){ ev.preventDefault(); setEntryBaht(!entryBaht, true); } });
      seg.appendChild(b);
    });
  }
  document.getElementById('convRow').hidden = !tid;
  document.getElementById('splitN').value = entrySplit;
  document.getElementById('entryNote').placeholder = tid ? 'เช่น ข้าวเย็นที่ซานลี่ถุน' : 'เช่น ข้าวเที่ยง';
  updateConv();
  // ผูกกับทริป: normal mode only, while some trip is still ahead or running
  const sel = document.getElementById('entryLink');
  const list = linkableTrips();
  if(entryLink && !list.some(x => x.id === entryLink)){ const cur = findTrip(entryLink); if(cur) list.push(cur); }
  document.getElementById('linkWrap').hidden = !!t || !list.length;
  sel.innerHTML = '<option value="">ไม่ผูก</option>' + list.map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}</option>`).join('');
  sel.value = entryLink;
  renderChips();
  ensureSelectedPayment();
  renderPayControl();
  updateDateSummary();
}
function setEntryBaht(v, focus){
  entryBaht = !!v;
  renderForm();
  if(focus){ const on = document.querySelector('#curSeg [aria-checked="true"]'); if(on) on.focus(); }
}
function setKind(k, focus){
  entryKind = k === 'normal' ? 'normal' : 'trip';
  renderForm();
  if(focus){ const on = document.querySelector('#kindSeg [aria-checked="true"]'); if(on) on.focus(); }
}
function setSplit(n){
  n = parseInt(n, 10);
  entrySplit = n >= 1 ? Math.min(n, 50) : 1;
  document.getElementById('splitN').value = entrySplit;
  updateConv();
  updateKbBarLabel();
}
function updateConv(){
  const line = document.getElementById('convLine');
  if(!formTripId()){ line.textContent = ''; return; }
  const { total, share } = formAmounts();
  const baht = formCurrency() === 'THB';
  const mark = baht ? '' : '≈ ';
  // two unbreakable chunks, so a narrow screen wraps between them and never inside a phrase
  if(entrySplit > 1) line.innerHTML = `<span style="white-space:nowrap">ทั้งบิล ${mark}${fmt(total)}</span> <span style="white-space:nowrap">ส่วนของคุณ ${mark}${fmt(share)}</span>`;
  else line.textContent = baht ? '' : `≈ ${fmt(share)}`;
}

let saving = false;
async function addEntry(){
  if(saving) return;
  const dateVal = document.getElementById('entryDate').value;
  const amountEl = document.getElementById('entryAmount');
  const amount = parseFloat(amountEl.value);
  const note = document.getElementById('entryNote').value.trim();
  const err = document.getElementById('amountError');
  if(!amount || amount <= 0){
    err.textContent = 'ใส่จำนวนเงินก่อน';
    amountEl.setAttribute('aria-invalid','true');
    amountEl.focus();
    return;
  }
  if(!dateVal){
    err.textContent = 'เลือกวันที่ก่อน';
    document.getElementById('moreDetails').open = true;
    return;
  }
  ensureSelectedPayment();
  const tid = formTripId();
  if(tid){
    const { share } = formAmounts();
    if(!(share > 0)){
      err.textContent = 'จำนวนเงินน้อยเกินไป';
      amountEl.setAttribute('aria-invalid','true');
      amountEl.focus();
      return;
    }
    await saveNewEntry({ date: dateVal, amount: share, category: selectedTripCategory, note, paymentMethod: selectedPayment,
      trip: { tripId: tid, currency: formCurrency(), originalAmount: amount, splitCount: entrySplit, rate: formRate() } }, true);
    return;
  }
  ensureSelectedCategory();
  await saveNewEntry({ date: dateVal, amount, category: selectedCategory, note, paymentMethod: selectedPayment }, true);
}

// Did this entry push its category past 80% / 100% of that month's budget? (Trip entries never count against budgets.)
function budgetCrossing(entry){
  if(entry.tripId) return null;
  const mk = entry.date.slice(0,7);
  const budget = getEffectiveBudgets(mk)[entry.category];
  if(!(budget > 0)) return null;
  const before = state.entries.filter(e => !e.tripId && e.date.slice(0,7) === mk && e.category === entry.category).reduce((s,e)=> s + e.amount, 0);
  const after = before + entry.amount;
  if(before <= budget && after > budget) return { type:'over', over: after - budget };
  if(before / budget < 0.8 && after / budget >= 0.8 && after <= budget) return { type:'near' };
  return null;
}

// Shared save path for the form and the quick-repeat chips. `f.trip` (optional) holds the trip fields.
async function saveNewEntry(f, fromForm){
  if(saving) return null;
  saving = true;
  const btn = document.getElementById('addEntryBtn');
  btn.disabled = true;
  const amountEl = document.getElementById('entryAmount');
  const entry = { id: genId(), date: f.date, amount: f.amount, category: f.category, note: f.note, updatedAt: nowISO() };
  if(f.paymentMethod) entry.paymentMethod = f.paymentMethod;
  if(f.trip) Object.assign(entry, f.trip, { amountOverridden:false });
  const before = { label: heroShown.label, num: heroShown.num };
  const cross = budgetCrossing(entry);
  state.entries.push(entry);
  await saveData();
  btn.disabled = false;
  saving = false;
  if(fromForm){
    amountEl.value = '';
    document.getElementById('entryNote').value = '';
    document.getElementById('amountError').textContent = '';
    amountEl.removeAttribute('aria-invalid');
    // After every save the toggle goes back to ทริป, and a booking link or split never carries over.
    entryKind = 'trip'; entryLink = ''; entrySplit = 1;
  }
  const d = parseISODate(f.date);
  currentMonth = new Date(d.getFullYear(), d.getMonth(), 1);   // รายการ shows the month the entry went to
  const ae = document.activeElement;
  if(ae && ae.blur && ae.closest && ae.closest('#panel-today .card')) ae.blur();
  document.getElementById('moreDetails').open = false;
  if(fromForm) renderForm(); else updateDateSummary();
  render();
  updateKbBarLabel();
  const undo = { label:'เลิกทำ', onClick: ()=> undoEntry(entry) };
  const at = activeTrip();
  if(entry.tripId){
    let msg = `จดแล้ว ${fmtCur(entry.originalAmount, entry.currency)}`;
    if(entry.currency !== 'THB' || entry.splitCount > 1) msg += ` ≈ ${fmt(entry.amount)}`;
    if(at && at.id === entry.tripId) heroFeedback(entry.amount, msg, undo, before);
    else flashToast(msg, true, undo);
  }else if(f.date.slice(0,7) === monthKey(new Date())){
    let msg = `จดแล้ว ${fmtExact(f.amount)}`;
    if(cross && cross.type === 'over') msg += ` ${f.category}เกินงบ ${fmt(cross.over)}`;
    else if(cross && cross.type === 'near') msg += ` ${f.category}ใกล้ครบงบ`;
    if(at) flashToast(msg, true, undo);   // the trip hero does not move for a normal entry
    else heroFeedback(f.amount, msg, undo, before);
  }else{
    flashToast(`จดแล้ว วันที่ ${fmtToastDate(f.date)}`, true, undo);
  }
  return entry;
}

async function undoEntry(entry){
  state.entries = state.entries.filter(x => x.id !== entry.id);
  await saveData();
  render();
  flashToast('เลิกทำแล้ว', true);
}

// After logging: hero number counts to its new value, the delta shows, a one-line toast confirms.
function heroFeedback(amount, msg, undo, before){
  const hero = document.getElementById('heroCard');
  const value = document.getElementById('heroValue');
  flashToast(msg, true, undo);
  if(value.style.display === 'none') return;
  const delta = document.getElementById('heroDelta');
  delta.textContent = (heroShown.dir === 'up' ? '+' : '−') + fmt(amount);
  delta.classList.remove('show', 'under'); value.classList.remove('pulse');
  // Put the delta under the number when it would not fit beside it inside the card.
  const wr = document.getElementById('heroValueWrap').getBoundingClientRect();
  const hr = hero.getBoundingClientRect();
  if(wr.right + 8 + delta.offsetWidth > hr.right - 12) delta.classList.add('under');
  void value.offsetWidth;
  delta.classList.add('show'); value.classList.add('pulse');
  if(before && before.label === heroShown.label && typeof before.num === 'number') animateHeroNumber(value, before.num, heroShown.num);
  goTab('today', { keepScroll:true });
  const r = hero.getBoundingClientRect();
  const bottomLimit = window.innerHeight - 56;   // tab bar
  if(r.top < 0 || r.bottom > bottomLimit) hero.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block:'start' });
}

let heroAnimRaf = 0;
function animateHeroNumber(el, from, to){
  cancelAnimationFrame(heroAnimRaf);
  if(reducedMotion() || from === to) return;
  const t0 = performance.now();
  el.textContent = fmt(from);
  const step = t=>{
    const p = Math.min((t - t0) / 400, 1);
    el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if(p < 1) heroAnimRaf = requestAnimationFrame(step); else el.textContent = fmt(to);
  };
  heroAnimRaf = requestAnimationFrame(step);
}

function describeEntry(e){
  let s = `${e.category} ${fmt(e.amount)} วันที่ ${fmtThaiDate(e.date)}`;
  if(e.note) s += ` ${e.note}`;
  const pm = payName(e.paymentMethod);
  if(pm) s += ` จ่ายด้วย ${pm}`;
  return s;
}

function askDeleteEntry(id, afterDelete){
  const e = state.entries.find(x => x.id === id);
  if(!e) return;
  openConfirm({
    title: 'ลบรายการนี้ไหม?',
    desc: describeEntry(e),
    confirmLabel: 'ลบ',
    onConfirm: async ()=>{
      state.entries = state.entries.filter(x => x.id !== id);
      await saveData();
      if(afterDelete) afterDelete();
      render();
    }
  });
}

