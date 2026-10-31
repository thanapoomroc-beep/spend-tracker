async function init(){
  state = await loadData();
  loadLastCategory();
  loadLastPayment('normal');
  document.getElementById('loadingOverlay').style.display = 'none';
  document.getElementById('mainWrap').style.display = 'block';
  setupUi();
  setChartFont();
  initForm();
  render();
  // Always open on วันนี้ unless the URL carries a valid tab hash.
  applyTab(TABS.includes(location.hash.replace(/^#/, '')) ? tabFromHash() : 'today', { keepScroll:true });
  if(/^#trip\//.test(location.hash)) syncFromHash();   // direct load of a trip page (falls back to วันนี้ if the trip is gone)
}
init();

const APP_VERSION = (document.querySelector('meta[name="app-version"]') || {}).content || '';
document.getElementById('appVersion').textContent = APP_VERSION;
if('serviceWorker' in navigator){
  // The service worker answers from cache first; when its background check finds a newer
  // index.html it tells us, and a reload picks up the already-cached new version.
  navigator.serviceWorker.addEventListener('message', ev=>{
    if(ev.data && ev.data.type === 'update-available'){
      flashToast('มีเวอร์ชันใหม่แล้ว', true, { label:'อัปเดต', onClick: ()=> location.reload() });
    }
  });
}
if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(()=>{}); });
}
