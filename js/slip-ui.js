/* Slip inbox UI (v3b, 2.10.0): the สลิปรอตรวจ card on วันนี้, the settings section สลิปอัตโนมัติ and the remembered-receivers sheet.
   Maths lives in slip-core.js, the pull in slip-net.js. Uses the wealth-ui.js helpers ($w, sheets, wRadioHtml) and briefing-ui.js bpSwitchHtml. */
let slBusy = false;
const SL_SOURCE = { kplus: 'K PLUS', ttb: 'ttb touch' };

/* ---------- Helpers ---------- */
function slWaiting(){ return sortEntries(state.entries.filter(e => e.needsReview === true)); }
function slRepayCards(){ return state.paymentMethods.filter(m => !m.archived && m.cardType === 'repay'); }
function slActiveCats(){ return state.categories.filter(c => !c.archived); }
function slTimeOf(iso){
  const d = new Date(iso);
  return isFinite(d.getTime()) ? pad2(d.getHours()) + ':' + pad2(d.getMinutes()) : '';
}
function slWhen(iso){
  const d = new Date(iso);
  if(!isFinite(d.getTime())) return '';
  const day = isoOf(d);
  return (day === todayISO() ? '' : fmtThaiDate(day) + ' ') + slTimeOf(iso);
}
function slRuleLabel(r){
  if(r.action === 'ignore') return 'ไม่ใช่รายจ่าย';
  if(r.action === 'repay'){ const c = findPay(r.methodId); return 'โอนคืนบัตร' + (c ? ' ' + c.name : ''); }
  return r.category || '';
}

/* ---------- วันนี้ card ---------- */
function slipRowHtml(e){
  const src = SL_SOURCE[e.slipSource] || 'K PLUS';
  const meta = fmtThaiDate(e.date) + (e.slipTime ? ' ' + e.slipTime : '') + ' · ' + src;
  const name = e.note ? escapeHtml(e.note) : '<span class="slip-none">ไม่มีชื่อผู้รับ</span>';
  const cat = escapeHtml(e.category) + (e.aiGuess ? ' (AI เดา)' : '');
  const cards = slRepayCards();
  return `<li class="slip-item" data-id="${escapeHtml(e.id)}"><div class="entry-row" data-id="${escapeHtml(e.id)}"><button type="button" class="entry-main" aria-label="แก้ไขสลิป ${escapeHtml(e.note || 'ไม่มีชื่อผู้รับ')} ${fmt(e.amount)}"><span class="dot" style="background:${entryColor(e)}" aria-hidden="true"></span><span class="entry-text"><span class="entry-cat">${name}</span><span class="entry-note">${escapeHtml(meta)}</span></span><span class="entry-amt">${fmt(e.amount)}<span class="tiny-tag">${cat}</span></span></button></div>` +
    `<div class="slip-acts"><button type="button" data-act="sl-ok" data-id="${escapeHtml(e.id)}">ถูกแล้ว</button><button type="button" class="secondary" data-act="sl-not" data-id="${escapeHtml(e.id)}">ไม่ใช่รายจ่าย</button>${cards.length ? `<button type="button" class="secondary" data-act="sl-repay" data-id="${escapeHtml(e.id)}">โอนคืนบัตร</button>` : ''}</div></li>`;
}
function slipUnreadHtml(u){
  const t = slTimeOf(u.photoAt) || slTimeOf(u.at);
  return `<li class="slip-item slip-unread" data-key="${escapeHtml(u.key)}"><div class="slip-unread-t">อ่านสลิปไม่ออก (${escapeHtml(SL_SOURCE[u.source] || 'K PLUS')}${t ? ' ' + t : ''})</div><div class="slip-acts"><button type="button" class="secondary" data-act="sl-manual" data-key="${escapeHtml(u.key)}">จดเอง</button><button type="button" class="secondary" data-act="sl-dismiss" data-key="${escapeHtml(u.key)}">ปิด</button></div></li>`;
}
function renderSlipCard(){
  const card = document.getElementById('slipCard');
  if(!card) return;
  const waiting = slWaiting();
  const unread = (state.slipSettings && state.slipSettings.unreadable) || [];
  if(!waiting.length && !unread.length){ card.style.display = 'none'; card.innerHTML = ''; return; }
  const n = waiting.length + unread.length;
  card.style.display = '';
  card.innerHTML = `<div class="slip-head"><h2 id="slipTitle" tabindex="-1">สลิปรอตรวจ ${n} รายการ</h2>${waiting.length >= 2 ? '<button type="button" class="linkbtn slip-all" data-act="sl-all">ถูกทั้งหมด</button>' : ''}</div><ul class="slip-list" id="slipList">${waiting.map(slipRowHtml).join('')}${unread.map(slipUnreadHtml).join('')}</ul>`;
}
// Where focus goes after a row is gone: the row now at the same place, else the card title, else the amount field.
function slAfterChange(idx){
  const rows = [...document.querySelectorAll('#slipList .slip-item')];
  const t = rows[Math.min(idx, rows.length - 1)];
  const f = t ? (t.querySelector('.entry-main') || t.querySelector('button')) : document.getElementById('slipTitle');
  const card = document.getElementById('slipCard');
  if(f && card && card.style.display !== 'none') f.focus();
  else { const a = document.getElementById('entryAmount'); if(a) a.focus({ preventScroll: true }); }
}
function slRowIndex(sel){
  return [...document.querySelectorAll('#slipList .slip-item')].findIndex(r => r.matches(sel));
}
function slipFocusCard(){
  goTab('today');
  const t = document.getElementById('slipTitle');
  if(t){ t.scrollIntoView({ block: 'start' }); t.focus({ preventScroll: true }); }
}

