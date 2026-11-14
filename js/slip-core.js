/* Slip inbox (v3b, 2.10.0): pure parsing, de-duplication, receiver rules and migration. No DOM, no network.
   Loaded after briefing-net.js. Function declarations only; everything runs in the shared global scope.
   defaultSlipSettings() lives in core.js because freshState() runs while core.js loads. */

const SLIP_HANDLED_MAX = 500;
const SLIP_UNREADABLE_MAX = 20;
const SLIP_RECEIVERS_MAX = 300;
// Receiver keys that name a gateway or a bank instead of the shop: never learned, always go to review / AI.
const NO_LEARN = ['2c2p', 'kbank', 'k plus', 'kplus', 'k+', 'promptpay', 'gb prime pay', 'gb primepay', 'omise', 'ttb', 'scb', 'bualuang'];

const SLIP_MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  'มค': 1, 'กพ': 2, 'มีค': 3, 'เมย': 4, 'พค': 5, 'มิย': 6, 'กค': 7, 'สค': 8, 'กย': 9, 'ตค': 10, 'พย': 11, 'ธค': 12,
  'มกราคม': 1, 'กุมภาพันธ์': 2, 'มีนาคม': 3, 'เมษายน': 4, 'พฤษภาคม': 5, 'มิถุนายน': 6, 'กรกฎาคม': 7, 'สิงหาคม': 8, 'กันยายน': 9, 'ตุลาคม': 10, 'พฤศจิกายน': 11, 'ธันวาคม': 12
};

function slipIsNoise(line){ return /^[1Il|〈<＜]?\s*\+$/.test(line); }
function slipIsMasked(s){
  return /[x*]{3}-[x*]-[x*]?\d{3,4}/i.test(s) || (/[x*]{3,}/i.test(s) && /\d{4}/.test(s));
}
// Lines that can never be a receiver name.
function slipIsLabel(s){
  return /^(amount|fee|transaction|scan\s+for|verify\s+slip|จำนวน|ค่าธรรมเนียม|ค่าธรรมเนียม|เลขที่|รหัส|ref\b)/i.test(s)
    || /^[\d\s,.:\-/]+$/.test(s) || /^[\d,]+(\.\d+)?\s*(baht|บาท|thb)$/i.test(s) || slipIsMasked(s);
}
function slipCompany(s){ return /CO\.?,?\s*LTD\.?|PUBLIC\s+COMPANY|จำกัด|\bPCL\b/i.test(s); }

function slipDayOfYear(y, m, d){ return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000); }

// Finds the first recognisable date (+ time) in the lines. Returns { date, time, idx } or null.
function slipFindDate(lines){
  const re = /(\d{1,2})\s+([A-Za-zก-๙.]+)\s+(\d{2,4})(?!\d)/g;
  for(let i = 0; i < lines.length; i++){
    re.lastIndex = 0;
    let m;
    while((m = re.exec(lines[i]))){
      const tok = m[2].replace(/\./g, '').toLowerCase();
      const thai = /[ก-๙]/.test(tok);
      const mon = SLIP_MONTHS[thai ? tok : tok.slice(0, 3)];
      if(!mon) continue;
      let y = parseInt(m[3], 10);
      if(m[3].length === 2) y += thai ? 2500 : 2000;
      if(y > 2400) y -= 543;
      const d = parseInt(m[1], 10);
      if(d < 1 || d > 31 || y < 2000 || y > 2100) continue;
      if(new Date(Date.UTC(y, mon - 1, d)).getUTCDate() !== d) continue;
      const rest = lines[i].slice(m.index + m[0].length);
      let tm = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/.exec(rest);
      let idx = i;
      if(!tm && lines[i + 1]){
        tm = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/.exec(lines[i + 1]);
        if(tm) idx = i + 1;
      }
      let time = '';
      if(tm){
        let h = parseInt(tm[1], 10); const mi = parseInt(tm[2], 10);
        if(tm[3]){ h = h % 12 + (/p/i.test(tm[3]) ? 12 : 0); }
        if(h > 23 || mi > 59) continue;
        time = String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
      }
      return { date: y + '-' + String(mon).padStart(2, '0') + '-' + String(d).padStart(2, '0'), time, idx, y, mon, d };
    }
  }
  return null;
}

