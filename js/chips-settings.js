/* ---------- Category chips (radiogroup) ---------- */
function loadLastCategory(){
  try{
    const c = localStorage.getItem(LAST_CAT_KEY);
    if(c && activeCats().some(x => x.name === c)) selectedCategory = c;
    const t = localStorage.getItem(LAST_CAT_TRIP_KEY);
    if(t && TRIP_CATS.includes(t)) selectedTripCategory = t;
  }catch(e){}
  ensureSelectedCategory();
}
// `extra`: a name to include even if archived (so editing an old entry keeps its category visible).
// `trip`: build the fixed trip category list instead of the editable one.
function buildChips(container, selected, onSelect, extra, trip){
  const hadFocus = container.contains(document.activeElement);
  container.innerHTML = '';
  const names = trip ? TRIP_CATS.slice() : activeCats().map(c => c.name);
  if(!trip && extra && !names.includes(extra) && findCat(extra)) names.push(extra);
  const n = names.length;
  const hasActive = names.includes(selected);
  names.forEach((cat,i)=>{
    const on = cat === selected;
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role','radio');
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = (on || (!hasActive && i === 0)) ? 0 : -1;
    b.className = 'chip' + (on ? ' active' : '');
    b.innerHTML = `<span class="dot" style="background:${trip ? tripCatColor(cat) : categoryColor(cat)}" aria-hidden="true"></span>${escapeHtml(cat)}`;
    b.addEventListener('click', ()=> onSelect(cat));
    b.addEventListener('keydown', ev=>{
      const step = (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') ? 1 : (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') ? -1 : 0;
      if(step){ ev.preventDefault(); onSelect(names[(i + step + n) % n]); }
    });
    container.appendChild(b);
  });
  if(hadFocus){ const a = container.querySelector('.chip.active'); if(a) a.focus(); }
}
function renderChips(){
  const trip = formMode() === 'trip';
  buildChips(document.getElementById('categoryChips'), trip ? selectedTripCategory : selectedCategory, selectCategory, null, trip);
  updateKbBarLabel();
}
function selectCategory(cat){
  clearAmountError();
  if(formMode() === 'trip'){
    selectedTripCategory = cat;
    try{ localStorage.setItem(LAST_CAT_TRIP_KEY, cat); }catch(e){}
  }else{
    selectedCategory = cat;
    try{ localStorage.setItem(LAST_CAT_KEY, cat); }catch(e){}
  }
  renderChips();
}
function renderEditChips(){
  const orig = state.entries.find(x => x.id === editingId);
  buildChips(document.getElementById('editChips'), editCategory, c=>{ editCategory = c; renderEditChips(); }, !editTripId && orig && !orig.tripId ? orig.category : null, !!editTripId);
}

