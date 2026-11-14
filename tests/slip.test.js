const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, ROOT } = require('./load');
const plain = v => JSON.parse(JSON.stringify(v));   // objects built inside the vm have another realm's prototypes

const fx = n => fs.readFileSync(path.join(ROOT, 'tests/fixtures/slips', n + '.txt'), 'utf8');
const app = loadApp({ now: '2026-11-14T09:00:00+07:00' });
const parse = (text, source) => plain(app.run(`parseSlipText(${JSON.stringify(text)}, ${JSON.stringify(source || 'kplus')})`));
// Runs code against a fresh state patched by `patch` (JS statements using `st`); returns whatever the code returns.
const ev = (code, patch) => plain(app.run(`(() => { const st = freshState(); ${patch || ''}; ${code} })()`));
const item = (id, text) => ({ id, source: 'kplus', photo_at: '2026-11-14T08:00:00Z', text, created_at: '2026-11-14T08:01:00Z' });
const T0 = '2026-11-01T00:00:00.000Z';

test('six K PLUS fixtures parse to the expected values', () => {
  const want = {
    'kplus-qr-shop': { kind: 'payment', date: '2026-11-14', time: '15:41', amount: 124, receiver: 'เชลฟ์ สมูทตี้', ref: '016318154113BQR02309', ownAccount: false },
    'kplus-transfer-person': { kind: 'transfer', date: '2026-11-13', time: '21:54', amount: 252, receiver: 'MS. SUDA RAKDEE', ref: '016317215456ATF07968', ownAccount: false },
    'kplus-ttb-repay': { kind: 'transfer', date: '2026-11-08', time: '20:08', amount: 9204, receiver: 'MRS. MALEE JAIDEE', ref: '016312200804BTF05478', ownAccount: false },
    'kplus-own-account': { kind: 'transfer', date: '2026-05-11', time: '12:49', amount: 115, receiver: 'MR. SOMCHAI JAIDEE', ref: '016131124924ATF04901', ownAccount: true },
    'kplus-qr-tops': { kind: 'payment', date: '2026-11-13', time: '19:16', amount: 42, receiver: 'Tops', ref: '016317191600AQR04617', ownAccount: false },
    'kplus-qr-2c2p': { kind: 'payment', date: '2026-11-12', time: '08:57', amount: 115, receiver: 'ชาจี', ref: '016316085734AQR01940', ownAccount: false }
  };
  for (const [name, w] of Object.entries(want)) {
    const p = parse(fx(name));
    assert.deepEqual({ ...p, ok: undefined, confidence: undefined }, { ...w, ok: undefined, confidence: undefined }, name);
    assert.equal(p.ok, true, name);
    assert.equal(p.confidence, 'high', name);
  }
});

test('Thai-UI slip parses (BE year, 24 h time, amount on one line)', () => {
  const text = 'โอนเงินสำเร็จ\n14 พ.ย. 69 15:41\nนาย สมชาย จ\nธ.กสิกรไทย xxx-x-x1111-x\nนางสาว สุดา รักดี\nธ.กสิกรไทย xxx-x-x2222-x\nเลขที่รายการ: 016318154113ATF07968\nจำนวนเงิน 1,234.50 บาท\nค่าธรรมเนียม 0.00 บาท';
  const p = parse(text);
  assert.equal(p.ok, true);
  assert.equal(p.date, '2026-11-14');
  assert.equal(p.time, '15:41');
  assert.equal(p.amount, 1234.5);
  assert.equal(p.receiver, 'นางสาว สุดา รักดี');
  assert.equal(p.kind, 'transfer');
  assert.equal(parse('x\n14 พฤศจิกายน 2569 09:05\nจำนวน 10 บาท').date, '2026-11-14');
});

test('garbled text is not ok', () => {
  assert.equal(parse('###\n@@ 12 ?? abc').ok, false);
  assert.equal(parse('').ok, false);
  assert.equal(parse('Transfer Completed\nAmount:\n0.00 Baht\n14 Nov 26 3:41 PM').ok, false);   // amount must be > 0
});

