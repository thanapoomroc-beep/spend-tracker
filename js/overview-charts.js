/* ---------- Breakdown by payment method (ภาพรวม) ---------- */
// The one place that decides which entries feed the method breakdown (a later phase can exclude trip entries here).
function paymentStatsEntries(monthEntries){ return monthEntries.filter(e => !e.tripId); }
function renderPayBreakdown(entries, els){
  els = els || { card: document.getElementById('payCard'), body: document.getElementById('payBody'), total: document.getElementById('payTotal') };
  const card = els.card, body = els.body;
  body.innerHTML = '';
  card.style.display = entries.length ? '' : 'none';
  if(!entries.length){ els.total.textContent = ''; return; }
  const by = new Map();
  entries.forEach(e=>{ const k = findPay(e.paymentMethod) ? e.paymentMethod : ''; by.set(k, (by.get(k) || 0) + e.amount); });
  const rows = [...by.entries()].map(([id, sum]) => ({ id, sum, name: id ? payName(id) : 'ไม่ระบุ' })).sort((a,b)=> b.sum - a.sum);
  const total = rows.reduce((s,r)=> s + r.sum, 0);
  const max = rows[0].sum;
  els.total.textContent = 'รวม ' + fmt(total);
  rows.forEach(r=>{
    const li = document.createElement('li');
    li.innerHTML = `<div class="pb-head"><span class="nm">${escapeHtml(r.name)}</span><span class="amt">${fmt(r.sum)}</span><span class="pct">${Math.round(r.sum / total * 100)}%</span></div><div class="pb-bar" aria-hidden="true"><span style="width:${max > 0 ? r.sum / max * 100 : 0}%"></span></div>`;
    body.appendChild(li);
  });
}

/* ---------- Budget alert (inside the hero) ---------- */
// Categories at 80% or more of their budget this calendar month. Colour plus the words used / over.
function renderBudgetAlert(budgets, monthEntries, travel){
  const btn = document.getElementById('budgetAlert');
  if(travel){ btn.style.display = 'none'; btn.innerHTML = ''; return; }
  const spentBy = {};
  monthEntries.forEach(e=>{ spentBy[e.category] = (spentBy[e.category]||0) + e.amount; });
  const hits = state.categories.map(c => c.name).filter(n => budgets[n] > 0 && spentBy[n] / budgets[n] >= 0.8)
    .map(n => ({ name:n, budget:budgets[n], spent:spentBy[n], ratio:spentBy[n] / budgets[n] }))
    .sort((a,b)=> b.ratio - a.ratio);
  btn.style.display = hits.length ? '' : 'none';
  if(!hits.length){ btn.innerHTML = ''; return; }
  const top = hits[0];
  const over = top.spent > top.budget;
  btn.className = 'hero-alert ' + (over ? 'neg' : 'warn');
  const txt = over ? `${top.name}เกินงบ ${fmt(top.spent - top.budget)}`
    : top.spent === top.budget ? `${top.name}ใช้ครบงบแล้ว`
    : `${top.name}ใช้ไป ${Math.round(top.ratio * 100)}%`;
  btn.innerHTML = `<span class="sr-only">ดูภาพรวมงบ </span><span class="ba-txt"><b>${escapeHtml(txt)}</b></span>${hits.length > 1 ? `<span class="ba-more">อีก ${hits.length - 1} หมวด</span>` : ''}<svg class="chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>`;
}

