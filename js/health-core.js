/* ---------- Financial health, triggers and the briefing payload (v5, 2.8.0): pure maths ---------- */
// DOM-free. Loaded after wealth-prices.js. It reads helpers from later files (monthFigures, upcomingPayments, getEffectiveSettings...) only at run time.
// The contract with the server is docs/BRIEFING_CONTRACT.md; every % is 0-100 with 1 decimal, every ratio 0-1 with 3 decimals.
const HEALTH_CLASS = { th_stock: 'SET', foreign_stock: 'US', fund: 'FUND', gold: 'GOLD', crypto: 'CRYPTO' };
const HEALTH_CLASS_ORDER = ['CASH', 'SET', 'US', 'FUND', 'GOLD', 'CRYPTO', 'OTHER'];
const HEALTH_THRESHOLD_KEYS = ['emergencyMonthsTarget', 'savingsRateTarget', 'maxSingleHoldingPct', 'bigMovePct', 'bigMoveMinWeightPct', 'drawdownPct', 'spendPaceTolerancePct', 'fxExposureWatchPct'];
const HEALTH_PACE_AFTER_DAY = 7;        // T5 and `pace` need more than this many days of the month
const HEALTH_REMIND_DAYS = 3;           // T6: a card bill due within this many days
const HEALTH_FX_MOVE_PCT = 2;           // T8: THB moved at least this much in 7 days
const HEALTH_SCHEMA_VERSION = 1;

function hRound(n, d){ const f = Math.pow(10, d); return Math.round((n + Number.EPSILON) * f) / f; }
function hNum(v){ return typeof v === 'number' && isFinite(v); }

/* ---------- Settings migration (called from migrateState) ---------- */
// Missing or wrong-typed values become the default, out-of-range numbers are clamped, unknown keys are dropped. goals stays [] until the goals round.
function migrateWealthSettings(parsed){
  const src = parsed.wealthSettings && typeof parsed.wealthSettings === 'object' && !Array.isArray(parsed.wealthSettings) ? parsed.wealthSettings : {};
  const out = defaultWealthSettings();
  HEALTH_THRESHOLD_KEYS.forEach(k => {
    const v = src[k];
    if(!hNum(v)) return;
    const [lo, hi] = WEALTH_SETTINGS_LIMITS[k];
    out[k] = Math.min(hi, Math.max(lo, v));
  });
  out.briefingShareAmounts = src.briefingShareAmounts === true;
  out.briefingEnabled = src.briefingEnabled === true;
  out.goals = Array.isArray(src.goals) ? src.goals : [];
  parsed.wealthSettings = out;
  return parsed;
}
// The thresholds in effect for a state (defaults fill anything missing).
function healthThresholds(ws){
  const out = {};
  HEALTH_THRESHOLD_KEYS.forEach(k => { out[k] = ws && hNum(ws[k]) ? ws[k] : WEALTH_SETTINGS_DEFAULTS[k]; });
  return out;
}

/* ---------- Small pure helpers ---------- */
// Rounds shares that add up to ~100 to `dec` decimals so the rounded numbers add up to exactly 100 (largest remainder).
function healthRoundShares(vals, dec){
  const f = Math.pow(10, dec), total = vals.reduce((s, v) => s + v, 0);
  if(!(Math.abs(total - 100) < 0.5)) return vals.map(v => hRound(v, dec));
  const scaled = vals.map(v => Math.max(0, v) * f), floors = scaled.map(Math.floor);
  let left = Math.round(100 * f) - floors.reduce((s, v) => s + v, 0);
  const order = scaled.map((v, i) => ({ i, frac: v - floors[i] })).sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
  for(let k = 0; left > 0 && k < order.length; k++, left--) floors[order[k].i]++;
  return floors.map(v => v / f);
}
function healthHash(text){   // FNV-1a: enough to tell "changed or not"
  let h = 0x811c9dc5;
  for(let i = 0; i < text.length; i++){ h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}
function healthHoldingDiversified(h){ return typeof h.diversified === 'boolean' ? h.diversified : defaultDiversified(h.assetType); }
function healthSigned(n){ return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1); }

