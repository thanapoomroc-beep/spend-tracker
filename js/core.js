const STORAGE_KEY = 'spendTrackerState';
const LAST_CAT_KEY = 'spendTrackerLastCategory';
const LAST_PAY_KEY = 'spendTrackerLastPayment';
const LAST_PAY_TRIP_KEY = 'spendTrackerLastPaymentTrip';
const LAST_CAT_TRIP_KEY = 'spendTrackerLastCategoryTrip';
const TRIP_SUGGEST_KEY = 'spendTrackerTripSuggestDismissed';   // today's ISO date when the suggestion was dismissed
function lastPaymentKey(mode){ return mode === 'trip' ? LAST_PAY_TRIP_KEY : LAST_PAY_KEY; }
const PAYMENT_SEEDS = [{ id:'cash', name:'เงินสด' }, { id:'ttb', name:'บัตรเครดิต TTB' }, { id:'kbank', name:'บัตรเครดิต KBANK' }];
const SUBSCRIPTION_DEFAULTS = ['อินเทอร์เน็ต','YouTube Premium','Netflix','Spotify','Claude'];
// 6 validated hue slots in fixed order (never cycled, never by rank). Status colours stay reserved for status.
const SLOT_COLORS = ['#d95926','#3987e5','#199e70','#c98500','#d55181','#9085e9'];
const SLOT_NAMES = ['ส้ม','น้ำเงิน','เขียว','เหลือง','ชมพู','ม่วง'];
const NEUTRAL_COLOR = '#C3C6CC';   // อื่นๆ / categories without a colour slot
const FIXED_COLOR = '#80838A';
const DEFAULT_CATEGORIES = ['อาหาร','การเดินทาง','สาธารณูปโภค','ช้อปปิ้ง','สุขภาพ','บันเทิง','อื่นๆ'];
const EPOCH = '1970-01-01T00:00:00Z';
// Trips (v2.4). Trip categories are a fixed list, separate from the editable normal categories.
const TRIP_CATS = ['ตั๋วเครื่องบิน','ที่พัก','เดินทาง','อาหาร','ช้อปปิ้ง','ตั๋ว/กิจกรรม','อื่นๆ'];
const TRIP_COLOR = '#5CE1E6';
const CURRENCIES = [
  { code:'CNY', sym:'元', name:'หยวน' }, { code:'VND', sym:'₫', name:'ด่ง' }, { code:'JPY', sym:'¥', name:'เยน' },
  { code:'KRW', sym:'₩', name:'วอน' }, { code:'USD', sym:'$', name:'ดอลลาร์สหรัฐ' }, { code:'EUR', sym:'€', name:'ยูโร' },
  { code:'SGD', sym:'$', name:'ดอลลาร์สิงคโปร์' }, { code:'HKD', sym:'$', name:'ดอลลาร์ฮ่องกง' }, { code:'TWD', sym:'$', name:'ดอลลาร์ไต้หวัน' },
  { code:'THB', sym:'฿', name:'บาท' }
];
const ZERO_DECIMAL = ['VND','JPY','KRW'];
const TREND_KEY = 'spendTrackerTrendRange';
const SCHEMA_VERSION = 3;

function nowISO(){ return new Date().toISOString(); }
function genId(){ return Date.now() + '-' + Math.random().toString(36).slice(2,7); }

// Local-time date helpers (Thailand is UTC+7; never go through UTC).
function pad2(n){ return String(n).padStart(2,'0'); }
function todayISO(){
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());
}
function parseISODate(str){
  const p = String(str).split('-');
  return new Date(+p[0], (+p[1]||1) - 1, +p[2]||1);
}
function fmtThaiDate(str){
  return parseISODate(str).toLocaleDateString('th-TH', { day:'numeric', month:'short' });
}

