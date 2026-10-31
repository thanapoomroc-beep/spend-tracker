const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load');
const plain = v => JSON.parse(JSON.stringify(v));

const KBANK = { id: 'kbank', name: 'บัตรเครดิต KBANK', archived: false, updatedAt: 'x', cardType: 'statement', statementDay: 25, dueDay: 5 };
const E = (date, amount, extra) => Object.assign({ id: date + amount, date, amount, category: 'อาหาร', note: '', paymentMethod: 'kbank' }, extra || {});
const FIX = [E('2026-09-20', 1000), E('2026-09-26', 500), E('2026-10-10', 2000), E('2026-10-25', 300), E('2026-10-26', 400)];
const PAID = [{ id: 'p1', methodId: 'kbank', date: '2026-10-04', amount: 1000, updatedAt: 'x' }];

function status(run, method, today, entries, pays) {
  return plain(run(`cardStatus(${JSON.stringify(method)}, '${today}', ${JSON.stringify(entries)}, ${JSON.stringify(pays)})`));
}
function rows(run, today, methods, entries, pays) {
  return plain(run(`cardDueRows('${today}', ${JSON.stringify(methods)}, ${JSON.stringify(entries)}, ${JSON.stringify(pays)})`));
}

test('KBANK cycles: unpaid, due date, open cycle, due rows', () => {
  const { run } = loadApp();
  let s = status(run, KBANK, '2026-10-28', FIX, PAID);
  assert.equal(s.unpaid, 2800);
  assert.equal(s.dueDate, '2026-11-05');
  assert.equal(s.daysToDue, 8);
  assert.equal(s.openSpend, 400);
  assert.equal(s.nextClose, '2026-11-25');
  assert.deepEqual(rows(run, '2026-10-28', [KBANK], FIX, PAID), []);   // 8 days away: not in the row list
  const r = rows(run, '2026-10-29', [KBANK], FIX, PAID);
  assert.equal(r.length, 1);
  assert.equal(r[0].off, 7);
  assert.equal(r[0].amount, 2800);
  s = status(run, KBANK, '2026-11-06', FIX, PAID);
  assert.equal(s.overdueDays, 1);
  assert.equal(rows(run, '2026-11-06', [KBANK], FIX, PAID)[0].off, -1);
  const paidAll = PAID.concat([{ id: 'p2', methodId: 'kbank', date: '2026-10-29', amount: 2800, updatedAt: 'x' }]);
  s = status(run, KBANK, '2026-10-29', FIX, paidAll);
  assert.equal(s.unpaid, 0);
  assert.deepEqual(rows(run, '2026-10-29', [KBANK], FIX, paidAll), []);
});

test('cycles before the card was configured still count', () => {
  const { run } = loadApp();
  // Sep 20 spend closes on Sep 25 and is due Oct 5: unpaid until the payment.
  const s = status(run, KBANK, '2026-10-01', FIX, []);
  assert.equal(s.unpaid, 1000);
  assert.equal(s.dueDate, '2026-10-05');
});

