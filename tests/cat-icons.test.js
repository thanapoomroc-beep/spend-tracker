const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./load');

test('catIconId: stored valid id wins, invalid falls back to the default', () => {
  const { run } = loadApp();
  assert.equal(run(`catIconId('อาหาร','coffee')`), 'coffee');
  assert.equal(run(`catIconId('อาหาร','nope')`), 'utensils');
  assert.equal(run(`catIconId('อาหาร','constructor')`), 'utensils');
});

test('catIconId: exact-name defaults', () => {
  const { run } = loadApp();
  const exp = { 'อาหาร':'utensils', 'การเดินทาง':'bus', 'สาธารณูปโภค':'lightbulb', 'ช้อปปิ้ง':'shopping-bag', 'สุขภาพ':'heart-pulse', 'บันเทิง':'clapperboard', 'อื่นๆ':'ellipsis' };
  for (const [n, id] of Object.entries(exp)) assert.equal(run(`catIconId(${JSON.stringify(n)})`), id);
});

test('catIconId: keyword guess, first rule wins, unknown is tag', () => {
  const { run } = loadApp();
  assert.equal(run(`catIconId('ค่ากาแฟ')`), 'coffee');
  assert.equal(run(`catIconId('ค่าน้ำมันรถ')`), 'fuel');   // น้ำมัน is checked before รถ
  assert.equal(run(`catIconId('ค่ารถ')`), 'car');
  assert.equal(run(`catIconId('BTS')`), 'bus');
  assert.equal(run(`catIconId('ค่าเน็ต')`), 'wifi');
  assert.equal(run(`catIconId('ซื้อของขวัญ')`), 'gift');
  assert.equal(run(`catIconId('อะไรก็ไม่รู้')`), 'tag');
  assert.equal(run(`catIconId('')`), 'tag');
});

test('icon tables are consistent', () => {
  const { run } = loadApp();
  assert.equal(run(`CAT_ICON_ORDER.every(id => CAT_ICONS[id] && CAT_ICON_LABELS[id])`), true);
  assert.equal(run(`new Set(CAT_ICON_ORDER).size === CAT_ICON_ORDER.length`), true);
  assert.equal(run(`Object.keys(CAT_ICONS).every(id => CAT_ICON_ORDER.includes(id))`), true);
  assert.equal(run(`Object.values(CAT_ICON_DEFAULTS).concat(Object.values(TRIP_CAT_ICON_DEFAULTS)).every(id => CAT_ICONS[id])`), true);
  assert.equal(run(`TRIP_CATS.every(c => TRIP_CAT_ICON_DEFAULTS[c])`), true);
  assert.equal(run(`tripCatIconId('ตั๋วเครื่องบิน')`), 'plane');
  assert.ok(run(`catIconSvg('utensils', 20)`).includes('class="cat-ic"'));
});

test('migrateState keeps a valid category icon and drops an invalid one', () => {
  const { run } = loadApp();
  const out = run(`(() => {
    const s = migrateState({ schemaVersion:3, entries:[], categories:[
      { name:'อาหาร', slot:0, archived:false, updatedAt:'2026-01-01T00:00:00.000Z', icon:'coffee' },
      { name:'การเดินทาง', slot:1, archived:false, updatedAt:'2026-01-01T00:00:00.000Z', icon:'bogus' },
      { name:'อื่นๆ', slot:null, archived:false, updatedAt:'2026-01-01T00:00:00.000Z' } ] });
    return JSON.stringify(s.categories.map(c => [c.name, 'icon' in c ? c.icon : null]));
  })()`);
  assert.deepEqual(JSON.parse(out), [['อาหาร','coffee'],['การเดินทาง',null],['อื่นๆ',null]]);
});

test('an old backup without icons still loads and gets defaults', () => {
  const { run } = loadApp();
  const out = run(`(() => {
    const s = migrateState({ settings:{ income: 1000 }, entries:[{ id:'a', date:'2026-01-02', amount:50, category:'อาหาร', note:'' }] });
    return s.categories.every(c => !('icon' in c)) && s.categories.length > 0;
  })()`);
  assert.equal(out, true);
});