/* ---------- Payment methods (ช่องทางจ่าย) ---------- */
function findPay(id){ return id ? state.paymentMethods.find(m => m.id === id) : undefined; }
function activePays(){ return state.paymentMethods.filter(m => !m.archived); }
function payName(id){ const m = findPay(id); return m ? m.name : ''; }
// In use = has entries or card payments; such a method can be hidden but not deleted.
function payUsed(id){ return state.entries.some(e => e.paymentMethod === id) || state.cardPayments.some(p => p.methodId === id); }
// Short form for tight spots: the last word when the name has a space, else the name; capped with an ellipsis.
function shortPayName(id){
  const n = payName(id).trim();
  if(!n) return '';
  const w = n.includes(' ') ? n.split(/\s+/).pop() : n;
  return w.length > 12 ? w.slice(0, 11) + '…' : w;
}
function loadLastPayment(mode){
  selectedPayment = '';
  try{
    const id = localStorage.getItem(lastPaymentKey(mode));
    if(id && activePays().some(m => m.id === id)) selectedPayment = id;
  }catch(e){}
}
function ensureSelectedPayment(){
  if(selectedPayment && !activePays().some(m => m.id === selectedPayment)) selectedPayment = '';
}
// Segmented control; tapping the selected option clears it. More than 4 options become a wrapping chip grid.
// `extra`: an id to include even if archived (so editing an old entry never drops its method).
function buildPay(container, selected, onSelect, extra){
  const focusId = container.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  container.innerHTML = '';
  const list = activePays();
  if(extra && !list.some(m => m.id === extra) && findPay(extra)) list.push(findPay(extra));
  container.hidden = !list.length;
  if(!list.length) return;
  container.className = 'pay-seg' + (list.length > 4 ? ' wrap' : '');
  container.style.setProperty('--n', list.length);
  const n = list.length;
  const hasSel = list.some(m => m.id === selected);
  list.forEach((m,i)=>{
    const on = m.id === selected;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pay-opt';
    b.dataset.id = m.id;
    b.setAttribute('role','radio');
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = (on || (!hasSel && i === 0)) ? 0 : -1;
    b.textContent = m.name;
    b.addEventListener('click', ()=> onSelect(on ? '' : m.id));
    b.addEventListener('keydown', ev=>{
      const step = (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') ? 1 : (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') ? -1 : 0;
      if(step){ ev.preventDefault(); onSelect(list[(i + step + n) % n].id); }
    });
    container.appendChild(b);
  });
  if(focusId){
    const opts = [...container.querySelectorAll('.pay-opt')];
    const f = container.querySelector('[aria-checked="true"]') || opts.find(x => x.dataset.id === focusId) || container.querySelector('[tabindex="0"]');
    if(f) f.focus();
  }
}
function renderPayControl(){
  ensureSelectedPayment();
  buildPay(document.getElementById('payControl'), selectedPayment, selectPayment);
  updateKbBarLabel();
}
function selectPayment(id){
  selectedPayment = id;
  try{ localStorage.setItem(lastPaymentKey(formMode()), id); }catch(e){}
  renderPayControl();
}
function renderEditPay(){
  const orig = state.entries.find(x => x.id === editingId);
  const box = document.getElementById('editPay');
  buildPay(box, editPayment, id=>{ editPayment = id; renderEditPay(); }, orig && orig.paymentMethod);
  document.getElementById('editPayLabel').style.display = box.hidden ? 'none' : '';
}

/* ---------- Settings form ---------- */
const instOpen = new Set();   // item ids whose installment fields are shown before both values exist
let openPickerFor = null;     // category name whose colour picker is open

function renderSettingsForm(){
  const mKey = monthKey(currentMonth);
  const raw = getRawSettings(mKey);

  const monthLbl = document.getElementById('settingsMonthLabel');
  if(monthLbl) monthLbl.textContent = 'ตั้งค่าเดือน ' + thaiMonthYear(mKey);

  document.getElementById('setIncome').value = raw.income || '';

  // Settings list every item of the month (even installments outside their term, marked as such);
  // only items inside their term are counted elsewhere.
  renderFixedGroupList('financingList', raw.fixedItems.filter(i => i.group === 'financing'), 'ยังไม่มีรายการ');
  renderFixedGroupList('subscriptionList', raw.fixedItems.filter(i => i.group !== 'financing'), 'ยังไม่มีรายการ');
  const subSum = getEffectiveSettings(mKey).fixedItems.filter(i => i.group !== 'financing').reduce((s,i)=> s + (i.amount||0), 0);
  document.getElementById('subYearly').textContent = subSum > 0 ? `ค่าสมาชิกรวมปีละ ${fmt(subSum * 12)}` : '';
  renderCategorySettings();
  renderPaySettings();
  renderBudgetSettings(getEffectiveBudgets(mKey));
}

