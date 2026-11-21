/* Uitsluitend visuele hoogtesynchronisatie. Geen opleidingsdata of bevoegdheden via postMessage. */
(()=>{
 'use strict';
 if(new URLSearchParams(location.search).get('embedded')!=='1'||window.parent===window)return;
 let latest=0,pending=false;
 const measure=()=>{
  pending=false;
  // Body height measures content. documentElement.scrollHeight can equal the
  // iframe viewport and create a feedback loop (+16px on every resize).
  const raw=document.body?.scrollHeight||0;
  const height=Math.ceil(raw);
  if(height<320||height>16000||Math.abs(height-latest)<8)return;
  latest=height;
  window.parent.postMessage({type:'bpd-training-register-resize',height},location.origin);
 };
 const update=()=>{
  if(pending)return;
  pending=true;
  requestAnimationFrame(measure);
 };
 const init=()=>{
  update();
  if(typeof ResizeObserver==='function'){
   const resize=new ResizeObserver(update);
   resize.observe(document.body);
   resize.observe(document.documentElement);
  }
  window.addEventListener('load',update,{once:true});
  window.addEventListener('resize',update,{passive:true});
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
