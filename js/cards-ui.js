/* ---------- Credit-card bills: screens (logic lives in cards.js) ---------- */
const CARD_TYPE_OPTIONS = [{ v:'', label:'ทั่วไป' }, { v:'repay', label:'บัตร (โอนคืน)' }, { v:'statement', label:'บัตร (มีรอบบิล)' }];
const cardHistOpen = new Set();   // methods whose history disclosure is open (survives re-renders)

// "บัตร KBANK"-style names would read "บัตร บัตรเครดิต KBANK" with a plain prefix.
function cardRowLabel(name){ return /^บัตร/.test(name) ? name : 'บัตร ' + name; }
function dueWhenText(off){
  if(off < 0) return `เลยกำหนด ${-off} วัน`;
  return off === 0 ? 'วันนี้' : off === 1 ? 'พรุ่งนี้' : `อีก ${off} วัน`;
}

/* ---------- Settings: card type and billing days (inside each ช่องทางจ่าย row) ---------- */
function buildCardSettings(m, block){
  const nm = escapeHtml(m.name);
  const labId = 'pay-type-lab-' + m.id;
  const wrap = document.createElement('div');
  wrap.className = 'pay-card';
  wrap.innerHTML = `<div class="pay-type-lab" id="${escapeHtml(labId)}">ประเภท</div>
    <div class="opt-seg pay-type" role="radiogroup" aria-labelledby="${escapeHtml(labId)}"></div>`;
  const seg = wrap.querySelector('.pay-type');
  CARD_TYPE_OPTIONS.forEach((o, i)=>{
    const on = (m.cardType || '') === o.v;
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
    b.dataset.type = o.v;
    b.textContent = o.label;
    b.addEventListener('click', ()=> setCardType(m.id, o.v));
    b.addEventListener('keydown', ev=>{
      const step = (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') ? 1 : (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') ? -1 : 0;
      if(step){ ev.preventDefault(); setCardType(m.id, CARD_TYPE_OPTIONS[(i + step + CARD_TYPE_OPTIONS.length) % CARD_TYPE_OPTIONS.length].v, true); }
    });
    seg.appendChild(b);
  });
  if(m.cardType === 'statement'){
    const days = document.createElement('div');
    days.className = 'pay-days';
    const field = (key, label, cls) => `<div><label for="pay-${key}-${escapeHtml(m.id)}">${label}</label><input type="number" class="${cls}" id="pay-${key}-${escapeHtml(m.id)}" inputmode="numeric" min="1" max="31" step="1" value="${m[key] || ''}" aria-describedby="pay-days-err-${escapeHtml(m.id)}"></div>`;
    days.innerHTML = field('statementDay', 'ตัดรอบวันที่', 'pay-stmt-day') + field('dueDay', 'จ่ายภายในวันที่', 'pay-due-day') +
      `<div class="field-error pay-days-err" id="pay-days-err-${escapeHtml(m.id)}" role="alert"></div>`;
    days.querySelectorAll('input').forEach(inp => inp.addEventListener('change', ()=> setCardDay(m.id, inp.id.indexOf('statementDay') > -1 ? 'statementDay' : 'dueDay', inp, days.querySelector('.pay-days-err'))));
    wrap.appendChild(days);
  }
  block.appendChild(wrap);
}
async function setCardType(id, type, focus){
  const m = findPay(id); if(!m) return;
  if((m.cardType || '') !== type){
    m.cardType = type;
    m.updatedAt = nowISO();
    await afterPayChange();
  }
  if(focus){
    const b = document.querySelector(`.pay-block[data-id="${CSS.escape(id)}"] .pay-type [data-type="${type}"]`);
    if(b) b.focus();
  }
}
async function setCardDay(id, key, inp, errEl){
  const m = findPay(id); if(!m) return;
  const raw = inp.value.trim();
  errEl.textContent = '';
  inp.removeAttribute('aria-invalid');
  if(raw === ''){
    if(m[key] === undefined) return;
    delete m[key];
  }else{
    const n = Number(raw);
    if(!Number.isInteger(n) || n < 1 || n > 31){
      errEl.textContent = 'ใส่วันที่ 1 ถึง 31';
      inp.setAttribute('aria-invalid', 'true');
      return;
    }
    if(m[key] === n) return;
    m[key] = n;
  }
  m.updatedAt = nowISO();
  // No full re-render: it would rebuild the other day field while the owner is tapping into it.
  await saveData();
  renderToday();
  renderCardsCard();
}
// "ตั้งวันตัดรอบ" on ภาพรวม: jump to that card's setting.
function goToCardSettings(id){
  goTab('settings');
  const inp = document.querySelector(`.pay-block[data-id="${CSS.escape(id)}"] .pay-stmt-day`);
  if(inp){ inp.scrollIntoView({ block:'center' }); inp.focus(); }
}