function slipFindAmount(lines){
  const num = s => { const m = /(\d[\d,]*(?:\.\d+)?)/.exec(s); return m ? parseFloat(m[1].replace(/,/g, '')) : NaN; };
  for(let i = 0; i < lines.length; i++){
    const m = /^(?:amount|จำนวนเงิน|จำนวน)\s*[:：]?\s*(.*)$/i.exec(lines[i]);
    if(!m) continue;
    let v = m[1] ? num(m[1]) : NaN;
    if(!(v > 0) && lines[i + 1]) v = num(lines[i + 1]);
    if(v > 0) return v;
  }
  for(let i = 0; i < lines.length; i++){
    if(/^(fee|ค่าธรรมเนียม)/i.test(lines[i]) || (i > 0 && /^(fee|ค่าธรรมเนียม)\s*[:：]?$/i.test(lines[i - 1]))) continue;
    const m = /(\d[\d,]*(?:\.\d+)?)\s*(?:baht|บาท|thb)/i.exec(lines[i]);
    if(m){ const v = parseFloat(m[1].replace(/,/g, '')); if(v > 0) return v; }
  }
  return 0;
}

function slipFindRef(text, lines){
  const kp = /\d{12}[A-Z]{3}\d{5}/;
  const ti = text.search(/transaction\s*id/i);
  let m = ti >= 0 ? kp.exec(text.slice(ti)) : null;
  if(!m) m = kp.exec(text);
  if(m) return { ref: m[0], kplus: true };
  const g = /(?:เลขที่รายการ|รหัสอ้างอิง|transaction\s*id|ref(?:erence)?(?:\s*no\.?)?)[\s:：.]*([A-Za-z0-9]{8,})/i.exec(text);
  return g ? { ref: g[1], kplus: false } : { ref: '', kplus: false };
}

function slipNameTokens(s){ return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean); }
// Sender "MR. SOMCHAI J" (last token an initial) against receiver "MR. SOMCHAI JAIDEE".
function slipSameOwner(sender, receiver){
  const st = slipNameTokens(sender), rt = slipNameTokens(receiver);
  if(st.length < 2 || rt.length < st.length) return false;
  for(let i = 0; i < st.length - 1; i++) if(st[i] !== rt[i]) return false;
  const a = st[st.length - 1].replace(/\.$/, ''), b = rt[st.length - 1];
  if(!a) return false;
  return b.startsWith(a);
}

function parseSlipText(text, source){
  const out = { ok: false, kind: null, amount: 0, date: '', time: '', receiver: '', ref: '', ownAccount: false, confidence: 'low' };
  const raw = String(text == null ? '' : text);
  const lines = raw.split(/\r?\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s && !slipIsNoise(s));
  const clean = lines.join('\n');
  const head = lines.slice(0, 3).join(' ');
  if(/transfer\s+completed|โอนเงินสำเร็จ|โอนเงิน/i.test(head)) out.kind = 'transfer';
  else if(/payment\s+completed|ชำระเงินสำเร็จ|จ่ายเงินสำเร็จ|ชำระเงิน|จ่ายบิล/i.test(head)) out.kind = 'payment';

  out.amount = slipFindAmount(lines);
  const dt = slipFindDate(lines);
  if(dt){ out.date = dt.date; out.time = dt.time; }
  const rf = slipFindRef(clean, lines);
  out.ref = rf.ref;

  // Receiver: K PLUS layout (sender = 2 lines after the date, receiver next), else a labelled line.
  let sender = '';
  if(dt){
    const after = lines.slice(dt.idx + 1);
    if(after.length >= 3 && slipIsMasked(after[1]) && !slipIsLabel(after[0])){
      sender = after[0];
      const cand = after[2];
      if(cand && !slipIsLabel(cand)) out.receiver = cand;
    }
  }
  if(!out.receiver){
    for(let i = 0; i < lines.length; i++){
      const m = /^(?:ไปยัง|ถึง|ผู้รับ|to)\s*[:：]?\s*(.*)$/i.exec(lines[i]);
      if(!m) continue;
      const cand = m[1] || lines[i + 1] || '';
      if(cand && !slipIsLabel(cand)){ out.receiver = cand; break; }
    }
  }
  out.receiver = out.receiver.replace(/\s+/g, ' ').trim();
  if(out.kind === 'transfer' && sender && out.receiver) out.ownAccount = slipSameOwner(sender, out.receiver);

  out.ok = out.amount > 0 && !!out.date;
  let crossOk = true;
  if(dt && rf.kplus){
    const doy = parseInt(rf.ref.slice(3, 6), 10);
    if(doy !== slipDayOfYear(dt.y, dt.mon, dt.d)) crossOk = false;
    else if(dt.time){
      const refMin = parseInt(rf.ref.slice(6, 8), 10) * 60 + parseInt(rf.ref.slice(8, 10), 10);
      const dtMin = parseInt(dt.time.slice(0, 2), 10) * 60 + parseInt(dt.time.slice(3, 5), 10);
      if(Math.abs(refMin - dtMin) > 1) crossOk = false;
    }
  }
  out.confidence = (out.ok && out.receiver && crossOk) ? 'high' : 'low';
  return out;
}