function renderFixedGroupList(containerId, items, emptyText){
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if(items.length === 0){
    container.innerHTML = `<div class="empty" style="padding:6px 0;">${emptyText}</div>`;
    return;
  }
  const mKey = monthKey(currentMonth);
  const head = document.createElement('div');
  head.className = 'fi-head';
  head.setAttribute('aria-hidden','true');
  head.innerHTML = '<span>ชื่อรายการ</span><span>จำนวนเงิน</span><span></span>';
  container.appendChild(head);
  items.forEach(item=>{
    const isFin = item.group === 'financing';
    const instOn = isFin && (item.startMonth || item.totalTerms || instOpen.has(item.id));
    const nm = escapeHtml(item.name || 'รายการ');
    const block = document.createElement('div');
    block.className = 'fi-block';
    block.setAttribute('data-id', item.id);
    let instHtml = '';
    if(instOn){
      const info = installmentText(item, mKey);
      const partial = !installmentInfo(item, mKey);
      instHtml = `
        <div class="row2 fi-inst">
          <div><label for="st-${item.id}">เริ่มเดือน</label><input type="month" class="fi-start" id="st-${item.id}" value="${escapeHtml(item.startMonth || mKey)}"></div>
          <div><label for="tt-${item.id}">จำนวนงวด</label><input type="number" class="fi-terms" id="tt-${item.id}" min="1" max="600" step="1" inputmode="numeric" placeholder="เช่น 48" value="${item.totalTerms || ''}"></div>
        </div>
        <div class="fi-info">${partial ? 'ใส่จำนวนงวดก่อน จะได้นับงวดให้' : escapeHtml(info).replace(/\n/g, '<br>')}</div>`;
    }
    block.innerHTML = `
      <div class="fixed-item-row">
        <input type="text" class="fi-name" value="${escapeHtml(item.name)}" placeholder="ชื่อรายการ" aria-label="ชื่อรายการ" onchange="updateFixedItem('${item.id}')">
        <input type="number" class="fi-amount" min="0" step="1" inputmode="numeric" value="${item.amount || ''}" placeholder="0" aria-label="จำนวนเงิน" onchange="updateFixedItem('${item.id}')">
        <button type="button" class="del-fixed" aria-label="ลบ ${nm}" onclick="removeFixedItem('${item.id}')">${ICON_X}</button>
      </div>
      <div class="fi-extra">
        <div class="fi-due"><label for="due-${item.id}">ตัดทุกวันที่</label><input type="number" class="fi-dueday" id="due-${item.id}" min="1" max="31" step="1" inputmode="numeric" placeholder="-" value="${item.dueDay || ''}" aria-label="ตัดทุกวันที่ ${nm}" onchange="updateFixedItem('${item.id}')"></div>
        ${isFin ? `<button type="button" class="secondary fi-inst-toggle" aria-pressed="${instOn ? 'true' : 'false'}" aria-label="ผ่อนเป็นงวด ${nm}" onclick="toggleInstallment('${item.id}')">ผ่อนเป็นงวด</button>` : ''}
      </div>
      ${instHtml}`;
    block.querySelectorAll('.fi-start,.fi-terms').forEach(el => el.addEventListener('change', ()=> updateFixedItem(item.id)));
    container.appendChild(block);
  });
}

function toggleInstallment(id){
  const raw = getRawSettings(monthKey(currentMonth));
  const item = raw.fixedItems.find(i => i.id === id);
  if(!item) return;
  const on = item.startMonth || item.totalTerms || instOpen.has(id);
  if(on){
    instOpen.delete(id);
    const ms = ensureMonthSettings(monthKey(currentMonth));
    const it = ms.fixedItems.find(i => i.id === id);
    if(it){ delete it.startMonth; delete it.totalTerms; }
    saveData().then(()=>{
      render();
      const t = document.querySelector(`.fi-block[data-id="${id}"] .fi-inst-toggle`); if(t) t.focus();
    });
  }else{
    instOpen.add(id);
    renderSettingsForm();
    const s = document.querySelector(`.fi-block[data-id="${id}"] .fi-start`); if(s) s.focus();
  }
}

/* ---------- Category management (F1) ---------- */
function setCatMsg(t){ document.getElementById('catMsg').textContent = t || ''; }

