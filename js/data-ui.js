function exportData(){
  const json = JSON.stringify(state, null, 2), name = `spend-tracker-backup-${todayISO()}.json`;
  // Share sheet first (Files / iCloud Drive on iPhone); no await before share(), it needs the tap's user activation.
  if(cbCanShareFiles()){
    try{
      const file = new File([json], name, {type:'application/json'});
      navigator.share({files:[file]}).then(noteExportDone, err=>{
        if(err && err.name === 'AbortError') return;   // the owner closed the sheet
        downloadBackupFile(json, name);
      });
      return;
    }catch(e){ /* fall through to the download */ }
  }
  downloadBackupFile(json, name);
}
function downloadBackupFile(json, name){
  const blob = new Blob([json], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  noteExportDone();
}

async function importData(event){
  const input = event.target;
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    input.value = '';
    let parsed;
    try{
      parsed = JSON.parse(e.target.result);
    }catch(err){
      flashToast('อ่านไฟล์นี้ไม่ได้ ลองเช็กไฟล์อีกที', false);
      return;
    }
    if(!parsed || (!parsed.settings && !parsed.monthlySettings) || !Array.isArray(parsed.entries)){
      flashToast('ไฟล์นี้ใช้เป็นไฟล์สำรองไม่ได้', false);
      return;
    }
    openConfirm({
      title: 'นำเข้าไฟล์นี้ไหม?',
      desc: 'ข้อมูลในไฟล์จะแทนข้อมูลที่มีตอนนี้ทั้งหมด',
      confirmLabel: 'นำเข้า',
      onConfirm: async ()=>{
        const prev = state;
        try{
          state = migrateState(parsed);
        }catch(err){
          flashToast('อ่านไฟล์นี้ไม่ได้ ลองเช็กไฟล์อีกที', false);
          return;
        }
        await saveData();
        initForm();
        render();
        renderThresholds(); renderBriefingCard();
        flashToast('นำเข้าแล้ว', true, { label: 'เลิกทำ', onClick: ()=> restoreState(prev, 'เลิกทำแล้ว') });
      }
    });
  };
  reader.readAsText(file);
}

// Puts back a previous state object (undo for import, cloud restore and clear-all).
async function restoreState(prev, msg){
  state = prev;
  await saveData();
  initForm();
  render();
  renderThresholds(); renderBriefingCard();
  if(typeof renderCloudCard === 'function') renderCloudCard();
  flashToast(msg, true);
}

function clearAllData(){
  const c = cloudLoadConfig();
  let desc;
  if(c && c.enabled && c.lastOkAt && !c.dirty) desc = `กู้คืนได้จากสำรองออนไลน์ ล่าสุด ${cbWhen(c.lastOkAt)}`;
  else if(c && c.enabled) desc = 'ที่แก้ล่าสุดยังไม่ได้สำรองออนไลน์ ส่งออกไฟล์ก่อนดีกว่า';
  else desc = 'ล้างแล้วเอากลับมาไม่ได้ ส่งออกไฟล์สำรองก่อนดีกว่า';
  openConfirm({
    title: 'ล้างข้อมูลทั้งหมดไหม?',
    desc,
    confirmLabel: 'ล้างข้อมูล',
    onConfirm: ()=>{
      const prev = state;
      try{
        localStorage.removeItem(STORAGE_KEY);
      }catch(e){
        console.error('Clear error:', e);
      }
      state = freshState();
      initForm();
      render();
      renderThresholds(); renderBriefingCard();
      flashToast('ล้างข้อมูลแล้ว', true, { label: 'เลิกทำ', onClick: ()=> restoreState(prev, 'เลิกทำแล้ว') });
    }
  });
}