/* ---------- Upcoming payments (F3) ---------- */
// Items due within the next 7 days (today included), wrapping into next month.
// dueDay beyond the month's length falls on the last day of that month.
function upcomingPayments(now){
  const out = [];
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for(let off = 0; off <= 7; off++){
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + off);
    const dim = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    getEffectiveSettings(monthKey(d)).fixedItems.forEach(it=>{
      if(!(it.dueDay >= 1) || !(it.amount > 0)) return;
      if(Math.min(it.dueDay, dim) === d.getDate()) out.push({ off, name: it.name || 'รายการ', amount: it.amount });
    });
  }
  return out;
}
function renderDueCard(travel){
  const card = document.getElementById('dueCard');
  const list = document.getElementById('dueList');
  list.innerHTML = '';
  const now = new Date();
  const items = travel ? [] : upcomingPayments(now);
  card.style.display = items.length ? '' : 'none';
  items.forEach(p=>{
    const li = document.createElement('li');
    if(p.off === 0) li.className = 'today';
    const when = p.off === 0 ? 'วันนี้' : p.off === 1 ? 'พรุ่งนี้' : `อีก ${p.off} วัน`;
    li.innerHTML = `<span class="due-name">${escapeHtml(p.name)}<span class="due-when">${when}</span></span><span class="due-amt">${fmt(p.amount)}</span>`;
    list.appendChild(li);
  });
}

/* ---------- Installments card (F2) ---------- */
function renderInstallCard(fixedItems){
  const mKey = monthKey(currentMonth);
  const card = document.getElementById('installCard');
  const body = document.getElementById('installBody');
  body.innerHTML = '';
  const items = fixedItems.filter(i => { const inf = installmentInfo(i, mKey); return inf && inf.status === 'active'; });
  card.style.display = items.length ? '' : 'none';
  items.forEach(it=>{
    const inf = installmentInfo(it, mKey);
    const nm = escapeHtml(it.name || 'รายการ');
    const row = document.createElement('div');
    row.className = 'budget-row';
    row.innerHTML = `
      <div class="budget-head"><span class="name">${nm}</span><span class="nums">เดือนละ ${fmt(it.amount || 0)}</span></div>
      <div class="bar inst" role="progressbar" aria-label="${nm} ผ่อนไปแล้วงวดที่ ${inf.termNo} จาก ${inf.total}" aria-valuemin="0" aria-valuemax="${inf.total}" aria-valuenow="${inf.termNo}"><span style="width:${inf.termNo / inf.total * 100}%"></span></div>
      <div class="budget-foot">${escapeHtml(installmentText(it, mKey)).replace(/\n/g, '<br>')}</div>`;
    body.appendChild(row);
  });
}

/* ---------- Daily totals, month-over-month compare, heatmap ---------- */
function dailyTotals(d){
  const dim = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  const arr = new Array(dim).fill(0);
  entriesForMonth(d).forEach(e=>{
    const day = parseISODate(e.date).getDate();
    if(day >= 1 && day <= dim) arr[day-1] += e.amount;
  });
  return arr;
}
function cumulative(arr, upto){
  let s = 0;
  return arr.map((v,i)=> i < upto ? (s += v) : null);
}
// Days of the viewed month that have "happened": today's date for the current month, all for past, none for future.
function daysElapsed(dim){
  const now = new Date(), vk = monthKey(currentMonth), tk = monthKey(now);
  return vk === tk ? now.getDate() : (vk < tk ? dim : 0);
}
function d2label(d){ return d.toLocaleString('th-TH', { month:'short' }); }

// Toggle the "charts need to be online" message when Chart.js failed to load.
function chartAvailable(canvasId){
  const wrap = document.getElementById(canvasId).closest('.chart-wrap');
  const ok = typeof Chart !== 'undefined';
  wrap.classList.toggle('no-chart', !ok);
  return ok;
}