function renderCategorySettings(){
  const list = document.getElementById('categoryList');
  const act = activeCats();
  const hadFocusIn = list.contains(document.activeElement);
  list.innerHTML = '';
  act.forEach((c,i)=>{
    const used = categoryUsed(c.name);
    const nm = escapeHtml(c.name);
    const slotLabel = c.slot === null ? 'เทา' : SLOT_NAMES[c.slot];
    const block = document.createElement('div');
    block.className = 'cat-block';
    block.dataset.name = c.name;
    block.setAttribute('role','group');
    block.setAttribute('aria-label','หมวด ' + c.name);
    block.innerHTML = `
      <div class="cat-row">
        <button type="button" class="secondary cat-dot" aria-label="เลือกสีของ ${nm} ตอนนี้สี${slotLabel}" aria-expanded="${openPickerFor === c.name}"><span class="swatch" style="background:${categoryColor(c.name)}"></span></button>
        <input type="text" class="cat-name" value="${nm}" maxlength="24" aria-label="ชื่อหมวด" autocomplete="off">
        <button type="button" class="secondary cat-up" aria-label="เลื่อนขึ้น" title="เลื่อนขึ้น"${i === 0 ? ' disabled' : ''}>▲</button>
        <button type="button" class="secondary cat-down" aria-label="เลื่อนลง" title="เลื่อนลง"${i === act.length-1 ? ' disabled' : ''}>▼</button>
        ${used
          ? `<button type="button" class="secondary cat-act hide" aria-label="ซ่อนหมวด ${nm}" title="ซ่อนหมวดนี้">ซ่อน</button>`
          : `<button type="button" class="del-fixed cat-act" aria-label="ลบหมวด ${nm}" title="ลบหมวด">${ICON_X}</button>`}
      </div>`;
    if(openPickerFor === c.name){
      const pick = document.createElement('div');
      pick.className = 'cat-picker';
      pick.setAttribute('role','group');
      pick.setAttribute('aria-label','เลือกสีของ ' + c.name);
      const used6 = new Set(state.categories.map(x => x.slot));
      for(let s = 0; s < SLOT_COLORS.length; s++){
        if(used6.has(s) && c.slot !== s) continue;     // only free slots (plus its own)
        pick.appendChild(slotChip(c, s, SLOT_NAMES[s], SLOT_COLORS[s]));
      }
      pick.appendChild(slotChip(c, null, 'เทา (อื่นๆ)', NEUTRAL_COLOR));
      block.appendChild(pick);
    }
    const nameInp = block.querySelector('.cat-name');
    nameInp.addEventListener('change', ()=> renameCategory(c.name, nameInp));
    block.querySelector('.cat-dot').addEventListener('click', ()=>{ openPickerFor = openPickerFor === c.name ? null : c.name; renderCategorySettings(); focusCat(c.name, '.cat-dot'); });
    block.querySelector('.cat-up').addEventListener('click', ()=> moveCategory(c.name, -1));
    block.querySelector('.cat-down').addEventListener('click', ()=> moveCategory(c.name, 1));
    block.querySelector('.cat-act').addEventListener('click', ()=> used ? askArchiveCategory(c.name) : askDeleteCategory(c.name));
    list.appendChild(block);
  });
  void hadFocusIn;

  const arch = state.categories.filter(c => c.archived);
  document.getElementById('archivedWrap').style.display = arch.length ? '' : 'none';
  const al = document.getElementById('archivedList');
  al.innerHTML = '';
  arch.forEach(c=>{
    const nm = escapeHtml(c.name);
    const row = document.createElement('div');
    row.className = 'arch-row';
    row.innerHTML = `<span class="nm"><span class="dot" style="background:${categoryColor(c.name)}" aria-hidden="true"></span>${nm}</span><button type="button" class="secondary" aria-label="แสดงหมวด ${nm} อีกครั้ง">แสดงอีกครั้ง</button>${categoryUsed(c.name) ? '' : `<button type="button" class="del-fixed" aria-label="ลบหมวด ${nm}">${ICON_X}</button>`}`;
    row.querySelector('.secondary').addEventListener('click', ()=> unarchiveCategory(c.name));
    const d = row.querySelector('.del-fixed'); if(d) d.addEventListener('click', ()=> askDeleteCategory(c.name));
    al.appendChild(row);
  });
}
function slotChip(cat, slot, label, color){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'fchip';
  b.setAttribute('aria-pressed', cat.slot === slot ? 'true' : 'false');
  b.innerHTML = `<span class="dot" style="background:${color}" aria-hidden="true"></span>${escapeHtml(label)}`;
  b.addEventListener('click', ()=> setCategorySlot(cat.name, slot));
  return b;
}
function focusCat(name, sel){
  const blk = [...document.querySelectorAll('#categoryList .cat-block')].find(b => b.dataset.name === name);
  if(!blk) return;
  const el = blk.querySelector(sel);
  if(el && !el.disabled) el.focus();
}

