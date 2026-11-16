const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load');

const a = loadApp({ now: '2026-11-16T10:00:00+07:00' });
const key = (v, k) => a.run(`amountKey(${JSON.stringify(v)}, ${JSON.stringify(k)})`);
const press = (keys, start = '') => [...keys].reduce((v, k) => key(v, k === '<' ? 'Backspace' : k), start);

test('amountKey: digits append', () => {
  assert.equal(press('120'), '120');
  assert.equal(press('9'), '9');
});

test('amountKey: only one dot, and a leading dot becomes 0.', () => {
  assert.equal(press('1.2.'), '1.2');
  assert.equal(press('..'), '0.');
  assert.equal(press('.5'), '0.5');
});

test('amountKey: at most 2 decimals', () => {
  assert.equal(press('1.234'), '1.23');
  assert.equal(press('0.999'), '0.99');
});

test('amountKey: no leading zeros', () => {
  assert.equal(press('05'), '5');
  assert.equal(press('000'), '0');
  assert.equal(press('0.5'), '0.5');
  assert.equal(press('0.'), '0.');
  assert.equal(press('0.05'), '0.05');
});

test('amountKey: backspace removes the last character, and is safe when empty', () => {
  assert.equal(press('120<'), '12');
  assert.equal(press('1.<'), '1');
  assert.equal(press('<<'), '');
  assert.equal(press('5<<<'), '');
});

test('amountKey: at most 9 integer digits, decimals still allowed', () => {
  assert.equal(press('1234567890'), '123456789');
  assert.equal(press('123456789.55'), '123456789.55');
});

test('amountKey: other keys and null leave the value alone', () => {
  assert.equal(key('12', 'a'), '12');
  assert.equal(key('12', 'Enter'), '12');
  assert.equal(key(null, '3'), '3');
});

const entries = [
  { id: 'a', date: '2026-11-16', amount: 100 },
  { id: 'b', date: '2026-11-15', amount: 200 },
  { id: 'c', date: '2026-11-16', amount: 300, tripId: 't1' },
  { id: 'd', date: '2026-11-16', amount: 400, tripId: 't2' },
  { id: 'e', date: '2026-11-15', amount: 500, tripId: 't1' }
];
const today = (tid) => a.run(`todayEntries(${JSON.stringify(entries)}, '2026-11-16', ${JSON.stringify(tid)}).map(e => e.id).join('')`);

test('todayEntries: only today, trip entries left out when not travelling', () => {
  assert.equal(today(''), 'a');
  assert.equal(today(null), 'a');
});

test('todayEntries: with a trip, only that trip\'s entries from today', () => {
  assert.equal(today('t1'), 'c');
  assert.equal(today('t2'), 'd');
  assert.equal(today('t3'), '');
});
