/* Shared live/Uniformatelier font fitting for the photographic nameplate.
   The plate can be very small in an organogram thumbnail. Do not truncate the
   person's real name or BELGIEPD call: size each line from measured text.
   Does not change personnel data, only visible pixels. */
(function(){
 'use strict';
 const canvas=document.createElement('canvas');
 const ctx=typeof canvas.getContext==='function'?canvas.getContext('2d'):null;
 const baseSelectors=':scope > .bpd-woven-name, :scope > .bpd-woven-call, :scope > .compose-name, :scope > .compose-call';
 function fit(plate){
  if(!plate||!plate.isConnected||typeof window.getComputedStyle!=='function')return;
  const rows=plate.querySelectorAll?.(baseSelectors);
  if(!rows)return;
  for(const row of rows){
   const text=String(row.textContent||'').trim();
   if(!text)continue;
   // Remove previous sizing to read the CSS default after any layout change.
   row.style.fontSize='';
   const style=window.getComputedStyle(row);
   const base=Number.parseFloat(style.fontSize);
   const width=row.clientWidth;
   const height=row.clientHeight;
   if(!(base>0&&width>0&&height>0))continue;
   const letterSpacing=Number.parseFloat(style.letterSpacing)||0;
   let measured=0;
   if(ctx){
    ctx.font=[style.fontStyle||'normal',style.fontWeight||'700',
     base+'px',style.fontFamily||'Arial'].join(' ');
    measured=ctx.measureText(text).width;
   }else{
    // Older/locked-down browser fallback: prefer shrinking to clipping.
    measured=text.length*base*.63;
   }
   measured+=Math.max(0,text.length-1)*letterSpacing;
   const safeWidth=Math.max(1,width-1);
   const safeHeight=Math.max(1,height*.9);
   const fitted=Math.max(.8,Math.min(base,safeHeight,
    measured>0?base*safeWidth/measured:base));
   row.style.fontSize=fitted.toFixed(2)+'px';
   row.style.textOverflow='clip';
  }
 }
 const observer=typeof window.ResizeObserver==='function'?
  new window.ResizeObserver(entries=>{
   for(const entry of entries)fit(entry.target);
  }):null;
 function watch(plate){
  if(!plate)return;
  observer?.observe(plate);
  if(typeof window.requestAnimationFrame==='function')
   window.requestAnimationFrame(()=>fit(plate));
  if(document.fonts?.ready)
   document.fonts.ready.then(()=>fit(plate)).catch(()=>{});
 }
 window.BPDNameplateFit=Object.freeze({fit,watch});
})();
