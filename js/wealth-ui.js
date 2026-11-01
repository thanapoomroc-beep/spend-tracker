/* ---------- Wealth tab (ทรัพย์สิน): screens. The maths lives in wealth-core.js ---------- */
const WEALTH_HIDE_KEY = 'spendTrackerHideWealth';
let wealthHidden = false;
try{ wealthHidden = localStorage.getItem(WEALTH_HIDE_KEY) === '1'; }catch(e){}
let wealthView = null;         // account id of the holdings page, null = the main page
let wealthChart = null;
let wSheetRestore = null;      // element (or selector) that gets focus back when the sheet closes

const ASSET_LABEL = { th_stock:'หุ้นไทย', foreign_stock:'หุ้นต่างประเทศ', fund:'กองทุน', gold:'ทอง', crypto:'คริปโต' };
const ASSET_UNIT_WORD = { th_stock:'หุ้น', foreign_stock:'หุ้น', fund:'หน่วย', crypto:'เหรียญ' };
const GROUP_LABEL = { cash:'เงินในบัญชี', invest:'เงินลงทุน' };
const W_MASK = '฿••••';
const ICON_CHEV = '<svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>';
const ICON_EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7a12.6 12.6 0 0 1-3.2 4.2M6.6 6.6C4.3 8 2.7 10.2 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 4.4-1"/></svg>';
const ICON_BACK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';

/* ---------- Formatting (every baht amount goes through wm so the eye button can mask it) ---------- */
function wm(text){ return wealthHidden ? W_MASK : text; }
function wMoney(n){ const r = Math.round(n); return r < 0 ? '−' + fmt(-r) : fmt(r); }
function wSigned(n){ const r = Math.round(n); return r > 0 ? '+' + fmt(r) : r < 0 ? '−' + fmt(-r) : fmt(0); }
function wPct(p){ const v = Math.round(p * 1000) / 10; return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '%'; }
function wPlText(pl, pct){ return wSigned(pl) + (pct !== null ? ' (' + wPct(pct) + ')' : ''); }
function wDir(n){ return wealthHidden ? '' : (Math.round(n) > 0 ? 'w-pos' : Math.round(n) < 0 ? 'w-neg' : ''); }
function wNum(n){ return Number(n).toLocaleString('en-US', { maximumFractionDigits: 6 }); }
function wPrice(n, cur){
  const big = n >= 1000;
  const s = Number(n).toLocaleString('en-US', { minimumFractionDigits: big ? 0 : 2, maximumFractionDigits: big ? 2 : 4 });
  if(!cur || cur === 'THB') return '฿' + s;
  if(cur === 'CNY') return s + '元';
  const sym = curInfo(cur).sym;
  return (sym === '$' && cur !== 'USD' ? cur + ' ' : sym) + s;
}
function wCompact(v){
  const a = Math.abs(v), sign = v < 0 ? '−' : '';
  const t = x => x.toFixed(2).replace(/\.?0+$/, '');
  if(a >= 1e6) return sign + '฿' + t(a / 1e6) + 'M';
  if(a >= 1e3) return sign + '฿' + t(a / 1e3) + 'K';
  return sign + '฿' + Math.round(a);
}
function wAgeText(day){
  if(!day) return 'ยังไม่มียอด';
  const a = ageDays(day, todayISO());
  if(a <= 0) return 'อัปเดตวันนี้';
  if(a === 1) return 'อัปเดตเมื่อวาน';
  if(a < 60) return `อัปเดต ${a} วันก่อน`;
  return `อัปเดต ${Math.floor(a / 30)} เดือนก่อน`;
}
function parseWNum(s){
  const t = String(s == null ? '' : s).replace(/[,\s]/g, '');
  return t === '' ? NaN : Number(t);
}
function wInputNum(n){ return Number(n).toLocaleString('en-US', { maximumFractionDigits: 6, useGrouping: false }); }
const $w = id => document.getElementById(id);
const wEsc = escapeHtml;

/* ---------- State helpers ---------- */
function findWAccount(id){ return state.accounts.find(a => a.id === id && !a.deleted); }
function liveHoldingsOf(accId){ return wLive(state.holdings).filter(h => h.accountId === accId); }
function holdingName(h){ return h.assetType === 'gold' ? 'ทองคำ' : h.symbol; }
function holdingQty(r){
  const h = r.holding;
  const units = wealthHidden ? '••••' : wNum(h.units);
  const word = h.assetType === 'gold' ? (h.unit === 'baht' ? 'บาท' : 'กรัม') : ASSET_UNIT_WORD[h.assetType];
  const price = r.price === null ? '' : ' × ' + (h.assetType === 'gold' ? 'บาทละ ' : '') + (wealthHidden ? W_MASK : wPrice(r.price, r.priceCurrency));
  return `${units} ${word}${price}`;
}
// Quiet save for housekeeping writes (no "saved" toast).
function wealthSaveQuiet(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }catch(e){ return false; }
}
// One snapshot per day: written on open, on viewing the tab and after every wealth edit. Nothing is written until there is something to value.
function wealthTouchSnapshot(){
  const today = todayISO();
  const sum = wealthSummaryNow(today);
  if(!sum.hasData) return false;
  if(!upsertSnapshot(state.snapshots, today, buildSnapshot(sum))) return false;
  wealthSaveQuiet();
  return true;
}
async function wealthCommit(){
  const today = todayISO();
  const sum = wealthSummaryNow(today);
  if(sum.hasData) upsertSnapshot(state.snapshots, today, buildSnapshot(sum));
  await saveData();
  renderWealth();
}
// After a price fetch: snapshot, quiet save (no "saved" toast), redraw.
function wealthCommitQuiet(){
  const today = todayISO();
  const sum = wealthSummaryNow(today);
  if(sum.hasData) upsertSnapshot(state.snapshots, today, buildSnapshot(sum));
  wealthSaveQuiet();
}
function showWealthTab(){
  wealthTouchSnapshot();
  renderWealth();
  maybeAutoRefreshPrices();
}
// The price fetch changed its status (running, done, failed): redraw so the button, status line and row notes follow.
function onPriceStatus(){ if(activeTab === 'wealth') renderWealth(); }