test('AM/PM edges', () => {
  const mk = t => `Transfer Completed\n14 Nov 26 ${t}\nAmount:\n10.00 Baht`;
  assert.equal(parse(mk('12:05 AM')).time, '00:05');
  assert.equal(parse(mk('12:30 PM')).time, '12:30');
  assert.equal(parse(mk('1:07 AM')).time, '01:07');
  assert.equal(parse(mk('11:59 PM')).time, '23:59');
});

test('the OCR junk after the ref is dropped', () => {
  assert.equal(parse(fx('kplus-qr-2c2p')).ref, '016316085734AQR01940');
});

test('ref cross-check against the date line: mismatch gives low confidence and keeps the date line', () => {
  const bad = fx('kplus-qr-shop').replace('016318154113BQR02309', '016318163013BQR02309');   // 16:30 vs 15:41
  const p = parse(bad);
  assert.equal(p.confidence, 'low');
  assert.equal(p.date, '2026-11-14');
  assert.equal(p.time, '15:41');
  const wrongDay = fx('kplus-qr-shop').replace('016318154113BQR02309', '016319154113BQR02309');
  assert.equal(parse(wrongDay).confidence, 'low');
  const off1 = fx('kplus-qr-shop').replace('016318154113BQR02309', '016318154213BQR02309');   // one minute apart is fine
  assert.equal(parse(off1).confidence, 'high');
});

test('missing receiver gives low confidence; no ref uses the h: key', () => {
  const p = parse('Payment Completed\n14 Nov 26 3:41 PM\nAmount:\n50.00 Baht');
  assert.equal(p.ok, true);
  assert.equal(p.receiver, '');
  assert.equal(p.confidence, 'low');
  assert.equal(app.run(`slipKey(${JSON.stringify(p)}, 'kplus', 7)`), 'h:kplus:2026-11-14:15:41:50');
  assert.equal(app.run(`slipKey({ ok:false }, 'kplus', 7)`), 'u:7');
  assert.equal(app.run(`slipKey(${JSON.stringify(parse(fx('kplus-qr-tops')))}, 'kplus', 7)`), '016317191600AQR04617');
});

test('receiver key normalisation and NO_LEARN', () => {
  const k = s => app.run(`slipReceiverKey(${JSON.stringify(s)})`);
  assert.equal(k('  MS.  SUDA   RAKDEE '), 'ms. suda rakdee');
  assert.equal(k('Tops xxx-x-x1234-x'), 'tops');
  assert.equal(k('x'.repeat(200)).length, 80);
  const l = s => app.run(`slipLearnable(${JSON.stringify(s)})`);
  assert.equal(l(''), false);
  assert.equal(l('2c2p'), false);
  assert.equal(l('kbank'), false);
  assert.equal(l('promptpay'), false);
  assert.equal(l('ชาจี'), true);
  assert.equal(l('tops'), true);
});

// ---- planSlipItems ----
const plan = (items, patch) => ev(`return planSlipItems(${JSON.stringify(items)}, st)`, patch);
const SHOP = fx('kplus-qr-shop'), PERSON = fx('kplus-transfer-person'), REPAY = fx('kplus-ttb-repay'), OWN = fx('kplus-own-account'), TOPS = fx('kplus-qr-tops'), C2 = fx('kplus-qr-2c2p');
const rule = (key, r) => `st.slipSettings.receivers[${JSON.stringify(key)}] = ${JSON.stringify({ name: key, updatedAt: T0, ...r })};`;

test('plan: unknown receiver becomes a review entry (อื่นๆ, cash)', () => {
  const p = plan([item(1, SHOP)]);
  assert.equal(p.entries.length, 1);
  const e = p.entries[0];
  assert.deepEqual([e.date, e.amount, e.category, e.note, e.paymentMethod, e.slipRef, e.slipPayee, e.needsReview], ['2026-11-14', 124, 'อื่นๆ', 'เชลฟ์ สมูทตี้', 'cash', '016318154113BQR02309', 'เชลฟ์ สมูทตี้', true]);
  assert.equal(e.tripId, undefined);
  assert.deepEqual(p.handledKeys, ['016318154113BQR02309']);
  assert.deepEqual(p.askAi, [e.id]);
  assert.deepEqual(p.ackIds, [1]);
});

