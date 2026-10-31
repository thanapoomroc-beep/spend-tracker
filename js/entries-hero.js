/* ---------- Info dialog ---------- */
let infoOpener = null;
function openInfo(){
  infoOpener = document.activeElement;
  document.getElementById('infoModalOverlay').style.display = 'flex';
  document.getElementById('infoOkBtn').focus();
}
function closeInfo(){
  document.getElementById('infoModalOverlay').style.display = 'none';
  if(infoOpener && infoOpener.focus) infoOpener.focus();
  infoOpener = null;
}

/* ---------- Keyboard save bar ---------- */
function kbBarLabelText(){
  const a = parseFloat(document.getElementById('entryAmount').value);
  ensureSelectedCategory();
  ensureSelectedPayment();
  const pm = shortPayName(selectedPayment);
  const cat = formCategory();
  return (a > 0 ? `จด ${fmtCur(a, formCurrency())} ${cat}` : `จด ${cat}`) + (pm ? ' ' + pm : '');
}
function updateKbBarLabel(){
  const b = document.getElementById('kbSaveBtn');
  if(b) b.textContent = kbBarLabelText();
}
// Pin the bar to the bottom of the visual viewport (the part of the page above the iOS keyboard).
function positionKbBar(){
  const bar = document.getElementById('kbBar');
  const vv = window.visualViewport;
  const off = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
  bar.style.bottom = off + 'px';
  bar.classList.toggle('vv', off > 0);
  document.documentElement.style.setProperty('--kb-off', off + 'px');
}
const KB_BAR_FIELDS = ['entryAmount', 'entryNote', 'entryDate'];
function syncKbBar(){
  const on = KB_BAR_FIELDS.includes((document.activeElement || {}).id);
  document.body.classList.toggle('kb-save', on);
  if(on){ updateKbBarLabel(); positionKbBar(); }
}

// Month-scoped tabs (รายการ, ภาพรวม, ตั้งค่า) all follow currentMonth.
function renderMonthViews(){
  const label = monthLabelStr(currentMonth);
  document.querySelectorAll('.month-label').forEach(el => el.textContent = label);
  const isNow = monthKey(currentMonth) === monthKey(new Date());
  document.querySelectorAll('.today-pill').forEach(el => el.style.display = isNow ? 'none' : '');
  document.getElementById('stripGroup').setAttribute('aria-label', isNow ? 'สรุปเดือนนี้' : 'สรุป ' + viewedMonthWord());

  const mKeyStr = monthKey(currentMonth);
  const fig = monthFigures(currentMonth);
  const eff = fig.eff;
  const monthEntries = sortEntries(fig.entries);
  const { fixed, variable, remaining } = fig;

  document.getElementById('statFixed').textContent = fmt(fixed);
  document.getElementById('statVariable').textContent = fmt(variable);
  const remEl = document.getElementById('statRemaining');
  remEl.textContent = fmt(remaining);
  remEl.className = 'v' + (remaining < 0 ? ' neg' : '');
  // ทริป cell: only when the month has trip entries (the grid adapts from 3 to 4 columns)
  const tripCell = document.getElementById('stripTripCell');
  const hasTrip = fig.tripEntries.length > 0;
  tripCell.hidden = !hasTrip;
  document.getElementById('stripGroup').classList.toggle('has-trip', hasTrip);
  if(hasTrip){
    document.getElementById('statTrip').textContent = fmt(fig.tripTotal);
    const fundings = new Set(fig.tripEntries.map(tripFundingOf));
    document.getElementById('statTripSub').textContent = fundings.size > 1 ? 'หลายทริป' : (fundings.has('income') ? 'หักจากรายได้' : 'ใช้เงินเก็บ');
  }
  const tn = document.getElementById('tripNote');
  tn.innerHTML = '';
  if(hasTrip){
    tn.appendChild(document.createTextNode(`มีรายการทริป ${fig.tripEntries.length} รายการ `));
    const lk = document.createElement('button');
    lk.type = 'button'; lk.className = 'linkbtn'; lk.textContent = 'ดูในหน้าทริป';
    lk.addEventListener('click', ()=> openMonthTrips(lk));
    tn.appendChild(lk);
  }

  pruneFilters();
  renderFilterChips();
  renderEntriesTab(monthEntries);

  renderBudgetCard(getEffectiveBudgets(mKeyStr), monthEntries);
  renderPayBreakdown(paymentStatsEntries(monthEntries));
  renderCardsCard();
  renderInstallCard(eff.fixedItems);
  renderCompareChart();
  renderHeatmap();
  renderPieChart(monthEntries, eff.fixedItems);
  renderTrendChart();
  renderSettingsForm();
  renderTripsSettings();
  renderTripPage();
}

