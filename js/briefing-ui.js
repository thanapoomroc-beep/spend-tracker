/* ---------- Financial health (v5, 2.8.0): the สุขภาพการเงิน card, the เกณฑ์เตือน and ส่งสรุปให้ briefing settings, the payload viewer ---------- */
// Maths lives in health-core.js, the upload in briefing-net.js. Uses the wealth-ui.js helpers ($w, wEsc, sheets, wealthHidden).
let bpBusy = false;
const ICON_CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/* ---------- Health card (ทรัพย์สิน tab) ---------- */
// Percentages and months stay visible when the eye is closed; nothing on this card is a baht amount.
const H_SEV_LABEL = { act: 'ต้องทำ', watch: 'ควรดู', info: 'ทราบไว้' };
function hStatusPill(trig, label){
  if(!trig) return '';
  return `<span class="w-pill ${trig.severity === 'act' ? 'neg' : trig.severity === 'watch' ? 'warn' : ''}">${wEsc(trig.severity === 'act' ? 'ควรรีบดู' : label)}</span>`;
}
function hPctText(p){ return (p < 0 ? '−' : '') + Math.abs(p).toFixed(1) + '%'; }
function healthRowHtml(label, value, sub, trig, pillLabel){
  const val = value === null ? '<span class="h-na">ยังไม่พอคำนวณ</span>' : wEsc(value);
  return `<div class="h-row"><span class="w-main"><span class="w-name">${wEsc(label)}</span>${sub ? `<span class="w-sub">${wEsc(sub)}</span>` : ''}</span>${hStatusPill(trig, pillLabel)}<span class="w-amt">${val}</span></div>`;
}
function healthCardHtml(){
  let c;
  try{ c = healthCompute(state, new Date()); }catch(e){ return ''; }
  const byId = id => c.triggers.find(t => t.id === id) || null;
  const th = c.th, hm = c.health;
  const rows = [
    healthRowHtml('เงินสำรองพอใช้', hm.cash_runway_months === null ? null : hm.cash_runway_months.toFixed(1) + ' เดือน', `เป้า ${hRound(th.emergencyMonthsTarget, 1)} เดือน`, byId('T1'), 'ต่ำกว่าเป้า'),
    healthRowHtml('อัตราการออม 3 เดือน', hm.savings_rate_3m === null ? null : hPctText(hm.savings_rate_3m * 100), `เป้า ${hRound(th.savingsRateTarget * 100, 1)}%`, byId('T9'), 'ต่ำกว่าเป้า'),
    healthRowHtml('หนี้ต่อทรัพย์สิน', hm.debt_to_assets === null ? null : hPctText(hm.debt_to_assets * 100), '', null),
    healthRowHtml('ถือหุ้นตัวใหญ่สุด', c.top_single_holding_pct === null ? null : (c.top_single_holding_symbol ? hPctText(c.top_single_holding_pct) : 'ไม่มีหุ้นรายตัว'),
      c.top_single_holding_symbol ? `${c.top_single_holding_symbol} เกณฑ์ ${hRound(th.maxSingleHoldingPct, 1)}%` : '', byId('T2'), 'เกินเกณฑ์'),
    healthRowHtml('สินทรัพย์ต่างประเทศ', hm.fx_exposure_pct === null ? null : hPctText(hm.fx_exposure_pct), '', byId('T8'), 'ควรดู')
  ].join('');
  const list = c.triggers.length
    ? '<ul class="h-trig">' + c.triggers.map(t => `<li><span class="w-pill ${t.severity === 'act' ? 'neg' : t.severity === 'watch' ? 'warn' : ''}">${wEsc(H_SEV_LABEL[t.severity])}</span><span class="h-trig-t">${wEsc(t.text_th)}</span></li>`).join('') + '</ul>'
    : `<div class="h-ok">${ICON_CHECK}<span>ไม่มีอะไรต้องระวัง</span></div>`;
  return `<section class="card w-health" aria-labelledby="healthTitle"><h2 id="healthTitle">สุขภาพการเงิน</h2>${rows}${list}</section>`;
}

