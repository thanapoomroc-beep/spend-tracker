// One shader ground behind the วันนี้ hero (grain-gradient from vendor/fx). Purely decorative:
// any failure leaves #heroFx empty and the hero stays a plain card. fx.js handles reduced motion
// (one still frame), hidden tabs, off-screen pausing and WebGL failure by itself.
let heroFxCtl = null;
let heroFxState = 'idle';   // idle | loading | ready | failed
const HERO_FX_PALETTE = { bg:'#18191C', surface:'#222327', ink:'#F2F2F4', muted:'#9A9CA3', accent:'#E8D3A8', accentInk:'#0E0F11' };
const HERO_FX_PARAMS = { calm:0, tint:1, contrast:1, softness:0.3, scatter:1, grain:0.8, warp:0.8, speed:0.7 };
function heroFxWanted(){
  if(document.body.classList.contains('travel')) return false;
  const wrap = document.getElementById('heroValueWrap');
  return !(wrap && wrap.style.display === 'none');   // no-income state: value hidden, plain card
}
function heroFxSync(){
  const el = document.getElementById('heroFx');
  if(!el) return;
  const want = heroFxWanted();
  el.hidden = !want;
  if(!heroFxCtl) return;
  try{ if(want) heroFxCtl.resume(); else heroFxCtl.pause(); }catch(e){}
}
function heroFxStart(){
  if(heroFxState !== 'idle') return;
  const el = document.getElementById('heroFx');
  if(!el || !window.WebGLRenderingContext) { heroFxState = 'failed'; return; }
  heroFxState = 'loading';
  let warned = false;
  const fail = err => {
    heroFxState = 'failed'; heroFxCtl = null;
    if(!warned){ warned = true; try{ console.warn('hero shader off', err && err.message || err); }catch(e){} }
  };
  try{
    import(new URL('vendor/fx/fx.js', document.baseURI).href).then(mod => {
      const fx = mod.default || mod;
      return fx.mount(el, 'grain-gradient', { palette: HERO_FX_PALETTE, params: HERO_FX_PARAMS, seed: 6 });
    }).then(ctl => {
      heroFxCtl = ctl; heroFxState = 'ready'; heroFxSync();
    }).catch(fail);
  }catch(err){ fail(err); }
}
// Hero entrance, once per app open: a body class, because renderHero rewrites the card's className.
function heroEnter(){
  try{
    if(reducedMotion()) return;
    document.body.classList.add('app-enter');
    setTimeout(()=> document.body.classList.remove('app-enter'), 600);
  }catch(e){}
}