function slipReceiverKey(receiver){
  let s = String(receiver == null ? '' : receiver).toLowerCase();
  s = s.replace(/[x*]{3}-[x*]-[x*]?\d{3,4}(?:-[x*])?/g, ' ');
  return s.replace(/\s+/g, ' ').trim().slice(0, 80);
}
function slipLearnable(key){
  return typeof key === 'string' && key.length > 0 && !NO_LEARN.includes(key);
}
function slipKey(parsed, source, serverId){
  if(parsed && parsed.ok){
    return parsed.ref ? parsed.ref : 'h:' + source + ':' + parsed.date + ':' + parsed.time + ':' + parsed.amount;
  }
  return 'u:' + serverId;
}

/* ---------- Pull planning ---------- */
function slipActiveCat(state, name){
  const c = typeof name === 'string' ? (state.categories || []).find(x => x.name === name) : null;
  return c && !c.archived ? c : null;
}
function slipGuessCategory(state, receiver){
  const want = String(receiver || '').trim().toLowerCase();
  if(want){
    let best = null;
    (state.entries || []).forEach(e => {
      if(e.tripId || e.needsReview) return;
      if(String(e.note || '').trim().toLowerCase() !== want) return;
      if(!slipActiveCat(state, e.category)) return;
      if(!best || e.date >= best.date) best = e;
    });
    if(best) return best.category;
  }
  if(slipActiveCat(state, 'อื่นๆ')) return 'อื่นๆ';
  const first = (state.categories || []).find(c => !c.archived);
  return first ? first.name : 'อื่นๆ';
}

function planSlipItems(items, state){
  const ss = state.slipSettings || defaultSlipSettings();
  const handled = new Set((ss.handled || []).map(h => h.ref));
  (state.entries || []).forEach(e => { if(e.slipRef) handled.add(e.slipRef); });
  const unread = new Set((ss.unreadable || []).map(u => u.key));
  const plan = { entries: [], cardPayments: [], handledKeys: [], unreadable: [], skipped: { duplicate: 0, own: 0, ignore: 0 }, askAi: [], ackIds: [] };
  const cash = (state.paymentMethods || []).find(m => m.id === 'cash' && !m.archived);
  (items || []).forEach(it => {
    plan.ackIds.push(it.id);
    const p = parseSlipText(it.text, it.source);
    const key = slipKey(p, it.source, it.id);
    if(!p.ok){
      if(unread.has(key)){ plan.skipped.duplicate++; return; }
      unread.add(key);
      plan.unreadable.push({ key, at: nowISO(), source: String(it.source || ''), photoAt: String(it.photo_at || '') });
      return;
    }
    if(handled.has(key)){ plan.skipped.duplicate++; return; }
    handled.add(key);
    plan.handledKeys.push(key);
    if(p.ownAccount){ plan.skipped.own++; return; }
    const rkey = slipReceiverKey(p.receiver);
    const rule = p.confidence === 'high' && rkey ? (ss.receivers || {})[rkey] : null;
    const learn = slipLearnable(rkey);
    if(rule){
      if(rule.action === 'ignore'){ plan.skipped.ignore++; return; }
      if(rule.action === 'repay'){
        const card = (state.paymentMethods || []).find(m => m.id === rule.methodId);
        if(card && !card.archived && card.cardType === 'repay'){
          plan.cardPayments.push({ id: genId(), methodId: card.id, date: p.date, amount: p.amount, updatedAt: nowISO() });
          return;
        }
      }
    }
    const entry = { id: genId(), date: p.date, amount: p.amount, category: '', note: p.receiver || '' };
    if(cash) entry.paymentMethod = 'cash';
    entry.slipRef = key;
    if(p.time) entry.slipTime = p.time;
    entry.slipSource = String(it.source || '');
    if(learn) entry.slipPayee = rkey;
    if(rule && rule.action === 'expense' && slipActiveCat(state, rule.category)){
      entry.category = rule.category;
    }else{
      entry.category = slipGuessCategory(state, p.receiver);
      entry.needsReview = true;
      if(learn && !rule) plan.askAi.push(entry.id);
    }
    entry.updatedAt = nowISO();
    plan.entries.push(entry);
  });
  return plan;
}