async function afterCategoryChange(){
  ensureSelectedCategory();
  renderChips();
  await saveData();
  render();
}

async function setCategorySlot(name, slot){
  const c = findCat(name);
  if(!c || c.slot === slot) { openPickerFor = null; renderCategorySettings(); focusCat(name, '.cat-dot'); return; }
  if(slot !== null && state.categories.some(x => x !== c && x.slot === slot)) return;
  c.slot = slot;
  c.updatedAt = nowISO();
  openPickerFor = null;
  await afterCategoryChange();
  focusCat(name, '.cat-dot');
}

async function moveCategory(name, dir){
  const arr = state.categories;
  const i = arr.findIndex(c => c.name === name);
  if(i < 0) return;
  let j = i + dir;
  while(j >= 0 && j < arr.length && arr[j].archived) j += dir;   // skip hidden ones
  if(j < 0 || j >= arr.length) return;
  const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  const stamp = nowISO();
  arr[i].updatedAt = stamp; arr[j].updatedAt = stamp;
  await afterCategoryChange();
  focusCat(name, dir < 0 ? '.cat-up' : '.cat-down');
  const blk = [...document.querySelectorAll('#categoryList .cat-block')].find(b => b.dataset.name === name);
  if(blk && blk.querySelector(dir < 0 ? '.cat-up' : '.cat-down').disabled) focusCat(name, dir < 0 ? '.cat-down' : '.cat-up');
}

async function addCategory(){
  const inp = document.getElementById('newCatName');
  const name = inp.value.trim();
  if(!name){ setCatMsg('ใส่ชื่อหมวดก่อน'); inp.setAttribute('aria-invalid','true'); inp.focus(); return; }
  if(state.categories.some(c => c.name.toLowerCase() === name.toLowerCase())){ setCatMsg('มีหมวดชื่อนี้แล้ว'); inp.setAttribute('aria-invalid','true'); inp.focus(); return; }
  setCatMsg(''); inp.removeAttribute('aria-invalid');
  const slot = firstFreeSlot();
  state.categories.push({ name, slot, archived:false, updatedAt: nowISO() });
  inp.value = '';
  await afterCategoryChange();
  if(slot === null) flashToast('สีครบ 6 หมวดแล้ว หมวดนี้เลยเป็นสีเทาและรวมกับ "อื่นๆ" ในกราฟ', true);
}

function renameCategory(oldName, inp){
  const newName = inp.value.trim();
  inp.value = oldName;                         // restore; the confirmed rename re-renders with the new name
  if(!newName || newName === oldName){ setCatMsg(newName ? '' : 'ใส่ชื่อหมวดก่อน'); return; }
  if(state.categories.some(c => c.name !== oldName && c.name.toLowerCase() === newName.toLowerCase())){ setCatMsg('มีหมวดชื่อนี้แล้ว'); return; }
  setCatMsg('');
  openConfirm({
    title: `เปลี่ยนชื่อ "${oldName}" เป็น "${newName}" ไหม?`,
    desc: 'รายการเก่าและงบทุกเดือนจะเปลี่ยนตามด้วย',
    confirmLabel: 'เปลี่ยนชื่อ',
    onConfirm: async ()=>{
      const stamp = nowISO();
      const c = findCat(oldName);
      if(!c) return;
      c.name = newName; c.updatedAt = stamp;
      state.entries.forEach(e=>{ if(!e.tripId && e.category === oldName){ e.category = newName; e.updatedAt = stamp; } });
      Object.keys(state.budgetSettings).forEach(m=>{
        const b = state.budgetSettings[m];
        if(Object.prototype.hasOwnProperty.call(b, oldName)){ b[newName] = b[oldName]; delete b[oldName]; state.budgetUpdatedAt[m] = stamp; }
      });
      if(selectedCategory === oldName){ selectedCategory = newName; try{ localStorage.setItem(LAST_CAT_KEY, newName); }catch(e){} }
      if(filterCats.has(oldName)){ filterCats.delete(oldName); filterCats.add(newName); }
      if(openPickerFor === oldName) openPickerFor = newName;
      await afterCategoryChange();
      flashToast('เปลี่ยนชื่อหมวดแล้ว', true);
    }
  });
}

