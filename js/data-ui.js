function exportData(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spend-tracker-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
      desc: 'ข้อมูลที่มีตอนนี้จะถูกแทนด้วยข้อมูลในไฟล์',
      confirmLabel: 'นำเข้า',
      onConfirm: async ()=>{
        try{
          state = migrateState(parsed);
        }catch(err){
          flashToast('อ่านไฟล์นี้ไม่ได้ ลองเช็กไฟล์อีกที', false);
          return;
        }
        await saveData();
        initForm();
        render();
        flashToast('นำเข้าแล้ว', true);
      }
    });
  };
  reader.readAsText(file);
}

function clearAllData(){
  openConfirm({
    title: 'ล้างข้อมูลทั้งหมดไหม?',
    desc: 'ล้างแล้วเอากลับมาไม่ได้ ควรสำรองข้อมูลไว้ก่อน',
    confirmLabel: 'ล้างข้อมูล',
    onConfirm: ()=>{
      try{
        localStorage.removeItem(STORAGE_KEY);
      }catch(e){
        console.error('Clear error:', e);
      }
      state = freshState();
      initForm();
      render();
    }
  });
}

function setupUi(){
  document.getElementById('entryDate').addEventListener('input', updateDateSummary);
  document.getElementById('entryNote').addEventListener('input', updateDateSummary);
  document.querySelectorAll('[data-month-nav]').forEach(el => { el.innerHTML = MONTH_NAV_HTML; });
  document.querySelectorAll('#tabBar button').forEach(b => b.addEventListener('click', ()=> goTab(b.dataset.tab)));
  window.addEventListener('hashchange', syncFromHash);
  try{ if('scrollRestoration' in history) history.scrollRestoration = 'manual'; }catch(e){}
  // The bottom bar would float above the iOS keyboard: hide it while a field has focus.
  const isField = el => !!el && el.matches && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]):not([type=range]), select, textarea');
  let kbTimer = null;
  document.addEventListener('focusin', ev=>{
    clearTimeout(kbTimer);
    document.body.classList.toggle('kb-open', isField(ev.target));
    syncKbBar();
  });
  document.addEventListener('focusout', ()=>{
    clearTimeout(kbTimer);
    kbTimer = setTimeout(()=>{ if(!isField(document.activeElement)) document.body.classList.remove('kb-open'); syncKbBar(); }, 150);
  });
  document.getElementById('entryAmount').addEventListener('input', ()=>{ updateConv(); updateKbBarLabel(); });
  setupTripUi();
  const kbBtn = document.getElementById('kbSaveBtn');
  // Keep the input focused (and the keyboard up) until the click lands.
  ['pointerdown','mousedown'].forEach(t => kbBtn.addEventListener(t, ev => ev.preventDefault()));
  kbBtn.addEventListener('click', addEntry);
  if(window.visualViewport){
    visualViewport.addEventListener('resize', positionKbBar);
    visualViewport.addEventListener('scroll', positionKbBar);
  }
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