/* ---------- Settings: เกณฑ์เตือน ---------- */
// scale: the stored value x scale is what the owner types (the savings target is stored as a ratio, typed as a percent).
const TH_FIELDS = [
  { key: 'emergencyMonthsTarget', label: 'เงินสำรองที่ตั้งเป้า', unit: 'เดือน', scale: 1, step: '0.5' },
  { key: 'savingsRateTarget', label: 'เป้าการออม', unit: '% ของรายได้', scale: 100, step: '1' },
  { key: 'maxSingleHoldingPct', label: 'หุ้นตัวเดียวไม่เกิน', unit: '% ของเงินลงทุน', scale: 1, step: '1' },
  { key: 'bigMovePct', label: 'ราคาขยับแรงเมื่อเกิน', unit: '% ต่อวัน', scale: 1, step: '1' },
  { key: 'bigMoveMinWeightPct', label: 'นับเฉพาะตัวที่ใหญ่เกิน', unit: '% ของเงินลงทุน', scale: 1, step: '1' },
  { key: 'drawdownPct', label: 'ตกจากจุดสูงสุดเกิน', unit: '% ใน 90 วัน', scale: 1, step: '1' },
  { key: 'spendPaceTolerancePct', label: 'ใช้จ่ายเร็วกว่าแผนเกิน', unit: '%', scale: 1, step: '1' },
  { key: 'fxExposureWatchPct', label: 'สินทรัพย์ต่างประเทศเกิน', unit: '% ของทรัพย์สิน', scale: 1, step: '1' }
];
function thShown(f, v){ return hRound(v * f.scale, 4); }
function renderThresholds(){
  const el = $w('thresholdsBody');
  if(!el) return;
  const ws = state.wealthSettings;
  el.innerHTML = '<div class="set-note">ใช้ตัดสินว่าอะไรควรเตือน ทั้งในหน้าทรัพย์สินและในสรุปที่ส่งให้ briefing</div><div class="th-grid">' +
    TH_FIELDS.map(f => {
      const [lo, hi] = WEALTH_SETTINGS_LIMITS[f.key];
      return `<div><label for="th-${f.key}">${wEsc(f.label)} <span class="th-unit">(${wEsc(f.unit)})</span></label><input type="number" id="th-${f.key}" data-key="${f.key}" inputmode="decimal" min="${thShown(f, lo)}" max="${thShown(f, hi)}" step="${f.step}" value="${thShown(f, ws[f.key])}" aria-describedby="thMsg"></div>`;
    }).join('') + '</div><div class="field-error" id="thMsg" role="alert"></div><button type="button" class="secondary" data-act="th-reset">คืนค่าเริ่มต้น</button>';
}
async function thChange(inp){
  const f = TH_FIELDS.find(x => x.key === inp.dataset.key);
  if(!f) return;
  const [lo, hi] = WEALTH_SETTINGS_LIMITS[f.key], msg = $w('thMsg');
  const raw = inp.value.trim(), n = Number(raw);
  if(raw === '' || !isFinite(n) || n < thShown(f, lo) || n > thShown(f, hi)){
    msg.textContent = `${f.label} ใส่ตัวเลข ${thShown(f, lo)} ถึง ${thShown(f, hi)}`;
    inp.setAttribute('aria-invalid', 'true');
    return;
  }
  msg.textContent = '';
  inp.removeAttribute('aria-invalid');
  const v = hRound(n / f.scale, 4);
  if(state.wealthSettings[f.key] === v) return;
  state.wealthSettings[f.key] = v;
  await saveData();
}
function thAskReset(opener){
  openConfirm({
    title: 'คืนค่าเริ่มต้นไหม?', desc: 'เกณฑ์เตือนทั้ง 8 ข้อจะกลับเป็นค่าที่แอปตั้งไว้', confirmLabel: 'คืนค่า',
    onConfirm: async () => {
      HEALTH_THRESHOLD_KEYS.forEach(k => { state.wealthSettings[k] = WEALTH_SETTINGS_DEFAULTS[k]; });
      await saveData();
      renderThresholds();
    }
  });
}

