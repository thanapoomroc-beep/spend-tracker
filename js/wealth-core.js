/* ---------- Wealth (v4 / W1): pure maths ---------- */
// DOM-free. Functions take their data as arguments (easy to test); the last group reads `state`.
// Loaded after cards.js and before everything that draws, but core.js/cards.js helpers (installmentInfo, cardStatus, daysBetweenISO...) are only called at run time.
//
// Data (all records carry id, updatedAt, deleted:false - tombstones are kept for the later sync phase):
//   accounts:   [{ id, name, group:'cash'|'invest', archived, sortOrder }]           debts are not accounts (see liabilities)
//   balances:   [{ id, accountId, date, value }]                                      manual values, latest date per account wins
//   holdings:   [{ id, accountId, assetType, symbol, units, cost, currency, unit? }]  cost = total cost in the holding's currency; unit 'gram'|'baht' for gold
//   liabilities:[{ id, name, date, balance }]                                         manual debts (one value + the date it was true)
//   debtOverrides: { [derivedId]: { balance, date, updatedAt } }                      derivedId = 'inst:<fixedItemId>' | 'card:<methodId>'
//   priceCache: { '<assetType>:<SYMBOL>': { price, currency, at, source:'manual'|'auto', auto? } }
//               `auto` (only present while a manual price sits on top) keeps the last auto price so clearing the manual one can fall back to it.
//   fxCache:    { USD: { thb, at, source } }
//   snapshots:  { 'YYYY-MM-DD': { assets, debts, net, holdings:[{ key, units, unitTHB }] } }   one per day
const GRAM_PER_BAHT = 15.244;                         // 1 บาททองคำ in grams
const ASSET_TYPES = ['th_stock', 'foreign_stock', 'fund', 'gold', 'crypto'];
const STALE_PRICE_DAYS = 5, STALE_FX_DAYS = 3, STALE_BALANCE_DAYS = 45;
const WEALTH_GROUPS = ['cash', 'invest'];

function wLive(list){ return (list || []).filter(x => x && !x.deleted); }