/* ---------- Months, rates, runway ---------- */
// fig = monthFigures(d). Money stays inside; only ratios leave this module.
function healthMonthStat(fig){
  return { income: fig.income, outflow: round2(fig.fixed + fig.variable + fig.tripTotal), remaining: round2(fig.remaining) };
}
// stats: the last complete months, newest first; null where a month is unusable (before the first entry).
// savings_rate_month needs the newest month; the 3-month figures need at least 2 usable months (they average whatever of the 3 exist).
function healthRates(stats, liquid){
  const withIncome = stats.filter(s => s && s.income > 0);
  const first = stats[0] && stats[0].income > 0 ? hRound(stats[0].remaining / stats[0].income, 3) : null;
  const three = withIncome.length >= 2 ? hRound(withIncome.reduce((s, x) => s + x.remaining / x.income, 0) / withIncome.length, 3) : null;
  const used = stats.filter(Boolean);
  const avgOut = used.length >= 2 ? used.reduce((s, x) => s + x.outflow, 0) / used.length : null;
  const runway = avgOut !== null && avgOut > 0 && hNum(liquid) ? hRound(liquid / avgOut, 1) : null;
  return { savings_rate_month: first, savings_rate_3m: three, cash_runway_months: runway };
}

/* ---------- Portfolio: weights, allocation, FX ---------- */
// summary = wealthSummary(). Returns everything the payload needs about investments, never a baht amount.
function healthPortfolio(summary, fxCache){
  const assets = summary.assets, investable = summary.investTotal;
  const merged = new Map();
  summary.invest.forEach(a => (a.holdings || []).forEach(r => {
    if(r.unitTHB === null || !(r.value > 0)) return;           // no price (or FX) yet: nothing to weigh
    const h = r.holding, e = merged.get(r.key);
    if(e){ e.value += r.value; e.diversified = e.diversified && healthHoldingDiversified(h); return; }
    merged.set(r.key, { symbol: h.symbol, type: h.assetType, cls: HEALTH_CLASS[h.assetType], currency: r.priceCurrency || h.currency || 'THB',
      value: r.value, price: r.price, diversified: healthHoldingDiversified(h) });
  }));
  const rows = [...merged.values()].sort((a, b) => b.value - a.value).slice(0, 50);
  const sumVals = rows.reduce((s, r) => s + r.value, 0);
  const otherVal = investable > 0 ? Math.max(0, investable - sumVals) : 0;
  const rawW = rows.map(r => investable > 0 ? r.value / investable * 100 : 0);
  const rawOther = investable > 0 ? otherVal / investable * 100 : 0;
  const shares = healthRoundShares(rawW.concat([rawOther]), 1);
  const holdings = rows.map((r, i) => ({ symbol: r.symbol, type: r.type, class: r.cls, currency: r.currency, weight_pct: shares[i],
    price_at_upload: hRound(r.price, 6), diversified: r.diversified, change_1d_pct: null }));
  const other = shares[rows.length];

  let allocation = [];
  if(assets > 0){
    const byClass = { CASH: Math.max(0, summary.cashTotal) };
    rows.forEach(r => { byClass[r.cls] = (byClass[r.cls] || 0) + r.value; });
    if(otherVal > 0) byClass.OTHER = otherVal;
    const classes = HEALTH_CLASS_ORDER.filter(c => byClass[c] > 0);
    const pcts = healthRoundShares(classes.map(c => byClass[c] / assets * 100), 1);
    allocation = classes.map((c, i) => ({ class: c, pct: pcts[i] })).filter(x => x.pct > 0);
  }
  const fxVal = rows.filter(r => r.currency !== 'THB').reduce((s, r) => s + r.value, 0);
  const fx = {};
  rows.forEach(r => { if(r.currency !== 'THB'){ const f = fxRate(fxCache || {}, r.currency); if(f) fx[r.currency] = hRound(f.rate, 4); } });
  let top = null;   // the biggest single name (diversified funds and ETFs excluded); pct 0 when there is none
  if(investable > 0 && holdings.length){
    const t = holdings.filter(h => !h.diversified).sort((a, b) => b.weight_pct - a.weight_pct)[0];
    top = t ? { symbol: t.symbol, pct: t.weight_pct } : { symbol: null, pct: 0 };
  }
  return {
    investable_share_pct: assets > 0 ? hRound(investable / assets * 100, 1) : null,
    investable_other_pct: other, allocation, holdings,
    fx_exposure_pct: assets > 0 ? hRound(fxVal / assets * 100, 1) : null,
    fx_at_upload: fx, top
  };
}