test('plan: duplicates (handled, slipRef on an entry, same batch) are skipped but acked', () => {
  const ref = '016318154113BQR02309';
  let p = plan([item(1, SHOP)], `st.slipSettings.handled.push({ ref: '${ref}', at: '${T0}' })`);
  assert.equal(p.entries.length, 0); assert.equal(p.skipped.duplicate, 1); assert.deepEqual(p.ackIds, [1]);
  p = plan([item(1, SHOP)], `st.entries.push({ id:'x', date:'2026-11-14', amount:124, category:'อาหาร', note:'', slipRef:'${ref}', updatedAt:'${T0}' })`);
  assert.equal(p.entries.length, 0); assert.equal(p.skipped.duplicate, 1);
  p = plan([item(1, SHOP), item(2, SHOP), item(3, PERSON)]);
  assert.equal(p.entries.length, 2); assert.equal(p.skipped.duplicate, 1); assert.deepEqual(p.ackIds, [1, 2, 3]);
});

test('plan: own account is skipped, key handled, nothing added', () => {
  const p = plan([item(1, OWN)]);
  assert.equal(p.entries.length, 0); assert.equal(p.skipped.own, 1);
  assert.deepEqual(p.handledKeys, ['016131124924ATF04901']);
  assert.deepEqual(p.askAi, []);
});

test('plan: expense rule gives an entry without needsReview but with slipPayee', () => {
  const p = plan([item(1, TOPS)], rule('tops', { action: 'expense', category: 'อาหาร' }));
  const e = p.entries[0];
  assert.equal(e.category, 'อาหาร'); assert.equal(e.needsReview, undefined); assert.equal(e.slipPayee, 'tops'); assert.equal(e.paymentMethod, 'cash');
  assert.deepEqual(p.askAi, []);
});

test('plan: a rule whose category is archived or gone falls back to review (no AI)', () => {
  let p = plan([item(1, TOPS)], rule('tops', { action: 'expense', category: 'อาหาร' }) + `st.categories.find(c => c.name === 'อาหาร').archived = true;`);
  assert.equal(p.entries[0].needsReview, true); assert.equal(p.entries[0].category, 'อื่นๆ'); assert.deepEqual(p.askAi, []);
  p = plan([item(1, TOPS)], rule('tops', { action: 'expense', category: 'หมวดที่ไม่มี' }));
  assert.equal(p.entries[0].needsReview, true);
});

test('plan: ignore rule adds nothing', () => {
  const p = plan([item(1, TOPS)], rule('tops', { action: 'ignore' }));
  assert.equal(p.entries.length, 0); assert.equal(p.skipped.ignore, 1); assert.deepEqual(p.handledKeys, ['016317191600AQR04617']);
});

test('plan: repay rule adds a card payment and no entry; archived card falls back to review', () => {
  const r = rule('mrs. malee jaidee', { action: 'repay', methodId: 'ttb' });
  let p = plan([item(1, REPAY)], r);
  assert.equal(p.entries.length, 0); assert.equal(p.cardPayments.length, 1);
  const c = p.cardPayments[0];
  assert.deepEqual([c.methodId, c.date, c.amount, typeof c.id, typeof c.updatedAt], ['ttb', '2026-11-08', 9204, 'string', 'string']);
  p = plan([item(1, REPAY)], r + `st.paymentMethods.find(m => m.id === 'ttb').archived = true;`);
  assert.equal(p.cardPayments.length, 0); assert.equal(p.entries[0].needsReview, true);
  p = plan([item(1, REPAY)], r + `st.paymentMethods.find(m => m.id === 'ttb').cardType = '';`);
  assert.equal(p.cardPayments.length, 0); assert.equal(p.entries.length, 1);
});