/* ---------- Dates and staleness ---------- */
// 'YYYY-MM-DD' (local day) of a date string or ISO timestamp.
function dayOfStamp(s){
  if(typeof s !== 'string' || !s) return null;
  if(ISO_DATE_RE.test(s)) return s;
  const d = new Date(s);
  if(isNaN(d.getTime())) return null;
  return isoFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
function ageDays(stamp, today){
  const d = dayOfStamp(stamp);
  return d ? daysBetweenISO(d, today) : null;
}
// Stale means strictly older than `limit` whole days (5 days old is fine, 6 is stale). No date counts as not stale (nothing to be old).
function isStale(stamp, today, limit){
  const a = ageDays(stamp, today);
  return a !== null && a > limit;
}

/* ---------- Prices and FX ---------- */
function priceKey(assetType, symbol){ return assetType + ':' + String(symbol || '').trim().toUpperCase(); }
// The price that counts: a manual one wins over auto until it is cleared. null when there is none.
function effectivePrice(cache, key){
  const e = cache && cache[key];
  if(!e || !(e.price > 0)) return null;
  return { price: e.price, currency: e.currency, at: e.at, source: e.source === 'manual' ? 'manual' : 'auto' };
}
function setManualPrice(cache, key, price, currency, at){
  const prev = cache[key];
  const entry = { price, currency, at, source: 'manual' };
  // Remember the auto price underneath so "use the automatic price" can restore it.
  if(prev){
    if(prev.source === 'manual'){ if(prev.auto) entry.auto = prev.auto; }
    else entry.auto = { price: prev.price, currency: prev.currency, at: prev.at };
  }
  cache[key] = entry;
}
// Back to the last auto price when there is one, else no price at all. Returns 'restored' | 'removed' | 'none'.
function clearManualPrice(cache, key){
  const e = cache[key];
  if(!e || e.source !== 'manual') return 'none';
  if(e.auto && e.auto.price > 0){
    cache[key] = { price: e.auto.price, currency: e.auto.currency, at: e.auto.at, source: 'auto' };
    return 'restored';
  }
  delete cache[key];
  return 'removed';
}
// Round 2 calls this with fetched prices: a manual price is never overwritten (the fetch goes under it).
function setAutoPrice(cache, key, price, currency, at){
  const e = cache[key];
  if(e && e.source === 'manual'){ e.auto = { price, currency, at }; return false; }
  cache[key] = { price, currency, at, source: 'auto' };
  return true;
}
function setManualFx(fxCache, cur, thb, at){ fxCache[cur] = { thb, at, source: 'manual' }; }
// THB is always 1 and never stale. null when a foreign currency has no rate yet.
function fxRate(fxCache, cur){
  if(!cur || cur === 'THB') return { rate: 1, at: null, source: 'fixed' };
  const e = fxCache && fxCache[cur];
  if(!e || !(e.thb > 0)) return null;
  return { rate: e.thb, at: e.at, source: e.source };
}

/* ---------- Holdings ---------- */
// Gold is priced per บาททองคำ; grams convert at 15.244 g per baht. Everything else is priced per unit.
function holdingPriceUnits(h){
  return (h.assetType === 'gold' && h.unit === 'gram') ? h.units / GRAM_PER_BAHT : h.units;
}
function holdingValue(h, ctx){
  const key = priceKey(h.assetType, h.symbol);
  const p = effectivePrice(ctx.priceCache, key);
  const cur = h.currency || 'THB';
  const fx = p ? fxRate(ctx.fxCache, p.currency || cur) : null;
  const costFx = fxRate(ctx.fxCache, cur);
  const priceUnits = holdingPriceUnits(h);
  const ok = !!(p && fx);
  const unitTHB = ok ? p.price * fx.rate : null;
  const value = ok ? round2(priceUnits * unitTHB) : 0;
  const cost = (costFx && h.cost >= 0) ? round2(h.cost * costFx.rate) : null;
  const hasPL = ok && cost !== null && cost > 0;
  return {
    id: h.id, key, holding: h,
    value, unitTHB, priceUnits,
    price: p ? p.price : null, priceCurrency: p ? p.currency : cur, priceAt: p ? p.at : null, source: p ? p.source : null,
    missingPrice: !p, missingFx: (!!p && !fx) || !costFx,
    cost: hasPL ? cost : null,
    pl: hasPL ? round2(value - cost) : null,
    plPct: hasPL ? (value - cost) / cost : null,
    stale: !!p && (isStale(p.at, ctx.today, STALE_PRICE_DAYS) || (!!fx && fx.at !== null && isStale(fx.at, ctx.today, STALE_FX_DAYS)))
  };
}

function latestBalance(balances, accountId){
  let best = null;
  wLive(balances).forEach(b => {
    if(b.accountId !== accountId) return;
    if(!best || b.date > best.date || (b.date === best.date && (b.updatedAt || '') > (best.updatedAt || ''))) best = b;
  });
  return best;
}
function balanceHistory(balances, accountId){
  return wLive(balances).filter(b => b.accountId === accountId)
    .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : ((a.updatedAt || '') < (b.updatedAt || '') ? 1 : -1));
}

// One account's value. An invest account with at least one holding is valued from its holdings, otherwise from its latest manual balance.
function accountValue(acc, w, ctx){
  const hs = wLive(w.holdings).filter(h => h.accountId === acc.id);
  const base = { id: acc.id, name: acc.name, group: acc.group, archived: !!acc.archived, sortOrder: acc.sortOrder || 0 };
  if(acc.group === 'invest' && hs.length){
    const rows = hs.map(h => holdingValue(h, ctx));
    const value = round2(rows.reduce((s, r) => s + r.value, 0));
    const withPL = rows.filter(r => r.pl !== null);
    const cost = round2(withPL.reduce((s, r) => s + r.cost, 0));
    const pl = round2(withPL.reduce((s, r) => s + r.pl, 0));
    const dated = rows.map(r => dayOfStamp(r.priceAt)).filter(Boolean).sort();
    return Object.assign(base, {
      value, hasHoldings: true, holdingCount: hs.length, holdings: rows, cost, pl, plPct: cost > 0 ? pl / cost : null,
      asOf: dated[0] || null,                                   // the oldest price decides how fresh the account is
      stale: rows.some(r => r.stale), incomplete: rows.some(r => r.missingPrice || r.missingFx)
    });
  }
  const b = latestBalance(w.balances, acc.id);
  return Object.assign(base, {
    value: b ? b.value : 0, hasHoldings: false, holdingCount: 0, holdings: [], cost: null, pl: null, plPct: null,
    asOf: b ? b.date : null, stale: !!b && isStale(b.date, ctx.today, STALE_BALANCE_DAYS), incomplete: false
  });
}