// Starter template. Built once so item ids stay stable between calls
// (an edit forks the template into a month; fresh ids would break the lookup).
let starterItems = null;
function freshFixedItems(){
  if(!starterItems){
    starterItems = [
      {id:genId(), name:'เงินลงทุน', amount:0, group:'financing'},
      {id:genId(), name:'ผ่อนรถ', amount:0, group:'financing'},
      {id:genId(), name:'หักจากเงินเดือน', amount:0, group:'subscription'},
    ];
    SUBSCRIPTION_DEFAULTS.forEach(n => starterItems.push({id:genId(), name:n, amount:0, group:'subscription'}));
  }
  return starterItems.map(i => ({...i}));
}

// Older saved data (or freshly-imported backups) may not have a `group` on
// each fixed item. Investment/car map to "financing"; everything else
// defaults to "subscription", matching how the two groups were defined.
function inferGroup(name){
  if(name === 'เงินลงทุน' || name === 'ผ่อนรถ') return 'financing';
  return 'subscription';
}

// Seeds the category list: the v2 names in order, slots 0-5, and `อื่นๆ` with slot null (neutral).
function seedCategories(stamp){
  return DEFAULT_CATEGORIES.map((name,i)=>({ name, slot: i < SLOT_COLORS.length ? i : null, archived:false, updatedAt: stamp }));
}

// Data shape (v3a). Everything beyond v1 is additive:
//   schemaVersion: 3
//   categories: [{ name, slot: 0-5|null, archived, updatedAt }]   (array order = display order)
//   monthlySettings[m]: { income, fixedItems:[{id,name,amount,group, dueDay?, startMonth?, totalTerms?}], updatedAt }
//   budgetSettings[m]:  { [category]: number }  - a plain map, so it must hold budgets only.
//   budgetUpdatedAt[m]: ISO string              - the updatedAt of budgetSettings[m] lives here for that reason.
//   paymentMethods: [{ id, name, archived, updatedAt }]          (array order = display order; ids are stable)
//   entries: [{ id, date, amount, category, note, paymentMethod?, updatedAt }]  (category by name, paymentMethod by id)
function seedPayments(stamp){
  return PAYMENT_SEEDS.map(p => ({ id:p.id, name:p.name, archived:false, updatedAt: stamp }));
}
//   trips: [{ id, name, currency, thbPerUnit, startDate, endDate, budget, funding:'savings'|'income', createdAt, updatedAt }]   activeTripId: id|null
//   trip entries add: tripId, currency, originalAmount, splitCount, rate, amountOverridden.  entry.amount is ALWAYS the owner's share in baht.
function freshState(){
  return { schemaVersion: SCHEMA_VERSION, monthlySettings: {}, budgetSettings: {}, budgetUpdatedAt: {}, categories: seedCategories(nowISO()), paymentMethods: seedPayments(nowISO()), entries: [], trips: [], activeTripId: null };
}

function cleanBudgets(b){
  const out = {};
  if(b && typeof b === 'object' && !Array.isArray(b)){
    Object.keys(b).forEach(k=>{ const v = parseFloat(b[k]); if(v > 0) out[k] = v; });
  }
  return out;
}