function renderCompareChart(){
  const note = document.getElementById('compareNote');
  const cur = dailyTotals(currentMonth);
  const prevDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth()-1, 1);
  const prev = dailyTotals(prevDate);
  const upto = daysElapsed(cur.length);
  const curCum = cumulative(cur, upto);
  const prevCum = cumulative(prev, prev.length);

  if(upto === 0){
    note.textContent = viewedMonthWord() + ' ยังไม่เริ่ม';
  }else{
    const prevAt = prevCum[Math.min(upto, prev.length) - 1];
    const diff = curCum[upto-1] - prevAt;
    const when = upto === cur.length && monthKey(currentMonth) !== monthKey(new Date()) ? 'ทั้งเดือน' : `ถึงวันที่ ${upto}`;
    note.innerHTML = diff === 0
      ? `${when} ใช้เท่าเดือนก่อน`
      : `${when} ใช้<span class="${diff > 0 ? 'more' : 'less'}">${diff > 0 ? 'มากกว่า' : 'น้อยกว่า'}เดือนก่อน ${fmt(Math.abs(diff))}</span>`;
  }

  if(!chartAvailable('compareChart')) return;
  const n = Math.max(cur.length, prev.length);
  const labels = Array.from({length:n}, (_,i)=> i+1);
  const ctx = document.getElementById('compareChart').getContext('2d');
  if(compareChart) compareChart.destroy();
  compareChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [
      { label: d2label(currentMonth), data: curCum, borderColor:'#E8D3A8', backgroundColor:'rgba(232,211,168,.15)', fill:true, pointRadius:0, borderWidth:2.5, tension:.15 },
      { label: d2label(prevDate), data: prevCum, borderColor:'#9A9CA3', borderDash:[5,4], pointRadius:0, borderWidth:2, tension:.15 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      plugins: {
        legend: { labels: { color:'#F2F2F4', font:{size:11} } },
        tooltip: { callbacks: { title: it => 'วันที่ ' + it[0].label, label: it => ` ${it.dataset.label}: ${fmt(it.parsed.y)}` } }
      },
      scales: {
        x: { ticks:{color:'#9A9CA3', maxTicksLimit:8}, grid:{color:'#2E3035'} },
        y: { beginAtZero:true, ticks:{color:'#9A9CA3'}, grid:{color:'#2E3035'} }
      }
    }
  });
}

function compactMoney(n){
  if(n >= 10000) return Math.round(n/1000) + 'k';
  if(n >= 1000) return (n/1000).toFixed(1).replace(/\.0$/,'') + 'k';
  return String(Math.round(n));
}
function renderHeatmap(){
  const el = document.getElementById('heatmap');
  const cur = dailyTotals(currentMonth);
  const max = Math.max(0, ...cur);
  const lead = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const now = new Date();
  const todayDay = monthKey(currentMonth) === monthKey(now) ? now.getDate() : 0;
  let html = ['อา','จ','อ','พ','พฤ','ศ','ส'].map(x=>`<div class="heat-dow" aria-hidden="true">${x}</div>`).join('');
  for(let i=0;i<lead;i++) html += '<div></div>';
  cur.forEach((v,i)=>{
    const day = i+1;
    let style = '', amt = '', aria = '';
    if(v > 0){
      const a = 0.2 + 0.8 * (v / max);
      // Opaque mix of --panel2 and the sand accent, so text colour can be picked by real contrast.
      const mix = [34,35,39].map((c,k)=> Math.round(c + ([232,211,168][k] - c) * a));
      const lin = mix.map(v=>{ v/=255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); });
      const lum = .2126*lin[0] + .7152*lin[1] + .0722*lin[2];
      const darkText = (lum + .05) / (0.0049 + .05) > (0.886 + .05) / (lum + .05);
      style = `background:rgb(${mix.join(',')});` + (darkText ? 'color:var(--on-accent);' : 'color:var(--text);');
      amt = `<span class="a">${compactMoney(v)}</span>`;
      aria = ` role="img" aria-label="วันที่ ${day} ใช้ ${fmt(v)}"`;
    }
    html += `<div class="heat-cell${day === todayDay ? ' today' : ''}" style="${style}"${aria}><span class="d">${day}</span>${amt}</div>`;
  });
  el.innerHTML = html;
}

