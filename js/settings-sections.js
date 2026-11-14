/* Settings sections (2.10.1): accordion for the ตั้งค่า tab. One section open at a time, all closed on every load.
   Nothing here runs at load time; initSettingsSections() is called from setupUi(). */
function settingsSectionButton(key){
  if(!key) return null;
  const root = document.getElementById('panel-settings');
  if(!root) return null;
  const el = document.getElementById(key);
  if(!el) return null;
  if(el.classList && el.classList.contains('set-toggle')) return el;
  const own = el.querySelector ? el.querySelector('.set-toggle') : null;   // heading id
  if(own) return own;
  const btns = root.querySelectorAll('.set-toggle');   // body id (aria-controls)
  for(let i = 0; i < btns.length; i++){
    if(btns[i].getAttribute('aria-controls') === key) return btns[i];
  }
  return null;
}
function setSettingsSectionOpen(btn, open){
  const body = document.getElementById(btn.getAttribute('aria-controls'));
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if(body) body.hidden = !open;
}
function closeOtherSettingsSections(except){
  const root = document.getElementById('panel-settings');
  if(!root) return;
  root.querySelectorAll('.set-toggle').forEach(b => {
    if(b !== except && b.getAttribute('aria-expanded') === 'true') setSettingsSectionOpen(b, false);
  });
}
// Opens one section and closes the rest. Safe when the key is unknown.
function openSettingsSection(key){
  const btn = settingsSectionButton(key);
  if(!btn) return false;
  closeOtherSettingsSections(btn);
  setSettingsSectionOpen(btn, true);
  return true;
}
function toggleSettingsSection(btn){
  if(!btn) return;
  const before = btn.getBoundingClientRect().top;
  if(btn.getAttribute('aria-expanded') === 'true'){
    setSettingsSectionOpen(btn, false);
  }else{
    closeOtherSettingsSections(btn);
    setSettingsSectionOpen(btn, true);
  }
  const delta = btn.getBoundingClientRect().top - before;   // a section above closed: keep the title under the finger
  if(delta) window.scrollBy(0, delta);
}
function initSettingsSections(){
  const root = document.getElementById('panel-settings');
  if(!root) return;
  root.addEventListener('click', ev => {
    const btn = ev.target && ev.target.closest ? ev.target.closest('.set-toggle') : null;
    if(btn && root.contains(btn)) toggleSettingsSection(btn);
  });
}