test('plan: cash archived or missing leaves paymentMethod unset', () => {
  let p = plan([item(1, SHOP)], `st.paymentMethods.find(m => m.id === 'cash').archived = true;`);
  assert.equal(p.entries[0].paymentMethod, undefined);
  p = plan([item(1, SHOP)], `st.paymentMethods = st.paymentMethods.filter(m => m.id !== 'cash');`);
  assert.equal(p.entries[0].paymentMethod, undefined);
});

test('plan: category guess from a settled entry with the same note; ignores review and trip entries', () => {
  const mk = extra => `st.entries.push(${JSON.stringify({ id: 'p1', date: '2026-10-01', amount: 99, category: 'การเดินทาง', note: 'เชลฟ์ สมูทตี้ ', updatedAt: T0, ...extra })});`;
  assert.equal(plan([item(1, SHOP)], mk({})).entries[0].category, 'การเดินทาง');
  assert.equal(plan([item(1, SHOP)], mk({ needsReview: true })).entries[0].category, 'อื่นๆ');
  assert.equal(plan([item(1, SHOP)], mk({ category: 'อื่นๆ', tripId: 't' })).entries[0].category, 'อื่นๆ');
  assert.equal(plan([item(1, SHOP)], mk({}) + `st.categories.find(c => c.name === 'การเดินทาง').archived = true;`).entries[0].category, 'อื่นๆ');
  assert.equal(plan([item(1, SHOP)], `st.categories.find(c => c.name === 'อื่นๆ').archived = true;`).entries[0].category !== 'อื่นๆ', true);
});

test('plan: low confidence never uses a rule and is not a learnable duplicate', () => {
  const bad = TOPS.replace('016317191600AQR04617', '016317201600AQR04617');
  const p = plan([item(1, bad)], rule('tops', { action: 'ignore' }));
  assert.equal(p.entries.length, 1); assert.equal(p.entries[0].needsReview, true); assert.equal(p.skipped.ignore, 0);
});

test('plan: unreadable gets a u: key and never stores the text', () => {
  const p = plan([item(5, 'blurry ###')]);
  assert.equal(p.entries.length, 0);
  assert.equal(p.unreadable.length, 1);
  assert.equal(p.unreadable[0].key, 'u:5');
  assert.deepEqual(Object.keys(p.unreadable[0]).sort(), ['at', 'key', 'photoAt', 'source']);
  assert.ok(!JSON.stringify(p).includes('blurry'));
  assert.deepEqual(p.ackIds, [5]);
});

test('plan: askAi lists only learnable unknowns', () => {
  const noShop = 'Payment Completed\n14 Nov 26 3:41 PM\nAmount:\n50.00 Baht';
  const gateway = C2.replace('ชาจี', '2C2P');
  const p = plan([item(1, SHOP), item(2, noShop), item(3, gateway), item(4, TOPS)], rule('tops', { action: 'expense', category: 'อาหาร' }));
  assert.equal(p.entries.length, 4);
  assert.deepEqual(p.askAi, [p.entries[0].id]);
  assert.equal(p.entries[2].slipPayee, undefined);   // gateway receiver is never learned
});

// ---- apply / undo / learn ----
test('applySlipPlan adds rows, keeps newest 500 handled and 20 unreadable, and undo removes only the added rows', () => {
  const r = ev(`
    for (let i = 0; i < 499; i++) st.slipSettings.handled.push({ ref: 'old' + i, at: '${T0}' });
    for (let i = 0; i < 20; i++) st.slipSettings.unreadable.push({ key: 'p' + i, at: '${T0}', source: 'kplus', photoAt: '' });
    const plan = planSlipItems(${JSON.stringify([item(1, SHOP), item(2, PERSON), item(3, 'junk')])}, st);
    st.cardPayments.push({ id: 'keep', methodId: 'ttb', date: '2026-11-01', amount: 5, updatedAt: '${T0}' });
    const undo = applySlipPlan(st, plan);
    const mid = { entries: st.entries.length, handled: st.slipSettings.handled.length, unread: st.slipSettings.unreadable.length, firstHandled: st.slipSettings.handled[0].ref, lastUnread: st.slipSettings.unreadable[19].key };
    undoSlipPlan(st, undo);
    return { mid, undo, after: { entries: st.entries.length, handled: st.slipSettings.handled.length, cp: st.cardPayments.length } };`);
  assert.deepEqual(r.mid, { entries: 2, handled: 500, unread: 20, firstHandled: 'old1', lastUnread: 'u:3' });
  assert.equal(r.undo.entryIds.length, 2);
  assert.deepEqual(r.after, { entries: 0, handled: 500, cp: 1 });
});