/* ---------- Net-worth history: 30-day change and drawdown ---------- */
// Market-only change between two snapshots: units held on both dates x change in unit price (the same rule as monthChange).
function healthMarketDelta(from, to){
  const prev = new Map((from.holdings || []).map(h => [h.key, h]));
  let m = 0;
  (to.holdings || []).forEach(h => { const p = prev.get(h.key); if(p) m += p.units * (h.unitTHB - p.unitTHB); });
  return m;
}
// snapshots: the stored map; nowSnap: buildSnapshot of the live summary (replaces today's stored one).
function healthHistory(snapshots, today, nowSnap){
  const all = Object.assign({}, snapshots || {});
  if(nowSnap) all[today] = nowSnap;
  const days = Object.keys(all).filter(d => d <= today).sort();
  const out = { change_30d_pct: null, change_30d_split: null, drawdown_from_90d_high_pct: null };
  if(!nowSnap || days.length < 2) return out;
  // 30 days: the latest snapshot that is 30 to 60 days old.
  const base = days.filter(d => daysBetweenISO(d, today) >= 30 && daysBetweenISO(d, today) <= 60).pop();
  if(base && all[base].net > 0){
    const b = all[base], total = (nowSnap.net - b.net) / b.net * 100, market = healthMarketDelta(b, nowSnap) / b.net * 100;
    out.change_30d_pct = hRound(total, 1);
    out.change_30d_split = { market_pct: hRound(market, 1), flows_pct: hRound(total - market, 1) };
  }
  // 90-day high of the market-only level (deposits and withdrawals are taken out so they cannot look like a drawdown).
  const win = days.filter(d => daysBetweenISO(d, today) <= 90);
  if(win.length >= 2){
    let level = all[win[0]].net, high = level;
    for(let i = 1; i < win.length; i++){
      level += healthMarketDelta(all[win[i - 1]], all[win[i]]);
      if(level > high) high = level;
    }
    if(high > 0) out.drawdown_from_90d_high_pct = hRound(Math.max(0, (high - level) / high * 100), 1);
  }
  return out;
}

/* ---------- Spending pace ---------- */
// sp: { day, dim, income, fixed, actual, remaining } for the current month (amounts stay inside). pace is null until day 8 or without income.
function healthSpendPace(sp, tolerancePct){
  const progress = Math.round(sp.day / sp.dim * 100);
  const spendable = sp.income - sp.fixed;
  let aheadPct = null, pace = null;
  if(sp.income > 0 && spendable > 0 && sp.day > HEALTH_PACE_AFTER_DAY){
    const expected = spendable * sp.day / sp.dim;
    aheadPct = hRound((sp.actual - expected) / expected * 100, 1);
    pace = aheadPct > tolerancePct ? 'ahead' : aheadPct < -tolerancePct ? 'behind' : 'on_track';
  }
  return { month_progress_pct: progress, pace, aheadPct };
}

/* ---------- Freshness ---------- */
// summary = wealthSummary(); today 'YYYY-MM-DD'; autoAts: the `at` of every holding's auto price.
function healthFreshness(summary, today, autoAts){
  let stale = 0;
  summary.invest.forEach(a => (a.holdings || []).forEach(r => { if(r.stale) stale++; }));
  const manual = [];
  summary.cash.concat(summary.invest).forEach(a => { if(!a.hasHoldings && a.asOf) manual.push(a.asOf); });
  summary.debts.forEach(d => { if(d.asOf && (!d.auto || d.overridden)) manual.push(d.asOf); });
  const ages = manual.map(d => daysBetweenISO(d, today)).filter(n => n >= 0);
  const ats = (autoAts || []).filter(a => isFinite(Date.parse(a))).sort((x, y) => Date.parse(y) - Date.parse(x));
  return { prices_as_of: ats[0] || null, stale_items: stale, oldest_manual_days: ages.length ? Math.max.apply(null, ages) : null };
}

