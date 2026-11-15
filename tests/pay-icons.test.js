const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load');

test('payIconSvg: wallet for plain methods, credit card for repay and statement', () => {
  const { run } = loadApp();
  const wallet = run(`payIconSvg({ cardType:'' })`);
  assert.ok(wallet.includes('M19 7V4'));
  assert.equal(run(`payIconSvg({})`), wallet);
  assert.equal(run(`payIconSvg(null)`), wallet);
  for (const t of ['repay', 'statement']) {
    const card = run(`payIconSvg({ cardType:'${t}' })`);
    assert.ok(card.includes('<rect width="20" height="14"'));
    assert.notEqual(card, wallet);
  }
  assert.ok(wallet.includes('aria-hidden="true"') && wallet.includes('stroke-width="1.75"'));
});

test('hero-fx.js loads without side effects and heroFxSync is safe without a controller', () => {
  const { run } = loadApp();
  assert.equal(run(`typeof heroFxStart`), 'function');
  assert.doesNotThrow(() => run(`heroFxSync()`));
  assert.equal(run(`heroFxCtl`), null);
});