test('undo of a repay-rule pull removes the card payment', () => {
  const r = ev(`
    const plan = planSlipItems(${JSON.stringify([item(1, REPAY)])}, st);
    const undo = applySlipPlan(st, plan); const n = st.cardPayments.length; undoSlipPlan(st, undo);
    return [n, st.cardPayments.length, st.slipSettings.handled.length];`, rule('mrs. malee jaidee', { action: 'repay', methodId: 'ttb' }));
  assert.deepEqual(r, [1, 0, 1]);
});

test('settle learns an expense rule; trip entries and unlearnable receivers learn nothing', () => {
  const r = ev(`
    st.entries.push({ id:'a', date:'2026-11-14', amount:42, category:'อาหาร', note:'Tops', slipPayee:'tops', slipRef:'r1', needsReview:true, aiGuess:true, updatedAt:'${T0}' });
    st.entries.push({ id:'b', date:'2026-11-14', amount:42, category:'อื่นๆ', note:'x', slipPayee:'x', slipRef:'r2', needsReview:true, tripId:'t', updatedAt:'${T0}' });
    st.entries.push({ id:'c', date:'2026-11-14', amount:42, category:'อาหาร', note:'', slipRef:'r3', needsReview:true, updatedAt:'${T0}' });
    settleSlipEntry(st, 'a'); settleSlipEntry(st, 'b'); settleSlipEntry(st, 'c');
    return { rules: st.slipSettings.receivers, e: st.entries.map(e => [e.needsReview, e.aiGuess]), ok: settleSlipEntry(st, 'zzz') };`);
  assert.deepEqual(Object.keys(r.rules), ['tops']);
  assert.deepEqual([r.rules.tops.action, r.rules.tops.category, r.rules.tops.name], ['expense', 'อาหาร', 'Tops']);
  assert.deepEqual(r.e, [[null, null], [null, null], [null, null]]);
  assert.equal(r.ok, false);
});

test('dismiss learns ignore and deletes; repay learns repay and adds a card payment; forget and set', () => {
  const r = ev(`
    st.entries.push({ id:'a', date:'2026-11-14', amount:42, category:'อาหาร', note:'Tops', slipPayee:'tops', slipRef:'r1', needsReview:true, updatedAt:'${T0}' });
    st.entries.push({ id:'b', date:'2026-11-08', amount:9204, category:'อื่นๆ', note:'MRS. MALEE JAIDEE', slipPayee:'mrs. malee jaidee', slipRef:'r2', needsReview:true, updatedAt:'${T0}' });
    dismissSlipEntry(st, 'a');
    const noCard = repaySlipEntry(st, 'b', 'nope');
    repaySlipEntry(st, 'b', 'ttb');
    const rules = JSON.parse(JSON.stringify(st.slipSettings.receivers));
    setSlipReceiverRule(st, 'tops', 'expense', { category: 'อาหาร' });
    const afterSet = [st.slipSettings.receivers.tops.action, st.slipSettings.receivers.tops.name];
    const bad = setSlipReceiverRule(st, 'tops', 'expense', {});
    forgetSlipReceiver(st, 'tops');
    return { rules, noCard, entries: st.entries.length, cp: st.cardPayments.map(p => [p.methodId, p.date, p.amount]), afterSet, bad, left: Object.keys(st.slipSettings.receivers) };`);
  assert.equal(r.rules.tops.action, 'ignore');
  assert.deepEqual([r.rules['mrs. malee jaidee'].action, r.rules['mrs. malee jaidee'].methodId], ['repay', 'ttb']);
  assert.equal(r.noCard, false);
  assert.equal(r.entries, 0);
  assert.deepEqual(r.cp, [['ttb', '2026-11-08', 9204]]);
  assert.deepEqual(r.afterSet, ['expense', 'Tops']);
  assert.equal(r.bad, false);
  assert.deepEqual(r.left, ['mrs. malee jaidee']);
});