/* ---------- Price bar: button + status line ---------- */
function wTimeText(ms){
  const d = new Date(ms), hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  return todayISO() === isoFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate()) ? hm : fmtThaiDate(isoFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate())) + ' ' + hm;
}
function wFreshText(at){
  const t = Date.parse(at);
  if(!isFinite(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if(mins < 1) return 'อัปเดตเมื่อสักครู่';
  if(mins < 60) return `อัปเดต ${mins} นาทีก่อน`;
  if(mins < 1440) return `อัปเดต ${Math.floor(mins / 60)} ชม.ก่อน`;
  return wAgeText(dayOfStamp(at));
}
function newestAutoPriceMs(){
  let best = 0;
  wLive(state.holdings).forEach(h => {
    const a = autoPriceOf(state.priceCache[priceKey(h.assetType, h.assetType === 'gold' ? 'GOLD' : h.symbol)]);
    const t = a ? Date.parse(a.at) : 0;
    if(t > best) best = t;
  });
  return best;
}
function priceBarHtml(){
  if(!wLive(state.holdings).length) return '';
  const cfg = loadPriceConfig();
  if(!cfg) return '<div class="w-pricebar"><div class="w-status">ยังไม่ได้ตั้งค่าบริการราคา <button type="button" class="linkbtn" data-act="price-settings">ตั้งค่า</button></div></div>';
  const running = priceStatus.kind === 'running';
  let text;
  if(running) text = '';
  else if(priceStatus.kind === 'ok') text = 'ราคาล่าสุด ' + wTimeText(priceStatus.at);
  else if(priceStatus.kind === 'partial') text = 'ดึงราคาบางตัวไม่ได้ ใช้ราคาเดิม';
  else if(priceStatus.kind === 'fail') text = 'ดึงราคาไม่ได้ ใช้ราคาเดิม';
  else { const n = newestAutoPriceMs(); text = n ? 'ราคาล่าสุด ' + wTimeText(n) : 'ยังไม่เคยดึงราคา'; }
  return `<div class="w-pricebar"><button type="button" class="secondary" data-act="price-fetch"${running ? ' disabled aria-busy="true"' : ''}>${running ? 'กำลังดึงราคา...' : 'ดึงราคาล่าสุด'}</button><div class="w-status" role="status" aria-live="polite">${wEsc(text)}</div></div>`;
}
function priceSrcText(r){
  const parts = [];
  if(priceStatus.failed.includes(r.key)) parts.push('ดึงราคาไม่ได้');
  if(r.source === 'manual') parts.push('ราคาที่ใส่เอง');
  else if(r.source === 'auto' && r.priceAt) parts.push(wFreshText(r.priceAt));
  return parts.join(' ');
}
function goToPriceSettings(){
  goTab('settings');
  const inp = $w('priceUrl');
  if(inp){ inp.scrollIntoView({ block: 'center' }); inp.focus(); }
}

/* ---------- Settings: ราคาอัตโนมัติ ---------- */
function priceMsg(t){ $w('priceMsg').textContent = t || ''; }
function setupPriceSettings(){
  const cfg = loadPriceConfig();
  if(cfg){ $w('priceUrl').value = cfg.url; $w('priceToken').placeholder = '••••••••'; }
  const read = () => {
    const url = normalizePriceUrl($w('priceUrl').value);
    const typed = $w('priceToken').value.trim();
    const token = typed || (loadPriceConfig() || {}).token || '';
    if(!url){ priceMsg('ที่อยู่ไม่ถูก ต้องเป็น https เท่านั้น'); $w('priceUrl').focus(); return null; }
    if(!token){ priceMsg('ใส่รหัสส่วนตัวก่อน'); $w('priceToken').focus(); return null; }
    return { url, token };
  };
  $w('priceSaveBtn').addEventListener('click', () => {
    const c = read(); if(!c) return;
    if(!savePriceConfig(c.url, c.token)){ priceMsg('บันทึกไม่ได้ ลองใหม่อีกครั้ง'); return; }
    $w('priceUrl').value = c.url; $w('priceToken').value = ''; $w('priceToken').placeholder = '••••••••';
    priceMsg('บันทึกแล้ว');
    if(activeTab === 'wealth') renderWealth();
  });
  $w('priceTestBtn').addEventListener('click', async () => {
    const c = read(); if(!c) return;
    const b = $w('priceTestBtn'); b.disabled = true; priceMsg('กำลังทดสอบ...');
    const r = await testPriceService(c.url, c.token);
    b.disabled = false;
    priceMsg(r.ok ? 'ใช้ได้' : priceReasonText(r.reason));
  });
  $w('priceClearBtn').addEventListener('click', () => {
    clearPriceConfig();
    $w('priceUrl').value = ''; $w('priceToken').value = ''; $w('priceToken').placeholder = '';
    priceMsg('ล้างแล้ว');
    if(activeTab === 'wealth') renderWealth();
  });
}

/* ---------- Page ---------- */
function renderWealth(){
  const eye = $w('wealthEyeBtn');
  if(eye){
    eye.innerHTML = wealthHidden ? ICON_EYE_OFF : ICON_EYE;
    eye.setAttribute('aria-pressed', wealthHidden ? 'true' : 'false');
    eye.setAttribute('aria-label', wealthHidden ? 'แสดงตัวเลข' : 'ซ่อนตัวเลข');
  }
  if(wealthView && !findWAccount(wealthView)) wealthView = null;
  const sum = wealthSummaryNow();
  $w('wealthMain').hidden = !!wealthView;
  $w('wealthHoldings').hidden = !wealthView;
  const top = document.querySelector('#panel-wealth > .top');
  if(top) top.hidden = !!wealthView;
  if(wealthChart){ try{ wealthChart.destroy(); }catch(e){} wealthChart = null; }
  if(wealthView) renderHoldingsView(sum); else renderWealthMain(sum);
}

function wealthHeroHtml(sum, series, today){
  const mc = monthChange(state.snapshots, today, buildSnapshot(sum));
  let change = '';
  if(mc){
    const part = n => `<span class="${wDir(n)}">${wm(wSigned(n))}</span>`;
    change = `เดือนนี้ ${part(mc.change)} <span class="nb">(ตลาด ${wm(wSigned(mc.market))} ·</span> <span class="nb">เงินเข้า-ออก ${wm(wSigned(mc.flows))})</span>`;
  }
  let chart;
  if(series.length >= 2){
    const rows = series.map(p => `<tr><td>${wEsc(thaiMonthYear(p.month))}</td><td>${wm(wMoney(p.net))}</td><td>${p.change === null ? '-' : wm(wSigned(p.change))}</td></tr>`).join('');
    chart = `<div class="chart-wrap w-chart"><canvas id="wealthChart" role="img" aria-label="กราฟความมั่งคั่งสุทธิ ${series.length} เดือน ดูตัวเลขในตารางด้านล่าง"></canvas><div class="chart-fallback">ต้องต่อเน็ตถึงจะเห็นกราฟ</div></div>
      <details class="more w-table"><summary><span>ดูเป็นตาราง</span><svg class="chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
      <div class="table-scroll" tabindex="0" role="region" aria-label="ตารางความมั่งคั่งสุทธิรายเดือน"><table><thead><tr><th scope="col">เดือน</th><th scope="col">ความมั่งคั่งสุทธิ</th><th scope="col">เปลี่ยนแปลง</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  }else{
    chart = '<div class="w-chart-note">กราฟจะขึ้นเมื่อมีข้อมูล 2 เดือน</div>';
  }
  return `<div class="card w-hero">
    <div class="w-hero-label">ความมั่งคั่งสุทธิ</div>
    <div class="w-net">${wm(wMoney(sum.net))}</div>
    <div class="w-change">${change}</div>
    ${chart}
    <div class="w-split"><div><span class="k">ทรัพย์สิน</span><span class="v">${wm(wMoney(sum.assets))}</span></div><div><span class="k">หนี้</span><span class="v">${wm(wMoney(sum.debtTotal))}</span></div></div>
  </div>`;
}

function wealthAccountRow(a){
  let sub;
  if(a.hasHoldings) sub = `${a.holdingCount} ตัว ${a.asOf ? wAgeText(a.asOf) : 'ต้องใส่ราคา'}`;
  else sub = wAgeText(a.asOf);
  const pill = a.stale ? '<span class="w-pill warn">ข้อมูลเก่า</span>' : '';
  return `<button type="button" class="w-row" data-act="acct" data-id="${wEsc(a.id)}"><span class="w-main"><span class="w-name">${wEsc(a.name)}</span><span class="w-sub">${wEsc(sub)}</span></span>${pill}<span class="w-amt">${wm(wMoney(a.value))}</span>${ICON_CHEV}</button>`;
}
function wealthDebtSub(d){
  if(d.overridden) return 'ยอดจริง ' + wAgeText(d.asOf);
  if(d.kind === 'inst') return `งวดที่ ${d.meta.termNo} จาก ${d.meta.total}`;
  if(d.kind === 'repay') return 'ตั้งแต่โอนคืนครั้งล่าสุด';
  if(d.kind === 'statement') return 'ยังไม่ได้จ่าย';
  return wAgeText(d.asOf);
}
function wealthDebtRow(d){
  const pills = (d.auto ? (d.overridden ? '<span class="w-pill">ยอดจริง</span>' : '<span class="w-pill">อัตโนมัติ</span>') : '') + (d.stale ? '<span class="w-pill warn">ข้อมูลเก่า</span>' : '');
  return `<button type="button" class="w-row" data-act="debt" data-id="${wEsc(d.id)}"><span class="w-main"><span class="w-name">${wEsc(d.name)}</span><span class="w-sub">${wEsc(wealthDebtSub(d))}</span></span>${pills}<span class="w-amt">${wm(wMoney(d.balance))}</span>${ICON_CHEV}</button>`;
}
function wealthGroupHtml(title, total, rowsHtml){
  return `<section class="card w-group" aria-label="${wEsc(title)}"><h2><span>${wEsc(title)}</span><span class="h2-note">${wm(wMoney(total))}</span></h2>${rowsHtml}</section>`;
}

function renderWealthMain(sum){
  const today = todayISO();
  const series = monthSeries(state.snapshots, 12);
  let h = '';
  if(sum.hasData){
    h += wealthHeroHtml(sum, series, today);
  }else{
    h += `<div class="card w-empty"><div class="w-empty-t">ยังไม่ได้เพิ่มบัญชี</div><p>เพิ่มบัญชีเงินฝาก เงินลงทุน หรือหนี้ แล้วแอปจะรวมเป็นความมั่งคั่งสุทธิให้ ใส่ยอดเดือนละครั้งก็พอ</p><button type="button" data-act="add">+ เพิ่มบัญชี</button></div>`;
  }
  h += priceBarHtml();
  if(sum.cash.length) h += wealthGroupHtml(GROUP_LABEL.cash, sum.cashTotal, sum.cash.map(wealthAccountRow).join(''));
  if(sum.invest.length) h += wealthGroupHtml(GROUP_LABEL.invest, sum.investTotal, sum.invest.map(wealthAccountRow).join(''));
  if(sum.debts.length) h += wealthGroupHtml('หนี้', sum.debtTotal, sum.debts.map(wealthDebtRow).join(''));
  if(sum.hasData){
    h += '<button type="button" class="secondary w-add" data-act="add">+ เพิ่มบัญชี</button>';
    if(sum.hidden.length){
      h += `<details class="more w-hidden"><summary><span>บัญชีที่ซ่อนไว้ (${sum.hidden.length})</span><svg class="chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>` +
        sum.hidden.map(a => `<div class="w-row"><span class="w-main"><span class="w-name">${wEsc(a.name)}</span><span class="w-sub">${GROUP_LABEL[a.group]}</span></span><button type="button" class="secondary" style="width:auto;" data-act="unhide" data-id="${wEsc(a.id)}" aria-label="แสดง ${wEsc(a.name)} อีกครั้ง">แสดงอีกครั้ง</button></div>`).join('') + '</details>';
    }
    h += '<div class="w-foot">ราคาดึงอัตโนมัติ หุ้นไทยบางวันอาจต้องใส่เอง</div>';
  }
  $w('wealthMain').innerHTML = h;
  if(series.length >= 2) buildWealthChart(series);
}

/* ---------- Chart: one sand line, no fill, one y-axis ---------- */
const wealthCrosshair = {
  id: 'wealthCrosshair',
  afterDraw(chart){
    const t = chart.tooltip;
    if(!t || !t.getActiveElements || !t.getActiveElements().length) return;
    const x = t.getActiveElements()[0].element.x, a = chart.chartArea, c = chart.ctx;
    c.save(); c.beginPath(); c.moveTo(x, a.top); c.lineTo(x, a.bottom); c.lineWidth = 1; c.strokeStyle = 'rgba(154,156,163,.55)'; c.stroke(); c.restore();
  }
};
function buildWealthChart(series){
  if(!chartAvailable('wealthChart')) return;
  const ctx = $w('wealthChart').getContext('2d');
  const data = series.map(p => p.net), last = data.length - 1;
  const SAND = '#E8D3A8';
  wealthChart = new Chart(ctx, {
    type: 'line',
    data: { labels: series.map(p => d2label(parseISODate(p.month + '-01'))), datasets: [{
      data, borderColor: SAND, borderWidth: 2, borderJoinStyle: 'round', borderCapStyle: 'round', tension: 0, fill: false,
      pointRadius: data.map((_, i) => i === last ? 5 : 0), pointHoverRadius: 5, pointHitRadius: 24,
      pointBackgroundColor: SAND, pointBorderColor: CHART_PANEL, pointBorderWidth: 2, pointHoverBackgroundColor: SAND, pointHoverBorderColor: CHART_PANEL, pointHoverBorderWidth: 2
    }] },
    plugins: [wealthCrosshair],
    options: {
      responsive: true, maintainAspectRatio: false, animation: reducedMotion() ? false : { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 8, right: 8, left: 0 } },
      plugins: {
        legend: { display: false },
        tooltip: Object.assign(chartTooltip(), { displayColors: false, callbacks: {
          title: items => items.length ? thaiMonthYear(series[items[0].dataIndex].month) : '',
          label: it => 'ความมั่งคั่งสุทธิ ' + wm(wMoney(it.parsed.y)),
          afterLabel: it => { const c = series[it.dataIndex].change; return c === null ? '' : 'เทียบเดือนก่อน ' + wm(wSigned(c)); }
        } })
      },
      scales: {
        x: { border: { display: false }, grid: { display: false },
          ticks: { color: c => c.index === last ? CHART_TEXT : CHART_MUTED, maxRotation: 0, autoSkip: false, font: c => ({ size: 11, weight: c.index === last ? '700' : '400' }) } },
        y: { border: { display: false }, grace: '8%',
          grid: { color: c => c.tick && c.tick.value === 0 ? CHART_MUTED : CHART_GRID, lineWidth: 1, drawTicks: false },
          ticks: { display: !wealthHidden, color: CHART_MUTED, maxTicksLimit: 4, padding: 6, font: { size: 11 }, callback: v => wCompact(v) } }
      }
    }
  });
}

