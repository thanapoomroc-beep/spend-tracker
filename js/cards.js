/* ---------- Credit-card bills (phase 4) ---------- */
// Pure and DOM-free. The first group takes everything as arguments (easy to test); the last group reads `state`.
//
//   paymentMethods[i].cardType: '' (plain) | 'repay' (billed to someone else, owner transfers money back) | 'statement' (own card with a billing cycle)
//   statement cards add statementDay / dueDay (integers 1-31; a day past a month's length means that month's last day)
//   state.cardPayments: [{ id, methodId, date:'YYYY-MM-DD', amount>0, updatedAt }]  - never an expense, never touches คงเหลือ.
// A card's spend is the sum of entry.amount (the owner's share) of ALL entries on that method, trip entries included.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoFromParts(y, m, d){ return y + '-' + pad2(m) + '-' + pad2(d); }          // m is 1-12
function daysInMonth(y, m){ return new Date(y, m, 0).getDate(); }                      // m is 1-12
function clampedISO(y, m, day){ return isoFromParts(y, m, Math.min(day, daysInMonth(y, m))); }
function shiftYM(y, m, n){ const i = y * 12 + (m - 1) + n; return [Math.floor(i / 12), (i % 12) + 1]; }
function ymOfISO(iso){ return [+iso.slice(0, 4), +iso.slice(5, 7)]; }
function daysBetweenISO(a, b){                                                         // b minus a, in whole days
  const A = parseISODate(a), B = parseISODate(b);
  return Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) - Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / 86400000);
}
function sumAmounts(list){ return round2(list.reduce((s, x) => s + x.amount, 0)); }

// First dueDay strictly after the close date (same month when it falls later, else next month).
function dueAfterClose(closeISO, dueDay){
  let [y, m] = ymOfISO(closeISO);
  const c = clampedISO(y, m, dueDay);
  if(c > closeISO) return c;
  [y, m] = shiftYM(y, m, 1);
  return clampedISO(y, m, dueDay);
}
// All close dates from the first one on or after firstISO up to and including todayISO.
function cardCloses(statementDay, firstISO, todayISO){
  const out = [];
  let [y, m] = ymOfISO(firstISO);
  let c = clampedISO(y, m, statementDay);
  if(c < firstISO){ [y, m] = shiftYM(y, m, 1); c = clampedISO(y, m, statementDay); }
  while(c <= todayISO && out.length < 600){
    out.push(c);
    [y, m] = shiftYM(y, m, 1);
    c = clampedISO(y, m, statementDay);
  }
  return out;
}
// The close date on or before today, and the first one after today (calendar only, independent of any entry).
function closeAround(statementDay, todayISO){
  let [y, m] = ymOfISO(todayISO);
  let c = clampedISO(y, m, statementDay);
  let prev, next;
  if(c <= todayISO){
    prev = c;
    [y, m] = shiftYM(y, m, 1); next = clampedISO(y, m, statementDay);
  }else{
    next = c;
    [y, m] = shiftYM(y, m, -1); prev = clampedISO(y, m, statementDay);
  }
  return { prev, next };
}
// The first date on or after todayISO that falls on dueDay (clamped for short months).
function nextDayOnOrAfter(todayISO, day){
  let [y, m] = ymOfISO(todayISO);
  const c = clampedISO(y, m, day);
  if(c >= todayISO) return c;
  [y, m] = shiftYM(y, m, 1);
  return clampedISO(y, m, day);
}

function cardIsConfigured(method){ return method.cardType === 'statement' && method.statementDay >= 1 && method.dueDay >= 1; }