test('receivers keep the newest 300', () => {
  const r = ev(`
    for (let i = 0; i < 305; i++) {
      st.slipSettings.receivers['k' + i] = { name: 'k' + i, action: 'ignore', updatedAt: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() };
    }
    learnSlipRule(st, 'fresh', 'ignore');
    const keys = Object.keys(st.slipSettings.receivers);
    return { n: keys.length, hasFresh: keys.includes('fresh'), hasOld: keys.includes('k0'), hasNew: keys.includes('k304') };`);
  assert.deepEqual(r, { n: 300, hasFresh: true, hasOld: false, hasNew: true });
});

test('applyAiGuesses guards', () => {
  const r = ev(`
    const mk = (id, extra) => st.entries.push(Object.assign({ id, date:'2026-11-14', amount:10, category:'อื่นๆ', note:'', needsReview:true, updatedAt:'${T0}' }, extra || {}));
    mk('ok'); mk('moved'); mk('settled', { needsReview: undefined }); mk('nocat'); mk('lowc'); mk('med');
    delete st.entries.find(e => e.id === 'settled').needsReview;
    const snap = {}; st.entries.forEach(e => { snap[e.id] = e.updatedAt; });
    st.entries.find(e => e.id === 'moved').updatedAt = '2026-11-14T10:00:00.000Z';
    const n = applyAiGuesses(st, [
      { id:'ok', category:'อาหาร', confidence:'high' }, { id:'moved', category:'อาหาร', confidence:'high' },
      { id:'settled', category:'อาหาร', confidence:'high' }, { id:'nocat', category:'ไม่มี', confidence:'high' },
      { id:'lowc', category:'อาหาร', confidence:'low' }, { id:'med', category:'การเดินทาง', confidence:'medium' },
      { id:'gone', category:'อาหาร', confidence:'high' }, { id:'ok', category:null, confidence:'high' }], snap);
    return { n, e: st.entries.map(e => [e.id, e.category, e.aiGuess === true, e.updatedAt !== snap[e.id]]) };`);
  assert.equal(r.n, 2);
  const m = Object.fromEntries(r.e.map(x => [x[0], x.slice(1)]));
  assert.deepEqual(m.ok, ['อาหาร', true, true]);
  assert.deepEqual(m.med, ['การเดินทาง', true, true]);
  for (const id of ['moved', 'settled', 'nocat', 'lowc']) assert.equal(m[id][1], false, id);
  assert.equal(m.moved[0], 'อื่นๆ');
});

test('renameSlipCategory renames expense rules only; renameCategory path renames them too', () => {
  const r = ev(`
    st.slipSettings.receivers.a = { name:'a', action:'expense', category:'อาหาร', updatedAt:'${T0}' };
    st.slipSettings.receivers.b = { name:'b', action:'expense', category:'การเดินทาง', updatedAt:'${T0}' };
    st.slipSettings.receivers.c = { name:'c', action:'ignore', updatedAt:'${T0}' };
    renameSlipCategory(st, 'อาหาร', 'กิน');
    return Object.fromEntries(Object.entries(st.slipSettings.receivers).map(([k, v]) => [k, v.category]));`);
  assert.deepEqual(r, { a: 'กิน', b: 'การเดินทาง' });
  assert.ok(/renameSlipCategory\(state, oldName, newName\)/.test(fs.readFileSync(path.join(ROOT, 'js/chips-settings.js'), 'utf8')));
});