/* ---------- Holdings page ---------- */
function openHoldings(accId){
  wealthView = accId;
  renderWealth();
  window.scrollTo(0, 0);
  const b = document.querySelector('#wealthHoldings [data-act="back"]');
  if(b) b.focus();
}
function wealthBack(){
  const id = wealthView;
  wealthView = null;
  renderWealth();
  window.scrollTo(0, 0);
  const row = id && document.querySelector(`#wealthMain [data-act="acct"][data-id="${CSS.escape(id)}"]`);
  if(row) row.focus();
}
function renderHoldingsView(sum){
  const a = sum.cash.concat(sum.invest, sum.hidden).find(x => x.id === wealthView);
  const el = $w('wealthHoldings');
  if(!a){ el.innerHTML = ''; return; }
  const rows = a.holdings;
  let h = `<div class="w-backrow"><button type="button" class="icon-btn" data-act="back" aria-label="กลับ">${ICON_BACK}</button><h1>${wEsc(a.name)}</h1><span class="w-kind">${GROUP_LABEL[a.group]}</span></div>`;
  if(rows.length){
    const plLine = a.cost > 0 ? `ต้นทุน ${wm(wMoney(a.cost))} <span class="${wDir(a.pl)}">${a.pl >= 0 ? 'กำไร' : 'ขาดทุน'} ${wm(wPlText(a.pl, a.plPct))}</span>` : '';
    h += `<div class="card w-sum"><div class="k">มูลค่าตอนนี้</div><div class="v">${wm(wMoney(a.value))}</div><div class="m">${plLine}</div></div>`;
    h += priceBarHtml();
    h += '<div class="card w-list">' + rows.map(r => {
      const hd = r.holding;
      let right, sub2 = '';
      if(r.missingPrice) right = '<span class="w-sub">ยังไม่มีราคา</span>';
      else if(r.missingFx) right = `<span class="w-sub">ต้องใส่เรต ${wEsc(r.priceCurrency)}</span>`;
      else right = `<span>${wm(wMoney(r.value))}</span>` + (r.pl !== null ? `<small class="${wDir(r.pl)}">${wm(wPlText(r.pl, r.plPct))}</small>` : '');
      if(r.stale) sub2 = '<span class="w-pill warn">ข้อมูลเก่า</span>';
      return `<button type="button" class="w-row" style="min-height:64px;" data-act="hold-edit" data-id="${wEsc(hd.id)}"><span class="w-main"><span class="w-name" style="font-weight:600;">${wEsc(holdingName(hd))}</span><span class="w-sub">${wEsc(holdingQty(r))}</span>${priceSrcText(r) ? `<span class="w-sub">${wEsc(priceSrcText(r))}</span>` : ''}</span>${sub2}<span class="w-amt">${right}</span>${ICON_CHEV}</button>`;
    }).join('') + '</div>';
  }else{
    h += '<div class="card w-empty"><div class="w-empty-t">ยังไม่มีรายการ</div><p>เพิ่มหุ้น กองทุน ทอง หรือคริปโตทีละตัว แอปจะคูณจำนวนกับราคาให้เอง</p></div>';
  }
  h += `<div class="w-btnrow"><button type="button" class="secondary" data-act="hold-add">+ เพิ่มตัว</button>${rows.length ? '<button type="button" data-act="hold-prices">อัปเดตราคา</button>' : ''}</div>`;
  const newest = rows.map(r => dayOfStamp(r.priceAt)).filter(Boolean).sort().pop();
  h += `<div class="w-foot">${newest ? 'ราคาล่าสุดใส่เมื่อ ' + wEsc(fmtThaiDate(newest)) + ' แอปคูณจำนวนให้เอง' : 'ใส่ราคาแล้วแอปจะคูณจำนวนให้เอง'}</div>`;
  if(!a.archived) h += '<button type="button" class="link-danger" data-act="hide-acct" data-id="' + wEsc(a.id) + '">ซ่อนบัญชีนี้</button>';
  el.innerHTML = h;
}