function renderPieChart(monthEntries, fixedItems){
  if(!chartAvailable('pieChart')) return;
  const labels = [];
  const data = [];
  const colors = [];

  const financingTotal = (fixedItems||[]).filter(i => i.group === 'financing').reduce((s,i)=> s + (i.amount||0), 0);
  const subscriptionTotal = (fixedItems||[]).filter(i => i.group !== 'financing').reduce((s,i)=> s + (i.amount||0), 0);
  const fixedSum = financingTotal + subscriptionTotal;

  // One neutral slice for all fixed items; the tooltip lists the breakdown.
  if(fixedSum > 0){
    labels.push('รายการประจำ');
    data.push(fixedSum);
    colors.push(FIXED_COLOR);
  }

  // Coloured categories in fixed slot order; every category without a slot is grouped as `อื่นๆ`.
  const byCat = {}, otherParts = {};
  monthEntries.forEach(e=>{
    const g = chartGroup(e.category);
    byCat[g] = (byCat[g]||0) + e.amount;
    if(g === 'อื่นๆ') otherParts[e.category] = (otherParts[e.category]||0) + e.amount;
  });
  colouredCatsBySlot().forEach(c=>{
    if(byCat[c.name]){
      labels.push(c.name);
      data.push(byCat[c.name]);
      colors.push(categoryColor(c.name));
    }
  });
  if(byCat['อื่นๆ']){
    labels.push('อื่นๆ');
    data.push(byCat['อื่นๆ']);
    colors.push(NEUTRAL_COLOR);
  }

  const ctx = document.getElementById('pieChart').getContext('2d');
  const legend = document.getElementById('pieLegend');
  legend.innerHTML = '';
  if(pieChart){ pieChart.destroy(); pieChart = null; }
  if(labels.length === 0){
    ctx.clearRect(0,0,9999,9999);
    document.getElementById('pieCenter').style.display = 'none';
    return;
  }
  const total = data.reduce((a,b)=> a + b, 0);
  // Direct labels: the legend list carries name, amount and share, so identity is never colour-alone.
  labels.forEach((l,i)=>{
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot" style="background:${colors[i]}" aria-hidden="true"></span><span class="nm">${escapeHtml(l)}</span><span class="amt">${fmt(data[i])}</span><span class="pct">${Math.round(data[i] / total * 100)}%</span>`;
    legend.appendChild(li);
  });
  document.getElementById('pieTotal').textContent = fmt(total);
  document.getElementById('pieCenter').style.display = '';
  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: CHART_PANEL, borderWidth: 3, borderRadius: 6, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '74%', layout:{ padding:8 },
      plugins: {
        legend: { display:false },
        tooltip: Object.assign(chartTooltip(), { callbacks: {
          label: it => ` ${it.label}: ${fmt(it.parsed)} (${Math.round(it.parsed / total * 100)}%)`,
          afterLabel: it => it.label === 'รายการประจำ' ? [`ผ่อน/ลงทุน ${fmt(financingTotal)}, ค่าสมาชิก ${fmt(subscriptionTotal)}`]
            : (it.label === 'อื่นๆ' && Object.keys(otherParts).some(n => n !== 'อื่นๆ')) ? Object.keys(otherParts).map(n => `${n} ${fmt(otherParts[n])}`) : []
        } })
      }
    }
  });
}

// Shared chart look: recessive grid, muted ticks, tooltip on the elevated surface.
const CHART_TEXT = '#F2F2F4', CHART_MUTED = '#9A9CA3', CHART_GRID = '#222327', CHART_PANEL = '#18191C';
function chartTooltip(){
  return {
    backgroundColor:'#222327', borderColor:'#2E3035', borderWidth:1, padding:10, cornerRadius:10,
    titleColor:CHART_TEXT, bodyColor:CHART_TEXT, footerColor:CHART_TEXT, footerFont:{ weight:'bold' },
    boxPadding:4, usePointStyle:true
  };
}
function setChartFont(){
  if(typeof Chart === 'undefined') return;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = CHART_MUTED;
}

/* ---------- Trend (F4): stacked bars + income line ---------- */
let trendRange = 6;