/* ---------- Triggers T1-T9 (ROADMAP B5.2; T10 and goals come later) ---------- */
// m (every field may be null): { runway, savings3m, fxExposure, drawdown, fxMove7d, holdings:[{symbol,weight_pct,diversified,change_1d_pct}],
//   spend:{ day, income, remaining, aheadPct }, cards:[{ name, off }], freshness:{ stale_items, oldest_manual_days } }
// th = healthThresholds(). Returns [{ id, severity, text_th, metric, value, threshold }] in id order. Nothing fires on a null metric.
function healthTriggers(m, th){
  const out = [];
  const add = (id, severity, text_th, metric, value, threshold) => out.push({ id, severity, text_th, metric, value, threshold });
  const tgt = n => String(hRound(n, 1));

  if(hNum(m.runway) && m.runway < th.emergencyMonthsTarget){
    const act = m.runway < 3;
    add('T1', act ? 'act' : 'watch', act ? `เงินสำรองเหลือพอใช้แค่ ${m.runway.toFixed(1)} เดือน (เป้า ${tgt(th.emergencyMonthsTarget)})` : `เงินสำรองพอใช้ ${m.runway.toFixed(1)} เดือน (เป้า ${tgt(th.emergencyMonthsTarget)})`,
      'cash_runway_months', m.runway, th.emergencyMonthsTarget);
  }
  const hs = m.holdings || [];
  const over = hs.filter(h => !h.diversified && hNum(h.weight_pct) && h.weight_pct > th.maxSingleHoldingPct).sort((a, b) => b.weight_pct - a.weight_pct);
  if(over.length){
    add('T2', 'watch', `${over[0].symbol} ใหญ่ ${over[0].weight_pct.toFixed(1)}% ของเงินลงทุน (เกณฑ์ ${tgt(th.maxSingleHoldingPct)})${over.length > 1 ? ` และอีก ${over.length - 1} ตัว` : ''}`,
      'top_single_holding_pct', over[0].weight_pct, th.maxSingleHoldingPct);
  }
  const moved = hs.filter(h => hNum(h.change_1d_pct) && hNum(h.weight_pct) && h.weight_pct >= th.bigMoveMinWeightPct && Math.abs(h.change_1d_pct) >= th.bigMovePct)
    .sort((a, b) => Math.abs(b.change_1d_pct) - Math.abs(a.change_1d_pct));
  if(moved.length){
    add('T3', 'info', `${moved[0].symbol} ขยับ ${healthSigned(moved[0].change_1d_pct)}% ในวันเดียว${moved.length > 1 ? ` และอีก ${moved.length - 1} ตัว` : ''}`,
      'holding_change_1d_pct', moved[0].change_1d_pct, th.bigMovePct);
  }
  if(hNum(m.drawdown) && m.drawdown >= th.drawdownPct){
    add('T4', 'watch', `ความมั่งคั่งลดลง ${m.drawdown.toFixed(1)}% จากจุดสูงสุดใน 90 วัน (เกณฑ์ ${tgt(th.drawdownPct)})`, 'drawdown_from_90d_high_pct', m.drawdown, th.drawdownPct);
  }
  const sp = m.spend;
  if(sp && sp.income > 0 && sp.day > HEALTH_PACE_AFTER_DAY){
    if(sp.remaining < 0){
      add('T5', 'act', 'เดือนนี้ใช้จ่ายเกินรายได้แล้ว', 'spend_pace_ahead_pct', hNum(sp.aheadPct) ? sp.aheadPct : null, th.spendPaceTolerancePct);
    }else if(hNum(sp.aheadPct) && sp.aheadPct > th.spendPaceTolerancePct){
      add('T5', 'watch', `เดือนนี้ใช้จ่ายเร็วกว่าที่ควร ${sp.aheadPct.toFixed(1)}% (เกณฑ์ ${tgt(th.spendPaceTolerancePct)})`, 'spend_pace_ahead_pct', sp.aheadPct, th.spendPaceTolerancePct);
    }
  }
  const due = (m.cards || []).filter(c => hNum(c.off) && c.off <= HEALTH_REMIND_DAYS).sort((a, b) => a.off - b.off);
  if(due.length){
    const c = due[0];
    const when = c.off < 0 ? `เลยกำหนด ${-c.off} วัน` : c.off === 0 ? 'ครบกำหนดวันนี้' : c.off === 1 ? 'ครบกำหนดพรุ่งนี้' : `ครบกำหนดอีก ${c.off} วัน`;
    add('T6', 'act', `${c.name} ${when}${due.length > 1 ? ` และอีก ${due.length - 1} ใบ` : ''}`, 'card_due_in_days', c.off, HEALTH_REMIND_DAYS);
  }
  const fr = m.freshness || {};
  const staleN = hNum(fr.stale_items) ? fr.stale_items : 0, oldest = hNum(fr.oldest_manual_days) ? fr.oldest_manual_days : null;
  if(staleN > 0 || (oldest !== null && oldest > STALE_BALANCE_DAYS)){
    const parts = [];
    if(staleN > 0) parts.push(`ราคาเก่า ${staleN} ตัว`);
    if(oldest !== null && oldest > STALE_BALANCE_DAYS) parts.push(`ยอดที่ใส่เองเก่า ${oldest} วัน`);
    add('T7', 'info', parts.join(' '), staleN > 0 ? 'stale_items' : 'oldest_manual_days', staleN > 0 ? staleN : oldest, staleN > 0 ? 0 : STALE_BALANCE_DAYS);
  }
  if(hNum(m.fxExposure) && hNum(m.fxMove7d) && m.fxExposure > th.fxExposureWatchPct && Math.abs(m.fxMove7d) >= HEALTH_FX_MOVE_PCT){
    add('T8', 'info', `สินทรัพย์ต่างประเทศ ${m.fxExposure.toFixed(1)}% และบาทขยับ ${Math.abs(m.fxMove7d).toFixed(1)}% ใน 7 วัน`, 'fx_exposure_pct', m.fxExposure, th.fxExposureWatchPct);
  }
  if(hNum(m.savings3m) && m.savings3m < th.savingsRateTarget){
    add('T9', 'watch', `ออมเฉลี่ย 3 เดือนได้ ${(m.savings3m * 100).toFixed(1)}% (เป้า ${tgt(th.savingsRateTarget * 100)}%)`, 'savings_rate_3m', m.savings3m, th.savingsRateTarget);
  }
  return out;
}