/* ---------- Sheets ---------- */
function openWSheet(html, opts){
  opts = opts || {};
  const card = $w('wSheetCard');
  card.className = 'modal-card w-sheet-card';
  card.innerHTML = html;
  wSheetRestore = opts.restore || document.activeElement;
  $w('wSheetOverlay').style.display = 'flex';
  card.scrollTop = 0;
  const f = opts.focus && card.querySelector(opts.focus);
  if(f){ f.focus(); if(f.select) f.select(); }
}
function wSheetOpen(){ const o = $w('wSheetOverlay'); return !!o && o.style.display !== 'none'; }
function closeWSheet(){
  $w('wSheetOverlay').style.display = 'none';
  const r = wSheetRestore;
  wSheetRestore = null;
  let target = null;
  if(typeof r === 'string') target = document.querySelector(r);
  else if(r && document.body.contains(r)) target = r;
  if(target && target.focus) target.focus();
}
function wSheetFocusSel(act, id){ return `[data-act="${act}"]` + (id ? `[data-id="${CSS.escape(id)}"]` : ''); }
function wSheetHead(title, kind, extra){
  return `<div class="w-sheet-head"><div class="modal-title" id="wSheetTitle">${wEsc(title)}</div>${extra || (kind ? `<span class="w-sheet-kind">${wEsc(kind)}</span>` : '')}</div>`;
}
const W_CANCEL_SAVE = (saveLabel) => `<div class="modal-actions"><button type="button" class="secondary" id="ws-cancel">ยกเลิก</button><button type="button" id="ws-save">${saveLabel || 'บันทึก'}</button></div>`;
function wBind(id, ev, fn){ const e = $w(id); if(e) e.addEventListener(ev, fn); }
function wErr(msg, fieldId){
  $w('ws-err').textContent = msg || '';
  ['ws-amount','ws-name','ws-date','ws-sym','ws-units','ws-cost','ws-real','ws-price'].forEach(i => { const e = $w(i); if(e) e.removeAttribute('aria-invalid'); });
  if(fieldId){ const f = $w(fieldId); if(f){ f.setAttribute('aria-invalid', 'true'); f.focus(); } }
}