// Month-by-month data shared by the chart and the text table.
function trendSeries(n){
  const months = [];
  for(let i = n-1; i >= 0; i--) months.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth()-i, 1));
  const keys = months.map(monthKey);
  const fixed = keys.map(k => fixedTotal(k));
  const income = keys.map(k => getEffectiveSettings(k).income || 0);
  const series = colouredCatsBySlot().map(c => ({ label:c.name, color:SLOT_COLORS[c.slot], data: keys.map(()=>0) }));
  const idx = new Map(series.map((s,i)=>[s.label, i]));
  const other = keys.map(()=>0);
  const tripSum = keys.map(()=>0);
  state.entries.forEach(e=>{
    const mi = keys.indexOf(e.date.slice(0,7));
    if(mi < 0) return;
    if(e.tripId){ tripSum[mi] += e.amount; return; }   // trips stack on top as their own segment
    const si = idx.get(e.category);
    if(si !== undefined) series[si].data[mi] += e.amount; else other[mi] += e.amount;
  });
  const bars = [{ label:'รายการประจำ', color:FIXED_COLOR, data:fixed }]
    .concat(series.filter(s => s.data.some(v => v > 0)));
  if(other.some(v => v > 0)) bars.push({ label:'อื่นๆ', color:NEUTRAL_COLOR, data:other });
  if(tripSum.some(v => v > 0)) bars.push({ label:'ทริป', color:TRIP_COLOR, trip:true, data:tripSum });
  const totals = keys.map((_,i)=> bars.reduce((s,b)=> s + b.data[i], 0));
  return { months, keys, bars, income, totals };
}

function renderTrendTable(t){
  const tbl = document.getElementById('trendTable');
  const mlabel = d => d.toLocaleString('th-TH', { month:'short', year:'numeric' });
  let html = '<thead><tr><th scope="col">เดือน</th>' + t.bars.map(b => `<th scope="col">${escapeHtml(b.label)}</th>`).join('') + '<th scope="col">รวม</th><th scope="col">รายได้</th></tr></thead><tbody>';
  t.months.forEach((d,i)=>{
    html += `<tr><td>${escapeHtml(mlabel(d))}</td>` + t.bars.map(b => `<td>${b.data[i] > 0 ? fmt(b.data[i]) : '-'}</td>`).join('') + `<td>${fmt(t.totals[i])}</td><td>${t.income[i] > 0 ? fmt(t.income[i]) : '-'}</td></tr>`;
  });
  tbl.innerHTML = html + '</tbody>';
}

function setTrendRange(n){
  trendRange = n === 12 ? 12 : 6;
  try{ localStorage.setItem(TREND_KEY, String(trendRange)); }catch(e){}
  document.getElementById('trend6').setAttribute('aria-pressed', trendRange === 6 ? 'true' : 'false');
  document.getElementById('trend12').setAttribute('aria-pressed', trendRange === 12 ? 'true' : 'false');
  renderTrendChart();
}