/* ---------- Installments (reuses the F2 maths of installmentText) ---------- */
// What is still to pay on an active installment: amount x terms left after mKey (no interest). 0 when it has not started or has ended.
function remainingFinancing(item, mKey){
  const inf = installmentInfo(item, mKey);
  if(!inf || inf.status !== 'active') return 0;
  return (item.amount || 0) * inf.left;
}

/* ---------- Derived debts ---------- */
// input: { fixedItems (effective for mKey), mKey, methods, entries, payments, today }. Returns every candidate (a zero balance is kept so an override can still show).
function derivedDebts(input){
  const out = [];
  (input.fixedItems || []).forEach(it => {
    const inf = installmentInfo(it, input.mKey);
    if(!inf || inf.status !== 'active') return;
    out.push({ id: 'inst:' + it.id, kind: 'inst', name: it.name || 'ผ่อน', balance: remainingFinancing(it, input.mKey),
      meta: { monthly: it.amount || 0, termNo: inf.termNo, total: inf.total, end: inf.end } });
  });
  (input.methods || []).forEach(m => {
    if(!(m.cardType === 'repay' || m.cardType === 'statement')) return;
    const s = cardStatus(m, input.today, input.entries, input.payments);
    let balance;
    if(s.type === 'repay') balance = Math.max(0, s.owed);
    else if(!s.configured) balance = s.unpaid;
    // Closed unpaid cycles plus the running cycle; capped by (spend - paid) so a payment made ahead of the statement is not forgotten.
    else balance = Math.min(round2(s.unpaid + s.openSpend), Math.max(0, round2(s.spend - s.paid)));
    if(m.archived && !(balance > 0)) return;
    out.push({ id: 'card:' + m.id, kind: s.type === 'repay' ? 'repay' : 'statement', name: s.type === 'repay' ? 'ค้างโอนคืน ' + m.name.replace(/^บัตรเครดิต\s*/, '') : m.name, balance,
      meta: { configured: s.type === 'statement' ? s.configured : null } });
  });
  return out;
}

/* ---------- The whole picture ---------- */
// w: { accounts, balances, holdings, liabilities, debtOverrides, priceCache, fxCache }; derived: derivedDebts(); today: 'YYYY-MM-DD'.
function wealthSummary(w, derived, today){
  const ctx = { priceCache: w.priceCache || {}, fxCache: w.fxCache || {}, today };
  const all = wLive(w.accounts).map(a => accountValue(a, w, ctx));
  const byOrder = (a, b) => (a.sortOrder - b.sortOrder) || (a.name < b.name ? -1 : 1);
  const live = all.filter(a => !a.archived);
  const cash = live.filter(a => a.group === 'cash').sort(byOrder);
  const invest = live.filter(a => a.group === 'invest').sort(byOrder);
  const hidden = all.filter(a => a.archived).sort(byOrder);
  const total = list => round2(list.reduce((s, a) => s + a.value, 0));

  const debts = [];
  wLive(w.liabilities).forEach(l => debts.push({
    id: 'liab:' + l.id, liabilityId: l.id, name: l.name, balance: l.balance, derivedBalance: null, auto: false, overridden: false,
    asOf: l.date, stale: isStale(l.date, today, STALE_BALANCE_DAYS), meta: null, kind: 'manual'
  }));
  (derived || []).forEach(d => {
    const ov = (w.debtOverrides || {})[d.id];
    const balance = ov ? ov.balance : d.balance;
    if(!ov && !(d.balance > 0)) return;
    debts.push({
      id: d.id, name: d.name, balance, derivedBalance: d.balance, auto: true, overridden: !!ov, kind: d.kind,
      asOf: ov ? ov.date : null, stale: !!ov && isStale(ov.date, today, STALE_BALANCE_DAYS), meta: d.meta
    });
  });
  const cashTotal = total(cash), investTotal = total(invest);
  const assets = round2(cashTotal + investTotal);
  const debtTotal = round2(debts.reduce((s, d) => s + d.balance, 0));
  return { cash, invest, hidden, debts, cashTotal, investTotal, assets, debtTotal, net: round2(assets - debtTotal),
    hasData: all.length > 0 || wLive(w.liabilities).length > 0 };
}