// Radiogroup of buttons; onChange(value) runs after the aria state is updated.
function wRadioHtml(labelId, options, value, cls){
  return `<div class="opt-seg ${cls}" role="radiogroup" aria-labelledby="${labelId}">` + options.map(o =>
    `<button type="button" role="radio" aria-checked="${o.v === value}" tabindex="${o.v === value ? 0 : -1}" data-v="${wEsc(o.v)}">${wEsc(o.label)}</button>`).join('') + '</div>';
}
function wRadioBind(group, onChange){
  const btns = [...group.querySelectorAll('[role=radio]')];
  const set = (b, focus) => {
    btns.forEach(x => { const on = x === b; x.setAttribute('aria-checked', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1; });
    if(focus) b.focus();
    onChange(b.dataset.v);
  };
  btns.forEach((b, i) => {
    b.addEventListener('click', () => set(b, false));
    b.addEventListener('keydown', ev => {
      const step = (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') ? 1 : (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') ? -1 : 0;
      if(step){ ev.preventDefault(); set(btns[(i + step + btns.length) % btns.length], true); }
    });
  });
}

/* ----- Update a balance (cash account, invest account without holdings) ----- */
function openBalanceSheet(accId, opener){
  const a = findWAccount(accId);
  if(!a) return;
  const hist = balanceHistory(state.balances, accId);
  const cur = hist[0] || null;
  const today = todayISO();
  const html = wSheetHead(a.name, GROUP_LABEL[a.group]) +
    `<label for="ws-amount" class="w-lab" style="margin-top:4px;">ยอดตอนนี้</label>
    <input id="ws-amount" class="w-big" inputmode="decimal" autocomplete="off" value="${cur && !wealthHidden ? wEsc(wNum(cur.value)) : ''}" placeholder="${wealthHidden ? '••••' : '0'}" aria-describedby="ws-delta ws-err">
    <div class="w-delta" id="ws-delta" aria-live="polite"></div>
    <label for="ws-date">วันที่</label>
    <input type="date" id="ws-date" value="${today}" max="${today}">
    <div class="field-error" id="ws-err" role="alert"></div>` +
    W_CANCEL_SAVE() +
    (a.group === 'invest' ? '<button type="button" class="secondary" id="ws-itemize" style="margin-top:10px;">จดเป็นรายตัว (หุ้น กองทุน ทอง)</button>' : '') +
    (hist.length ? `<div class="w-hist"><h3>ประวัติยอด</h3>${hist.slice(0, 6).map(b => `<div class="w-hist-row"><span>${wEsc(fmtThaiDate(b.date))}</span><span>${wm(wMoney(b.value))}</span></div>`).join('')}</div>` : '') +
    '<button type="button" class="link-danger" id="ws-hide">ซ่อนบัญชีนี้</button>';
  openWSheet(html, { focus: '#ws-amount', restore: opener });
  const amt = $w('ws-amount');
  const delta = () => {
    const v = parseWNum(amt.value);
    $w('ws-delta').textContent = (cur && isFinite(v)) ? 'จากครั้งก่อน ' + wm(wSigned(v - cur.value)) : '';
  };
  amt.addEventListener('input', delta);
  wBind('ws-cancel', 'click', closeWSheet);
  wBind('ws-save', 'click', () => saveBalance(accId));
  wBind('ws-itemize', 'click', () => { closeWSheet(); openHoldings(accId); });
  wBind('ws-hide', 'click', () => askHideAccount(accId));
  amt.addEventListener('keydown', ev => { if(ev.key === 'Enter'){ ev.preventDefault(); saveBalance(accId); } });
}
async function saveBalance(accId){
  const a = findWAccount(accId);
  if(!a){ closeWSheet(); return; }
  const v = parseWNum($w('ws-amount').value), date = $w('ws-date').value;
  if(!isFinite(v)) return wErr('ใส่ยอดเป็นตัวเลข', 'ws-amount');
  if(v < 0) return wErr('ใส่ยอดตั้งแต่ 0 ขึ้นไป', 'ws-amount');
  if(!ISO_DATE_RE.test(date) || date > todayISO()) return wErr('เลือกวันที่ไม่เกินวันนี้', 'ws-date');
  const stamp = nowISO();
  const same = wLive(state.balances).find(b => b.accountId === accId && b.date === date);
  if(same){ same.value = round2(v); same.updatedAt = stamp; }
  else state.balances.push({ id: 'bal-' + genId(), accountId: accId, date, value: round2(v), updatedAt: stamp, deleted: false });
  a.updatedAt = stamp;
  closeWSheet();
  await wealthCommit();
}
function askHideAccount(accId){
  const a = findWAccount(accId);
  if(!a) return;
  openConfirm({
    title: 'ซ่อนบัญชีนี้ไหม?', desc: `${a.name} จะไม่นับในความมั่งคั่งสุทธิ แสดงกลับได้ที่ท้ายหน้า`, confirmLabel: 'ซ่อน',
    onConfirm: async () => {
      a.archived = true; a.updatedAt = nowISO();
      if(wSheetOpen()) { wSheetRestore = null; closeWSheet(); }
      if(wealthView === accId) wealthView = null;
      await wealthCommit();
    }
  });
}
async function unhideAccount(accId){
  const a = findWAccount(accId);
  if(!a) return;
  a.archived = false; a.updatedAt = nowISO();
  await wealthCommit();
}

/* ----- A manual debt ----- */
function openLiabilitySheet(l, opener){
  const today = todayISO();
  const html = wSheetHead(l.name, 'หนี้') +
    `<label for="ws-amount" class="w-lab" style="margin-top:4px;">ยอดค้างตอนนี้</label>
    <input id="ws-amount" class="w-big" inputmode="decimal" autocomplete="off" value="${wealthHidden ? '' : wEsc(wNum(l.balance))}" placeholder="${wealthHidden ? '••••' : '0'}" aria-describedby="ws-delta ws-err">
    <div class="w-delta" id="ws-delta" aria-live="polite"></div>
    <label for="ws-date">วันที่</label>
    <input type="date" id="ws-date" value="${today}" max="${today}">
    <div class="field-error" id="ws-err" role="alert"></div>` +
    W_CANCEL_SAVE() + '<button type="button" class="link-danger" id="ws-del">ลบหนี้นี้</button>';
  openWSheet(html, { focus: '#ws-amount', restore: opener });
  $w('ws-amount').addEventListener('input', () => {
    const v = parseWNum($w('ws-amount').value);
    $w('ws-delta').textContent = isFinite(v) ? 'จากครั้งก่อน ' + wm(wSigned(v - l.balance)) : '';
  });
  wBind('ws-cancel', 'click', closeWSheet);
  wBind('ws-save', 'click', async () => {
    const v = parseWNum($w('ws-amount').value), date = $w('ws-date').value;
    if(!isFinite(v) || v < 0) return wErr('ใส่ยอดเป็นตัวเลข 0 ขึ้นไป', 'ws-amount');
    if(!ISO_DATE_RE.test(date) || date > todayISO()) return wErr('เลือกวันที่ไม่เกินวันนี้', 'ws-date');
    l.balance = round2(v); l.date = date; l.updatedAt = nowISO();
    closeWSheet();
    await wealthCommit();
  });
  wBind('ws-del', 'click', () => openConfirm({
    title: 'ลบหนี้นี้ไหม?', desc: l.name, confirmLabel: 'ลบ',
    onConfirm: async () => { l.deleted = true; l.updatedAt = nowISO(); wSheetRestore = null; closeWSheet(); await wealthCommit(); }
  }));
}

/* ----- A derived debt: show the app's number, let the owner put a real one over it ----- */
function openDebtSheet(id, opener){
  const sum = wealthSummaryNow();
  const d = sum.debts.find(x => x.id === id);
  if(!d) return;
  if(!d.auto){ const l = state.liabilities.find(x => 'liab:' + x.id === id && !x.deleted); if(l) openLiabilitySheet(l, opener); return; }
  const why = d.kind === 'inst' ? 'คำนวณจากงวดผ่อน' : d.kind === 'repay' ? 'คำนวณจากรายการที่จดด้วยบัตร' : 'คำนวณจากรายการและรอบบิล';
  let meta = '';
  if(d.kind === 'inst'){
    const m = d.meta;
    meta = `<div class="m">เดือนละ ${wm(fmt(m.monthly))} งวดที่ ${m.termNo} จาก ${m.total} ผ่อนถึง ${wEsc(thaiMonthYear(m.end))}</div>`;
  }else if(d.kind === 'repay') meta = '<div class="m">ค้างตั้งแต่โอนคืนครั้งล่าสุด</div>';
  else meta = '<div class="m">ยอดที่ยังไม่ได้จ่ายกับรอบนี้</div>';
  const ov = d.overridden;
  const html = wSheetHead(d.name, '', `<span class="w-pill">${ov ? 'ยอดจริง' : 'อัตโนมัติ'}</span>`) +
    `<div class="w-box"><div class="k">${why}</div><div class="v">${wm(wMoney(d.derivedBalance))}</div>${meta}</div>` +
    (ov ? `<div class="w-delta" style="margin:0 0 10px;">ตอนนี้ใช้ยอดจริง ${wm(wMoney(d.balance))} ${wEsc(wAgeText(d.asOf))}</div>` : '') +
    '<div class="field-hint">ยอดจากแอปคิดจากรายการที่จดไว้ ถ้ายอดจริงต่างไป เช่น ปิดบางส่วนหรือมีดอกเบี้ย ใส่ยอดจริงทับได้</div>' +
    `<label for="ws-real" class="w-lab">ยอดจริงจากธนาคาร (ไม่ใส่ก็ได้)</label>
    <input id="ws-real" class="w-big" style="font-size:22px; min-height:52px;" inputmode="decimal" autocomplete="off" placeholder="${wealthHidden ? '••••' : wEsc(wNum(d.derivedBalance))}" aria-describedby="ws-err">
    <div class="field-error" id="ws-err" role="alert"></div>
    <div class="modal-actions"><button type="button" class="secondary" id="ws-useapp">ใช้ยอดจากแอป</button><button type="button" id="ws-saveReal">บันทึกยอดจริง</button></div>`;
  openWSheet(html, { focus: '#ws-real', restore: opener });
  wBind('ws-useapp', 'click', async () => {
    if(state.debtOverrides[id]) delete state.debtOverrides[id];
    closeWSheet();
    await wealthCommit();
  });
  wBind('ws-saveReal', 'click', async () => {
    const v = parseWNum($w('ws-real').value);
    if(!isFinite(v) || v < 0) return wErr('ใส่ยอดจริงเป็นตัวเลข 0 ขึ้นไป', 'ws-real');
    state.debtOverrides[id] = { balance: round2(v), date: todayISO(), updatedAt: nowISO() };
    closeWSheet();
    await wealthCommit();
  });
  $w('ws-real').addEventListener('keydown', ev => { if(ev.key === 'Enter'){ ev.preventDefault(); $w('ws-saveReal').click(); } });
}

/* ----- Add an account ----- */
function openAddSheet(opener){
  let kind = 'cash';
  const KINDS = [{ v:'cash', label:'เงินในบัญชี' }, { v:'invest', label:'เงินลงทุน' }, { v:'debt', label:'หนี้' }];
  const html = wSheetHead('เพิ่มบัญชี') +
    '<div class="w-lab" id="ws-typeLab">ประเภท</div>' + wRadioHtml('ws-typeLab', KINDS, kind, 'w-seg3') +
    `<label for="ws-name" class="w-lab" id="ws-nameLab">ชื่อบัญชี</label>
    <input id="ws-name" maxlength="40" autocomplete="off" aria-describedby="ws-err">
    <label for="ws-amount" class="w-lab" id="ws-amtLab">ยอดตอนนี้</label>
    <input id="ws-amount" class="w-big" inputmode="decimal" autocomplete="off" placeholder="0" aria-describedby="ws-hint ws-err">
    <div class="field-hint" id="ws-hint"></div>
    <div class="field-error" id="ws-err" role="alert"></div>` + W_CANCEL_SAVE('เพิ่ม');
  openWSheet(html, { focus: '#ws-name', restore: opener });
  const sync = () => {
    $w('ws-nameLab').textContent = kind === 'debt' ? 'ชื่อหนี้' : 'ชื่อบัญชี';
    $w('ws-name').placeholder = kind === 'cash' ? 'เช่น กสิกร ออมทรัพย์' : kind === 'invest' ? 'เช่น กองทุน RMF' : 'เช่น สินเชื่อบ้าน';
    $w('ws-amtLab').textContent = kind === 'debt' ? 'ยอดค้างตอนนี้' : kind === 'invest' ? 'ยอดตอนนี้ (ไม่ใส่ก็ได้)' : 'ยอดตอนนี้';
    $w('ws-hint').textContent = kind === 'debt' ? 'ครั้งต่อไปแค่แตะหนี้แล้วใส่ยอดใหม่'
      : kind === 'invest' ? 'ครั้งต่อไปแค่แตะบัญชีแล้วใส่ยอดใหม่ แอปจะเก็บประวัติไว้วาดกราฟ ถ้าจะจดเป็นรายตัว (หุ้น กองทุน ทอง) ไม่ต้องใส่ยอด'
      : 'ครั้งต่อไปแค่แตะบัญชีแล้วใส่ยอดใหม่ แอปจะเก็บประวัติไว้วาดกราฟ';
  };
  sync();
  wRadioBind($w('wSheetCard').querySelector('[role=radiogroup]'), v => { kind = v; sync(); });
  wBind('ws-cancel', 'click', closeWSheet);
  wBind('ws-save', 'click', async () => {
    const name = $w('ws-name').value.trim();
    const raw = $w('ws-amount').value.trim();
    const v = parseWNum(raw);
    if(!name) return wErr(kind === 'debt' ? 'ใส่ชื่อหนี้ก่อน' : 'ใส่ชื่อบัญชีก่อน', 'ws-name');
    const optional = kind === 'invest' && raw === '';
    if(!optional && (!isFinite(v) || v < 0)) return wErr('ใส่ยอดเป็นตัวเลข 0 ขึ้นไป', 'ws-amount');
    const stamp = nowISO(), today = todayISO();
    let openId = null;
    if(kind === 'debt'){
      state.liabilities.push({ id: 'liab-' + genId(), name, date: today, balance: round2(v), updatedAt: stamp, deleted: false });
    }else{
      const id = 'acc-' + genId();
      const order = wLive(state.accounts).reduce((m, x) => Math.max(m, x.sortOrder || 0), 0) + 1;
      state.accounts.push({ id, name, group: kind, archived: false, sortOrder: order, updatedAt: stamp, deleted: false });
      if(!optional) state.balances.push({ id: 'bal-' + genId(), accountId: id, date: today, value: round2(v), updatedAt: stamp, deleted: false });
      else openId = id;
    }
    wSheetRestore = null;
    closeWSheet();
    if(openId) wealthView = openId;
    await wealthCommit();
    if(openId) window.scrollTo(0, 0);
  });
  $w('ws-amount').addEventListener('keydown', ev => { if(ev.key === 'Enter'){ ev.preventDefault(); $w('ws-save').click(); } });
}

/* ----- Add / edit one holding ----- */
const HOLD_COPY = {
  th_stock:      { sym:'ชื่อย่อหุ้น', ph:'เช่น PTT',      units:'จำนวนหุ้น',    price:'ราคาตอนนี้ต่อหุ้น' },
  foreign_stock: { sym:'ชื่อย่อหุ้น', ph:'เช่น VOO',      units:'จำนวนหุ้น',    price:'ราคาตอนนี้ต่อหุ้น' },
  fund:          { sym:'ชื่อกองทุน',  ph:'เช่น K-FIXED', units:'จำนวนหน่วย',  price:'NAV ตอนนี้ต่อหน่วย' },
  gold:          { units:'น้ำหนักทอง', price:'ราคาทองตอนนี้บาทละ' },
  crypto:        { sym:'เหรียญ',      ph:'เช่น BTC',      units:'จำนวนเหรียญ', price:'ราคาตอนนี้ต่อเหรียญ' }
};
function currencyOptionsHtml(sel){
  return CURRENCIES.map(c => `<option value="${c.code}"${c.code === sel ? ' selected' : ''}>${c.code} ${wEsc(c.name)}</option>`).join('');
}
function openHoldingSheet(accId, holdingId, opener){
  const acc = findWAccount(accId);
  if(!acc) return;
  const edit = holdingId ? state.holdings.find(x => x.id === holdingId && !x.deleted) : null;
  if(holdingId && !edit) return;
  let type = edit ? edit.assetType : 'th_stock';
  let gunit = edit && edit.unit === 'baht' ? 'baht' : 'gram';
  const TYPES = ASSET_TYPES.map(t => ({ v:t, label:ASSET_LABEL[t] }));
  const curDefault = t => t === 'foreign_stock' ? 'USD' : 'THB';
  const html = wSheetHead(edit ? holdingName(edit) : 'เพิ่มตัว', edit ? ASSET_LABEL[edit.assetType] : acc.name) +
    (edit ? '' : '<div class="w-lab" id="ws-typeLab">ประเภท</div>' + wRadioHtml('ws-typeLab', TYPES, type, 'w-seg3')) +
    `<div id="ws-symWrap"${edit ? ' hidden' : ''}><label for="ws-sym" class="w-lab" id="ws-symLab"></label><input id="ws-sym" maxlength="24" autocomplete="off" autocapitalize="characters" aria-describedby="ws-err"></div>
    <div id="ws-gunitWrap" hidden><div class="w-lab" id="ws-gunitLab">นับเป็น</div>${wRadioHtml('ws-gunitLab', [{ v:'gram', label:'กรัม' }, { v:'baht', label:'บาท' }], gunit, 'w-seg2')}</div>
    <label for="ws-units" class="w-lab" id="ws-unitsLab"></label>
    <input id="ws-units" inputmode="decimal" autocomplete="off" aria-describedby="ws-err">
    <label for="ws-cost" class="w-lab">ต้นทุนรวม (ไม่ใส่ก็ได้)</label>
    <div class="rate-row" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);"><input id="ws-cost" inputmode="decimal" autocomplete="off" aria-label="ต้นทุนรวม" style="margin:0;"><select id="ws-cur" aria-label="สกุลเงิน" style="margin:0;"></select></div>
    ${edit ? '' : `<label for="ws-price" class="w-lab" id="ws-priceLab" style="margin-top:4px;"></label><input id="ws-price" inputmode="decimal" autocomplete="off" aria-describedby="ws-err">
    <div id="ws-fxWrap" hidden><div class="w-fx-row"><label for="ws-fx" id="ws-fxLab"></label><input id="ws-fx" inputmode="decimal" autocomplete="off" aria-label="เรตแลกเงิน"></div></div>`}
    <div class="field-error" id="ws-err" role="alert"></div>` + W_CANCEL_SAVE(edit ? 'บันทึก' : 'เพิ่ม') +
    (edit ? '<button type="button" class="link-danger" id="ws-del">ลบรายการนี้</button>' : '');
  openWSheet(html, { focus: edit ? '#ws-units' : '#ws-sym', restore: opener });
  const sync = () => {
    const c = HOLD_COPY[type];
    $w('ws-symWrap').hidden = !!edit || type === 'gold';
    if(!edit && type !== 'gold'){ $w('ws-symLab').textContent = c.sym; $w('ws-sym').placeholder = c.ph; }
    $w('ws-gunitWrap').hidden = type !== 'gold';
    $w('ws-unitsLab').textContent = c.units;
    if(!edit){ $w('ws-priceLab').textContent = c.price + ' (ไม่ใส่ก็ได้)'; }
    const curSel = $w('ws-cur');
    if(type === 'gold'){ curSel.value = 'THB'; curSel.disabled = true; } else curSel.disabled = false;
    syncFx();
  };
  const syncFx = () => {
    const w = $w('ws-fxWrap'); if(!w) return;
    const cur = $w('ws-cur').value;
    const need = cur !== 'THB' && !fxRate(state.fxCache, cur);
    w.hidden = !need;
    if(need) $w('ws-fxLab').textContent = `1 ${cur} = ฿`;
  };
  $w('ws-cur').innerHTML = currencyOptionsHtml(edit ? edit.currency : curDefault(type));
  if(edit){
    $w('ws-units').value = wNum(edit.units).replace(/,/g, '');
    $w('ws-cost').value = edit.cost ? wInputNum(edit.cost) : '';
  }
  sync();
  $w('ws-cur').addEventListener('change', syncFx);
  const groups = $w('wSheetCard').querySelectorAll('[role=radiogroup]');
  if(!edit){
    wRadioBind(groups[0], v => { type = v; $w('ws-cur').value = curDefault(v); sync(); });
    wRadioBind(groups[1], v => { gunit = v; });
  }else if(type === 'gold'){
    wRadioBind(groups[0], v => { gunit = v; });
  }
  wBind('ws-cancel', 'click', closeWSheet);
  wBind('ws-del', 'click', () => openConfirm({
    title: 'ลบรายการนี้ไหม?', desc: holdingName(edit), confirmLabel: 'ลบ',
    onConfirm: async () => { edit.deleted = true; edit.updatedAt = nowISO(); wSheetRestore = null; closeWSheet(); await wealthCommit(); }
  }));
  wBind('ws-save', 'click', async () => {
    const units = parseWNum($w('ws-units').value);
    const costRaw = $w('ws-cost').value.trim();
    const cost = costRaw === '' ? 0 : parseWNum(costRaw);
    const cur = type === 'gold' ? 'THB' : $w('ws-cur').value;
    let symbol = edit ? edit.symbol : (type === 'gold' ? 'GOLD' : $w('ws-sym').value.trim().toUpperCase());
    if(!symbol) return wErr(type === 'fund' ? 'ใส่ชื่อกองทุนก่อน' : type === 'crypto' ? 'ใส่ชื่อเหรียญก่อน' : 'ใส่ชื่อย่อก่อน', 'ws-sym');
    if(!isFinite(units) || !(units > 0)) return wErr('ใส่จำนวนมากกว่า 0', 'ws-units');
    if(!isFinite(cost) || cost < 0) return wErr('ใส่ต้นทุนเป็นตัวเลข 0 ขึ้นไป', 'ws-cost');
    const stamp = nowISO();
    if(edit){
      edit.units = units; edit.cost = round2(cost); edit.currency = cur; edit.updatedAt = stamp;
      if(type === 'gold') edit.unit = gunit;
    }else{
      const price = $w('ws-price').value.trim() === '' ? null : parseWNum($w('ws-price').value);
      if(price !== null && (!isFinite(price) || !(price > 0))) return wErr('ใส่ราคามากกว่า 0', 'ws-price');
      const fxv = $w('ws-fxWrap').hidden || $w('ws-fx').value.trim() === '' ? null : parseWNum($w('ws-fx').value);
      if(fxv !== null && (!isFinite(fxv) || !(fxv > 0))) return wErr('ใส่เรตมากกว่า 0', 'ws-fx');
      const h = { id: 'hold-' + genId(), accountId: accId, assetType: type, symbol, units, cost: round2(cost), currency: cur, updatedAt: stamp, deleted: false };
      if(type === 'gold') h.unit = gunit;
      state.holdings.push(h);
      if(price !== null) setManualPrice(state.priceCache, priceKey(type, symbol), price, cur, stamp);
      if(fxv !== null) setManualFx(state.fxCache, cur, fxv, stamp);
    }
    acc.updatedAt = stamp;
    wSheetRestore = null;
    closeWSheet();
    await wealthCommit();
  });
}

/* ----- Update prices for a whole account ----- */
function openPriceSheet(accId, opener){
  const acc = findWAccount(accId);
  if(!acc) return;
  const hs = liveHoldingsOf(accId);
  const seen = new Set(), items = [];
  hs.forEach(h => {
    const key = priceKey(h.assetType, h.symbol);
    if(seen.has(key)) return;
    seen.add(key);
    items.push({ key, h, p: effectivePrice(state.priceCache, key) });
  });
  const curs = [...new Set(hs.map(h => h.currency).filter(c => c && c !== 'THB'))];
  const priceRow = (it, i) => {
    const manual = it.p && it.p.source === 'manual';
    const old = it.p ? (it.h.assetType === 'gold' ? 'เดิม บาทละ ' : 'เดิม ') + wm(wPrice(it.p.price, it.p.currency)) : 'ยังไม่มีราคา';
    return `<div class="w-price"><div class="w-price-row"><label for="ws-p${i}">${wEsc(holdingName(it.h))}<span>${old}${manual ? ' <b class="w-pill">ราคาที่ใส่เอง</b>' : ''}</span></label>
      <input id="ws-p${i}" data-key="${wEsc(it.key)}" inputmode="decimal" autocomplete="off" value="${it.p && !wealthHidden ? wInputNum(it.p.price) : ''}" placeholder="${wealthHidden ? '••••' : '0'}" aria-label="ราคาใหม่ ${wEsc(holdingName(it.h))}"></div>
      ${manual ? `<div class="w-clear-row"><button type="button" class="w-clear" data-clear="${wEsc(it.key)}">ใช้ราคาอัตโนมัติ</button></div>` : ''}</div>`;
  };
  const fxRow = (cur, i) => {
    const e = state.fxCache[cur];
    const stale = e && isStale(e.at, todayISO(), STALE_FX_DAYS);
    return `<div class="w-fx-row"><label for="ws-fx${i}">1 ${cur} = ฿</label><input id="ws-fx${i}" data-cur="${cur}" inputmode="decimal" autocomplete="off" value="${e && !wealthHidden ? wInputNum(e.thb) : ''}" placeholder="${wealthHidden ? '••••' : '0'}"></div>
      <div class="w-delta" style="margin:-4px 0 10px;">${e ? 'เดิม ' + wm('฿' + wInputNum(e.thb)) + ' ' + wEsc(wAgeText(dayOfStamp(e.at))) + (stale ? ' ข้อมูลเก่า' : '') : 'ยังไม่มีเรต ต้องใส่ถึงจะนับมูลค่า'}</div>`;
  };
  const html = wSheetHead('อัปเดตราคา', acc.name) +
    items.map(priceRow).join('') +
    (curs.length ? '<div class="w-sheet-h">เรตแลกเงิน</div>' + curs.map(fxRow).join('') : '') +
    '<div class="field-error" id="ws-err" role="alert"></div>' + W_CANCEL_SAVE('บันทึกราคา');
  openWSheet(html, { focus: '#ws-p0', restore: opener });
  wBind('ws-cancel', 'click', closeWSheet);
  $w('wSheetCard').querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.clear;
    const e = state.priceCache[key];
    const doClear = async () => {
      clearManualPrice(state.priceCache, key);
      await wealthCommit();
      openPriceSheet(accId, wSheetRestore || opener);
    };
    if(e && e.auto) doClear();
    else openConfirm({ title: 'ล้างราคาที่ใส่เองไหม?', desc: 'ตอนนี้ยังไม่มีราคาอัตโนมัติ มูลค่าตัวนี้จะเป็น 0 จนกว่าจะใส่ราคาใหม่', confirmLabel: 'ล้าง', onConfirm: doClear });
  }));
  wBind('ws-save', 'click', async () => {
    const stamp = nowISO();
    const changes = [];
    for(const inp of $w('wSheetCard').querySelectorAll('input[data-key]')){
      const raw = inp.value.trim();
      if(raw === '') continue;
      const v = parseWNum(raw);
      if(!isFinite(v) || !(v > 0)){ inp.setAttribute('aria-invalid', 'true'); $w('ws-err').textContent = 'ใส่ราคามากกว่า 0'; inp.focus(); return; }
      const it = items.find(x => x.key === inp.dataset.key);
      if(!it.p || Math.abs(it.p.price - v) > 1e-9) changes.push(() => setManualPrice(state.priceCache, it.key, v, it.h.currency, stamp));
    }
    for(const inp of $w('wSheetCard').querySelectorAll('input[data-cur]')){
      const raw = inp.value.trim();
      if(raw === '') continue;
      const v = parseWNum(raw);
      if(!isFinite(v) || !(v > 0)){ inp.setAttribute('aria-invalid', 'true'); $w('ws-err').textContent = 'ใส่เรตมากกว่า 0'; inp.focus(); return; }
      const e = state.fxCache[inp.dataset.cur];
      if(!e || Math.abs(e.thb - v) > 1e-9) changes.push(() => setManualFx(state.fxCache, inp.dataset.cur, v, stamp));
    }
    closeWSheet();
    if(!changes.length) return;
    changes.forEach(f => f());
    await wealthCommit();
  });
}