async function slOk(id){
  const idx = slRowIndex(`[data-id="${CSS.escape(id)}"]`);
  if(!settleSlipEntry(state, id)) return;
  await saveData(); render(); slAfterChange(idx);
}
async function slOkAll(){
  const ids = slWaiting().map(e => e.id);
  ids.forEach(id => settleSlipEntry(state, id));
  await saveData(); render(); slAfterChange(0);
  flashToast(`ตรวจแล้ว ${ids.length} รายการ`, true);
}
function slNot(id){
  const e = state.entries.find(x => x.id === id);
  if(!e) return;
  const idx = slRowIndex(`[data-id="${CSS.escape(id)}"]`);
  openConfirm({
    title: 'ลบรายการนี้ไหม?', desc: describeEntry(e), confirmLabel: 'ลบ',
    onConfirm: async () => { dismissSlipEntry(state, id); await saveData(); render(); slAfterChange(idx); }
  });
}
function slRepay(id){
  const e = state.entries.find(x => x.id === id);
  const cards = slRepayCards();
  if(!e || !cards.length) return;
  if(cards.length === 1) return slRepayConfirm(id, cards[0].id);
  // Several repay cards: pick one first.
  const opener = document.querySelector(`#slipList [data-act="sl-repay"][data-id="${CSS.escape(id)}"]`);
  openWSheet(wSheetHead('โอนคืนบัตรใบไหน?') + '<div class="w-list">' + cards.map(c =>
    `<button type="button" class="w-row" data-card="${escapeHtml(c.id)}"><span class="w-main"><span class="w-name">${escapeHtml(c.name)}</span></span>${ICON_CHEV}</button>`).join('') +
    '</div><div class="modal-actions" style="margin-top:12px;"><button type="button" class="secondary" id="ws-cancel">ยกเลิก</button></div>', { restore: opener, focus: '.w-row' });
  wBind('ws-cancel', 'click', closeWSheet);
  document.querySelectorAll('#wSheetCard .w-row').forEach(b => b.addEventListener('click', () => { closeWSheet(); slRepayConfirm(id, b.dataset.card); }));
}
function slRepayConfirm(id, methodId){
  const e = state.entries.find(x => x.id === id), c = findPay(methodId);
  if(!e || !c) return;
  const idx = slRowIndex(`[data-id="${CSS.escape(id)}"]`);
  openConfirm({
    title: 'บันทึกเป็นโอนคืนบัตรไหม?', desc: `${fmt(e.amount)} ให้ ${c.name}`, confirmLabel: 'บันทึก',
    onConfirm: async () => {
      if(!repaySlipEntry(state, id, methodId)) return;
      await saveData(); render(); slAfterChange(idx);
      flashToast('บันทึกโอนคืนบัตรแล้ว', true);
    }
  });
}
function slManual(key){
  const u = state.slipSettings.unreadable.find(x => x.key === key);
  goTab('today');
  const d = u && new Date(u.photoAt || u.at);
  if(d && isFinite(d.getTime())){
    document.getElementById('entryDate').value = isoOf(d);
    updateDateSummary();
  }
  const a = document.getElementById('entryAmount');
  a.scrollIntoView({ block: 'center' });
  a.focus();
}
async function slDismissUnread(key){
  const idx = slRowIndex(`[data-key="${CSS.escape(key)}"]`);
  state.slipSettings.unreadable = state.slipSettings.unreadable.filter(x => x.key !== key);
  await saveData(); render(); slAfterChange(idx);
}
function slCardClick(ev){
  const b = ev.target.closest('button');
  if(!b) return;
  if(b.classList.contains('entry-main')){
    const row = b.closest('.entry-row');
    if(row) openEdit(row.dataset.id, 'slipList');
    return;
  }
  const act = b.dataset.act, id = b.dataset.id, key = b.dataset.key;
  if(act === 'sl-ok') slOk(id);
  else if(act === 'sl-all') slOkAll();
  else if(act === 'sl-not') slNot(id);
  else if(act === 'sl-repay') slRepay(id);
  else if(act === 'sl-manual') slManual(key);
  else if(act === 'sl-dismiss') slDismissUnread(key);
}

