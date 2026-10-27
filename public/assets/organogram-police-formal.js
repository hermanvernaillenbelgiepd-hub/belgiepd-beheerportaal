/* BelgiumPD organogram, only visual. NEVER use grade display as authorization. */
(function(){
 'use strict';
 const BASE='/assets/organogram-police-formal.webp';
 const ranks=[
  {key:'1hcp',label:'Eerste hoofdcommissaris',abbr:'1-HCP',kind:'crown',count:3,line:true},
  {key:'1cp',label:'Eerste commissaris',abbr:'1-CP',kind:'crown',count:2,line:true},
  {key:'acp',label:'Aspirant-commissaris',abbr:'A-CP',kind:'crown',count:1},
  {key:'cp',label:'Commissaris',abbr:'CP',kind:'crown',count:2},
  {key:'1hinp',label:'Eerste hoofdinspecteur',abbr:'1-HINP',kind:'silverCrown',count:2,line:true},
  {key:'hinp',label:'Hoofdinspecteur',abbr:'HINP',kind:'silverCrown',count:2},
  {key:'ahinp',label:'Aspirant-hoofdinspecteur',abbr:'A-HINP',kind:'silverCrown',count:1},
  {key:'1inp',label:'Eerste inspecteur',abbr:'1-INP',kind:'star',count:2,line:true},
  {key:'inp',label:'Inspecteur',abbr:'INP',kind:'star',count:2},
  {key:'ainp',label:'Aspirant-inspecteur',abbr:'A-INP',kind:'star',count:1},
  {key:'ap',label:'Agent van politie',abbr:'AP',kind:'bars',count:2}
 ];
 const byKey=Object.fromEntries(ranks.map(x=>[x.key,x]));
 function gradeFor(person){
  if(!person||person.dept!=='politie')return null;
  const c=String(person.call||'').trim().toUpperCase();
  const m=c.match(/^(?:[A-Z]+[- ])?(\d{3})$/),n=m?Number(m[1]):null;
  if(n===900)return byKey['1hcp'];
  if(n===910)return byKey['1cp'];
  if(n===920||n===930)return byKey.acp;
  if(n!==null&&n>=800&&n<900)return byKey['1hinp'];
  if(n!==null&&n>=700&&n<800)return byKey.hinp;
  if(n!==null&&n>=600&&n<700)return byKey.ahinp;
  if(n!==null&&n>=500&&n<600)return byKey['1inp'];
  if(n!==null&&n>=400&&n<500)return byKey.inp;
  if(n!==null&&n>=300&&n<400)return byKey.ainp;
  if(n!==null&&n>=100&&n<300)return byKey.ap;
  // Fallback for legacy TEST calls like TEST-P101: read display rank, never privileges.
  const rank=String(person.rank||'').toLocaleLowerCase('nl');
  if(/eerste hoofdcommissaris|1hcp/.test(rank))return byKey['1hcp'];
  if(/eerste commissaris|1cp/.test(rank))return byKey['1cp'];
  if(/aspirant.commissaris|a.cp/.test(rank))return byKey.acp;
  if(/commissaris/.test(rank))return byKey.cp;
  if(/eerste hoofdinspecteur|1.hinp/.test(rank))return byKey['1hinp'];
  if(/aspirant.hoofdinspecteur|a.hinp/.test(rank))return byKey.ahinp;
  if(/hoofdinspecteur/.test(rank))return byKey.hinp;
  if(/eerste inspecteur|1.inp/.test(rank))return byKey['1inp'];
  if(/aspirant.inspecteur|a.inp/.test(rank))return byKey.ainp;
  if(/inspecteur/.test(rank))return byKey.inp;
  if(/agent van politie/.test(rank))return byKey.ap;
  return null;
 }
 const ns='http://www.w3.org/2000/svg';
 function svgEl(tag,attrs){
  const v=document.createElementNS(ns,tag);
  for(const [k,x] of Object.entries(attrs||{}))v.setAttribute(k,String(x));
  return v;
 }
 // Each police rank is now one physically separate 512x160 transparent
 // WebP asset. Never crop a tall montage: that caused adjacent badges
 // to leak into the personnel cards at several browser zoom levels.
 // Normalized bounding boxes (left, top, right, bottom) measured in
 // each 512x160 transparent source file. Different embroidered frames had
 // unequal transparent margins, which made the middle/officer badges look
 // visibly narrower than the basic cadre even with identical CSS sizes.
 // Scale only their *rendered* pixels into one identical inner frame.
 const GRADE_ALPHA_BOUNDS=Object.freeze({
  ap:[3,4,509,156],
  ainp:[3,6,509,153],
  inp:[3,6,509,153],
  '1inp':[31,3,481,157],
  ahinp:[39,3,472,157],
  hinp:[30,3,482,157],
  '1hinp':[27,3,484,157],
  acp:[37,3,474,157],
  cp:[28,3,483,156],
  '1cp':[25,3,487,157],
  '1hcp':[24,3,487,157]
 });
 // Same exterior patch dimensions, embroidered rim and margins for all ranks.
 const NORMALIZED_GRADE_FRAME=Object.freeze({x:16,y:4,width:480,height:152});
 const GRADE_ASSETS=Object.freeze({
  ap:'/assets/bpd-rank-ap-clean-20261027.webp',
  ainp:'/assets/bpd-rank-ainp-clean-20261027.webp',
  inp:'/assets/bpd-rank-inp-clean-20261027.webp',
  '1inp':'/assets/bpd-rank-1inp-clean-20261027.webp',
  ahinp:'/assets/bpd-rank-ahinp-clean-20261027.webp',
  hinp:'/assets/bpd-rank-hinp-clean-20261027.webp',
  '1hinp':'/assets/bpd-rank-1hinp-clean-20261027.webp',
  acp:'/assets/bpd-rank-acp-clean-20261027.webp',
  cp:'/assets/bpd-rank-cp-clean-20261027.webp',
  '1cp':'/assets/bpd-rank-1cp-clean-20261027.webp',
  '1hcp':'/assets/bpd-rank-1hcp-clean-20261027.webp'
 });
 function drawing(grade){
  const svg=svgEl('svg',{viewBox:'0 0 512 160',
   preserveAspectRatio:'xMidYMid meet',
   'aria-hidden':'true',focusable:'false',class:'bpd-grade-vector'});
  const source=grade?GRADE_ASSETS[grade.key]:null;
  if(!source)return svg;
  const bounds=GRADE_ALPHA_BOUNDS[grade.key];
  if(!bounds)return svg;
  const [left,top,right,bottom]=bounds;
  const frame=NORMALIZED_GRADE_FRAME;
  const scaleX=frame.width/(right-left);
  const scaleY=frame.height/(bottom-top);
  // Keep a single isolated image per grade. No sprite, no neighboring rank:
  // the source's visible bounding box maps to exactly the same frame for
  // agent, basic, middle, officer and corps leadership alike.
  svg.append(svgEl('image',{
   href:source,
   x:Number((frame.x-left*scaleX).toFixed(4)),
   y:Number((frame.y-top*scaleY).toFixed(4)),
   width:Number((512*scaleX).toFixed(4)),
   height:Number((160*scaleY).toFixed(4)),
   preserveAspectRatio:'none'
  }));
  return svg;
 }
 function useBelgianBadgeArtwork(container,grade){
  container.classList.add('bpd-vector-rank');
  container.dataset.grade=grade?.key||'unknown';
  container.append(drawing(grade));
 }
 function makeBadge(person,large=false){
  const grade=gradeFor(person);
  if(!grade)return null;
  const badge=document.createElement('span');
  badge.className='bpd-grade-badge'+(large?' bpd-grade-badge-large':'');
  badge.setAttribute('role','img');
  badge.setAttribute('aria-label','BelgiumPD-graadteken '+grade.label);
  badge.title=grade.abbr+' · '+grade.label;
  useBelgianBadgeArtwork(badge,grade);
  return badge;
 }

 // Uniform accents follow the verified BelgiumPD display-grade mapping.
 // Operational permissions remain entirely server-side and independent.
 // Distinct shoulder bands. Silver fittings (cord, cuffs, collar, buttons)
 // remain consistent across middle, basic and agent cadres.
 function trimFor(grade){
  if(grade?.key==='1hcp'||grade?.key==='1cp')return 'gold-thick';
  if(grade?.key==='acp'||grade?.key==='cp')return 'gold-thin';
  if(['ahinp','hinp','1hinp'].includes(grade?.key))return 'silver-thin';
  return 'silver-none';
 }
 const preparedUniforms=new Map();
 function preparedUniform(trim){
  if(preparedUniforms.has(trim))return preparedUniforms.get(trim);
  if(typeof Image==='undefined'||typeof document?.createElement!=='function')
   return Promise.resolve(BASE);
  const pending=new Promise(resolve=>{
   const photo=new Image();
   photo.onload=()=>{
    try{
     const canvas=document.createElement('canvas');
     const w=photo.naturalWidth,h=photo.naturalHeight;
     if(!w||!h||!canvas.getContext){resolve(BASE);return}
     canvas.width=w;canvas.height=h;
     const ctx=canvas.getContext('2d',{willReadFrequently:true});
     if(!ctx){resolve(BASE);return}
     ctx.drawImage(photo,0,0,w,h);
     const pixels=ctx.getImageData(0,0,w,h),v=pixels.data;
     // Paint out the fixed red-ribbon medal below the original rank
     // using nearby navy cloth. The medal only reappears when awarded.
     const x0=Math.floor(w*134/240),x1=Math.ceil(w*165/240),
       y0=Math.floor(h*167/255),y1=Math.ceil(h*215/255);
     for(let y=y0;y<y1;y++){
      const sx=Math.min(w-1,Math.floor(w*183/240));
      const si=(y*w+sx)*4;
      const cloth=[v[si],v[si+1],v[si+2]];
      for(let x=x0;x<x1;x++){
       const p=(y*w+x)*4;
       v[p]=cloth[0];v[p+1]=cloth[1];v[p+2]=cloth[2];
      }
     }
     // The left nameplate is SILVER in all cadres, including Korpsleiding.
     // Only its original ochre pixel accents are recoloured, not the coat.
     for(let y=Math.floor(h*137/255);y<Math.ceil(h*172/255);y++){
      for(let x=Math.floor(w*36/240);x<Math.ceil(w*97/240);x++){
       const p=(y*w+x)*4,r=v[p],g=v[p+1],bb=v[p+2];
       if(r>75&&g>55&&r>g*1.05&&g>bb*1.08){
        const lum=Math.round(r*.30+g*.56+bb*.14);
        v[p]=Math.min(255,lum+8);v[p+1]=Math.min(255,lum+15);
        v[p+2]=Math.min(255,lum+24);
       }
      }
     }
     // Lower cadres use silver cord, collar, necklace and cuff details.
     // Select yellow/gold pixels only; protect navy cloth, white shirt
     // and burgundy tie from undesired desaturation.
     if(trim==='silver-thin'||trim==='silver-none')for(let i=0;i<v.length;i+=4){
      const r=v[i],g=v[i+1],b=v[i+2];
      if(r>90&&g>75&&r>g*1.04&&g>b*1.10&&r-b>31){
       const light=Math.min(230,Math.round(r*.26+g*.54+b*.20+25));
       v[i]=Math.min(255,light+7);
       v[i+1]=Math.min(255,light+13);
       v[i+2]=Math.min(255,light+21);
      }
     }
     ctx.putImageData(pixels,0,0);
     // All grades (including 900/910) must lose the OLD golden square
     // epaulettes baked into the original jacket illustration. Restore the
     // surrounding navy fabric in a shaped area, with a notch at left to
     // preserve the genuine shoulder cord. Then a slim SVG band is drawn
     // OVER this cleaned material in portrait coordinates.
     // These coordinates come from the 720×765 uniform reference.
     const scaleX=w/720,scaleY=h/765;
     const cleanupPolygons=[
      [[0,119],[75,103],[91,183],[42,190],[28,168],[22,141],[0,141]],
      [[635,101],[719,120],[719,184],[643,195],[612,117]]
     ];
     ctx.fillStyle='#1c3761';
     for(const pts of cleanupPolygons){
      ctx.beginPath();
      pts.forEach(([x,y],i)=>i?ctx.lineTo(x*scaleX,y*scaleY):
        ctx.moveTo(x*scaleX,y*scaleY));
      ctx.closePath();
      ctx.fill();
     }
     resolve(canvas.toDataURL('image/webp',.87));
    }catch(_){resolve(BASE)}
   };
   photo.onerror=()=>resolve(BASE);
   photo.src=BASE;
  });
  preparedUniforms.set(trim,pending);
  return pending;
 }
 // Narrow, lengthwise shoulder seams on TOP of the garment, never
 // freestanding square patches. Sized in the same reference coordinates
 // as the underlying 720x765 Belgian formal uniform.
 function makeShoulderTrim(trim){
  const thickness={
   'gold-thick':10,'gold-thin':5,'silver-thin':3
  }[trim]||0;
  if(!thickness)return null; // base and agent cadres have bare shoulders
  const gold=trim.startsWith('gold-');
  const metal=gold?'#dbb55d':'#bfcdda';
  const light=gold?'#f8dc9a':'#f0f5fa';
  const dark=gold?'#9b772f':'#778b9d';
  const wrap=document.createElement('span');
  wrap.className='bpd-shoulder-trim';
  wrap.setAttribute('aria-hidden','true');
  wrap.dataset.trim=trim;
  const svg=svgEl('svg',{viewBox:'0 0 720 765',
   preserveAspectRatio:'none',focusable:'false'});
  function band(ax,ay,bx,by){
   // Four vertices: a tapered sewn strip extending front-to-back.
   const x2=bx,y2=by+thickness,x1=ax,y1=ay+thickness;
   svg.append(svgEl('path',{
    d:'M'+ax+' '+ay+' L'+bx+' '+by+
      ' L'+x2+' '+y2+' L'+x1+' '+y1+' Z',
    fill:metal,stroke:dark,'stroke-width':'.75',
    'stroke-linejoin':'round'
   }));
   svg.append(svgEl('path',{
    d:'M'+(ax+1)+' '+(ay+1)+' L'+(bx-1)+' '+(by+1),
    fill:'none',stroke:light,'stroke-width':'.9',
    'stroke-linecap':'round',opacity:'.88'
   }));
  }
  band(20,132,81,111); // left shoulder, close to cord attachment
  band(639,111,700,132); // right shoulder, same perspective
  wrap.append(svg);
  return wrap;
 }
 function nameplateData(person){
  const name=String(person?.name||'NAAM ONBEKEND').trim().slice(0,64)||'NAAM ONBEKEND';
  const call=String(person?.call||'—').trim().slice(0,24)||'—';
  return {name,call,bottom:'BELGIEPD - '+call};
 }
 function makeNameplate(person,zoom=false){
  if(person?.dept!=='politie')return null;
  const details=nameplateData(person);
  const plate=document.createElement('span');
  plate.className='bpd-personal-nameplate'+(zoom?' bpd-nameplate-zoom':'');
  plate.setAttribute('role','img');
  plate.setAttribute('aria-label','Naamplaat: '+details.name+', '+details.bottom);
  plate.title=details.name+' · '+details.bottom;
  plate.dataset.call=details.call;
  // The original illustrated uniform ALREADY has a sewn nameplate frame.
  // Paint ONLY inside its existing inner textile opening. Its stitches,
  // border and blue surrounds remain part of the base uniform illustration.
  // SVG content is sharp at zoom and follows current name and callsign.
  const svg=svgEl('svg',{viewBox:'0 0 320 100',preserveAspectRatio:'none',
    'aria-hidden':'true',focusable:'false',class:'bpd-nameplate-vector'});
  const add=(tag,attrs)=>{const e=svgEl(tag,attrs);svg.append(e);return e};
  add('rect',{x:0,y:0,width:320,height:100,fill:'#0f1928'});
  add('rect',{x:0,y:0,width:80,height:100,fill:'#101a2b'});
  const stroke='#b9c6d4';
  for(let i=0;i<4;i++){
   const x=i*22-10;
   add('path',{d:'M'+x+' 100 L'+(x+43)+' 0',fill:'none',
    stroke,'stroke-width':3.5,opacity:'.94'});
  }
  // No drawn external border: it would produce a second nameplate.
  // Only the inner silver dividing thread belongs to this overlay.
  add('line',{x1:90,y1:49,x2:310,y2:49,stroke,
   'stroke-width':2.6});
  const name=details.name.length>27?details.name.slice(0,26)+'…':details.name;
  const nameSize=name.length>21?14:name.length>16?17:21;
  const first=add('text',{x:199,y:34,'text-anchor':'middle',
   'font-family':'system-ui,Segoe UI,Arial,sans-serif',
   'font-size':nameSize,'font-weight':750,
   fill:'#e2ebf5','letter-spacing':'.2'});
  first.textContent=name;
  const second=add('text',{x:199,y:76,'text-anchor':'middle',
   'font-family':'system-ui,Segoe UI,Arial,sans-serif',
   'font-size':16,'font-weight':750,
   fill:'#d9e3ed','letter-spacing':'.2'});
  second.textContent=details.bottom;
  plate.append(svg);
  return plate;
 }
 function makePortrait(person,large=false){
  if(person?.dept!=='politie')return null;
  const grade=gradeFor(person);
  const trim=trimFor(grade);
  const outer=document.createElement('span');
  outer.className='portrait bpd-police-formal'+(large?' large':'');
  outer.dataset.dept='politie';
  outer.dataset.trim=trim;
  outer.setAttribute('role','img');
  outer.setAttribute('aria-label','Belgisch geïnspireerd formeel politie-uniform'+(grade?' · '+grade.label:'')+' · sjabloon, geen persoonlijke foto');
  const image=document.createElement('img');
  image.src=BASE;
  image.alt='';
  image.loading=large?'eager':'lazy';
  image.decoding='async';
  image.draggable=false;
  outer.append(image);
  const shoulder=makeShoulderTrim(trim);
  if(shoulder)outer.append(shoulder);
  // BelgiumPD nameplate is shared by real staff cards and the fictitious
  // demo. Always derive both fields from the CURRENT public roster entry.
  const currentNameplate=makeNameplate(person);
  if(currentNameplate)outer.append(currentNameplate);
  // Keep identical geometry across all four shoulder variants.
  // Decorations and rank patches remain separate and untouched.
  void preparedUniform(trim).then(src=>{if(src&&image.src!==src)image.src=src});
  // Decorations are independent pieces; no large rectangular patch masks
  // the uniform or its grade again.
  const rack=window.BPDDecorations?.uniformRack(person.awards);
  if(rack?.ribbons)outer.append(rack.ribbons);
  // Replace the original 1-HCP chest insignia completely with a dynamic patch.
  const patch=document.createElement('span');
  patch.className='bpd-chest-insignia';
  patch.setAttribute('aria-hidden','true');
  useBelgianBadgeArtwork(patch,grade);
  outer.append(patch);
  if(rack?.medals)outer.append(rack.medals);
  return outer;
 }
 window.BPDPoliceUniform=Object.freeze({gradeFor,trimFor,makeBadge,makePortrait,makeNameplate,nameplateData,asset:BASE});
})();