/* ---------- Settings: ส่งสรุปให้ briefing ---------- */
function bpSwitchHtml(labId, label, on, act, stateText){
  return `<div class="sw-row"><span class="sw-lab" id="${labId}">${wEsc(label)}</span><button type="button" class="sw" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-labelledby="${labId}" data-act="${act}"><span class="sw-state">${stateText}</span><span class="sw-track" aria-hidden="true"><span class="sw-knob"></span></span></button></div>`;
}
function bpWhen(iso){ return typeof cbWhen === 'function' ? cbWhen(iso) : iso; }
function renderBriefingCard(){
  const el = $w('briefingBody');
  if(!el) return;
  const on = briefingIsOn(), priced = !!loadPriceConfig(), share = state.wealthSettings.briefingShareAmounts === true, st = briefingLoadStatus();
  let h = '<div class="set-note">ส่งสรุปสุขภาพการเงินให้ briefing เช้าอ่าน เป็นเปอร์เซ็นต์และชื่อหุ้น ไม่มีชื่อบัญชีและโน้ต</div>';
  if(!priced && !on){
    h += '<div class="set-note">ต้องตั้งค่าบริการราคาก่อน</div><button type="button" class="secondary" data-act="bp-price">ไปตั้งค่าบริการราคา</button>';
  }else{
    let status;
    if(st.lastError && on){
      status = `<div class="cb-status warn">ส่งไม่ได้ จะลองใหม่อัตโนมัติ</div><div class="cb-sub">${wEsc(briefingReasonText(st.lastError))}${st.lastOkAt ? ' · ส่งล่าสุด ' + wEsc(bpWhen(st.lastOkAt)) : ''}</div>`;
    }else if(st.lastOkAt){
      status = `<div class="cb-status">ส่งล่าสุด ${wEsc(bpWhen(st.lastOkAt))}</div>`;
    }else{
      status = '<div class="cb-status">ยังไม่ได้ส่ง</div>';
    }
    h += bpSwitchHtml('bpSwLab1', 'ส่งสรุปให้ briefing', on, 'bp-toggle', on ? 'เปิด' : 'ปิด') +
      `<div role="status" aria-live="polite" class="bp-status">${status}</div>` +
      bpSwitchHtml('bpSwLab2', 'รวมยอดเงินในสรุป', share, 'bp-share', share ? 'เปิด' : 'ปิด') +
      `<div class="field-hint">${share ? 'ส่งยอดความมั่งคั่งสุทธิ เงินสด หนี้ และยอดที่ใกล้ถึงกำหนดไปด้วย' : 'ปิดอยู่ ไม่ส่งยอดเงินเป็นบาท'}</div>`;
  }
  const canSend = on && priced;
  h += `<div class="row2"><button type="button" data-act="bp-now"${canSend && !bpBusy ? '' : ' disabled'}>${bpBusy ? 'กำลังส่ง...' : 'ส่งตอนนี้'}</button><button type="button" class="secondary" data-act="bp-view">ดูข้อมูลที่ส่ง</button></div>`;
  el.innerHTML = h;
}
function briefingUiRefresh(){ renderBriefingCard(); }   // called by briefing-net.js (via typeof) when the status changes