/* ---------- Snapshots ---------- */
// units are in the price unit (baht of gold), so a snapshot's units x unitTHB is the holding's value on that day. Holdings without a price are left out.
function buildSnapshot(summary){
  const by = new Map();
  summary.cash.concat(summary.invest).forEach(a => a.holdings.forEach(r => {
    if(r.unitTHB === null) return;
    const e = by.get(r.key) || { key: r.key, units: 0, unitTHB: r.unitTHB };
    e.units += r.priceUnits;
    by.set(r.key, e);
  }));
  return { assets: summary.assets, debts: summary.debtTotal, net: summary.net,
    holdings: [...by.values()].map(h => ({ key: h.key, units: Math.round(h.units * 1e6) / 1e6, unitTHB: Math.round(h.unitTHB * 1e6) / 1e6 })) };
}
// Writes (or replaces) the snapshot for `day`. Returns true when something changed (so the caller knows whether to save).
function upsertSnapshot(snapshots, day, snap){
  if(JSON.stringify(snapshots[day]) === JSON.stringify(snap)) return false;
  snapshots[day] = snap;
  return true;
}

// Month change: live/latest snapshot against the last snapshot of the previous calendar month. null until that earlier snapshot exists.
//   market = sum over holdings present in both of units_prev x (unitTHB_now - unitTHB_prev);  flows = change - market.
function monthChange(snapshots, today, nowSnap){
  const days = Object.keys(snapshots).filter(d => d <= today).sort();
  if(!days.length && !nowSnap) return null;
  const last = days[days.length - 1];
  const to = nowSnap || snapshots[last];
  const month = nowSnap ? today.slice(0, 7) : last.slice(0, 7);
  const prevDays = days.filter(d => d.slice(0, 7) === addMonths(month, -1));
  if(!prevDays.length) return null;
  const from = snapshots[prevDays[prevDays.length - 1]];
  const prevBy = new Map((from.holdings || []).map(h => [h.key, h]));
  let market = 0;
  (to.holdings || []).forEach(h => {
    const p = prevBy.get(h.key);
    if(p) market += p.units * (h.unitTHB - p.unitTHB);
  });
  market = round2(market);
  const change = round2(to.net - from.net);
  return { from: prevDays[prevDays.length - 1], change, market, flows: round2(change - market) };
}
// Last snapshot of each month, the most recent n months that have one. change = net minus the previous point's net.
function monthSeries(snapshots, n){
  const lastOf = new Map();
  Object.keys(snapshots).sort().forEach(d => lastOf.set(d.slice(0, 7), d));
  const pts = [...lastOf.entries()].map(([month, date]) => ({ month, date, net: snapshots[date].net }));
  const cut = pts.slice(-(n || 12));
  return cut.map((p, i) => Object.assign(p, { change: i ? round2(p.net - cut[i - 1].net) : null }));
}

