const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT } = require('./load');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const swText = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function swAssets() {
  const ctx = { caches: {}, self: { addEventListener() {}, location: { origin: 'http://x' } }, URL, Request, Response };
  vm.createContext(ctx);
  vm.runInContext(swText + '\n;this.__out = { VERSION, ASSETS };', ctx);
  return ctx.__out;
}

test('app-version, sw VERSION and every ?v= agree', () => {
  const meta = /<meta name="app-version" content="([^"]+)"/.exec(html)[1];
  const { VERSION } = swAssets();
  assert.equal(VERSION, meta);
  const vs = [...html.matchAll(/\?v=([^"']+)"/g)].map(m => m[1]);
  assert.ok(vs.length >= 11);
  vs.forEach(v => assert.equal(v, meta));
});

test('every local src/href exists on disk and is precached by the service worker', () => {
  const { ASSETS } = swAssets();
  const refs = [...html.matchAll(/<(?:script|link)\s[^>]*?(?:src|href)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:|#)/.test(u));
  assert.ok(refs.length >= 14);
  for (const ref of refs) {
    const file = ref.split('?')[0];
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${ref} missing on disk`);
    assert.ok(ASSETS.includes('./' + ref), `${ref} not in sw.js ASSETS`);
  }
  for (const a of ASSETS) {
    if (a === './') continue;
    assert.ok(fs.existsSync(path.join(ROOT, a.split('?')[0])), `${a} (ASSETS) missing on disk`);
  }
});

test('no https:// anywhere in the shipped code', () => {
  const files = ['index.html', 'sw.js']
    .concat(fs.readdirSync(path.join(ROOT, 'css')).map(f => 'css/' + f))
    .concat(fs.readdirSync(path.join(ROOT, 'js')).map(f => 'js/' + f));
  for (const f of files) {
    const n = (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/https:\/\//g) || []).length;
    assert.equal(n, 0, `${f} contains https://`);
  }
});