function askArchiveCategory(name){
  if(activeCats().length <= 1){ setCatMsg('ต้องมีหมวดอย่างน้อย 1 หมวด'); return; }
  setCatMsg('');
  openConfirm({
    title: `ซ่อนหมวด "${name}" ไหม?`,
    desc: 'จะไม่โชว์ตอนจดรายการและตั้งงบ แต่ยังเห็นในประวัติและกราฟ',
    confirmLabel: 'ซ่อน',
    onConfirm: async ()=>{
      const c = findCat(name); if(!c) return;
      c.archived = true; c.updatedAt = nowISO();
      if(openPickerFor === name) openPickerFor = null;
      await afterCategoryChange();
    }
  });
}
async function unarchiveCategory(name){
  const c = findCat(name); if(!c) return;
  c.archived = false; c.updatedAt = nowISO();
  await afterCategoryChange();
}
function askDeleteCategory(name){
  if(categoryUsed(name)){ askArchiveCategory(name); return; }
  const c = findCat(name);
  if(c && !c.archived && activeCats().length <= 1){ setCatMsg('ต้องมีหมวดอย่างน้อย 1 หมวด'); return; }
  setCatMsg('');
  openConfirm({
    title: `ลบหมวด "${name}" ไหม?`,
    desc: 'หมวดนี้ยังไม่มีรายการ',
    confirmLabel: 'ลบ',
    onConfirm: async ()=>{
      const stamp = nowISO();
      state.categories = state.categories.filter(x => x.name !== name);
      Object.keys(state.budgetSettings).forEach(m=>{
        if(Object.prototype.hasOwnProperty.call(state.budgetSettings[m], name)){ delete state.budgetSettings[m][name]; state.budgetUpdatedAt[m] = stamp; }
      });
      filterCats.delete(name);
      if(openPickerFor === name) openPickerFor = null;
      await afterCategoryChange();
    }
  });
}