function slipSettingsOf(state){
  if(!state.slipSettings || typeof state.slipSettings !== 'object') state.slipSettings = defaultSlipSettings();
  const ss = state.slipSettings;
  if(!Array.isArray(ss.handled)) ss.handled = [];
  if(!Array.isArray(ss.unreadable)) ss.unreadable = [];
  if(!ss.receivers || typeof ss.receivers !== 'object') ss.receivers = {};
  return ss;
}

function applySlipPlan(state, plan){
  const ss = slipSettingsOf(state);
  const at = nowISO();
  plan.entries.forEach(e => state.entries.push(e));
  if(!Array.isArray(state.cardPayments)) state.cardPayments = [];
  plan.cardPayments.forEach(p => state.cardPayments.push(p));
  plan.handledKeys.forEach(ref => ss.handled.push({ ref, at }));
  if(ss.handled.length > SLIP_HANDLED_MAX) ss.handled = ss.handled.slice(-SLIP_HANDLED_MAX);
  plan.unreadable.forEach(u => ss.unreadable.push({ key: u.key, at: u.at, source: u.source, photoAt: u.photoAt }));
  if(ss.unreadable.length > SLIP_UNREADABLE_MAX) ss.unreadable = ss.unreadable.slice(-SLIP_UNREADABLE_MAX);
  return { entryIds: plan.entries.map(e => e.id), cardPaymentIds: plan.cardPayments.map(p => p.id) };
}
function undoSlipPlan(state, undo){
  const eids = new Set(undo.entryIds || []), pids = new Set(undo.cardPaymentIds || []);
  state.entries = state.entries.filter(e => !eids.has(e.id));
  state.cardPayments = (state.cardPayments || []).filter(p => !pids.has(p.id));
}

/* ---------- Receiver rules ---------- */
function learnSlipRule(state, entryOrPayee, action, extra){
  extra = extra || {};
  const isEntry = entryOrPayee && typeof entryOrPayee === 'object';
  const key = isEntry ? entryOrPayee.slipPayee : entryOrPayee;
  if(!slipLearnable(key)) return false;
  const rule = { name: String(extra.name || (isEntry && entryOrPayee.note) || key).trim().slice(0, 80) || key, action };
  if(action === 'expense'){
    const cat = extra.category || (isEntry ? entryOrPayee.category : '');
    if(typeof cat !== 'string' || !cat) return false;
    rule.category = cat;
  }else if(action === 'repay'){
    if(typeof extra.methodId !== 'string' || !extra.methodId) return false;
    rule.methodId = extra.methodId;
  }else if(action !== 'ignore') return false;
  rule.updatedAt = nowISO();
  const ss = slipSettingsOf(state);
  ss.receivers[key] = rule;
  const keys = Object.keys(ss.receivers);
  if(keys.length > SLIP_RECEIVERS_MAX){
    keys.sort((a, b) => String(ss.receivers[b].updatedAt).localeCompare(String(ss.receivers[a].updatedAt)));
    keys.slice(SLIP_RECEIVERS_MAX).forEach(k => { delete ss.receivers[k]; });
  }
  return true;
}
function settleSlipEntry(state, id){
  const e = state.entries.find(x => x.id === id);
  if(!e) return false;
  if(e.slipPayee && !e.tripId) learnSlipRule(state, e, 'expense', { category: e.category });
  delete e.needsReview; delete e.aiGuess;
  e.updatedAt = nowISO();
  return true;
}
function dismissSlipEntry(state, id){
  const e = state.entries.find(x => x.id === id);
  if(!e) return false;
  learnSlipRule(state, e, 'ignore');
  state.entries = state.entries.filter(x => x.id !== id);
  return true;
}
function repaySlipEntry(state, id, methodId){
  const e = state.entries.find(x => x.id === id);
  const card = (state.paymentMethods || []).find(m => m.id === methodId);
  if(!e || !card) return false;
  learnSlipRule(state, e, 'repay', { methodId });
  if(!Array.isArray(state.cardPayments)) state.cardPayments = [];
  state.cardPayments.push({ id: genId(), methodId, date: e.date, amount: e.amount, updatedAt: nowISO() });
  state.entries = state.entries.filter(x => x.id !== id);
  return true;
}
function forgetSlipReceiver(state, key){
  const ss = slipSettingsOf(state);
  if(!Object.prototype.hasOwnProperty.call(ss.receivers, key)) return false;
  delete ss.receivers[key];
  return true;
}
function setSlipReceiverRule(state, key, action, extra){
  const old = slipSettingsOf(state).receivers[key];
  return learnSlipRule(state, key, action, Object.assign({ name: old && old.name }, extra || {}));
}

