// The วันนี้ hero's warm light: a still image (img/hero-light.webp, one frame of the taste kit's
// film-light-leak effect, seed 5, under a soft centre scrim) on #heroFx. 2.11.2 replaced the live WebGL shader, which flickered
// on iPhone. #heroFx is a child of #heroCard because render rewrites the card's className.
function heroFxWanted(){
  if(document.body.classList.contains('travel')) return false;
  const wrap = document.getElementById('heroValueWrap');
  return !(wrap && wrap.style.display === 'none');   // no-income state: value hidden, plain card
}
function heroFxSync(){
  const el = document.getElementById('heroFx');
  if(el) el.hidden = !heroFxWanted();
}
// Hero entrance, once per app open: a body class, because renderHero rewrites the card's className.
function heroEnter(){
  try{
    if(reducedMotion()) return;
    document.body.classList.add('app-enter');
    setTimeout(()=> document.body.classList.remove('app-enter'), 600);
  }catch(e){}
}