/* ---------- Settings: สลิปอัตโนมัติ ---------- */
function slStatusHtml(st, on){
  if(!on && !st.lastPullAt && !st.lastError) return '<div class="cb-status">ยังไม่ได้เปิด</div>';
  const parts = [];
  if(st.lastPullAt) parts.push('ดึงล่าสุด ' + escapeHtml(slWhen(st.lastPullAt)));
  const sk = st.lastSkipped || {};
  const small = [];
  if(typeof st.lastAdded === 'number' && st.lastPullAt) small.push('เพิ่ม ' + st.lastAdded);
  if(sk.duplicate) small.push('ซ้ำ ' + sk.duplicate);
  if(sk.own) small.push('บัญชีตัวเอง ' + sk.own);
  if(sk.ignore) small.push('ไม่ใช่รายจ่าย ' + sk.ignore);
  if(st.lastError) return `<div class="cb-status warn">${escapeHtml(st.lastError)}</div>` + (parts.length ? `<div class="cb-sub">${parts.join('')}${small.length ? ' · ' + small.join(' · ') : ''}</div>` : '');
  if(!parts.length) return '<div class="cb-status">ยังไม่เคยดึง</div>';
  return `<div class="cb-status">${parts.join('')}</div>` + (small.length ? `<div class="cb-sub">${small.join(' · ')}</div>` : '');
}
function renderSlipSettings(){
  const el = $w('slipSettingsBody');
  if(!el) return;
  const ss = state.slipSettings, on = slipIsOn(), priced = !!loadPriceConfig(), st = slipLoadStatus();
  const rn = Object.keys(ss.receivers).length;
  const swOn = (labId, label, isOn, act, disabled) => bpSwitchHtml(labId, label, isOn, act, isOn ? 'เปิด' : 'ปิด').replace('<button ', disabled ? '<button disabled ' : '<button ');
  let h = '<div class="set-note">ดึงสลิปที่ Shortcut ส่งมา ให้เป็นรายการรอตรวจ ส่งแค่ข้อความในสลิป ไม่ส่งรูป</div>';
  h += swOn('slSwLab1', 'ดึงสลิปเข้าแอป', on, 'sl-toggle', !priced && !on);
  if(!priced && !on) h += '<div class="field-hint">ตั้งค่าราคาอัตโนมัติก่อน</div><button type="button" class="secondary" data-act="sl-price">ไปตั้งค่าราคาอัตโนมัติ</button>';
  h += `<div role="status" aria-live="polite" class="bp-status">${slStatusHtml(st, on)}</div>`;
  h += `<button type="button" data-act="sl-now"${on && priced && !slBusy ? '' : ' disabled'}>${slBusy ? 'กำลังดึง...' : 'ดึงตอนนี้'}</button>`;
  h += '<div style="height:10px"></div>' + swOn('slSwLab2', 'ให้ AI เดาหมวดผู้รับใหม่', ss.aiGuess !== false, 'sl-ai', false);
  h += `<div class="field-hint">ส่งชื่อผู้รับกับยอดเงินของผู้รับใหม่ไปให้ AI</div>`;
  if(st.aiUnavailable && ss.aiGuess !== false) h += '<div class="cb-status warn" role="status">AI ยังไม่พร้อมที่เซิร์ฟเวอร์</div>';
  h += `<div class="row2" style="margin-top:6px;"><button type="button" class="secondary" data-act="sl-rcv">ผู้รับที่จำไว้ ${rn}</button><a class="linkbtn sl-doc" href="docs/SHORTCUT_SETUP.md" target="_blank" rel="noopener">วิธีตั้ง Shortcut</a></div>`;
  el.innerHTML = h;
}
function slipUiRefresh(){
  const el = $w('slipSettingsBody');
  if(!el) return;
  const hadFocus = el.contains(document.activeElement) ? (document.activeElement.dataset || {}).act : '';
  renderSlipSettings();
  if(hadFocus){ const b = el.querySelector(`[data-act="${hadFocus}"]`); if(b && !b.disabled) b.focus(); }
}
async function slPullNow(){
  if(slBusy) return;
  slBusy = true; renderSlipSettings();
  const r = await slipPull({ manual: true });
  slBusy = false; slipUiRefresh();
  if(!r.ok) flashToast('ดึงไม่ได้ ' + (r.reason === 'noconfig' || r.reason === 'off' ? 'ตรวจการตั้งค่าก่อน' : slipReasonText(r.reason)), false);
  else if(!r.added && !r.repaid) flashToast('ไม่มีสลิปใหม่', true);
  const b = document.querySelector('#slipSettingsBody [data-act="sl-now"]');
  if(b && !b.disabled && document.activeElement === document.body) b.focus();
}
async function slSetEnabled(on){
  state.slipSettings.enabled = on;
  if(typeof state.slipSettings.aiGuess !== 'boolean') state.slipSettings.aiGuess = true;
  await saveData();
  renderSlipSettings();
  if(on) slPullNow();
}
async function slSetAi(on){
  state.slipSettings.aiGuess = on;
  await saveData();
  renderSlipSettings();
  const b = document.querySelector('#slipSettingsBody [data-act="sl-ai"]'); if(b) b.focus();
}