// ---- migration ----
const mig = obj => plain(app.run(`migrateState(${JSON.stringify(obj)})`));
const DEF = { enabled: false, handled: [], unreadable: [], receivers: {}, aiGuess: true };

test('old backups import unchanged apart from the slip defaults', () => {
  const v1 = { settings: { income: 30000, fixedItems: [] }, entries: [{ id: 'a', date: '2026-10-13', amount: 120, category: 'อาหาร', note: '' }] };
  let out = mig(v1);
  assert.deepEqual(out.slipSettings, DEF);
  assert.equal(out.entries[0].slipRef, undefined);
  const v28 = mig(JSON.parse(JSON.stringify(out)));   // a 2.8.1-shaped backup (no slipSettings)
  delete v28.slipSettings;
  assert.deepEqual(mig(v28).slipSettings, DEF);
  const again = mig(mig(v1));
  assert.deepEqual(again, mig(v1));   // idempotent
  const v24 = { schemaVersion: 3, monthlySettings: {}, categories: [{ name: 'อาหาร', slot: 0 }], entries: [{ id: 'x', date: '2026-10-01', amount: 5, category: 'อาหาร', note: 'n', updatedAt: T0 }] };
  out = mig(v24);
  assert.deepEqual(out.entries[0], v24.entries[0]);
  assert.deepEqual(out.slipSettings, DEF);
  assert.deepEqual(plan([], '').handledKeys, []);
});

test('fresh state carries default slipSettings', () => {
  assert.deepEqual(ev('return st.slipSettings'), DEF);
});

test('migration removes invalid slip fields', () => {
  const long = 'z'.repeat(81);
  const raw = {
    entries: [
      { id: '1', date: '2026-11-01', amount: 1, category: 'อาหาร', note: '', slipRef: long, slipPayee: 5, needsReview: 'yes', aiGuess: true },
      { id: '2', date: '2026-11-01', amount: 1, category: 'อาหาร', note: '', slipRef: 'r', slipPayee: 'p', needsReview: true, aiGuess: true },
      { id: '3', date: '2026-11-01', amount: 1, category: 'อาหาร', note: '', slipRef: '', aiGuess: 'x', needsReview: true }
    ],
    slipSettings: {
      enabled: 'yes', aiGuess: 'no',
      handled: [{ ref: 'a', at: T0 }, { ref: '', at: T0 }, { ref: long, at: T0 }, { ref: 'b' }, null, { ref: 'c', at: T0, extra: 1 }],
      unreadable: [{ key: 'u:1', at: T0, source: 'kplus', photoAt: T0, text: 'secret' }, { key: 'u:2' }],
      receivers: {
        ok1: { name: 'Ok', action: 'expense', category: 'อาหาร', updatedAt: T0 },
        ok2: { name: 'Ok2', action: 'repay', methodId: 'ttb', updatedAt: T0 },
        ok3: { name: 'Ok3', action: 'ignore', updatedAt: T0, junk: 1 },
        bad1: { name: 'B', action: 'expense', updatedAt: T0 },
        bad2: { name: 'B', action: 'repay', updatedAt: T0 },
        bad3: { name: 'B', action: 'delete', updatedAt: T0 },
        bad4: 'x'
      }
    }
  };
  const out = mig(raw);
  const [a, b, c] = out.entries;
  assert.equal(a.slipRef, undefined); assert.equal(a.slipPayee, undefined); assert.equal(a.needsReview, undefined); assert.equal(a.aiGuess, undefined);
  assert.deepEqual([b.slipRef, b.slipPayee, b.needsReview, b.aiGuess], ['r', 'p', true, true]);
  assert.equal(c.slipRef, undefined); assert.equal(c.aiGuess, undefined); assert.equal(c.needsReview, true);
  const s = out.slipSettings;
  assert.equal(s.enabled, false); assert.equal(s.aiGuess, true);
  assert.deepEqual(s.handled.map(h => h.ref), ['a', 'c']);
  assert.deepEqual(Object.keys(s.handled[1]).sort(), ['at', 'ref']);
  assert.deepEqual(s.unreadable, [{ key: 'u:1', at: T0, source: 'kplus', photoAt: T0 }]);
  assert.deepEqual(Object.keys(s.receivers).sort(), ['ok1', 'ok2', 'ok3']);
  assert.deepEqual(Object.keys(s.receivers.ok3).sort(), ['action', 'name', 'updatedAt']);
  const lone = mig({ entries: [{ id: '4', date: '2026-11-01', amount: 1, category: 'อาหาร', note: '', aiGuess: true }] });
  assert.equal(lone.entries[0].aiGuess, undefined);
});

