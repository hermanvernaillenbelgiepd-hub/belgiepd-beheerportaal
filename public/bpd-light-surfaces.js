/* Lichte weergave: pagina's met hard-gecodeerde donkere vlakken (inline kleuren)
 * krijgen in het lichte thema een lichte achtergrond, zodat de tekst leesbaar blijft.
 * Enkel presentatie; in donker thema wordt alles teruggezet. */
(()=>{
  const root=document.documentElement;
  const isLight=()=>root.getAttribute('data-bpd-theme')==='light';
  const SKIP='button,a,option,select,input,textarea,svg,img,canvas,iframe,video,#bpdSidebar,#bpdSidebar *,.bpd-theme-toggle,[data-keep-dark]';
  function parse(c){const m=c&&c.match(/rgba?\(([^)]+)\)/);if(!m)return null;
    const p=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);return{r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}}
  const lum=({r,g,b})=>(0.2126*r+0.7152*g+0.0722*b)/255;
  function scan(){
    const on=isLight();
    for(const el of document.querySelectorAll('[data-bpd-dark-surface]'))
      if(!on)el.removeAttribute('data-bpd-dark-surface');
    if(!on)return;
    const scope=document.querySelector('main')||document.body;
    for(const el of scope.querySelectorAll('*')){
      if(el.matches(SKIP)||el.hasAttribute('data-bpd-dark-surface'))continue;
      const r=el.getBoundingClientRect();
      const th=el.tagName==='TH'||el.tagName==='THEAD'||el.tagName==='TR';
      if(!th&&(r.width<220||r.height<30))continue;
      const cs=getComputedStyle(el);
      let c=parse(cs.backgroundColor);
      if((!c||c.a<.55)&&/gradient/.test(cs.backgroundImage)){
        const m=cs.backgroundImage.match(/rgba?\([^)]+\)/);c=m?parse(m[0]):null;
      }
      if(!c||c.a<.55||lum(c)>=.36)continue;
      const kind=c.g>c.r+12&&c.g>c.b+12?'ok':(c.r>c.g+14&&c.r>c.b+30?(c.g<c.b+25?'err':'warn'):'note');
      el.setAttribute('data-bpd-dark-surface',kind);
    }
  }
  let t=0;const later=()=>{clearTimeout(t);t=setTimeout(scan,250)};
  new MutationObserver(later).observe(root,{attributes:true,attributeFilter:['data-bpd-theme']});
  new MutationObserver(later).observe(document.body,{childList:true,subtree:true});
  addEventListener('load',later);later();
})();