/* ---------- Remembered receivers sheet ---------- */
function slReceiverRows(){
  const r = state.slipSettings.receivers;
  return Object.keys(r).sort((a, b) => String(r[b].updatedAt).localeCompare(String(r[a].updatedAt))).map(k => [k, r[k]]);
}
function slRcvListHtml(){
  const rows = slReceiverRows();
  const body = rows.length
    ? '<div class="w-list">' + rows.map(([k, r]) => `<button type="button" class="w-row" data-key="${escapeHtml(k)}"><span class="w-main"><span class="w-name">${escapeHtml(r.name || k)}</span><span class="w-sub">${escapeHtml(slRuleLabel(r))}</span></span>${ICON_CHEV}</button>`).join('') + '</div>'
    : '<div class="set-note">ยังไม่มีผู้รับที่จำไว้ จะจำเมื่อกด ถูกแล้ว หรือแก้รายการสลิป</div>';
  return wSheetHead('ผู้รับที่จำไว้') + body + '<div class="modal-actions" style="margin-top:12px;"><button type="button" class="secondary" id="ws-cancel">ปิด</button></div>';
}
function openSlipReceivers(opener){
  openWSheet(slRcvListHtml(), { restore: opener, focus: '.w-row, #ws-cancel' });
  slBindList(opener);
}
function slBindList(opener){
  wBind('ws-cancel', 'click', closeWSheet);
  document.querySelectorAll('#wSheetCard .w-row').forEach(b => b.addEventListener('click', () => slReceiverDetail(b.dataset.key, opener)));
}
function slReceiverDetail(key, opener){
  const r = state.slipSettings.receivers[key];
  if(!r) return openSlipReceivers(opener);
  const cats = slActiveCats().map(c => ({ v: c.name, label: c.name }));
  const cards = slRepayCards();
  const html = wSheetHead(r.name || key) + `<div class="set-note" id="slRcvNow">ตอนนี้ ${escapeHtml(slRuleLabel(r))}</div>` +
    `<div class="w-lab" id="slRcvCatLab">หมวด</div>` + wRadioHtml('slRcvCatLab', cats, r.action === 'expense' ? r.category : '', 'sl-cats') +
    `<div class="slip-acts"><button type="button" class="secondary" data-rule="ignore">ไม่ใช่รายจ่าย</button>${cards.map(c => `<button type="button" class="secondary" data-rule="repay" data-card="${escapeHtml(c.id)}">โอนคืนบัตร${cards.length > 1 ? ' ' + escapeHtml(c.name) : ''}</button>`).join('')}</div>` +
    '<button type="button" class="link-danger" id="slRcvForget">ลืมผู้รับนี้</button>' +
    '<div class="modal-actions" style="margin-top:8px;"><button type="button" class="secondary" id="slRcvBack">กลับ</button></div>';
  openWSheet(html, { restore: opener, focus: '#wSheetCard [role=radio][aria-checked=true], #wSheetCard [role=radio]' });
  const saved = async (action, extra) => {
    if(!setSlipReceiverRule(state, key, action, extra)) return;
    await saveData();
    slReceiverDetail(key, opener);
    slipUiRefresh();
  };
  wRadioBind(document.querySelector('#wSheetCard .sl-cats'), v => saved('expense', { category: v }));
  document.querySelectorAll('#wSheetCard [data-rule]').forEach(b => b.addEventListener('click', () => saved(b.dataset.rule, b.dataset.card ? { methodId: b.dataset.card } : {})));
  wBind('slRcvBack', 'click', () => openSlipReceivers(opener));
  wBind('slRcvForget', 'click', () => openConfirm({
    title: 'ลืมผู้รับนี้ไหม?', desc: r.name || key, confirmLabel: 'ลืม',
    onConfirm: async () => { forgetSlipReceiver(state, key); await saveData(); openSlipReceivers(opener); slipUiRefresh(); }
  }));
}
function slSettingsClick(ev){
  const b = ev.target.closest('[data-act]');
  if(!b || b.disabled) return;
  const act = b.dataset.act;
  if(act === 'sl-toggle') slSetEnabled(!slipIsOn());
  else if(act === 'sl-now') slPullNow();
  else if(act === 'sl-ai') slSetAi(state.slipSettings.aiGuess === false);
  else if(act === 'sl-rcv') openSlipReceivers(b);
  else if(act === 'sl-price') goToPriceSettings();
}

function setupSlipUi(){
  const card = document.getElementById('slipCard');
  if(card) card.addEventListener('click', slCardClick);
  const body = $w('slipSettingsBody');
  if(body){ body.addEventListener('click', slSettingsClick); renderSlipSettings(); }
  document.addEventListener('visibilitychange', () => { if(!document.hidden) slipOnOpen(); });
  window.addEventListener('online', slipOnOpen);
}
