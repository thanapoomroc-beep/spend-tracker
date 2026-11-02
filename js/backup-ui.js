/* ---------- Online backup UI (W3): the สำรองออนไลน์ card, the setup sheet and the restore sheet. Uses wealth-ui.js sheets. ---------- */
const CB_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
let cbBusy = false;

/* ---------- Formatting ---------- */
function cbClock(d){ return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
// "2 พ.ย. 14:02"
function cbDateTime(iso){
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  return d.getDate() + ' ' + CB_MONTHS[d.getMonth()] + ' ' + cbClock(d);
}
// "วันนี้ 14:02" / "เมื่อวาน 14:02" / "2 พ.ย. 14:02"
function cbWhen(iso){
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  const a = ageDays(iso, todayISO());
  if(a === 0) return 'วันนี้ ' + cbClock(d);
  if(a === 1) return 'เมื่อวาน ' + cbClock(d);
  return cbDateTime(iso);
}
function cbSize(bytes){ return Math.max(1, Math.round((Number(bytes) || 0) / 1024)) + ' KB'; }

/* ---------- Card ---------- */
function renderCloudCard(){
  const el = $w('cloudBackupBody');
  if(!el) return;
  const cfg = cloudLoadConfig(), on = !!(cfg && cfg.enabled), priced = !!loadPriceConfig();
  let h;
  if(on){
    let status;
    if(cfg.lastError){
      status = `<div class="cb-status warn">สำรองไม่ได้ จะลองใหม่อัตโนมัติ</div><div class="cb-sub">${escapeHtml(cloudReasonText(cfg.lastError))}${cfg.lastOkAt ? ' · สำรองล่าสุด ' + escapeHtml(cbWhen(cfg.lastOkAt)) : ''}</div>`;
    }else if(cfg.lastOkAt){
      status = `<div class="cb-status">สำรองล่าสุด ${escapeHtml(cbWhen(cfg.lastOkAt))}</div>`;
    }else{
      status = '<div class="cb-status">ยังไม่ได้สำรอง</div>';
    }
    h = `<div role="status" aria-live="polite">${status}</div>
      <div class="row2"><button type="button" id="cbNowBtn" data-act="cb-now"${cbBusy ? ' disabled' : ''}>${cbBusy ? 'กำลังสำรอง...' : 'สำรองตอนนี้'}</button>
      <button type="button" class="secondary" data-act="cb-restore">กู้ข้อมูล</button></div>
      <button type="button" class="linkbtn cb-off" data-act="cb-off">ปิดสำรองออนไลน์</button>`;
  }else if(!priced){
    h = `<div class="set-note">ต้องตั้งค่าบริการราคาก่อน</div><button type="button" class="secondary" data-act="cb-price">ไปตั้งค่าบริการราคา</button>`;
  }else{
    h = `<div class="set-note">สำรองแบบเข้ารหัสอัตโนมัติ ใช้กู้ข้อมูลเมื่อเปลี่ยนเครื่อง</div>
      <div class="row2"><button type="button" data-act="cb-on">เปิดสำรองออนไลน์</button>
      <button type="button" class="secondary" data-act="cb-restore">กู้ข้อมูลจากสำรองออนไลน์</button></div>`;
  }
  el.innerHTML = h;
}
function cloudUiRefresh(){ renderCloudCard(); }   // called by backup-cloud.js (via typeof) when the status changes

async function cbBackupNow(){
  if(cbBusy) return;
  cbBusy = true; renderCloudCard();
  const r = await cloudRunBackup();
  cbBusy = false; renderCloudCard();
  if(r.ok) flashToast('สำรองแล้ว', true);
  else if(r.reason === 'offline') flashToast('ไม่มีเน็ต ลองใหม่ภายหลัง', false);
  else if(r.reason === 'empty') flashToast('ยังไม่มีข้อมูลให้สำรอง', false);
  else flashToast('สำรองไม่ได้ ' + cloudReasonText(r.reason), false);
  const b = document.querySelector('#cloudBackupBody [data-act="cb-now"]');
  if(b && document.activeElement === document.body) b.focus();
}

function cbAskOff(){
  openConfirm({
    title: 'ปิดสำรองออนไลน์ไหม?',
    desc: 'รหัสจะถูกลบออกจากเครื่องนี้ ข้อมูลที่สำรองไว้ยังอยู่ และกู้ได้ด้วยรหัสเดิม',
    confirmLabel: 'ปิด',
    onConfirm: () => {
      clearTimeout(cloudTimer); cloudTimer = null;
      cloudClearConfig();
      renderCloudCard();
      flashToast('ปิดแล้ว', true);
    }
  });
}

/* ---------- Setup sheet ---------- */
function cbSetErr(msg, fieldId){
  const e = $w('ws-err'); if(e) e.textContent = msg || '';
  ['cb-pass', 'cb-pass2', 'cb-rpass'].forEach(i => { const f = $w(i); if(f) f.removeAttribute('aria-invalid'); });
  if(fieldId){ const f = $w(fieldId); if(f){ f.setAttribute('aria-invalid', 'true'); f.focus(); } }
}
function cbPassToggle(ids){
  const t = $w('cb-show');
  t.addEventListener('click', () => {
    const show = t.getAttribute('aria-pressed') !== 'true';
    t.setAttribute('aria-pressed', show ? 'true' : 'false');
    t.textContent = show ? 'ซ่อนรหัส' : 'แสดงรหัส';
    ids.forEach(i => { $w(i).type = show ? 'text' : 'password'; });
  });
}
function openCloudEnableSheet(opener){
  const html = wSheetHead('เปิดสำรองออนไลน์') +
    `<div class="set-note">ถ้าลืมรหัสนี้ จะกู้ข้อมูลไม่ได้ เก็บไว้ในแอปจดรหัสผ่าน</div>
    <label for="cb-pass" class="w-lab">รหัสสำรอง (อย่างน้อย 8 ตัว)</label>
    <input type="password" id="cb-pass" autocomplete="new-password" autocapitalize="off" spellcheck="false" aria-describedby="ws-err">
    <label for="cb-pass2" class="w-lab">ใส่รหัสอีกครั้ง</label>
    <input type="password" id="cb-pass2" autocomplete="new-password" autocapitalize="off" spellcheck="false" aria-describedby="ws-err">
    <button type="button" class="linkbtn" id="cb-show" aria-pressed="false">แสดงรหัส</button>
    <div class="field-error" id="ws-err" role="alert"></div>` + W_CANCEL_SAVE('เปิดใช้');
  openWSheet(html, { focus: '#cb-pass', restore: opener });
  cbPassToggle(['cb-pass', 'cb-pass2']);
  const save = async () => {
    const p1 = $w('cb-pass').value, p2 = $w('cb-pass2').value;
    if([...p1].length < 8) return cbSetErr('รหัสต้องมีอย่างน้อย 8 ตัว', 'cb-pass');
    if(p1 !== p2) return cbSetErr('รหัสสองช่องไม่ตรงกัน', 'cb-pass2');
    cbSetErr('');
    const btn = $w('ws-save'); btn.disabled = true; btn.textContent = 'กำลังตั้งค่า...';
    let k;
    try{ k = await cloudSetupKey(p1); }catch(e){ btn.disabled = false; btn.textContent = 'เปิดใช้'; return cbSetErr('ตั้งรหัสในเครื่องนี้ไม่ได้'); }
    cloudClearConfig();
    if(!cloudSaveConfig({ enabled: true, keyB64: k.keyB64, salt: k.salt, iter: k.iter, lastOkAt: null, lastOkId: null, lastError: null, dirty: true })){
      btn.disabled = false; btn.textContent = 'เปิดใช้';
      return cbSetErr('บันทึกไม่ได้ ลองใหม่อีกครั้ง');
    }
    if(cloudStateIsEmpty(state)){
      closeWSheet(); renderCloudCard();
      flashToast('เปิดแล้ว จะสำรองเมื่อมีข้อมูล', true);
      return;
    }
    const r = await cloudRunBackup();
    closeWSheet(); renderCloudCard();
    if(r.ok) flashToast('เปิดและสำรองแล้ว', true);
    else flashToast('เปิดแล้ว แต่สำรองไม่ได้ ' + cloudReasonText(r.reason), false);
  };
  wBind('ws-cancel', 'click', closeWSheet);
  wBind('ws-save', 'click', save);
  ['cb-pass', 'cb-pass2'].forEach(i => $w(i).addEventListener('keydown', ev => { if(ev.key === 'Enter'){ ev.preventDefault(); save(); } }));
}

/* ---------- Restore sheet ---------- */
function cbRestoreShell(opener){
  openWSheet(wSheetHead('กู้ข้อมูล') + '<div id="cb-body"></div>', { restore: opener });
}
function cbBody(html){ const b = $w('cb-body'); if(b) b.innerHTML = html; }
function cbErrorView(msg, retry){
  cbBody(`<div class="set-note" role="alert">${escapeHtml(msg)}</div><div class="modal-actions"><button type="button" class="secondary" id="ws-cancel">ปิด</button>${retry ? '<button type="button" id="cb-retry">ลองใหม่</button>' : ''}</div>`);
  wBind('ws-cancel', 'click', closeWSheet);
  if(retry) wBind('cb-retry', 'click', retry);
  const f = $w(retry ? 'cb-retry' : 'ws-cancel'); if(f) f.focus();
}
async function openCloudRestoreSheet(opener){
  cbRestoreShell(opener);
  await cbShowVersions();
}
async function cbShowVersions(){
  cbBody('<div class="set-note" role="status">กำลังโหลด...</div>');
  const r = await cloudRequest('list');
  if(!$w('cb-body')) return;   // closed meanwhile
  if(!r.ok) return cbErrorView('เปิดรายการสำรองไม่ได้ ' + cloudReasonText(r.reason), cbShowVersions);
  const items = r.data.items.filter(it => it && it.id >= 0 && isFinite(Date.parse(it.at)));
  if(!items.length){ cbErrorView('ยังไม่มีข้อมูลสำรอง', null); return; }
  cbBody('<div class="set-note">เลือกชุดที่ต้องการกู้</div><div class="cb-list">' + items.map((it, i) =>
    `<button type="button" class="w-row" data-i="${i}"><span class="w-main"><span class="w-name">${escapeHtml(cbWhen(it.at))}</span><span class="w-sub">${i === 0 ? 'ล่าสุด' : escapeHtml(cbDateTime(it.at))}</span></span><span class="w-amt">${escapeHtml(cbSize(it.size))}</span>${ICON_CHEV}</button>`).join('') +
    '</div><div class="modal-actions" style="margin-top:12px;"><button type="button" class="secondary" id="ws-cancel">ปิด</button></div>');
  wBind('ws-cancel', 'click', closeWSheet);
  document.querySelectorAll('#cb-body .w-row').forEach(b => b.addEventListener('click', () => cbPick(items[+b.dataset.i])));
  const first = document.querySelector('#cb-body .w-row'); if(first) first.focus();
}
async function cbPick(item){
  cbBody('<div class="set-note" role="status">กำลังเปิด...</div>');
  const r = await cloudRequest('get', { id: item.id });
  if(!$w('cb-body')) return;
  if(!r.ok) return cbErrorView(r.reason === 'not_found' ? 'ไม่พบข้อมูลชุดนี้' : 'เปิดข้อมูลชุดนี้ไม่ได้ ' + cloudReasonText(r.reason), r.reason === 'not_found' ? null : () => cbPick(item));
  const blob = r.data.blob, cfg = cloudLoadConfig();
  if(cfg && cfg.keyB64){
    let d = null;
    try{ d = await cloudDecrypt(blob, await cloudImportKey(cfg.keyB64)); }catch(e){}
    if(d && d.ok) return cbConfirm(item, d.text, null);
    if(d && d.reason === 'format') return cbErrorView('ข้อมูลชุดนี้อ่านไม่ได้', null);
  }
  cbPassView(item, blob);
}
function cbPassView(item, blob){
  cbBody(`<div class="set-note">ชุดนี้ต้องใช้รหัสสำรอง ใส่รหัสที่ตั้งตอนเปิดสำรองออนไลน์</div>
    <label for="cb-rpass" class="w-lab">รหัสสำรอง</label>
    <input type="password" id="cb-rpass" autocomplete="current-password" autocapitalize="off" spellcheck="false" aria-describedby="ws-err">
    <button type="button" class="linkbtn" id="cb-show" aria-pressed="false">แสดงรหัส</button>
    <div class="field-error" id="ws-err" role="alert"></div>
    <div class="modal-actions"><button type="button" class="secondary" id="cb-back">กลับ</button><button type="button" id="ws-save">ต่อไป</button></div>`);
  cbPassToggle(['cb-rpass']);
  const go = async () => {
    const p = $w('cb-rpass').value;
    if(!p) return cbSetErr('ใส่รหัสก่อน', 'cb-rpass');
    cbSetErr('');
    const btn = $w('ws-save'); btn.disabled = true; btn.textContent = 'กำลังตรวจ...';
    const d = await cloudDecryptWithPassphrase(blob, p);
    if(!$w('cb-body')) return;
    if(!d.ok){
      btn.disabled = false; btn.textContent = 'ต่อไป';
      return d.reason === 'format' ? cbErrorView('ข้อมูลชุดนี้อ่านไม่ได้', null) : cbSetErr('รหัสไม่ถูก ลองใหม่', 'cb-rpass');
    }
    cbConfirm(item, d.text, { keyB64: d.keyB64, salt: d.salt, iter: d.iter });
  };
  wBind('cb-back', 'click', cbShowVersions);
  wBind('ws-save', 'click', go);
  $w('cb-rpass').addEventListener('keydown', ev => { if(ev.key === 'Enter'){ ev.preventDefault(); go(); } });
  $w('cb-rpass').focus();
}
function cbConfirm(item, text, keyInfo){
  let parsed;
  try{ parsed = JSON.parse(text); }catch(e){ return cbErrorView('ข้อมูลชุดนี้อ่านไม่ได้', null); }
  if(!parsed || (!parsed.settings && !parsed.monthlySettings) || !Array.isArray(parsed.entries)) return cbErrorView('ข้อมูลชุดนี้ใช้กู้ไม่ได้', null);
  openConfirm({
    title: `กู้ข้อมูลจากวันที่ ${cbDateTime(item.at)} ไหม?`,
    desc: 'ข้อมูลที่มีตอนนี้จะถูกแทนด้วยข้อมูลที่สำรองไว้',
    confirmLabel: 'กู้ข้อมูล',
    onConfirm: () => cbRestore(parsed, item, keyInfo)
  });
}
// Keeps a copy of the current data in localStorage['spendTrackerBeforeRestore'], then replaces the state exactly like importData.
async function cbRestore(parsed, item, keyInfo){
  if(!cloudStateIsEmpty(state)){
    try{ localStorage.setItem(BEFORE_RESTORE_KEY, JSON.stringify(state)); }
    catch(e){ flashToast('เก็บข้อมูลเดิมไว้ไม่ได้ ส่งออกไฟล์สำรองก่อนนะ', false); return; }
  }
  try{
    state = migrateState(parsed);
  }catch(e){
    flashToast('ข้อมูลชุดนี้ใช้กู้ไม่ได้', false);
    return;
  }
  closeWSheet();
  await saveData();
  initForm();
  render();
  flashToast('กู้ข้อมูลแล้ว', true);
  renderCloudCard();
  if(keyInfo && !cloudLoadConfig()){
    openConfirm({
      title: 'เปิดสำรองออนไลน์ไหม?',
      desc: 'ใช้รหัสเดิมที่เพิ่งใส่ ไม่ต้องตั้งรหัสใหม่',
      confirmLabel: 'เปิดใช้',
      onConfirm: () => {
        cloudSaveConfig({ enabled: true, keyB64: keyInfo.keyB64, salt: keyInfo.salt, iter: keyInfo.iter, lastOkAt: item.at, lastOkId: item.id, lastError: null, dirty: false });
        renderCloudCard();
        flashToast('เปิดสำรองออนไลน์แล้ว', true);
      }
    });
  }
}

/* ---------- Setup ---------- */
function cbClick(ev){
  const b = ev.target.closest('[data-act]');
  if(!b) return;
  const act = b.dataset.act;
  if(act === 'cb-on') openCloudEnableSheet(b);
  else if(act === 'cb-restore') openCloudRestoreSheet(b);
  else if(act === 'cb-now') cbBackupNow();
  else if(act === 'cb-off') cbAskOff();
  else if(act === 'cb-price') goToPriceSettings();
}
function setupCloudBackupUi(){
  const body = $w('cloudBackupBody');
  if(body){ body.addEventListener('click', cbClick); renderCloudCard(); }
  const hint = $w('exportHint');
  if(hint) hint.textContent = cbCanShareFiles() ? 'บันทึกลงแอปไฟล์หรือ iCloud Drive ได้' : 'ดาวน์โหลดเป็นไฟล์ในเครื่อง';
  document.addEventListener('visibilitychange', () => { if(!document.hidden) cloudOnOpen(); });
  window.addEventListener('online', cloudOnOpen);
  cloudOnOpen();
}
// True when the share sheet can take a file (iOS Safari: lets the owner pick Files / iCloud Drive).
function cbCanShareFiles(){
  try{
    if(typeof File === 'undefined' || !navigator.canShare || !navigator.share) return false;
    return !!navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] });
  }catch(e){ return false; }
}