// Migrates older backups (single global settings object) into the new
// per-month model. The old global settings become an "anchor" at the
// earliest month that already had entries (or the current month if there
// were none) - this preserves existing totals instead of erasing history.
function migrateState(parsed){
  if(!parsed.monthlySettings){
    parsed.monthlySettings = {};
    if(parsed.settings){
      let anchorKey;
      if(Array.isArray(parsed.entries) && parsed.entries.length){
        anchorKey = parsed.entries.map(e => e.date.slice(0,7)).sort()[0];
      }else{
        anchorKey = monthKey(currentMonth);
      }
      parsed.monthlySettings[anchorKey] = {
        income: parsed.settings.income || 0,
        fixedItems: Array.isArray(parsed.settings.fixedItems) ? parsed.settings.fixedItems.map(i=>({...i, group: i.group || inferGroup(i.name)})) : []
      };
    }
    delete parsed.settings;
  }
  if(!parsed.budgetSettings || typeof parsed.budgetSettings !== 'object' || Array.isArray(parsed.budgetSettings)) parsed.budgetSettings = {};
  Object.keys(parsed.monthlySettings).forEach(k=>{
    const ms = parsed.monthlySettings[k];
    if(!Array.isArray(ms.fixedItems)) ms.fixedItems = [];
    ms.fixedItems.forEach(item=>{
      if(!item.group) item.group = inferGroup(item.name);
    });
    if(typeof ms.income !== 'number') ms.income = parseFloat(ms.income) || 0;
    if(!ms.updatedAt) ms.updatedAt = EPOCH;
    // Early v2 builds kept budgets inside monthlySettings; move them to budgetSettings.
    if(ms.budgets){
      const moved = cleanBudgets(ms.budgets);
      if(Object.keys(moved).length && !parsed.budgetSettings[k]) parsed.budgetSettings[k] = moved;
      delete ms.budgets;
    }
  });
  Object.keys(parsed.budgetSettings).forEach(k=>{ parsed.budgetSettings[k] = cleanBudgets(parsed.budgetSettings[k]); });
  if(!parsed.budgetUpdatedAt || typeof parsed.budgetUpdatedAt !== 'object' || Array.isArray(parsed.budgetUpdatedAt)) parsed.budgetUpdatedAt = {};
  Object.keys(parsed.budgetSettings).forEach(k=>{ if(!parsed.budgetUpdatedAt[k]) parsed.budgetUpdatedAt[k] = EPOCH; });
  if(!Array.isArray(parsed.entries)) parsed.entries = [];
  parsed.entries.forEach(e=>{ if(!e.updatedAt) e.updatedAt = EPOCH; });

  // Trips: validate, then make sure every trip entry points at a real trip and carries sane conversion fields.
  const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const tripIds = new Set(), trips = [];
  (Array.isArray(parsed.trips) ? parsed.trips : []).forEach(t=>{
    if(!t || typeof t.id !== 'string' || !t.id || tripIds.has(t.id) || typeof t.name !== 'string' || !t.name.trim() || !isDay(t.startDate)) return;
    const cur = (typeof t.currency === 'string' && /^[A-Z]{3}$/.test(t.currency)) ? t.currency : 'CNY';
    let rate = parseFloat(t.thbPerUnit); if(!(rate > 0)) rate = 1;
    if(cur === 'THB') rate = 1;
    const end = isDay(t.endDate) && t.endDate >= t.startDate ? t.endDate : t.startDate;
    tripIds.add(t.id);
    trips.push({ id:t.id, name:t.name.trim(), currency:cur, thbPerUnit:rate, startDate:t.startDate, endDate:end,
      budget: parseFloat(t.budget) > 0 ? parseFloat(t.budget) : 0, funding: t.funding === 'income' ? 'income' : 'savings',
      createdAt: t.createdAt || EPOCH, updatedAt: t.updatedAt || EPOCH });
  });
  parsed.trips = trips;
  parsed.activeTripId = (typeof parsed.activeTripId === 'string' && tripIds.has(parsed.activeTripId)) ? parsed.activeTripId : null;
  parsed.entries.forEach(e=>{
    const t = e.tripId ? trips.find(x => x.id === e.tripId) : null;
    if(!t){
      ['tripId','currency','originalAmount','splitCount','rate','amountOverridden'].forEach(k => delete e[k]);   // orphan or normal entry
      return;
    }
    if(typeof e.currency !== 'string' || !e.currency) e.currency = t.currency;
    let r = parseFloat(e.rate); if(!(r > 0)) r = e.currency === 'THB' ? 1 : t.thbPerUnit;
    e.rate = e.currency === 'THB' ? 1 : r;
    let o = parseFloat(e.originalAmount); if(!(o > 0)) o = e.amount;
    e.originalAmount = o;
    const sc = parseInt(e.splitCount, 10); e.splitCount = sc >= 1 ? sc : 1;
    e.amountOverridden = !!e.amountOverridden;
    if(!TRIP_CATS.includes(e.category)) e.category = 'อื่นๆ';
  });

  // Categories: seed from the v2 list when absent, then validate and add any unknown names.
  if(!Array.isArray(parsed.categories)) parsed.categories = seedCategories(EPOCH);
  const seen = new Set(), usedSlots = new Set(), cats = [];
  parsed.categories.forEach(c=>{
    if(!c || typeof c.name !== 'string') return;
    const name = c.name.trim();
    if(!name || seen.has(name)) return;
    seen.add(name);
    let slot = (Number.isInteger(c.slot) && c.slot >= 0 && c.slot < SLOT_COLORS.length) ? c.slot : null;
    if(slot !== null && usedSlots.has(slot)) slot = null;   // a slot belongs to one category
    if(slot !== null) usedSlots.add(slot);
    cats.push({ name, slot, archived: !!c.archived, updatedAt: c.updatedAt || EPOCH });
  });
  const addUnknown = name => {
    if(typeof name !== 'string' || !name.trim() || seen.has(name)) return;
    seen.add(name);
    cats.push({ name, slot:null, archived:false, updatedAt: EPOCH });
  };
  parsed.entries.forEach(e => { if(!e.tripId) addUnknown(e.category); });
  Object.keys(parsed.budgetSettings).forEach(k => Object.keys(parsed.budgetSettings[k]).forEach(addUnknown));
  parsed.categories = cats;

  // Payment methods: seed when absent; otherwise validate. Entries keep their paymentMethod id as is.
  if(!Array.isArray(parsed.paymentMethods)){
    parsed.paymentMethods = seedPayments(EPOCH);
  }else{
    const ids = new Set(), pms = [];
    parsed.paymentMethods.forEach(m=>{
      if(!m || typeof m.id !== 'string' || !m.id || typeof m.name !== 'string' || ids.has(m.id)) return;
      const name = m.name.trim();
      if(!name) return;
      ids.add(m.id);
      pms.push({ id:m.id, name, archived: !!m.archived, updatedAt: m.updatedAt || EPOCH });
    });
    parsed.paymentMethods = pms;
  }
  parsed.entries.forEach(e=>{ if(e.paymentMethod !== undefined && (typeof e.paymentMethod !== 'string' || !e.paymentMethod)) delete e.paymentMethod; });
  parsed.schemaVersion = SCHEMA_VERSION;
  return parsed;
}