function applyAiGuesses(state, guesses, snapshot){
  let n = 0;
  (guesses || []).forEach(g => {
    if(!g || (g.confidence !== 'high' && g.confidence !== 'medium')) return;
    if(!slipActiveCat(state, g.category)) return;
    const e = state.entries.find(x => x.id === g.id);
    if(!e || !e.needsReview || !snapshot || e.updatedAt !== snapshot[g.id]) return;
    e.category = g.category; e.aiGuess = true; e.updatedAt = nowISO();
    n++;
  });
  return n;
}

function renameSlipCategory(state, oldName, newName){
  const ss = state.slipSettings;
  if(!ss || !ss.receivers) return;
  const stamp = nowISO();
  Object.keys(ss.receivers).forEach(k => {
    const r = ss.receivers[k];
    if(r && r.action === 'expense' && r.category === oldName){ r.category = newName; r.updatedAt = stamp; }
  });
}

/* ---------- Migration (called from migrateState) ---------- */
function migrateSlip(parsed){
  const src = parsed.slipSettings && typeof parsed.slipSettings === 'object' && !Array.isArray(parsed.slipSettings) ? parsed.slipSettings : {};
  const out = defaultSlipSettings();
  const str = (v, max) => typeof v === 'string' && v.length >= 1 && v.length <= max;
  out.enabled = src.enabled === true;
  out.aiGuess = typeof src.aiGuess === 'boolean' ? src.aiGuess : true;
  out.handled = (Array.isArray(src.handled) ? src.handled : []).filter(h => h && str(h.ref, 80) && typeof h.at === 'string').map(h => ({ ref: h.ref, at: h.at })).slice(-SLIP_HANDLED_MAX);
  out.unreadable = (Array.isArray(src.unreadable) ? src.unreadable : []).filter(u => u && str(u.key, 80) && typeof u.at === 'string')
    .map(u => ({ key: u.key, at: u.at, source: typeof u.source === 'string' ? u.source : '', photoAt: typeof u.photoAt === 'string' ? u.photoAt : '' })).slice(-SLIP_UNREADABLE_MAX);
  const rec = src.receivers && typeof src.receivers === 'object' && !Array.isArray(src.receivers) ? src.receivers : {};
  const rows = [];
  Object.keys(rec).forEach(k => {
    const r = rec[k];
    if(!str(k, 80) || !r || typeof r !== 'object') return;
    const row = { name: typeof r.name === 'string' && r.name ? r.name.slice(0, 80) : k, action: r.action, updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : EPOCH };
    if(r.action === 'expense'){ if(typeof r.category !== 'string' || !r.category) return; row.category = r.category; }
    else if(r.action === 'repay'){ if(typeof r.methodId !== 'string' || !r.methodId) return; row.methodId = r.methodId; }
    else if(r.action !== 'ignore') return;
    rows.push([k, row]);
  });
  rows.sort((a, b) => String(b[1].updatedAt).localeCompare(String(a[1].updatedAt)));
  rows.slice(0, SLIP_RECEIVERS_MAX).forEach(([k, row]) => { out.receivers[k] = row; });
  parsed.slipSettings = out;
  (parsed.entries || []).forEach(e => {
    if(!str(e.slipRef, 80)) delete e.slipRef;
    if(!str(e.slipPayee, 80)) delete e.slipPayee;
    if(typeof e.slipTime !== 'string' || !/^\d{2}:\d{2}$/.test(e.slipTime)) delete e.slipTime;
    if(e.slipSource !== 'kplus' && e.slipSource !== 'ttb') delete e.slipSource;
    if(e.needsReview !== true) delete e.needsReview;
    if(e.aiGuess !== true || e.needsReview !== true) delete e.aiGuess;
  });
}