function setupUi(){
  initSettingsSections();
  document.getElementById('entryDate').addEventListener('input', updateDateSummary);
  document.getElementById('entryNote').addEventListener('input', updateDateSummary);
  document.querySelectorAll('[data-month-nav]').forEach(el => { el.innerHTML = MONTH_NAV_HTML; });
  document.querySelectorAll('#tabBar button').forEach(b => b.addEventListener('click', ()=> goTab(b.dataset.tab)));
  window.addEventListener('hashchange', syncFromHash);
  try{ if('scrollRestoration' in history) history.scrollRestoration = 'manual'; }catch(e){}
  // The bottom bar would float above the iOS keyboard: hide it while a field has focus.
  const isField = el => !!el && el.matches && el.matches('input:not([readonly]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]):not([type=range]), select, textarea');
  let kbTimer = null;
  document.addEventListener('focusin', ev=>{
    clearTimeout(kbTimer);
    document.body.classList.toggle('kb-open', isField(ev.target));
  });
  document.addEventListener('focusout', ()=>{
    clearTimeout(kbTimer);
    kbTimer = setTimeout(()=>{ if(!isField(document.activeElement)) document.body.classList.remove('kb-open'); }, 150);
  });
  setupEntrySheet();
  setupTripUi();
  setupWealthUi();
  setupCloudBackupUi();
  setupBriefingUi();
  setupSlipUi();
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) renderToday(); });
  try{ if(localStorage.getItem(TREND_KEY) === '12') trendRange = 12; }catch(e){}
  document.getElementById('trend6').setAttribute('aria-pressed', trendRange === 6 ? 'true' : 'false');
  document.getElementById('trend12').setAttribute('aria-pressed', trendRange === 12 ? 'true' : 'false');
  document.getElementById('trend6').addEventListener('click', ()=> setTrendRange(6));
  document.getElementById('trend12').addEventListener('click', ()=> setTrendRange(12));
  document.getElementById('entrySearch').addEventListener('input', ev=>{
    const v = ev.target.value;
    clearTimeout(filterTimer);
    filterTimer = setTimeout(()=>{ filterText = v; updateFilterSummary(); refreshEntryList(); }, 150);
  });
  document.getElementById('searchAllBtn').addEventListener('click', ()=>{ searchAll = !searchAll; updateFilterSummary(); refreshEntryList(); });
  document.getElementById('addPayBtn').addEventListener('click', addPay);
  document.getElementById('newPayName').addEventListener('keydown', ev=>{ if(ev.key === 'Enter'){ ev.preventDefault(); addPay(); } });
  document.getElementById('newPayName').addEventListener('input', ()=>{ setPayMsg(''); document.getElementById('newPayName').removeAttribute('aria-invalid'); });
  document.getElementById('addCatBtn').addEventListener('click', addCategory);
  document.getElementById('newCatName').addEventListener('keydown', ev=>{ if(ev.key === 'Enter'){ ev.preventDefault(); addCategory(); } });
  document.getElementById('newCatName').addEventListener('input', ()=>{ setCatMsg(''); document.getElementById('newCatName').removeAttribute('aria-invalid'); });
}

function setupTripUi(){
  const $ = id => document.getElementById(id);
  // radiogroup arrow keys: switch to the other option
  const arrows = (ev, fn)=>{ if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)){ ev.preventDefault(); fn(); } };
  $('kindSeg').querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', ()=> setKind(b.dataset.kind));
    b.addEventListener('keydown', ev=> arrows(ev, ()=> setKind(entryKind === 'trip' ? 'normal' : 'trip', true)));
  });
  $('splitMinus').addEventListener('click', ()=> setSplit(entrySplit - 1));
  $('splitPlus').addEventListener('click', ()=> setSplit(entrySplit + 1));
  $('splitN').addEventListener('change', ev=> setSplit(ev.target.value));
  $('entryLink').addEventListener('change', ev=>{ entryLink = ev.target.value; renderForm(); });
  // edit sheet
  $('editOrig').addEventListener('input', editRecalc);
  $('editSplitMinus').addEventListener('click', ()=> setEditSplit(editSplit - 1));
  $('editSplitPlus').addEventListener('click', ()=> setEditSplit(editSplit + 1));
  $('editSplitN').addEventListener('change', ev=> setEditSplit(ev.target.value));
  $('editLink').addEventListener('change', onEditLinkChange);
  // travel mode switch, banner, suggestion
  $('tripSwitchBtn').addEventListener('click', ()=> openTripSheet());
  $('tripOffBtn').addEventListener('click', ()=> setActiveTrip(null));
  $('tripBannerMain').addEventListener('click', ()=> openTripPage(state.activeTripId, $('tripBannerMain')));
  $('tripSuggestYes').addEventListener('click', ()=> setActiveTrip($('tripSuggest').dataset.id));
  $('tripSuggestNo').addEventListener('click', dismissSuggestion);
  $('tripNewBtn').addEventListener('click', ()=>{ const op = sheetOpener; closeTripSheet(false); openTripModal(null, op); });
  // trip modal
  $('tripCur').innerHTML = CURRENCIES.map(c => `<option value="${c.code}">${c.code} ${c.sym}${c.code === 'CNY' ? '' : ' ' + escapeHtml(c.name)}</option>`).join('');
  $('tripCur').addEventListener('change', ()=>{ syncRateLabels(); if($('tripCur').value !== 'THB'){ $('tripRateA').value = ''; $('tripRateB').value = ''; } });
  $('tripRateA').addEventListener('input', onRateA);
  $('tripRateB').addEventListener('input', onRateB);
  $('tripFund').querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', ()=> setTripFunding(b.dataset.fund));
    b.addEventListener('keydown', ev=> arrows(ev, ()=> setTripFunding(tripFunding === 'savings' ? 'income' : 'savings', true)));
  });
  $('tpBack').addEventListener('click', tripPageBack);
  $('tpEdit').addEventListener('click', ()=> openTripModal(tripPageId, $('tpEdit')));
  $('tpCsv').addEventListener('click', exportTripCsv);
  $('stripTripBtn').addEventListener('click', ()=> openMonthTrips($('stripTripBtn')));
  $('tripsNewBtn').addEventListener('click', ()=> openTripModal(null, $('tripsNewBtn')));
  $('tripSaveBtn').addEventListener('click', saveTrip);
  $('tripDeleteBtn').addEventListener('click', askDeleteTrip);
  $('tripName').addEventListener('input', ()=>{ $('tripNameErr').textContent = ''; $('tripName').removeAttribute('aria-invalid'); });
  ['tripStart','tripEnd'].forEach(i => $(i).addEventListener('input', ()=>{ $('tripDateErr').textContent = ''; }));
}