/* ---------- Payment method management ---------- */
function setPayMsg(t){ document.getElementById('payMsg').textContent = t || ''; }
function payNameError(name, selfId){
  if(!name) return 'ใส่ชื่อช่องทางก่อน';
  if(state.paymentMethods.some(m => m.id !== selfId && m.name.toLowerCase() === name.toLowerCase())) return 'มีช่องทางชื่อนี้แล้ว';
  return '';
}
function renderPaySettings(){
  const list = document.getElementById('payList');
  list.innerHTML = '';
  activePays().forEach(m=>{
    const used = payUsed(m.id);
    const nm = escapeHtml(m.name);
    const block = document.createElement('div');
    block.className = 'pay-block';
    block.dataset.id = m.id;
    const row = document.createElement('div');
    row.className = 'pay-row';
    row.setAttribute('role','group');
    row.setAttribute('aria-label','ช่องทาง ' + m.name);
    row.innerHTML = `<input type="text" class="pay-name" value="${nm}" maxlength="24" aria-label="ชื่อช่องทาง" autocomplete="off">` +
      (used ? `<button type="button" class="secondary pay-act hide" aria-label="ซ่อนช่องทาง ${nm}" title="ซ่อนช่องทางนี้">ซ่อน</button>`
            : `<button type="button" class="del-fixed pay-act" aria-label="ลบช่องทาง ${nm}" title="ลบช่องทาง">${ICON_X}</button>`);
    const inp = row.querySelector('.pay-name');
    inp.addEventListener('change', ()=> renamePay(m.id, inp));
    row.querySelector('.pay-act').addEventListener('click', ()=> used ? askArchivePay(m.id) : askDeletePay(m.id));
    block.appendChild(row);
    buildCardSettings(m, block);
    list.appendChild(block);
  });
  const arch = state.paymentMethods.filter(m => m.archived);
  document.getElementById('payArchWrap').style.display = arch.length ? '' : 'none';
  const al = document.getElementById('payArchList');
  al.innerHTML = '';
  arch.forEach(m=>{
    const nm = escapeHtml(m.name);
    const row = document.createElement('div');
    row.className = 'arch-row';
    row.innerHTML = `<span class="nm">${nm}</span><button type="button" class="secondary" aria-label="แสดงช่องทาง ${nm} อีกครั้ง">แสดงอีกครั้ง</button>${payUsed(m.id) ? '' : `<button type="button" class="del-fixed" aria-label="ลบช่องทาง ${nm}">${ICON_X}</button>`}`;
    row.querySelector('.secondary').addEventListener('click', ()=> unarchivePay(m.id));
    const d = row.querySelector('.del-fixed'); if(d) d.addEventListener('click', ()=> askDeletePay(m.id));
    al.appendChild(row);
  });
}
async function afterPayChange(){
  ensureSelectedPayment();
  renderPayControl();
  await saveData();
  render();
}
async function addPay(){
  const inp = document.getElementById('newPayName');
  const name = inp.value.trim();
  const err = payNameError(name, null);
  if(err){ setPayMsg(err); inp.setAttribute('aria-invalid','true'); inp.focus(); return; }
  setPayMsg(''); inp.removeAttribute('aria-invalid');
  state.paymentMethods.push({ id: 'pm-' + genId(), name, archived:false, cardType:'', updatedAt: nowISO() });
  inp.value = '';
  await afterPayChange();
}
async function renamePay(id, inp){
  const m = findPay(id); if(!m) return;
  const name = inp.value.trim();
  if(name === m.name){ setPayMsg(''); inp.removeAttribute('aria-invalid'); return; }
  const err = payNameError(name, id);
  if(err){ setPayMsg(err); inp.setAttribute('aria-invalid','true'); inp.value = m.name; inp.focus(); return; }
  setPayMsg(''); inp.removeAttribute('aria-invalid');
  m.name = name; m.updatedAt = nowISO();
  await afterPayChange();
}
function askArchivePay(id){
  const m = findPay(id); if(!m) return;
  setPayMsg('');
  openConfirm({
    title: `ซ่อนช่องทาง "${m.name}" ไหม?`,
    desc: 'จะไม่โชว์ตอนจดรายการ แต่ยังเห็นในรายการเก่า',
    confirmLabel: 'ซ่อน',
    onConfirm: async ()=>{
      m.archived = true; m.updatedAt = nowISO();
      await afterPayChange();
    }
  });
}
async function unarchivePay(id){
  const m = findPay(id); if(!m) return;
  m.archived = false; m.updatedAt = nowISO();
  await afterPayChange();
}
function askDeletePay(id){
  const m = findPay(id); if(!m) return;
  if(payUsed(id)){ askArchivePay(id); return; }
  setPayMsg('');
  openConfirm({
    title: `ลบช่องทาง "${m.name}" ไหม?`,
    desc: 'ช่องทางนี้ยังไม่มีรายการ',
    confirmLabel: 'ลบ',
    onConfirm: async ()=>{
      state.paymentMethods = state.paymentMethods.filter(x => x.id !== id);
      if(selectedPayment === id) selectedPayment = '';
      await afterPayChange();
    }
  });
}

// Budget inputs are rebuilt only when the list of active categories changes, and otherwise only
// have their values refreshed, so tapping from one budget field to the next never loses focus.
function renderBudgetSettings(budgets){
  const list = document.getElementById('budgetSettingsList');
  const act = activeCats();
  const sig = act.map(c => c.name).join('\u0001');
  if(list.dataset.sig !== sig){
    list.dataset.sig = sig;
    list.innerHTML = '';
    act.forEach(c=>{
      const row = document.createElement('div');
      row.className = 'budget-set-row';
      row.innerHTML = `<span aria-hidden="true">${escapeHtml(c.name)}</span><input type="number" class="budget-input" min="0" step="1" inputmode="numeric" placeholder="ไม่ตั้งงบ" aria-label="งบ ${escapeHtml(c.name)}">`;
      const inp = row.querySelector('input');
      inp.dataset.cat = c.name;
      inp.addEventListener('change', ()=> updateBudget(c.name, inp));
      list.appendChild(row);
    });
  }
  list.querySelectorAll('.budget-input').forEach(inp=>{
    if(document.activeElement === inp) return;
    inp.value = budgets[inp.dataset.cat] || '';
  });
}