test('statement day clamps to short months; dueDay before statementDay rolls to next month', () => {
  const { run } = loadApp();
  assert.deepEqual(plain(run(`cardCloses(31, '2026-11-02', '2027-03-01')`)), ['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
  assert.equal(run(`cardCloses(31, '2028-02-01', '2028-02-29')`)[0], '2028-02-29');
  assert.equal(run(`dueAfterClose('2026-10-25', 5)`), '2026-11-05');
  assert.equal(run(`dueAfterClose('2026-10-25', 28)`), '2026-10-28');
  assert.equal(run(`dueAfterClose('2026-11-30', 31)`), '2026-12-31');
  assert.equal(run(`dueAfterClose('2027-02-28', 31)`), '2027-03-31');
});

test('a trip entry adds the owner share only', () => {
  const { run } = loadApp();
  const entries = [E('2026-10-02', 300, { tripId: 't1', currency: 'CNY', originalAmount: 600, splitCount: 2 })];
  const s = status(run, { id: 'kbank', name: 'k', cardType: 'statement' }, '2026-10-29', entries, []);
  assert.equal(s.configured, false);
  assert.equal(s.unpaid, 300);
});

test('TTB repay: owed, overpaid, last payment', () => {
  const { run } = loadApp();
  const ttb = { id: 'ttb', name: 'บัตรเครดิต TTB', cardType: 'repay' };
  const ents = [E('2026-10-01', 500, { paymentMethod: 'ttb' }), E('2026-10-05', 700, { paymentMethod: 'ttb' })];
  const p1 = { id: 'a', methodId: 'ttb', date: '2026-10-10', amount: 1000, updatedAt: 'x' };
  let s = status(run, ttb, '2026-10-29', ents, [p1]);
  assert.equal(s.owed, 200);
  assert.deepEqual(s.lastPayment, { date: '2026-10-10', amount: 1000 });
  s = status(run, ttb, '2026-10-29', ents, [p1, { id: 'b', methodId: 'ttb', date: '2026-10-20', amount: 500, updatedAt: 'x' }]);
  assert.equal(s.owed, -300);
  assert.equal(s.over, 300);
});

test('migrateState: 2.4.x backup gets card types; card data round-trips; junk is dropped', () => {
  const { run } = loadApp({ now: '2026-10-29T05:00:00Z' });
  const old = { schemaVersion: 3, monthlySettings: {}, entries: [], paymentMethods: [
    { id: 'cash', name: 'เงินสด', archived: false, updatedAt: 'a' }, { id: 'ttb', name: 'TTB', archived: false, updatedAt: 'a' }, { id: 'kbank', name: 'KB', archived: false, updatedAt: 'a' }] };
  let out = plain(run(`migrateState(${JSON.stringify(old)})`));
  assert.deepEqual(out.paymentMethods.map(m => m.cardType), ['', 'repay', 'statement']);
  assert.equal(out.paymentMethods[2].statementDay, undefined);
  assert.deepEqual(out.cardPayments, []);

  const full = { schemaVersion: 3, monthlySettings: {}, entries: [], paymentMethods: [
    { id: 'cash', name: 'เงินสด', archived: false, updatedAt: 'a', cardType: '' },
    { id: 'kbank', name: 'KB', archived: true, updatedAt: 'b', cardType: 'statement', statementDay: 25, dueDay: 5 },
    { id: 'pm-1', name: 'X', archived: false, updatedAt: 'c', cardType: 'repay' }],
    cardPayments: [{ id: 'p1', methodId: 'kbank', date: '2026-10-04', amount: 1000.5, updatedAt: 'z' }] };
  out = plain(run(`migrateState(${JSON.stringify(full)})`));
  assert.deepEqual(out.paymentMethods, full.paymentMethods);
  assert.deepEqual(out.cardPayments, full.cardPayments);
  const again = plain(run(`migrateState(${JSON.stringify(out)})`));
  assert.deepEqual(again.paymentMethods, out.paymentMethods);

  const bad = JSON.parse(JSON.stringify(full));
  bad.paymentMethods[1].statementDay = 32; bad.paymentMethods[1].dueDay = '5'; bad.paymentMethods[2].cardType = 'weird';
  bad.cardPayments = [null, { id: 'a', methodId: 'kbank', date: '2026-10-04', amount: 0 }, { id: 'b', methodId: 'kbank', date: 'nope', amount: 5 },
    { id: 'c', methodId: 'gone', date: '2026-10-04', amount: 5 }, { id: 'd', methodId: 'kbank', date: '2026-10-04', amount: '5' }, full.cardPayments[0]];
  out = plain(run(`migrateState(${JSON.stringify(bad)})`));
  assert.equal(out.paymentMethods[1].statementDay, undefined);
  assert.equal(out.paymentMethods[1].dueDay, undefined);
  assert.equal(out.paymentMethods[2].cardType, '');
  assert.deepEqual(out.cardPayments.map(p => p.id), ['p1']);
});

test('v1 backup still imports and freshState has cardPayments', () => {
  const { run } = loadApp({ now: '2026-10-29T05:00:00Z' });
  const out = plain(run(`migrateState(${JSON.stringify({ settings: { income: 1, fixedItems: [] }, entries: [{ id: 'a', date: '2026-10-13', amount: 5, category: 'อาหาร', note: '' }] })})`));
  assert.deepEqual(out.cardPayments, []);
  assert.deepEqual(out.paymentMethods.map(m => m.cardType), ['', 'repay', 'statement']);
  assert.deepEqual(plain(run('freshState().cardPayments')), []);
});

test('ics text: event, monthly rule, alarm, CRLF', () => {
  const { run } = loadApp();
  const ics = run(`buildCardIcs(${JSON.stringify(KBANK)}, '2026-10-29', new Date('2026-10-29T03:00:00Z'))`);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('BEGIN:VEVENT'));
  assert.ok(ics.includes('RRULE:FREQ=MONTHLY;BYMONTHDAY=5\r\n'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261105\r\n'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20261106\r\n'));
  assert.ok(ics.includes('BEGIN:VALARM'));
  assert.ok(ics.includes('UID:card-kbank-bill@spend-tracker'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics));
  ics.split('\r\n').forEach(l => assert.ok(Buffer.byteLength(l) <= 75, l));
  assert.ok(run(`buildCardIcs({id:'a',name:'b',dueDay:31}, '2026-10-29', new Date())`).includes('BYMONTHDAY=-1'));
});