async function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      return migrateState(JSON.parse(raw));
    }
  }catch(e){
    // No saved data yet, or the key doesn't exist - fall back to a fresh state
  }
  return freshState();
}

// Returns the effective {income, fixedItems} for a given "YYYY-MM" key:
// the most recent explicit setting at or before that month (carried
// forward). If nothing has ever been configured, offers the friendly
// starter template. If earlier settings exist but none reach back this
// far, the month genuinely has no data (as requested: no retroactive
// backfilling of history before the first configured month).
function getRawSettings(mKey){
  const keys = Object.keys(state.monthlySettings).sort();
  let chosen = null;
  for(const k of keys){
    if(k <= mKey) chosen = k; else break;
  }
  if(chosen){
    const ms = state.monthlySettings[chosen];
    return { income: ms.income || 0, fixedItems: (ms.fixedItems||[]).map(i=>({...i})) };
  }
  if(keys.length === 0){
    return { income:0, fixedItems: freshFixedItems() };
  }
  return { income:0, fixedItems: [] };
}

/* ---------- Installment terms (F2) ---------- */
function monthIdx(key){ const p = key.split('-'); return (+p[0]) * 12 + (+p[1]) - 1; }
function addMonths(key, n){
  const i = monthIdx(key) + n;
  return Math.floor(i / 12) + '-' + pad2((i % 12) + 1);
}
function thaiMonthYear(key){
  const p = key.split('-');
  return new Date(+p[0], +p[1]-1, 1).toLocaleDateString('th-TH', { month:'short', year:'numeric' });
}
// null when the item has no (complete) installment terms.
function installmentInfo(item, mKey){
  if(!item || !/^\d{4}-\d{2}$/.test(item.startMonth || '')) return null;
  const total = parseInt(item.totalTerms, 10);
  if(!(total >= 1)) return null;
  const termNo = monthIdx(mKey) - monthIdx(item.startMonth) + 1;
  const status = termNo < 1 ? 'before' : (termNo > total ? 'ended' : 'active');
  return { start:item.startMonth, end:addMonths(item.startMonth, total - 1), total, termNo, status, left: Math.max(0, total - termNo) };
}
function installmentText(item, mKey){
  const inf = installmentInfo(item, mKey);
  if(!inf) return '';
  if(inf.status === 'before') return `ยังไม่เริ่มผ่อน (เริ่ม ${thaiMonthYear(inf.start)})`;
  if(inf.status === 'ended') return `ผ่อนครบแล้ว (${thaiMonthYear(inf.end)})`;
  return `งวดที่ ${inf.termNo} จาก ${inf.total}\nผ่อนถึง ${thaiMonthYear(inf.end)} เหลืออีก ${fmt((item.amount||0) * inf.left)}`;
}