/* ---------- The state-backed computation ---------- */
// Runs fn with `st` as the global state (monthFigures, getEffectiveSettings and friends read the global), then puts the old one back.
function healthWithState(st, fn){
  const prev = state;
  state = st;
  try{ return fn(); }finally{ state = prev; }
}
function healthLocalDay(now){ return isoFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate()); }
// Bangkok wall clock (UTC+7), whatever the phone's own zone is: { day:'YYYY-MM-DD', iso:'...+07:00' }.
function healthBangkok(now){
  const t = new Date(now.getTime() + 7 * 3600 * 1000), p = n => String(n).padStart(2, '0');
  const day = t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(t.getUTCDate());
  return { day, iso: day + 'T' + p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()) + ':' + p(t.getUTCSeconds()) + '+07:00' };
}

// Everything the health card and the payload show, from one state. st defaults to the live state, now to the clock.
function healthCompute(st, now){
  st = st || state; now = now || new Date();
  return healthWithState(st, () => {
    const today = healthLocalDay(now);
    const th = healthThresholds(st.wealthSettings);
    const sum = wealthSummary(wealthData(), derivedDebtsNow(today), today);
    const pf = healthPortfolio(sum, st.fxCache);

    const entryMonths = st.entries.map(e => String(e.date).slice(0, 7)).filter(k => /^\d{4}-\d{2}$/.test(k)).sort();
    const firstMonth = entryMonths[0] || null;
    const stats = [1, 2, 3].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return firstMonth && monthKey(d) >= firstMonth ? healthMonthStat(monthFigures(d)) : null;
    });
    const rates = healthRates(stats, sum.cashTotal);

    const hist = healthHistory(st.snapshots, today, buildSnapshot(sum));
    const fig = monthFigures(now);
    const dim = daysInMonth(now.getFullYear(), now.getMonth() + 1);
    const pace = healthSpendPace({ day: now.getDate(), dim, income: fig.income, fixed: fig.fixed, actual: fig.variable + fig.tripFromIncome, remaining: fig.remaining }, th.spendPaceTolerancePct);
    const budgets = getEffectiveBudgets(monthKey(now)), spentBy = {};
    fig.entries.forEach(e => { spentBy[e.category] = (spentBy[e.category] || 0) + e.amount; });
    const overBudget = Object.keys(budgets).filter(c => budgets[c] > 0 && spentBy[c] > budgets[c]);

    const cardRows = cardDueRows(today, st.paymentMethods.filter(isCardMethod), st.entries, st.cardPayments)
      .map(r => ({ type: 'card', label: /^บัตร/.test(r.name) ? r.name : 'บัตร ' + r.name, due_in_days: r.off, amount: r.amount }));
    const fixedRows = upcomingPayments(now).map(p => ({ type: 'fixed', label: p.name, due_in_days: p.off, amount: p.amount }));
    const upcoming = fixedRows.concat(cardRows).sort((a, b) => a.due_in_days - b.due_in_days);

    const trip = activeTrip();
    let tripOut = null;
    if(trip){
      const spent = tripEntriesOf(trip.id).reduce((s, e) => s + e.amount, 0);
      tripOut = { name: trip.name, day: Math.max(0, dayNum(today) - dayNum(trip.startDate) + 1), days: dayNum(trip.endDate) - dayNum(trip.startDate) + 1,
        budget_used_pct: trip.budget > 0 ? Math.round(spent / trip.budget * 100) : null };
    }

    const autoAts = wLive(st.holdings).map(h => autoPriceOf(st.priceCache[priceKey(h.assetType, h.assetType === 'gold' ? 'GOLD' : h.symbol)])).filter(Boolean).map(a => a.at);
    const freshness = healthFreshness(sum, today, autoAts);
    const health = {
      change_1d_pct: null, change_30d_pct: hist.change_30d_pct, change_30d_split: hist.change_30d_split,
      savings_rate_month: rates.savings_rate_month, savings_rate_3m: rates.savings_rate_3m, cash_runway_months: rates.cash_runway_months,
      debt_to_assets: sum.assets > 0 ? hRound(sum.debtTotal / sum.assets, 3) : null,
      fx_exposure_pct: pf.fx_exposure_pct, drawdown_from_90d_high_pct: hist.drawdown_from_90d_high_pct
    };
    const triggers = healthTriggers({
      runway: health.cash_runway_months, savings3m: health.savings_rate_3m, fxExposure: health.fx_exposure_pct, drawdown: health.drawdown_from_90d_high_pct, fxMove7d: null,
      holdings: pf.holdings, spend: { day: now.getDate(), income: fig.income, remaining: fig.remaining, aheadPct: pace.aheadPct },
      cards: cardRows.map(r => ({ name: r.label, off: r.due_in_days })), freshness
    }, th);
    return {
      today, th, summary: sum, health, portfolio: pf, freshness, triggers, upcoming, trip: tripOut,
      top_single_holding_pct: pf.top ? pf.top.pct : null, top_single_holding_symbol: pf.top ? pf.top.symbol : null,
      spending: { month_progress_pct: pace.month_progress_pct, pace: pace.pace, over_budget_categories: overBudget },
      ws: st.wealthSettings || defaultWealthSettings(),
      hasData: sum.hasData
    };
  });
}