test('migration caps handled at 500, unreadable at 20, receivers at 300', () => {
  const handled = Array.from({ length: 520 }, (_, i) => ({ ref: 'h' + i, at: T0 }));
  const unreadable = Array.from({ length: 25 }, (_, i) => ({ key: 'u:' + i, at: T0, source: 'kplus', photoAt: '' }));
  const receivers = {};
  for (let i = 0; i < 310; i++) receivers['r' + i] = { name: 'r', action: 'ignore', updatedAt: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() };
  const s = mig({ entries: [], slipSettings: { handled, unreadable, receivers } }).slipSettings;
  assert.equal(s.handled.length, 500); assert.equal(s.handled[0].ref, 'h20'); assert.equal(s.handled[499].ref, 'h519');
  assert.equal(s.unreadable.length, 20); assert.equal(s.unreadable[0].key, 'u:5');
  assert.equal(Object.keys(s.receivers).length, 300); assert.ok(!('r0' in s.receivers)); assert.ok('r309' in s.receivers);
});

test('aiGuess switch keeps an explicit false', () => {
  assert.equal(mig({ entries: [], slipSettings: { aiGuess: false, enabled: true } }).slipSettings.aiGuess, false);
  assert.equal(mig({ entries: [], slipSettings: { aiGuess: false, enabled: true } }).slipSettings.enabled, true);
});

// ---- wiring ----
test('saveData returns true, and false when localStorage.setItem throws', async () => {
  const a = loadApp();
  assert.equal(await a.run('saveData()'), true);
  a.run(`localStorage.setItem = () => { throw new Error('quota'); }`);
  const orig = console.error; console.error = () => {};
  try { assert.equal(await a.run('saveData()'), false); } finally { console.error = orig; }
});

test('repeatGroups skips needsReview entries', () => {
  const a = loadApp({ now: '2026-11-14T09:00:00+07:00' });
  const r = plain(a.run(`(() => {
    const e = (id, extra) => Object.assign({ id, date:'2026-11-10', amount:50, category:'อาหาร', note:'n', updatedAt:'${T0}' }, extra || {});
    state = freshState();
    state.entries = [e('1', { needsReview:true }), e('2', { needsReview:true })];
    const none = repeatGroups().length;
    state.entries.push(e('3'), e('4'));
    return [none, repeatGroups().length];
  })()`));
  assert.deepEqual(r, [0, 1]);
});

test('slipTime and slipSource are set at pull time and validated by migration', () => {
  const e = plan([item(1, SHOP)]).entries[0];
  assert.equal(e.slipTime, '15:41'); assert.equal(e.slipSource, 'kplus');
  const out = mig({ entries: [
    { id: 'a', date: '2026-11-01', amount: 1, category: 'อาหาร', note: '', slipTime: '15:41', slipSource: 'ttb' },
    { id: 'b', date: '2026-11-01', amount: 1, category: 'อาหาร', note: '', slipTime: '3:41 PM', slipSource: 'line' }
  ] });
  assert.deepEqual([out.entries[0].slipTime, out.entries[0].slipSource], ['15:41', 'ttb']);
  assert.deepEqual([out.entries[1].slipTime, out.entries[1].slipSource], [undefined, undefined]);
});