// Fixed items that count in mKey: items with complete terms only count inside their term window.
function getEffectiveSettings(mKey){
  const r = getRawSettings(mKey);
  r.fixedItems = r.fixedItems.filter(i => { const inf = installmentInfo(i, mKey); return !inf || inf.status === 'active'; });
  return r;
}

// Forks an explicit, editable settings entry for this month if one
// doesn't exist yet, seeded from the RAW (unfiltered) carried-forward values, so
// installments that have not started yet are not dropped from later months.
// Only called when something is about to be edited, so it also stamps updatedAt.
function ensureMonthSettings(mKey){
  if(!state.monthlySettings[mKey]){
    const raw = getRawSettings(mKey);
    state.monthlySettings[mKey] = { income: raw.income, fixedItems: raw.fixedItems };
  }
  state.monthlySettings[mKey].updatedAt = nowISO();
  return state.monthlySettings[mKey];
}

// Budgets carry forward independently of income/fixed items.
function getEffectiveBudgets(mKey){
  const keys = Object.keys(state.budgetSettings).sort();
  let chosen = null;
  for(const k of keys){
    if(k <= mKey) chosen = k; else break;
  }
  return chosen ? {...state.budgetSettings[chosen]} : {};
}

let saveIndicatorTimer = null;
function flashToast(msg, ok, action){
  const el = document.getElementById('saveIndicator');
  el.textContent = '';
  const span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(span);
  el.classList.toggle('has-action', !!action);
  if(action){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = action.label;
    b.addEventListener('click', ()=>{ clearTimeout(saveIndicatorTimer); el.classList.remove('show'); action.onClick(); });
    el.appendChild(b);
  }
  el.classList.toggle('error', !ok);
  el.classList.add('show');
  clearTimeout(saveIndicatorTimer);
  saveIndicatorTimer = setTimeout(()=> el.classList.remove('show'), action ? 6000 : (ok ? 1500 : 3000));
}
function flashSaveIndicator(ok){
  flashToast(ok ? 'บันทึกแล้ว' : 'บันทึกไม่ได้ ลองใหม่อีกครั้ง', ok);
}

async function saveData(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    flashSaveIndicator(true);
  }catch(e){
    console.error('Storage error:', e);
    flashSaveIndicator(false);
  }
}

let state = freshState();
let currentMonth = new Date();
currentMonth.setDate(1);
let selectedCategory = 'อาหาร';
let editCategory = 'อาหาร';
let selectedPayment = '';   // method id, '' = none
let editPayment = '';
let editingId = null;
let heroShown = { label:'', num:null, dir:'down' };   // what the hero last displayed (for the count-up after saving)
// Entry form state for trips
let selectedTripCategory = 'อาหาร';
let entryKind = 'trip';        // travel mode only: 'trip' | 'normal'
let entryLink = '';            // normal mode only: trip id to link a pre-trip booking to
let entryBaht = false;         // amount typed in baht instead of the trip currency
let entrySplit = 1;
let formSig = null;            // which form (trip id + kind) the controls were last built for
let suggestDismissedToday = false;

let pieChart, trendChart, compareChart;
