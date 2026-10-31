// Loads the app's classic scripts (the ones index.html lists, except boot.js) into one vm context, like a browser page.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
process.env.TZ = 'Asia/Bangkok';

function scriptFiles() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const out = [];
  const re = /<script\s+[^>]*src="(js\/[^"?]+)(?:\?[^"]*)?"/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function inertEl() {
  const el = {
    style: {}, dataset: {}, children: [], value: '', textContent: '', innerHTML: '', className: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, appendChild(c) { return c; }, setAttribute() {}, getAttribute() { return null; },
    querySelector() { return inertEl(); }, querySelectorAll() { return []; }, focus() {}, blur() {}, remove() {},
    getContext() { return {}; }, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; }
  };
  return el;
}

// opts.now: a Date (or ISO string) that `new Date()` returns inside the app; omit for the real clock.
function loadApp(opts = {}) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); }
  };
  const doc = {
    getElementById: () => inertEl(), querySelector: () => inertEl(), querySelectorAll: () => [],
    addEventListener() {}, createElement: () => inertEl(), body: inertEl(), documentElement: inertEl()
  };
  let FakeDate = Date;
  if (opts.now) {
    const NOW = new Date(opts.now).getTime();
    FakeDate = class extends Date {
      constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
      static now() { return NOW; }
    };
  }
  const win = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  const ctx = vm.createContext({
    document: doc, localStorage, window: win, navigator: {}, location: { protocol: 'http:', hostname: 'localhost', hash: '' },
    matchMedia: win.matchMedia, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout: () => 0, clearTimeout() {},
    history: { pushState() {}, back() {} }, console, Date: FakeDate, Intl, JSON, Math, Set, Map, Promise
  });
  for (const f of scriptFiles()) {
    if (f === 'js/boot.js') continue;
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const run = code => vm.runInContext(code, ctx);
  return { ctx, run, store };
}

module.exports = { loadApp, scriptFiles, ROOT };