// Everything the UI needs for one card method. entries/payments are the whole lists (filtered here).
function cardStatus(method, todayStr, entries, payments){
  const mine = entries.filter(e => e.paymentMethod === method.id && ISO_DATE_RE.test(e.date));
  const pays = payments.filter(p => p.methodId === method.id);
  const spend = sumAmounts(mine), paid = sumAmounts(pays);
  const last = pays.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0] || null;
  const lastPayment = last ? { date: last.date, amount: last.amount } : null;

  if(method.cardType === 'repay'){
    const owed = round2(spend - paid);
    return { type:'repay', spend, paid, owed, over: owed < 0 ? -owed : 0, lastPayment };
  }
  if(!cardIsConfigured(method)){
    return { type:'statement', configured:false, spend, paid, unpaid: Math.max(0, round2(spend - paid)), lastPayment };
  }
  const sd = method.statementDay, dd = method.dueDay;
  const first = mine.map(e => e.date).sort()[0];
  const closes = first ? cardCloses(sd, first, todayStr) : [];
  let rem = paid, prev = '';
  const unpaidCycles = [];
  closes.forEach(close => {
    const cs = sumAmounts(mine.filter(e => e.date > prev && e.date <= close));
    prev = close;
    const covered = Math.min(rem, cs);
    rem = round2(rem - covered);
    const left = round2(cs - covered);
    if(left > 0) unpaidCycles.push({ close, due: dueAfterClose(close, dd), left });
  });
  const unpaid = sumAmounts(unpaidCycles.map(c => ({ amount: c.left })));
  // The earliest unpaid cycle is the one that is, or will first be, late.
  const target = unpaidCycles[0] || null;
  const dueDate = target ? target.due : null;
  const daysToDue = dueDate ? daysBetweenISO(todayStr, dueDate) : null;
  const around = closeAround(sd, todayStr);
  const openSpend = sumAmounts(mine.filter(e => e.date > around.prev && e.date <= around.next));
  return {
    type:'statement', configured:true, spend, paid, unpaid, dueDate, daysToDue,
    overdueDays: daysToDue !== null && daysToDue < 0 ? -daysToDue : 0,
    openSpend, nextClose: around.next, lastPayment
  };
}

// Statement cards with money due within 7 days (or late): the rows for the วันนี้ due card. off is negative when overdue.
function cardDueRows(todayStr, methods, entries, payments){
  const out = [];
  methods.forEach(m => {
    if(!cardIsConfigured(m)) return;
    const s = cardStatus(m, todayStr, entries, payments);
    if(s.unpaid > 0 && s.daysToDue !== null && s.daysToDue <= 7) out.push({ methodId: m.id, name: m.name, amount: s.unpaid, off: s.daysToDue, overdueDays: s.overdueDays });
  });
  return out.sort((a, b) => a.off - b.off);
}

// Card shown on ภาพรวม: active cards always, hidden ones only while a balance remains.
function cardBalance(s){ return s.type === 'repay' ? s.owed : s.unpaid; }

/* ---------- Calendar reminder (.ics) ---------- */
// One all-day event on the next due date, repeating monthly on dueDay. dueDay 31 means "last day of the month" (BYMONTHDAY=-1,
// the same clamping the app uses). 29 and 30 keep their day: a calendar skips months that lack it (Feb), which is the
// safest portable choice because BYSETPOS rules are not reliably supported. The alarm fires 39 h before midnight = 09:00, two days ahead.
function icsEscape(t){ return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function icsFold(line){                                                               // RFC 5545: lines of at most 75 octets
  const out = []; let cur = '', bytes = 0;
  for(const ch of line){
    const cp = ch.codePointAt(0);
    const n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if(bytes + n > (out.length ? 74 : 75)){ out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
function icsDate(iso){ return iso.replace(/-/g, ''); }
function buildCardIcs(method, todayStr, nowDate){
  const dd = method.dueDay;
  const start = nextDayOnOrAfter(todayStr, dd);
  const [y, m] = ymOfISO(start);
  const endD = new Date(y, m - 1, +start.slice(8, 10) + 1);
  const end = endD.getFullYear() + pad2(endD.getMonth() + 1) + pad2(endD.getDate());
  const stamp = nowDate.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const rule = dd === 31 ? 'FREQ=MONTHLY;BYMONTHDAY=-1' : 'FREQ=MONTHLY;BYMONTHDAY=' + dd;
  const title = 'จ่ายบิล ' + method.name;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Spend Tracker//TH', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:card-' + String(method.id).replace(/[^A-Za-z0-9-]/g, '') + '-bill@spend-tracker',
    'DTSTAMP:' + stamp,
    'DTSTART;VALUE=DATE:' + icsDate(start),
    'DTEND;VALUE=DATE:' + end,
    'RRULE:' + rule,
    'SUMMARY:' + icsEscape(title),
    'BEGIN:VALARM', 'TRIGGER:-P1DT15H', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(title), 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ];
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

/* ---------- State-backed helpers ---------- */
function isCardMethod(m){ return m.cardType === 'repay' || m.cardType === 'statement'; }
function cardPaymentsOf(methodId){
  return state.cardPayments.filter(p => p.methodId === methodId).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.updatedAt < b.updatedAt ? 1 : -1)));
}
function cardStatusOf(method, todayStr){ return cardStatus(method, todayStr || todayISO(), state.entries, state.cardPayments); }
function cardDueRowsNow(todayStr){ return cardDueRows(todayStr || todayISO(), state.paymentMethods.filter(isCardMethod), state.entries, state.cardPayments); }