function renderTrendChart(){
  const t = trendSeries(trendRange);
  renderTrendTable(t);
  if(!chartAvailable('trendChart')) return;

  const TEXT = CHART_TEXT, MUTED = CHART_MUTED;
  const last = t.months.length - 1;
  // The selected month (always the last bar) stays full strength; earlier months recede.
  const dim = (hex, i) => i === last ? hex : hex + '73';
  // top-most non-zero bar segment of each month gets the rounded corners
  const topIdx = t.keys.map((_,mi)=>{ let top = -1; t.bars.forEach((b,di)=>{ if(b.data[mi] > 0) top = di; }); return top; });
  // The trip segment is ice cyan with a diagonal hatch (a pattern, so it differs from the flat category colours without relying on hue).
  const patCtx = document.getElementById('trendChart').getContext('2d');
  const tripPattern = alpha => {
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const x = c.getContext('2d');
    x.fillStyle = `rgba(92,225,230,${alpha * .3})`; x.fillRect(0, 0, 8, 8);
    x.strokeStyle = `rgba(92,225,230,${alpha})`; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, 8); x.lineTo(8, 0); x.moveTo(-1, 1); x.lineTo(1, -1); x.moveTo(7, 9); x.lineTo(9, 7); x.stroke();
    return patCtx.createPattern(c, 'repeat');
  };
  const patFull = t.bars.some(b => b.trip) ? tripPattern(1) : null, patDim = patFull ? tripPattern(.45) : null;
  const datasets = t.bars.map(b => ({
    type:'bar', label:b.label, data:b.data, stack:'spend', order:1, solidColor:b.color, swatch: b.trip ? patFull : null,
    backgroundColor: c => b.trip ? (c.dataIndex === last ? patFull : patDim) : dim(b.color, c.dataIndex), borderColor:CHART_PANEL, borderWidth:2, borderSkipped:false,
    maxBarThickness:28, categoryPercentage:.62, barPercentage:1,
    borderRadius: c => topIdx[c.dataIndex] === c.datasetIndex ? { topLeft:4, topRight:4, bottomLeft:0, bottomRight:0 } : 0
  }));
  // Income is baht too: same y-axis as the bars (never a second axis).
  datasets.push({
    type:'line', label:'รายได้', data:t.income.map(v => v > 0 ? v : null), order:0,
    borderColor:TEXT, backgroundColor:CHART_PANEL, borderWidth:2, borderDash:[5,4], tension:0, fill:false, spanGaps:false,
    pointRadius:4, pointHoverRadius:6, pointBorderWidth:2, pointStyle:'circle'
  });

  const ctx = document.getElementById('trendChart').getContext('2d');
  if(trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: t.months.map(d => d.toLocaleString('th-TH', { month:'short' })), datasets },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      onClick:(evt, els, chart)=>{
        const hit = chart.getElementsAtEventForMode(evt, 'nearest', { intersect:true }, true);
        if(!hit.length) return;
        const d = t.months[hit[0].index];
        if(monthKey(d) === monthKey(currentMonth)) return;
        // Deferred: render() rebuilds this chart, which must not happen inside its own event handler.
        setTimeout(()=>{ currentMonth = new Date(d.getFullYear(), d.getMonth(), 1); render(); }, 0);
      },
      plugins:{
        legend:{ position:'bottom', labels:{ color:TEXT, usePointStyle:true, pointStyle:'circle', boxWidth:8, boxHeight:8, font:{size:12}, padding:14,
          // legend swatches use the full-strength colour, not the dimmed past-month fill
          generateLabels: chart => Chart.defaults.plugins.legend.labels.generateLabels(chart).map(l => {
            const ds = chart.data.datasets[l.datasetIndex];
            if(ds.solidColor){ l.fillStyle = ds.swatch || ds.solidColor; l.strokeStyle = ds.solidColor; }
            return l;
          }) } },
        tooltip:Object.assign(chartTooltip(), {
          itemSort:(a,b)=>{
            const la = a.dataset.type === 'line', lb = b.dataset.type === 'line';
            return la !== lb ? (la ? 1 : -1) : b.datasetIndex - a.datasetIndex;
          },
          filter: it => it.dataset.type === 'line' ? it.parsed.y !== null : it.parsed.y > 0,
          callbacks:{
            title: items => items.length ? monthLabelStr(t.months[items[0].dataIndex]) : '',
            label: it => ` ${it.dataset.label}: ${fmt(it.parsed.y)}`,
            footer: items => items.length ? `รวม ${fmt(t.totals[items[0].dataIndex])}` : ''
          }
        })
      },
      scales:{
        x:{ stacked:true, border:{ display:false }, grid:{ display:false },
            ticks:{ color: c => c.index === last ? TEXT : MUTED, maxRotation:0, autoSkip:false, font: c => ({ size: t.months.length > 6 ? 11 : 12, weight: c.index === last ? '700' : '400' }) } },
        y:{ stacked:true, beginAtZero:true, border:{ display:false }, grid:{ color:CHART_GRID, drawTicks:false },
            ticks:{ color:MUTED, padding:8, maxTicksLimit:5, callback:v => compactMoney(v) } }
      }
    }
  });
}