/* ---------- Migration (called from migrateState) ---------- */
function emptyWealth(){
  return { accounts: [], balances: [], holdings: [], liabilities: [], debtOverrides: {}, priceCache: {}, fxCache: {}, snapshots: {} };
}
function migrateWealth(parsed){
  const isDay = v => typeof v === 'string' && ISO_DATE_RE.test(v);
  const num = v => typeof v === 'number' && isFinite(v);
  const stamp = v => (typeof v === 'string' && v) ? v : EPOCH;
  const plainObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const fresh = (list, ok) => {
    const ids = new Set(), out = [];
    (Array.isArray(list) ? list : []).forEach(r => {
      if(!r || typeof r.id !== 'string' || !r.id || ids.has(r.id)) return;
      const c = ok(r);
      if(!c) return;
      ids.add(r.id);
      c.id = r.id; c.updatedAt = stamp(r.updatedAt); c.deleted = !!r.deleted;
      out.push(c);
    });
    return out;
  };
  parsed.accounts = fresh(parsed.accounts, r => {
    if(typeof r.name !== 'string' || !r.name.trim() || !WEALTH_GROUPS.includes(r.group)) return null;
    return { name: r.name.trim(), group: r.group, archived: !!r.archived, sortOrder: num(r.sortOrder) ? r.sortOrder : 0 };
  });
  const accIds = new Set(parsed.accounts.map(a => a.id));
  parsed.balances = fresh(parsed.balances, r => (accIds.has(r.accountId) && isDay(r.date) && num(r.value)) ? { accountId: r.accountId, date: r.date, value: r.value } : null);
  parsed.holdings = fresh(parsed.holdings, r => {
    if(!accIds.has(r.accountId) || !ASSET_TYPES.includes(r.assetType)) return null;
    const symbol = r.assetType === 'gold' ? 'GOLD' : (typeof r.symbol === 'string' ? r.symbol.trim().toUpperCase() : '');
    if(!symbol || !num(r.units) || !(r.units > 0) || !num(r.cost) || r.cost < 0) return null;
    const currency = r.assetType === 'gold' ? 'THB' : (typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency) ? r.currency : 'THB');
    const c = { accountId: r.accountId, assetType: r.assetType, symbol, units: r.units, cost: r.cost, currency };
    if(r.assetType === 'gold') c.unit = r.unit === 'baht' ? 'baht' : 'gram';
    return c;
  });
  parsed.liabilities = fresh(parsed.liabilities, r => (typeof r.name === 'string' && r.name.trim() && isDay(r.date) && num(r.balance) && r.balance >= 0) ? { name: r.name.trim(), date: r.date, balance: r.balance } : null);

  const ovs = {};
  if(plainObj(parsed.debtOverrides)) Object.keys(parsed.debtOverrides).forEach(k => {
    const o = parsed.debtOverrides[k];
    if(/^(inst|card):.+/.test(k) && plainObj(o) && num(o.balance) && o.balance >= 0 && isDay(o.date)) ovs[k] = { balance: o.balance, date: o.date, updatedAt: stamp(o.updatedAt) };
  });
  parsed.debtOverrides = ovs;

  const prices = {};
  const cleanAuto = a => (plainObj(a) && num(a.price) && a.price > 0 && typeof a.currency === 'string' && /^[A-Z]{3}$/.test(a.currency) && typeof a.at === 'string' && a.at) ? { price: a.price, currency: a.currency, at: a.at } : null;
  if(plainObj(parsed.priceCache)) Object.keys(parsed.priceCache).forEach(k => {
    const e = parsed.priceCache[k];
    if(!/^(th_stock|foreign_stock|fund|gold|crypto):.+/.test(k) || !plainObj(e)) return;
    const base = cleanAuto(e);
    if(!base) return;
    const c = Object.assign({}, base, { source: e.source === 'manual' ? 'manual' : 'auto' });
    if(c.source === 'manual'){ const a = cleanAuto(e.auto); if(a) c.auto = a; }
    prices[k] = c;
  });
  parsed.priceCache = prices;

  const fx = {};
  if(plainObj(parsed.fxCache)) Object.keys(parsed.fxCache).forEach(k => {
    const e = parsed.fxCache[k];
    if(/^[A-Z]{3}$/.test(k) && k !== 'THB' && plainObj(e) && num(e.thb) && e.thb > 0 && typeof e.at === 'string' && e.at) fx[k] = { thb: e.thb, at: e.at, source: e.source === 'auto' ? 'auto' : 'manual' };
  });
  parsed.fxCache = fx;

  const snaps = {};
  if(plainObj(parsed.snapshots)) Object.keys(parsed.snapshots).forEach(d => {
    const s = parsed.snapshots[d];
    if(!isDay(d) || !plainObj(s) || !num(s.assets) || !num(s.debts) || !num(s.net)) return;
    const hs = (Array.isArray(s.holdings) ? s.holdings : []).filter(h => h && typeof h.key === 'string' && num(h.units) && num(h.unitTHB))
      .map(h => ({ key: h.key, units: h.units, unitTHB: h.unitTHB }));
    snaps[d] = { assets: s.assets, debts: s.debts, net: s.net, holdings: hs };
  });
  parsed.snapshots = snaps;
  return parsed;
}

/* ---------- State-backed helpers ---------- */
function wealthData(){
  return { accounts: state.accounts, balances: state.balances, holdings: state.holdings, liabilities: state.liabilities,
    debtOverrides: state.debtOverrides, priceCache: state.priceCache, fxCache: state.fxCache };
}
function derivedDebtsNow(todayStr){
  const today = todayStr || todayISO();
  const mKey = today.slice(0, 7);
  return derivedDebts({ fixedItems: getEffectiveSettings(mKey).fixedItems, mKey, methods: state.paymentMethods, entries: state.entries, payments: state.cardPayments, today });
}
function wealthSummaryNow(todayStr){
  const today = todayStr || todayISO();
  return wealthSummary(wealthData(), derivedDebtsNow(today), today);
}