async function bpSetEnabled(on){
  state.wealthSettings.briefingEnabled = on;
  if(!on){ clearTimeout(briefingTimer); briefingTimer = null; }
  await saveData();
  renderBriefingCard();
  if(!on) return;
  bpBusy = true; renderBriefingCard();
  const r = await briefingRun({ force: true });
  bpBusy = false; renderBriefingCard();
  if(r.ok) flashToast('เปิดและส่งแล้ว', true);
  else if(r.reason === 'empty') flashToast('เปิดแล้ว จะส่งเมื่อมีข้อมูล', true);
  else flashToast('เปิดแล้ว แต่ส่งไม่ได้ ' + briefingReasonText(r.reason), false);
}
async function bpSendNow(){
  if(bpBusy) return;
  bpBusy = true; renderBriefingCard();
  const r = await briefingRun({ force: true });
  bpBusy = false; renderBriefingCard();
  if(r.ok) flashToast('ส่งแล้ว', true);
  else if(r.reason === 'offline') flashToast('ไม่มีเน็ต ลองใหม่ภายหลัง', false);
  else if(r.reason === 'empty') flashToast('ยังไม่มีข้อมูลให้ส่ง', false);
  else flashToast('ส่งไม่ได้ ' + briefingReasonText(r.reason), false);
  const b = document.querySelector('#briefingBody [data-act="bp-now"]');
  if(b && document.activeElement === document.body) b.focus();
}
async function bpSetShare(on){
  state.wealthSettings.briefingShareAmounts = on;
  await saveData();
  renderBriefingCard();
  if(briefingIsOn()) briefingRun();   // the payload changed: send it now rather than waiting
}
function bpAskShare(){
  openConfirm({
    title: 'ส่งยอดเงินด้วยไหม?', desc: 'จะส่งความมั่งคั่งสุทธิ เงินสด หนี้ และยอดที่ใกล้ถึงกำหนดเป็นตัวเลขบาทไปกับสรุป ปิดได้ทุกเมื่อ', confirmLabel: 'ส่งด้วย',
    onConfirm: () => bpSetShare(true)
  });
}
// The exact JSON that would be uploaded now.
function openBriefingPayloadSheet(opener){
  let json;
  try{ json = JSON.stringify(buildBriefingPayload(state, new Date()), null, 2); }catch(e){ json = 'สร้างข้อมูลไม่ได้'; }
  const html = wSheetHead('ข้อมูลที่ส่ง') +
    `<div class="set-note">นี่คือข้อมูลทั้งหมดที่ออกจากเครื่อง${briefingIsOn() ? '' : ' (ตอนนี้ยังไม่ได้เปิดส่ง)'}</div>
    <pre class="bp-json" id="bpJson" tabindex="0" role="region" aria-label="ข้อมูลที่ส่งให้ briefing">${wEsc(json)}</pre>
    <div class="modal-actions"><button type="button" class="secondary" id="ws-cancel">ปิด</button></div>`;
  openWSheet(html, { focus: '#ws-cancel', restore: opener });
  wBind('ws-cancel', 'click', closeWSheet);
}
function bpClick(ev){
  const b = ev.target.closest('[data-act]');
  if(!b || b.disabled) return;
  const act = b.dataset.act;
  if(act === 'bp-toggle') bpSetEnabled(!briefingIsOn());
  else if(act === 'bp-share'){ if(state.wealthSettings.briefingShareAmounts === true) bpSetShare(false); else bpAskShare(); }
  else if(act === 'bp-now') bpSendNow();
  else if(act === 'bp-view') openBriefingPayloadSheet(b);
  else if(act === 'bp-price') goToPriceSettings();
}
function setupBriefingUi(){
  const body = $w('briefingBody');
  if(body){ body.addEventListener('click', bpClick); renderBriefingCard(); }
  const th = $w('thresholdsBody');
  if(th){
    renderThresholds();
    th.addEventListener('change', ev => { if(ev.target.matches && ev.target.matches('input[data-key]')) thChange(ev.target); });
    th.addEventListener('click', ev => { const b = ev.target.closest('[data-act="th-reset"]'); if(b) thAskReset(b); });
  }
  document.addEventListener('visibilitychange', () => { if(!document.hidden) briefingOnOpen(); });
  window.addEventListener('online', briefingOnOpen);
  briefingOnOpen();
}
