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
 function drawing(grade){
  // Belgian police rank graphics: official-style stripe geometry with crown
  // and star silhouettes CUT OUT OF THE USER-SUPPLIED REFERENCE IMAGES.
  // One transparent WebP sprite (gold crown, silver crown, silver star).
  // The SVG itself controls spacing, display-grade and first-rank underline.
  const svg=svgEl('svg',{viewBox:'0 0 160 70',preserveAspectRatio:'xMidYMid meet',
   'aria-hidden':'true',focusable:'false',class:'bpd-grade-vector'});
  const add=(tag,attrs,parent=svg)=>{const el=svgEl(tag,attrs);parent.append(el);return el};
  add('rect',{x:0,y:0,width:160,height:70,fill:'#202224'});
  add('path',{d:'M127 0 H160 V70 H109 Z',fill:'#212527'});
  // The diagonal lines belong on the RIGHT, as in the supplied Belgian
  // police rank photos. They are SILVER for every rank.
  for(let k=0;k<7;k++){
   const x=129+k*6.4;
   add('path',{d:'M'+x+' 0 L'+(x-20)+' 70',stroke:'#a4adb3',
    'stroke-width':1.15,fill:'none',opacity:'.85'});
  }
  if(!grade)return svg;
  if(grade.kind==='bars'){
   // AP: exactly two silver vertical bars.
   for(const x of [56,86]){
    add('rect',{x,y:16,width:6.6,height:40,rx:.45,
      fill:'#cbd0d6',stroke:'#9da7b1','stroke-width':.6});
    add('rect',{x:x+.7,y:17,width:1.6,height:37,fill:'#f2f4f6',opacity:'.63'});
   }
  }else{
   const row=grade.kind==='crown'?0:grade.kind==='silverCrown'?1:2;
   const positions=grade.count===1?[64]:grade.count===2?[43,85]:[23,63,103];
   for(const x of positions){
    // Native SVG viewport crops ONE row from the three-row WebP sprite.
    // This preserves the uploaded crown/star texture, unlike synthetic
    // simplified crown polygons, while scaling cleanly to staff cards.
    const viewport=add('svg',{x:x-19,y:grade.line?12:16,width:38,height:34,
      viewBox:'0 0 64 45',preserveAspectRatio:'xMidYMid meet',overflow:'hidden'});
    add('image',{href:'/assets/bpd-grade-symbols-from-user-20261027.webp',
      x:0,y:-row*45,width:64,height:135,preserveAspectRatio:'none'},viewport);
   }
  }
  // Underline ONLY when the grade itself is "Eerste":
  // 500=1-INP; 800=1-HINP; 910=1-CP; 900=1-HCP.
  if(grade.line){
   const x1=grade.count===3?10:23,x2=grade.count===3?117:104;
   add('line',{x1,y1:59,x2,y2:59,
    stroke:grade.kind==='crown'?'#d6ad4a':'#c8ced4',
    'stroke-width':2.8,'stroke-linecap':'square'});
  }
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
     // Gouden schouderstukken van het basismodel uitsluitend voor 1-CP/1-HCP.
     // Officieren A-CP/CP: dunne gouden omranding.
     // Middenkader: uitsluitend een haarfijne zilveren bovenbies.
     // Basis- en agentenkader: geen schouderband of omranding.
     if(trim!=='gold-thick'){
      const scaleX=w/240,scaleY=h/255;
      const polygons=[
       [[0,40],[22,35],[29,57],[5,64]],
       [[217,35],[240,40],[235,64],[210,57]]
      ];
      ctx.fillStyle='#1d3659';
      ctx.strokeStyle=trim==='gold-thin'?'#ebc66e':'#d0deeb';
      ctx.lineWidth=Math.max(.65,scaleX*(trim==='gold-thin'?1.15:.65));
      for(const pts of polygons){
       ctx.beginPath();
       pts.forEach(([x,y],i)=>i?ctx.lineTo(x*scaleX,y*scaleY):
         ctx.moveTo(x*scaleX,y*scaleY));
       ctx.closePath();ctx.fill();
       if(trim==='gold-thin')ctx.stroke();
       if(trim==='silver-thin'){
        // Only the upper seam: NO filled silver epaulette or outlined square.
        ctx.beginPath();
        ctx.moveTo(pts[0][0]*scaleX,pts[0][1]*scaleY);
        ctx.lineTo(pts[1][0]*scaleX,pts[1][1]*scaleY);
        ctx.stroke();
       }
      }
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