/* ---------- Events ---------- */
function setWealthHidden(on){
  wealthHidden = !!on;
  try{ localStorage.setItem(WEALTH_HIDE_KEY, wealthHidden ? '1' : '0'); }catch(e){}
  renderWealth();
}
function wealthClick(ev){
  const t = ev.target.closest('[data-act]');
  if(!t) return;
  const act = t.dataset.act, id = t.dataset.id;
  if(act === 'acct'){
    const a = findWAccount(id);
    if(!a) return;
    if(a.group === 'invest' && liveHoldingsOf(id).length) openHoldings(id); else openBalanceSheet(id, t);
  }
  else if(act === 'debt') openDebtSheet(id, t);
  else if(act === 'add') openAddSheet(t);
  else if(act === 'unhide') unhideAccount(id);
  else if(act === 'back') wealthBack();
  else if(act === 'hold-add') openHoldingSheet(wealthView, null, t);
  else if(act === 'hold-edit') openHoldingSheet(wealthView, id, t);
  else if(act === 'hold-prices') openPriceSheet(wealthView, t);
  else if(act === 'hide-acct') askHideAccount(id);
  else if(act === 'price-fetch') refreshPrices({ auto: false });
  else if(act === 'price-settings') goToPriceSettings();
}
function setupWealthUi(){
  $w('wealthEyeBtn').addEventListener('click', () => setWealthHidden(!wealthHidden));
  $w('panel-wealth').addEventListener('click', wealthClick);
  setupPriceSettings();
}
function anyOverlayOpen(){
  return ['wSheetOverlay','confirmModalOverlay','cardPayOverlay','tripModalOverlay','tripSheetOverlay','editModalOverlay','infoModalOverlay'].some(id => { const e = $w(id); return e && e.style.display !== 'none'; });
}
// Capture phase: Escape closes the wealth sheet (or the holdings page) before the app's other Escape handler sees it.
document.addEventListener('keydown', ev => {
  if(ev.key === 'Escape'){
    const confirmOpen = $w('confirmModalOverlay').style.display !== 'none';
    if(confirmOpen) return;
    if(wSheetOpen()){ ev.stopImmediatePropagation(); closeWSheet(); return; }
    if(wealthView && activeTab === 'wealth' && !anyOverlayOpen()){ ev.stopImmediatePropagation(); wealthBack(); }
    return;
  }
  if(ev.key === 'Tab' && wSheetOpen() && $w('confirmModalOverlay').style.display === 'none'){
    const ov = $w('wSheetOverlay');
    const f = [...ov.querySelectorAll('input, button, select')].filter(x => !x.disabled && !x.hidden && !x.closest('[hidden]') && x.tabIndex >= 0);
    if(!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if(!ov.contains(document.activeElement)){ ev.preventDefault(); first.focus(); }
    else if(ev.shiftKey && document.activeElement === first){ ev.preventDefault(); last.focus(); }
    else if(!ev.shiftKey && document.activeElement === last){ ev.preventDefault(); first.focus(); }
  }
}, true);