async function updateBudget(cat, inp){
  if(!inp) return;
  const key = monthKey(currentMonth);
  if(!state.budgetSettings[key]) state.budgetSettings[key] = getEffectiveBudgets(key);
  const v = parseFloat(inp.value);
  if(v > 0) state.budgetSettings[key][cat] = v; else delete state.budgetSettings[key][cat];
  state.budgetUpdatedAt[key] = nowISO();
  await saveData();
  render();
}

async function addFixedItem(group){
  const ms = ensureMonthSettings(monthKey(currentMonth));
  ms.fixedItems.push({id: genId(), name:'', amount:0, group: group === 'financing' ? 'financing' : 'subscription'});
  await saveData();
  render();
}

/* ---------- Generic confirm modal ---------- */
let confirmHandler = null;
function openConfirm({ title, desc, confirmLabel, onConfirm }){
  confirmHandler = onConfirm || null;
  document.getElementById('confirmTitle').textContent = title || '';
  document.getElementById('confirmDesc').textContent = desc || '';
  document.getElementById('confirmOkBtn').textContent = confirmLabel || 'ตกลง';
  ['editModalOverlay','tripModalOverlay','tripSheetOverlay'].forEach(id => { document.getElementById(id).style.visibility = 'hidden'; });
  document.getElementById('confirmModalOverlay').style.display = 'flex';
  document.querySelector('#confirmModalOverlay .secondary').focus();
}
function closeConfirm(){
  confirmHandler = null;
  document.getElementById('confirmModalOverlay').style.display = 'none';
  ['editModalOverlay','tripModalOverlay','tripSheetOverlay'].forEach(id => { document.getElementById(id).style.visibility = ''; });
}
async function runConfirm(){
  const h = confirmHandler;
  closeConfirm();
  if(h) await h();
}

function removeFixedItem(id){
  const raw = getRawSettings(monthKey(currentMonth));
  const item = raw.fixedItems.find(i => i.id === id);
  openConfirm({
    title: 'ลบรายการนี้ไหม?',
    desc: item && item.name ? `"${item.name}"` : 'รายการนี้',
    confirmLabel: 'ลบ',
    onConfirm: async ()=>{
      const ms = ensureMonthSettings(monthKey(currentMonth));
      ms.fixedItems = ms.fixedItems.filter(i => i.id !== id);
      await saveData();
      render();
    }
  });
}

async function updateFixedItem(id){
  const row = document.querySelector(`.fi-block[data-id="${id}"]`);
  if(!row) return;
  const ms = ensureMonthSettings(monthKey(currentMonth));
  const item = ms.fixedItems.find(i => i.id === id);
  if(!item) return;
  item.name = row.querySelector('.fi-name').value.trim();
  item.amount = parseFloat(row.querySelector('.fi-amount').value) || 0;
  const due = parseInt(row.querySelector('.fi-dueday').value, 10);
  if(due >= 1 && due <= 31) item.dueDay = due; else delete item.dueDay;
  const startEl = row.querySelector('.fi-start'), termsEl = row.querySelector('.fi-terms');
  if(startEl && termsEl){
    const s = startEl.value, t = parseInt(termsEl.value, 10);
    if(/^\d{4}-\d{2}$/.test(s)) item.startMonth = s; else delete item.startMonth;
    if(t >= 1) item.totalTerms = t; else delete item.totalTerms;
  }
  await saveData();
  render();
}

async function updateIncome(){
  const ms = ensureMonthSettings(monthKey(currentMonth));
  ms.income = parseFloat(document.getElementById('setIncome').value) || 0;
  await saveData();
  render();
}

