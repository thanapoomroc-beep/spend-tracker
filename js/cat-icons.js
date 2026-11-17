// Category glyphs (Lucide icons, ISC licence), inline path data so nothing loads from the network.
// Used only by the category pickers (entry sheet, edit sheet) and the icon picker in settings.
// A category stores an optional `icon` id; without one, catIconId() falls back to a name default or a keyword guess.
const CAT_ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="cat-ic"';
const CAT_ICONS = {
  'utensils': '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  'coffee': '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  'bus': '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
  'car': '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  'fuel': '<line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
  'plane': '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  'bed-double': '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/>',
  'lightbulb': '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  'zap': '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  'house': '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  'smartphone': '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  'wifi': '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
  'shopping-bag': '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>',
  'shirt': '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
  'heart-pulse': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
  'pill': '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  'gamepad-2': '<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>',
  'clapperboard': '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  'ticket': '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  'gift': '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  'graduation-cap': '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  'book-open': '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  'baby': '<path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/>',
  'paw-print': '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>',
  'dumbbell': '<path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>',
  'scissors': '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  'receipt': '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/>',
  'tag': '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  'ellipsis': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'
};
const CAT_ICON_ORDER = ['utensils','coffee','bus','car','fuel','plane','bed-double','lightbulb','zap','house','smartphone','wifi','shopping-bag','shirt','heart-pulse','pill','gamepad-2','clapperboard','ticket','gift','graduation-cap','book-open','baby','paw-print','dumbbell','scissors','receipt','tag','ellipsis'];
const CAT_ICON_LABELS = {
  'utensils':'จานอาหาร', 'coffee':'กาแฟ', 'bus':'รถเมล์', 'car':'รถยนต์', 'fuel':'น้ำมัน', 'plane':'เครื่องบิน', 'bed-double':'ที่พัก',
  'lightbulb':'หลอดไฟ', 'zap':'ไฟฟ้า', 'house':'บ้าน', 'smartphone':'มือถือ', 'wifi':'อินเทอร์เน็ต', 'shopping-bag':'ถุงช้อปปิ้ง', 'shirt':'เสื้อ',
  'heart-pulse':'สุขภาพ', 'pill':'ยา', 'gamepad-2':'เกม', 'clapperboard':'หนัง', 'ticket':'ตั๋ว', 'gift':'ของขวัญ', 'graduation-cap':'หมวกบัณฑิต',
  'book-open':'หนังสือ', 'baby':'เด็ก', 'paw-print':'สัตว์เลี้ยง', 'dumbbell':'ดัมเบล', 'scissors':'กรรไกร', 'receipt':'ใบเสร็จ', 'tag':'ป้าย', 'ellipsis':'จุดสามจุด'
};
const CAT_ICON_DEFAULTS = { 'อาหาร':'utensils', 'การเดินทาง':'bus', 'สาธารณูปโภค':'lightbulb', 'ช้อปปิ้ง':'shopping-bag', 'สุขภาพ':'heart-pulse', 'บันเทิง':'clapperboard', 'อื่นๆ':'ellipsis' };
const TRIP_CAT_ICON_DEFAULTS = { 'ตั๋วเครื่องบิน':'plane', 'ที่พัก':'bed-double', 'เดินทาง':'bus', 'อาหาร':'utensils', 'ช้อปปิ้ง':'shopping-bag', 'ตั๋ว/กิจกรรม':'ticket', 'อื่นๆ':'ellipsis' };
// Keyword guess for custom names: the first rule that matches wins, so specific words come before general ones (น้ำมัน before รถ).
const CAT_ICON_KEYWORDS = [
  ['coffee', ['กาแฟ','คาเฟ่','ชานม','coffee','cafe']],
  ['fuel', ['น้ำมัน','เติมรถ','ปั๊ม']],
  ['bus', ['แท็กซี่','รถเมล์','รถไฟ','bts','mrt','taxi','grab','มอไซค์','มอเตอร์ไซค์']],
  ['car', ['รถ','ที่จอด','ทางด่วน']],
  ['plane', ['เที่ยว','บิน','ท่องเที่ยว']],
  ['house', ['บ้าน','หอ','เช่า','คอนโด']],
  ['smartphone', ['มือถือ','โทร','ซิม']],
  ['wifi', ['เน็ต','wifi','อินเทอร์เน็ต']],
  ['shirt', ['เสื้อ','แฟชั่น','กางเกง','รองเท้า']],
  ['gamepad-2', ['เกม','game']],
  ['clapperboard', ['หนัง','ซีรีส์','netflix']],
  ['gift', ['ของขวัญ','การกุศล','บริจาค']],
  ['graduation-cap', ['เรียน','คอร์ส','ค่าเทอม']],
  ['book-open', ['หนังสือ']],
  ['baby', ['ลูก','เด็ก','นม']],
  ['paw-print', ['หมา','แมว','สัตว์']],
  ['dumbbell', ['ฟิต','ยิม','ออกกำลัง']],
  ['scissors', ['ตัดผม','ซาลอน','ทำผม','เสริมสวย']],
  ['receipt', ['บิล','ภาษี','ใบเสร็จ']],
  ['pill', ['ยา','หมอ','โรงพยาบาล']],
  ['utensils', ['ข้าว','กิน','อาหาร','ร้านอาหาร']]
];
// Pure. Stored icon (if valid) > exact-name default > keyword guess > 'tag'.
function catIconId(name, storedIcon){
  if(typeof storedIcon === 'string' && Object.prototype.hasOwnProperty.call(CAT_ICONS, storedIcon)) return storedIcon;
  const nm = typeof name === 'string' ? name.trim() : '';
  if(Object.prototype.hasOwnProperty.call(CAT_ICON_DEFAULTS, nm)) return CAT_ICON_DEFAULTS[nm];
  const low = nm.toLowerCase();
  for(const [id, words] of CAT_ICON_KEYWORDS){
    if(words.some(w => low.includes(w))) return id;
  }
  return 'tag';
}
function tripCatIconId(name){
  return Object.prototype.hasOwnProperty.call(TRIP_CAT_ICON_DEFAULTS, name) ? TRIP_CAT_ICON_DEFAULTS[name] : 'tag';
}
function categoryIconFor(name){ const c = findCat(name); return catIconId(name, c && c.icon); }
// Row icon for an entry or a category name, in its colour (replaces the round dot in rows).
function entryIconSvg(e){ return catIconSvg(e.tripId ? tripCatIconId(e.category) : categoryIconFor(e.category), 0, entryColor(e)); }
function catRowIconSvg(name, color){ return catIconSvg(categoryIconFor(name), 0, color || categoryColor(name)); }
function tripRowIconSvg(name){ return catIconSvg(tripCatIconId(name), 0, tripCatColor(name)); }
function catIconSvg(id, size, color){
  const body = CAT_ICONS[id] || CAT_ICONS.tag;
  const s = size ? ` width="${size}" height="${size}"` : '';
  const st = color ? ` style="color:${color}"` : '';
  return `<svg ${CAT_ICON_ATTRS}${s}${st}>${body}</svg>`;
}
