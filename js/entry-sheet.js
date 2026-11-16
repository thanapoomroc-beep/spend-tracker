/* ---------- Entry sheet: the วันนี้ form as a bottom sheet with an in-app number keypad ---------- */

// Pure: the amount string after one key press. Keys: '0'..'9', '.', 'Backspace'.
// One dot, at most 2 decimals, no leading zeros, at most 9 integer digits.
function amountKey(value, key){
  value = String(value == null ? '' : value);
  if(key === 'Backspace') return value.slice(0, -1);
  if(key === '.') return value.includes('.') ? value : (value === '' ? '0' : value) + '.';
  if(!/^[0-9]$/.test(key)) return value;
  const dot = value.indexOf('.');
  if(dot >= 0) return value.length - dot - 1 >= 2 ? value : value + key;
  if(value === '0') return key;
  return value.length >= 9 ? value : value + key;
}

let entrySheetOpener = null;
function entrySheetOpen(){
  const o = document.getElementById('entrySheetOverlay');
  return !!o && o.style.display !== 'none';
}

// Amount display: currency prefix (or the 元 suffix for CNY) and the save button label.
function updateSaveLabel(){
  const btn = document.getElementById('addEntryBtn');
  if(!btn) return;
  const cur = formCurrency();
  const a = parseFloat(document.getElementById('entryAmount').value);
  btn.textContent = a > 0 ? 'บันทึก ' + fmtCur(a, cur) : 'บันทึก';
  const pre = document.getElementById('amtPre'), suf = document.getElementById('amtSuf');
  if(cur === 'CNY'){ pre.textContent = ''; suf.textContent = '元'; }
  else{ pre.textContent = cur === 'THB' ? '฿' : curInfo(cur).sym; suf.textContent = ''; }
  const el = document.getElementById('entryAmount');
  el.style.width = (Math.max(el.value.length, 1) + 0.3) + 'ch';
  el.parentNode.dataset.size = el.value.length > 10 ? 's' : el.value.length > 7 ? 'm' : '';
  const live = document.getElementById('amtLive');
  if(live) live.textContent = a > 0 ? 'จำนวนเงิน ' + fmtCur(a, cur) : 'ยังไม่ใส่จำนวนเงิน';
}

function syncEntryTitle(){
  const t = activeTrip();
  document.getElementById('entrySheetTitle').textContent = t ? 'จดในทริป' : 'จดรายจ่าย';
  document.getElementById('addFabTxt').textContent = t ? 'จดในทริป' : 'จดรายจ่าย';
}

// The + button shows only on วันนี้, and not while the sheet is open. body.fab-on lifts the toast above it.
function syncFab(){
  const on = activeTab === 'today' && !tripPageId && !entrySheetOpen();
  document.body.classList.toggle('fab-on', on);
  document.body.classList.toggle('es-open', entrySheetOpen());
}

// Pin the sheet to the visible part of the page (above the iOS keyboard) while a text field has focus.
function syncKbOff(){
  const vv = window.visualViewport;
  const off = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
  const root = document.documentElement.style;
  root.setProperty('--kb-off', off + 'px');
  root.setProperty('--es-h', (vv ? Math.round(vv.height) : window.innerHeight) + 'px');
}

function openEntrySheet(opener){
  if(entrySheetOpen()) return;
  entrySheetOpener = opener || document.activeElement || null;
  renderForm();
  syncEntryTitle();
  const ov = document.getElementById('entrySheetOverlay');
  ov.classList.remove('es-typing');
  ov.style.display = 'flex';
  syncKbOff();
  updateSaveLabel();
  syncFab();
  const a = document.getElementById('entryAmount');
  a.focus({ preventScroll:true });
}
function closeEntrySheet(){
  if(!entrySheetOpen()) return;
  document.getElementById('entrySheetOverlay').style.display = 'none';
  document.getElementById('entrySheetOverlay').classList.remove('es-typing');
  syncFab();
  const o = entrySheetOpener;
  entrySheetOpener = null;
  const target = o && document.body.contains(o) && o.offsetParent !== null ? o : document.getElementById('addFab');
  if(target && target.focus) target.focus({ preventScroll:true });
}

function pressAmountKey(key){
  const el = document.getElementById('entryAmount');
  const next = amountKey(el.value, key);
  if(next === el.value) return;
  el.value = next;
  el.dispatchEvent(new Event('input', { bubbles:true }));
}

function setupEntrySheet(){
  document.querySelectorAll('#keypad button').forEach(b=>{
    // keep focus where it is, so a physical keyboard keeps working after a tap
    b.addEventListener('mousedown', ev => ev.preventDefault());
    b.addEventListener('click', ()=> pressAmountKey(b.dataset.k));
  });
  document.getElementById('entryAmount').addEventListener('input', ()=>{ updateConv(); updateSaveLabel(); });
  const card = document.getElementById('entryCard');
  const ov = document.getElementById('entrySheetOverlay');
  // The note and date open the system keyboard: hide the keypad so the save button stays above it.
  const typing = el => !!el && (el.id === 'entryNote' || el.id === 'entryDate');
  // After the keyboard has opened, bring the field into view inside the sheet's own scroll area.
  const reveal = ()=>{ const a = document.activeElement; if(typing(a) && entrySheetOpen()) a.scrollIntoView({ block:'nearest' }); };
  card.addEventListener('focusin', ev=>{ ov.classList.toggle('es-typing', typing(ev.target)); syncKbOff(); if(typing(ev.target)) setTimeout(reveal, 350); });
  card.addEventListener('focusout', ()=>{ setTimeout(()=>{ if(!typing(document.activeElement)) ov.classList.remove('es-typing'); syncKbOff(); }, 100); });
  if(window.visualViewport){
    visualViewport.addEventListener('resize', ()=>{ syncKbOff(); setTimeout(reveal, 50); });
    visualViewport.addEventListener('scroll', syncKbOff);
  }
  updateSaveLabel();
  syncFab();
}

// Capture phase: Tab stays inside the open sheet; digits, dot, Backspace and Enter work from a physical keyboard.
document.addEventListener('keydown', ev=>{
  if(!entrySheetOpen()) return;
  const ov = document.getElementById('entrySheetOverlay');
  if(ev.key === 'Tab'){
    if(ev.defaultPrevented) return;
    const f = [...ov.querySelectorAll('input, button, select, summary')].filter(x => !x.disabled && !x.hidden && !x.closest('[hidden]') && x.tabIndex >= 0 && x.offsetParent !== null);
    if(!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if(!ov.contains(document.activeElement)){ ev.preventDefault(); first.focus(); }
    else if(ev.shiftKey && document.activeElement === first){ ev.preventDefault(); last.focus(); }
    else if(!ev.shiftKey && document.activeElement === last){ ev.preventDefault(); first.focus(); }
    return;
  }
  if(ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const t = ev.target;
  const tag = t && t.tagName;
  // typing into any other field (note, date, split, the link select) keeps its own behaviour
  if(tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && t.id !== 'entryAmount')) return;
  if(/^[0-9]$/.test(ev.key) || ev.key === '.' || ev.key === 'Backspace'){
    ev.preventDefault();
    pressAmountKey(ev.key);
  }else if(ev.key === 'Enter' && tag !== 'BUTTON' && tag !== 'SUMMARY'){
    ev.preventDefault();
    addEntry();
  }
}, true);