function isoOf(d){ return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }

// newest day first; within a day, most recently added first
function sortEntries(arr){
  return arr.map((e,i)=>[e,i]).sort((a,b)=> a[0].date < b[0].date ? 1 : a[0].date > b[0].date ? -1 : b[1]-a[1]).map(x=>x[0]);
}

/* ---------- Search & filter (F5) ---------- */
let filterText = '', filterCats = new Set(), searchAll = false;
let filterTimer = null;
function filterActive(){ return !!filterText.trim() || filterCats.size > 0 || searchAll; }
function pruneFilters(){ [...filterCats].forEach(n => { if(!findCat(n)) filterCats.delete(n); }); }
function refreshEntryList(){ renderEntriesTab(sortEntries(entriesForMonth(currentMonth))); }   // never trip entries
function updateFilterSummary(){
  const parts = [];
  if(searchAll) parts.push('ทุกเดือน');
  if(filterCats.size) parts.push(filterCats.size + ' หมวด');
  document.getElementById('filterSummary').textContent = parts.length ? '(' + parts.join(', ') + ')' : '';
  const b = document.getElementById('searchAllBtn');
  b.setAttribute('aria-pressed', searchAll ? 'true' : 'false');
}
function renderFilterChips(){
  const box = document.getElementById('filterChips');
  box.innerHTML = '';
  const mk = (label, color, pressed, fn)=>{
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'fchip';
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.innerHTML = (color ? `<span class="dot" style="background:${color}" aria-hidden="true"></span>` : '') + escapeHtml(label);
    b.addEventListener('click', fn);
    box.appendChild(b);
    return b;
  };
  const all = mk('ทั้งหมด', null, filterCats.size === 0, ()=>{ filterCats.clear(); syncFilterChips(); refreshEntryList(); });
  all.dataset.all = '1';
  state.categories.forEach(c=>{
    const b = mk(c.name + (c.archived ? ' (ซ่อน)' : ''), categoryColor(c.name), filterCats.has(c.name), ()=>{
      if(filterCats.has(c.name)) filterCats.delete(c.name); else filterCats.add(c.name);
      syncFilterChips(); refreshEntryList();
    });
    b.dataset.cat = c.name;
  });
  updateFilterSummary();
}
// Update pressed state in place so focus is never lost while toggling.
function syncFilterChips(){
  document.querySelectorAll('#filterChips .fchip').forEach(b=>{
    const on = b.dataset.all ? filterCats.size === 0 : filterCats.has(b.dataset.cat);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  updateFilterSummary();
}
function fmtThaiDateYear(str){
  return parseISODate(str).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' });
}

// รายการ tab: full list of currentMonth with search/filter, plus its title and counters.
function renderEntriesTab(monthEntries){
  const { active, source } = renderEntryList(document.getElementById('entryList'), monthEntries, null, true);
  const word = viewedMonthWord();
  document.getElementById('entriesTitle').textContent = active && searchAll ? 'รายการทุกเดือน' : (word === 'เดือนนี้' ? 'รายการเดือนนี้' : 'รายการ ' + word);
  document.getElementById('emptyMsgTxt').textContent = 'ยังไม่มีรายการ' + word;
  const result = document.getElementById('resultLine');
  if(active){
    const sum = source.reduce((s,e)=> s + e.amount, 0);
    result.textContent = source.length ? `${source.length} รายการ รวม ${fmt(sum)}` : 'ไม่เจอรายการที่ค้นหา';
  }else{
    result.textContent = '';
  }
  document.getElementById('emptyMsg').style.display = (!active && monthEntries.length === 0) ? 'block' : 'none';
  document.getElementById('entryCount').textContent = (!active && monthEntries.length) ? `${monthEntries.length} รายการ` : '';
}

// Day-grouped rows into `list`. `limit`: max rows (null = all). `useFilters`: apply search/filter (F5).
// Muted second line of a row: note and short method name; nothing when neither exists.
function entrySub(e){
  const parts = [];
  if(e.tripId){
    if(e.currency && e.currency !== 'THB') parts.push(fmtCur(e.originalAmount, e.currency) + (e.splitCount > 1 ? ` ÷${e.splitCount}` : ''));
    else if(e.splitCount > 1) parts.push(`÷${e.splitCount}`);
  }
  return parts.concat([e.note, shortPayName(e.paymentMethod)]).filter(Boolean).join(' · ');
}
// One entry row (shared by the lists and the trip summary). `noBadge` hides the trip badge inside the trip page itself.
function entryRowEl(e, listId, noDelete, noBadge){
  const row = document.createElement('div');
  row.className = 'entry-row';
  row.dataset.id = e.id;
  row.innerHTML = `<button type="button" class="entry-main" aria-label="แก้ไข ${escapeHtml(describeEntry(e))}"><span class="dot" style="background:${entryColor(e)}" aria-hidden="true"></span><span class="entry-text"><span class="entry-cat">${escapeHtml(e.category)}${e.tripId && !noBadge ? '<span class="trip-badge">ทริป</span>' : ''}</span>${entrySub(e) ? `<span class="entry-note">${escapeHtml(entrySub(e))}</span>` : ''}</span><span class="entry-amt">${fmt(e.amount)}${e.amountOverridden ? '<span class="tiny-tag">แก้ยอดบาทเอง</span>' : ''}</span></button>${noDelete ? '' : `<button type="button" class="del" aria-label="ลบรายการ ${escapeHtml(e.category)} ${fmt(e.amount)}">${ICON_X}</button>`}`;
  row.querySelector('.entry-main').addEventListener('click', ()=> openEdit(e.id, listId));
  const delBtn = row.querySelector('.del');
  if(delBtn) delBtn.addEventListener('click', ()=> askDeleteEntry(e.id));
  return row;
}
function renderEntryList(list, monthEntries, limit, useFilters, noDelete){
  list.innerHTML = '';
  const active = !!useFilters && filterActive();
  let source = monthEntries;
  if(active){
    source = searchAll ? sortEntries(state.entries.filter(e => !e.tripId)) : monthEntries;
    const q = filterText.trim().toLowerCase();
    source = source.filter(e =>
      (!filterCats.size || filterCats.has(e.category)) &&
      (!q || String(e.note || '').toLowerCase().includes(q) || String(e.category).toLowerCase().includes(q) || payName(e.paymentMethod).toLowerCase().includes(q)));
  }
  const shown = limit ? source.slice(0, limit) : source;
  const today = todayISO();
  const y = new Date(); y.setDate(y.getDate()-1);
  const yesterday = isoOf(y);
  let lastDate = null;
  shown.forEach(e=>{
    if(e.date !== lastDate){
      lastDate = e.date;
      const total = source.filter(x => x.date === e.date).reduce((s,x)=> s + x.amount, 0);
      const label = (e.date === today ? 'วันนี้ ' : e.date === yesterday ? 'เมื่อวาน ' : '') + (active && searchAll ? fmtThaiDateYear(e.date) : fmtThaiDate(e.date));
      const head = document.createElement('div');
      head.className = 'day-head';
      head.innerHTML = `<span>${escapeHtml(label)}</span><span>${fmt(total)}</span>`;
      list.appendChild(head);
    }
    const row = entryRowEl(e, list.id, noDelete, false);
    list.appendChild(row);
  });
  return { active, source, shown };
}

function renderHero(income, remaining, variable, monthEntries){
  cancelAnimationFrame(heroAnimRaf);
  const card = document.getElementById('heroCard');
  const label = document.getElementById('heroLabel');
  const value = document.getElementById('heroValue');
  const wrap = document.getElementById('heroValueWrap');
  const sub = document.getElementById('heroSub');
  const sub2 = document.getElementById('heroSub2');
  const sub3 = document.getElementById('heroSub3');
  const meter = document.getElementById('heroMeter');
  const cta = document.getElementById('heroCta');
  const info = document.getElementById('heroInfo');
  meter.style.display = 'none'; cta.style.display = 'none'; info.style.display = 'none';
  sub2.innerHTML = ''; sub.innerHTML = ''; sub3.innerHTML = '';
  value.style.display = ''; wrap.style.display = '';
  card.className = 'card hero';
  heroShown = { label:'', num:null };

  // No income yet: a prompt instead of a hidden card, so first-run isn't a wall of ฿0.
  if(!(income > 0)){
    label.textContent = 'ตั้งรายได้ก่อน จะได้รู้ว่าวันนี้ใช้ได้เท่าไหร่';
    value.style.display = 'none'; wrap.style.display = 'none';
    cta.style.display = '';
    return;
  }
  info.style.display = '';
  card.classList.add('has-info');

  const now = new Date();
  const dim = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();

  let cls = '', html = '', html2 = '', html3 = '', num = 0;
  {
    const d = now.getDate();
    const today = todayISO();
    const todaySpent = monthEntries.filter(e => e.date === today).reduce((s,e)=> s + e.amount, 0);
    const daysLeft = dim - d + 1;
    const avg = variable / d;
    if(remaining < 0){
      label.textContent = 'ใช้เกินรายได้แล้ว';
      num = Math.abs(remaining);
      cls = 'neg';
      html = `เดือนนี้ใช้ไปเฉลี่ยวันละ ${fmt(avg)}`;
    }else{
      // Stable for the whole day: today's spending is added back before dividing.
      const dailyAllowance = (remaining + todaySpent) / daysLeft;
      const todayLeft = dailyAllowance - todaySpent;
      if(todayLeft >= 0){
        label.textContent = 'วันนี้ใช้ได้อีก';
        num = todayLeft;
        cls = 'pos';
      }else{
        label.textContent = 'วันนี้ใช้เกินแล้ว';
        num = Math.abs(todayLeft);
        cls = 'warn';
      }
      html = `ใช้ได้วันละ ${fmt(dailyAllowance)} อีก ${daysLeft} วัน`;
      if(d >= 3 && avg > dailyAllowance) html2 = `<span class="warn">เดือนนี้ใช้ไปเฉลี่ยวันละ ${fmt(avg)} เร็วกว่าที่ควร</span>`;
      if(now.getHours() >= 21 && todayLeft >= 0) html3 = `ถ้าไม่ใช้เพิ่ม วันนี้เก็บได้ ${fmt(todayLeft)}`;
      // Meter: what is left of today's allowance (drains as you spend); full amber once over.
      if(dailyAllowance > 0){
        meter.style.display = '';
        const left = Math.max(todayLeft, 0);
        meter.setAttribute('aria-valuemax', String(Math.round(dailyAllowance)));
        meter.setAttribute('aria-valuenow', String(Math.min(Math.round(left), Math.round(dailyAllowance))));
        const fill = document.getElementById('heroMeterFill');
        fill.style.width = (todayLeft < 0 ? 100 : Math.min(left / dailyAllowance, 1) * 100) + '%';
        fill.className = todayLeft >= 0 ? '' : 'warn';
      }
    }
  }
  value.textContent = fmt(num);
  heroShown = { label: label.textContent, num };
  value.className = 'hero-value ' + cls;
  card.className = 'card hero has-info ' + cls;
  sub.innerHTML = html;
  sub2.innerHTML = html2;
  sub3.innerHTML = html3;
}

function renderBudgetCard(budgets, monthEntries){
  const body = document.getElementById('budgetBody');
  body.innerHTML = '';
  // All categories with a budget, archived ones included (so past months still show their budgets).
  const cats = state.categories.map(c => c.name).filter(c => budgets[c] > 0);
  if(!cats.length){
    body.innerHTML = '<div class="empty" style="padding:4px 0 12px;">ยังไม่ได้ตั้งงบ ตั้งไว้จะได้เห็นว่าแต่ละหมวดใช้ไปเท่าไหร่</div>';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'secondary';
    btn.textContent = 'ตั้งงบ';
    btn.addEventListener('click', openBudgetSettings);
    body.appendChild(btn);
    return;
  }
  const spentBy = {};
  monthEntries.forEach(e=>{ spentBy[e.category] = (spentBy[e.category]||0) + e.amount; });
  cats.forEach(cat=>{
    const budget = budgets[cat], spent = spentBy[cat] || 0, ratio = spent / budget;
    const barCls = ratio > 1 ? 'neg' : (ratio >= 0.8 ? 'warn' : '');
    const over = spent > budget;
    const row = document.createElement('div');
    row.className = 'budget-row';
    row.innerHTML = `
      <div class="budget-head"><span class="name"><span class="dot" style="background:${categoryColor(cat)}" aria-hidden="true"></span>${escapeHtml(cat)}</span><span class="nums">${fmt(spent)} / ${fmt(budget)}</span></div>
      <div class="bar" role="progressbar" aria-label="งบ ${escapeHtml(cat)}" aria-valuemin="0" aria-valuemax="${budget}" aria-valuenow="${Math.min(Math.round(spent), budget)}"><span class="${barCls}" style="width:${Math.min(ratio,1)*100}%"></span></div>
      <div class="budget-foot${over ? ' neg' : ''}">${over ? 'เกิน ' + fmt(spent - budget) : 'เหลือ ' + fmt(budget - spent)}</div>`;
    body.appendChild(row);
  });
}