/* ---------- The payload (schema_version 1) ---------- */
function buildBriefingPayload(st, now){
  st = st || state; now = now || new Date();
  const c = healthCompute(st, now), bk = healthBangkok(now), pf = c.portfolio;
  const th = {};
  HEALTH_THRESHOLD_KEYS.forEach(k => { th[k] = c.th[k]; });
  const payload = {
    schema_version: HEALTH_SCHEMA_VERSION,
    personal_as_of: bk.day,
    uploaded_at: bk.iso,
    thresholds: th,
    freshness: c.freshness,
    health: c.health,
    investable_share_pct: pf.investable_share_pct,
    investable_other_pct: pf.investable_other_pct,
    allocation: pf.allocation,
    holdings: pf.holdings,
    fx_at_upload: pf.fx_at_upload,
    spending: c.spending,
    upcoming: c.upcoming.map(u => ({ type: u.type, label: u.label, due_in_days: u.due_in_days })),
    trip: c.trip,
    goals: [],
    triggers: c.triggers,
    amounts: null
  };
  if(c.ws.briefingShareAmounts === true){
    const s = c.summary;
    payload.amounts = { net_worth: Math.round(s.net), liquid: Math.round(s.cashTotal), liabilities: Math.round(s.debtTotal),
      upcoming_thb: Math.round(c.upcoming.reduce((t, u) => t + (u.amount || 0), 0)) };
  }
  return payload;
}
// What decides "did anything change": the payload without the upload time.
function briefingPayloadHash(payload){
  const copy = Object.assign({}, payload);
  delete copy.uploaded_at;
  return healthHash(JSON.stringify(copy));
}