/* ---------- วันนี้: due card rows ---------- */
function fillCardDueRow(li, r){
  li.className = 'card-due' + (r.off < 0 ? ' late' : '');
  const label = cardRowLabel(r.name);
  li.innerHTML = `<span class="due-name">${escapeHtml(label)}<span class="due-when ${r.off < 0 ? 'neg' : r.off <= 3 ? 'warn' : ''}">${dueWhenText(r.off)}</span></span><span class="due-amt">ประมาณ ${fmt(r.amount)}</span><button type="button" class="secondary due-pay" data-pay-btn="${escapeHtml(r.methodId)}" aria-label="จ่ายบิล ${escapeHtml(r.name)} แล้ว">จ่ายแล้ว</button>`;
  li.querySelector('.due-pay').addEventListener('click', ev => openCardPay(r.methodId, ev.currentTarget));
}

/* ---------- ภาพรวม: บัตรเครดิต card ---------- */
function renderCardsCard(){
  const card = document.getElementById('cardsCard');
  const body = document.getElementById('cardsBody');
  body.innerHTML = '';
  const isNow = monthKey(currentMonth) === monthKey(new Date());
  const today = todayISO();
  const rows = !isNow ? [] : state.paymentMethods.filter(isCardMethod).map(m => ({ m, s: cardStatusOf(m, today) })).filter(x => !x.m.archived || cardBalance(x.s) !== 0);
  card.style.display = rows.length ? '' : 'none';
  rows.forEach(({ m, s }) => body.appendChild(buildCardBlock(m, s)));
}
function buildCardBlock(m, s){
  const nm = escapeHtml(m.name);
  const div = document.createElement('div');
  div.className = 'cc';
  div.dataset.id = m.id;
  const repay = s.type === 'repay';
  let main = '', meta = '', btns = '';
  const payBtn = (label) => `<button type="button" data-pay-btn="${escapeHtml(m.id)}" aria-label="${label} ${nm}">${label}</button>`;
  if(repay){
    main = s.owed > 0 ? `<span class="cc-amt">ค้างโอนคืน ประมาณ ${fmt(s.owed)}</span>`
      : s.owed < 0 ? `<span class="cc-amt">โอนเกิน ${fmt(s.over)}</span>` : `<span class="cc-amt">โอนคืนครบแล้ว</span>`;
    if(s.lastPayment) meta = `โอนคืนล่าสุด ${fmtThaiDate(s.lastPayment.date)} ${fmtExact(s.lastPayment.amount)}`;
    btns = payBtn('โอนคืนแล้ว');
  }else if(!s.configured){
    main = `<span class="cc-amt">ใช้ไปแล้ว ประมาณ ${fmt(s.unpaid)}</span>`;
    btns = `<button type="button" class="secondary cc-setup" aria-label="ตั้งวันตัดรอบ ${nm}">ตั้งวันตัดรอบ</button>`;
    if(s.unpaid > 0) btns = payBtn('จ่ายแล้ว') + btns;
  }else{
    if(s.unpaid > 0){
      const flag = s.daysToDue < 0 ? `<span class="cc-flag neg">เลยกำหนด ${s.overdueDays} วัน</span>` : s.daysToDue <= 3 ? `<span class="cc-flag warn">${dueWhenText(s.daysToDue)}</span>` : '';
      main = `<span class="cc-amt">ต้องจ่าย ประมาณ ${fmt(s.unpaid)}</span><span class="cc-due">ภายใน ${fmtThaiDate(s.dueDate)}</span>${flag}`;
    }else{
      main = `<span class="cc-amt">ไม่มียอดค้าง</span>`;
    }
    meta = `รอบนี้ ${fmt(s.openSpend)} · ตัดรอบ ${fmtThaiDate(s.nextClose)}`;
    btns = (s.unpaid > 0 ? payBtn('จ่ายแล้ว') : '') + `<button type="button" class="secondary cc-ics" aria-label="เพิ่มในปฏิทิน ${nm}">เพิ่มในปฏิทิน</button>`;
  }
  const pays = cardPaymentsOf(m.id);
  const histTitle = repay ? 'ประวัติการโอนคืน' : 'ประวัติการจ่าย';
  div.innerHTML = `<div class="cc-name">${nm}</div><div class="cc-main">${main}</div>` +
    (meta ? `<div class="cc-meta">${escapeHtml(meta)}</div>` : '') +
    `<div class="cc-actions">${btns}</div>` +
    (pays.length ? `<details class="cc-hist"><summary>${histTitle}</summary><ul class="cc-pays"></ul></details>` : '');
  const pb = div.querySelector('[data-pay-btn]');
  if(pb) pb.addEventListener('click', ev => openCardPay(m.id, ev.currentTarget));
  const setup = div.querySelector('.cc-setup'); if(setup) setup.addEventListener('click', ()=> goToCardSettings(m.id));
  const ics = div.querySelector('.cc-ics'); if(ics) ics.addEventListener('click', ()=> downloadCardIcs(m));
  const det = div.querySelector('details');
  if(det){
    det.open = cardHistOpen.has(m.id);
    det.addEventListener('toggle', ()=>{ if(det.open) cardHistOpen.add(m.id); else cardHistOpen.delete(m.id); });
    const ul = det.querySelector('.cc-pays');
    pays.forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="cp-date">${fmtThaiDate(p.date)}</span><span class="cp-amt">${fmtExact(p.amount)}</span><button type="button" class="secondary del-fixed" aria-label="ลบ${repay ? 'การโอนคืน' : 'การจ่าย'} ${fmtExact(p.amount)} วันที่ ${fmtThaiDate(p.date)}">${ICON_X}</button>`;
      li.querySelector('button').addEventListener('click', ()=> askDeleteCardPayment(p.id, repay));
      ul.appendChild(li);
    });
  }
  return div;
}
function askDeleteCardPayment(id, repay){
  const p = state.cardPayments.find(x => x.id === id);
  if(!p) return;
  openConfirm({
    title: repay ? 'ลบการโอนคืนนี้ไหม?' : 'ลบการจ่ายนี้ไหม?',
    desc: `${fmtThaiDate(p.date)} ${fmtExact(p.amount)}`,
    confirmLabel: 'ลบ',
    onConfirm: async ()=>{
      state.cardPayments = state.cardPayments.filter(x => x.id !== id);
      await saveData();
      render();
    }
  });
}

/* ---------- Calendar reminder ---------- */
function downloadCardIcs(m){
  const text = buildCardIcs(m, todayISO(), new Date());
  const blob = new Blob([text], { type:'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bill-${String(m.id).replace(/[^A-Za-z0-9-]/g, '')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- Payment sheet (โอนคืน / จ่ายบิล) ---------- */
let cardPayMethodId = null, cardPayOpener = null;
function openCardPay(methodId, opener){
  const m = findPay(methodId);
  if(!m) return;
  cardPayMethodId = methodId;
  cardPayOpener = opener || document.activeElement;
  const s = cardStatusOf(m);
  const due = s.type === 'repay' ? s.owed : s.unpaid;
  document.getElementById('cardPayTitle').textContent = (s.type === 'repay' ? 'โอนคืน ' : 'จ่ายบิล ') + m.name;
  document.getElementById('cardPayAmount').value = due > 0 ? due : '';
  document.getElementById('cardPayDate').value = todayISO();
  document.getElementById('cardPayError').textContent = '';
  document.getElementById('cardPayAmount').removeAttribute('aria-invalid');
  document.getElementById('cardPayOverlay').style.display = 'flex';
  const a = document.getElementById('cardPayAmount');
  a.focus(); a.select();
}
function closeCardPay(){
  document.getElementById('cardPayOverlay').style.display = 'none';
  const id = cardPayMethodId, o = cardPayOpener;
  cardPayMethodId = null; cardPayOpener = null;
  // After a save the opener row may be gone: fall back to the same card's button, else leave focus alone.
  let target = o && document.body.contains(o) ? o : null;
  if(!target && id) target = document.querySelector(`[data-pay-btn="${CSS.escape(id)}"]`);
  if(target && target.focus) target.focus();
}
async function saveCardPay(){
  const m = findPay(cardPayMethodId);
  if(!m){ closeCardPay(); return; }
  const amtEl = document.getElementById('cardPayAmount'), err = document.getElementById('cardPayError');
  const amt = round2(parseFloat(amtEl.value));
  const date = document.getElementById('cardPayDate').value;
  amtEl.removeAttribute('aria-invalid');
  if(!(amt > 0)){ err.textContent = 'ใส่จำนวนเงินมากกว่า 0'; amtEl.setAttribute('aria-invalid', 'true'); amtEl.focus(); return; }
  if(!ISO_DATE_RE.test(date)){ err.textContent = 'เลือกวันที่ก่อน'; document.getElementById('cardPayDate').focus(); return; }
  state.cardPayments.push({ id: 'cp-' + genId(), methodId: m.id, date, amount: amt, updatedAt: nowISO() });
  await saveData();
  closeCardPay();
  render();
  flashToast(`บันทึกแล้ว ${fmtExact(amt)}`, true);
}
// Keep Tab inside the sheet while it is open.
document.addEventListener('keydown', ev=>{
  if(ev.key !== 'Tab') return;
  const ov = document.getElementById('cardPayOverlay');
  if(!ov || ov.style.display === 'none') return;
  const f = [...ov.querySelectorAll('input, button')].filter(x => !x.disabled);
  if(!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if(!ov.contains(document.activeElement)){ ev.preventDefault(); first.focus(); }
  else if(ev.shiftKey && document.activeElement === first){ ev.preventDefault(); last.focus(); }
  else if(!ev.shiftKey && document.activeElement === last){ ev.preventDefault(); first.focus(); }
});
