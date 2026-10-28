/* BelgiumPD organogram, only visual. NEVER use grade display as authorization. */
(function(){
 'use strict';
 const BASE='/assets/organogram-police-formal.webp';
 // Approved cord-free silver jacket from TEST, shared by middle, basic and agent cadres.
 const SILVER_BASE='/assets/bpd-uniform-zilver-zonder-koord-nieuw-20261028.webp';
 // The user-approved gold uniform from the TEST preview, stored as its own
 // image so that no canvas recolouring or shoulder masking touches the art.
 const GOLD_BASE='/assets/bpd-gold-officer-corps-approved-20261028.webp';
 // Self-contained colour-matched officer image; corps retains original gold.
 const OFFICER_NAVY_BASE='/assets/bpd-officieren-marine-match-20261028.svg';
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

 // Rank-specific presentation only: gold 900-930, cord-free silver 100-899.
 // Both base images are fixed photographic/graphic coats. Real name, call,
 // award and embroidered grade panels remain separate live display layers.
 // This visual lookup MUST NEVER grant any personnel permissions.
 function trimFor(grade){
  if(grade?.key==='1hcp'||grade?.key==='1cp')return 'gold-thick';
  if(grade?.key==='acp'||grade?.key==='cp')return 'gold-none';
  return 'silver-none';
 }
 // Old canvas-only shoulder masking has been retired for the approved gold
 // artwork. Cloth badges, name and awards remain separate dynamic layers.
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
 function makeGoldNameplate(person){
  const details=nameplateData(person);
  const plate=document.createElement('span');
  plate.className='bpd-personal-nameplate bpd-gold-nameplate';
  plate.dataset.call=details.call;
  plate.setAttribute('role','img');
  plate.setAttribute('aria-label','Naamplaat: '+details.name+', '+details.bottom);
  const first=document.createElement('span');
  first.className='bpd-gold-name';
  // Same dynamic uppercase embroidery as the user-approved TEST preview.
  first.textContent=details.name.toLocaleUpperCase('nl');
  const second=document.createElement('span');
  second.className='bpd-gold-call';
  second.textContent=details.bottom;
  plate.append(first,second);
  return plate;
 }
 function makeSilverWovenNameplate(person){
  // Same woven cloth as gold, with TEST-approved silver-coat positioning.
  const details=nameplateData(person);
  const plate=document.createElement('span');
  plate.className='bpd-personal-nameplate bpd-silver-woven-nameplate';
  plate.dataset.call=details.call;
  plate.setAttribute('role','img');
  plate.setAttribute('aria-label','Naamplaat: '+details.name+', '+details.bottom);
  const name=document.createElement('span');
  name.className='bpd-silver-woven-name';
  name.textContent=details.name.toLocaleUpperCase('nl');
  const call=document.createElement('span');
  call.className='bpd-silver-woven-call';
  call.textContent=details.bottom;
  plate.append(name,call);
  return plate;
 }
 function makePortrait(person,large=false){
  if(person?.dept!=='politie')return null;
  const grade=gradeFor(person);
  const trim=trimFor(grade);
  const isSilver=trim==='silver-none';
  const outer=document.createElement('span');
  outer.className='portrait bpd-police-formal'+(large?' large':'');
  outer.dataset.dept='politie';
  outer.dataset.trim=trim;
  outer.dataset.uniform=isSilver?'silver':'gold';
  outer.setAttribute('role','img');
  outer.setAttribute('aria-label','Belgisch geïnspireerd formeel politie-uniform'+(grade?' · '+grade.label:'')+' · sjabloon, geen persoonlijke foto');

  if(!isSilver){
   // Fit the approved 603:469 coat AS-IS; scale all dynamic panels together.
   // This stage is purely visual and never modifies personnel records.
   const stage=document.createElement('span');
   stage.className='bpd-gold-stage';
   const img=document.createElement('img');
   img.className='bpd-gold-coat';
   img.src=trim==='gold-none'?OFFICER_NAVY_BASE:GOLD_BASE;
   img.alt='';
   img.loading=large?'eager':'lazy';
   img.decoding='async';
   img.draggable=false;
   stage.append(img);
   stage.append(makeGoldNameplate(person));
   const rack=window.BPDDecorations?.uniformRack(person.awards);
   if(rack?.ribbons)stage.append(rack.ribbons);
   const chest=document.createElement('span');
   chest.className='bpd-chest-insignia bpd-gold-cloth-rank';
   chest.dataset.grade=grade?.key||'unknown';
   chest.setAttribute('aria-label','Geborduurde gradenplaat: '+(grade?.label||'Onbekend'));
   chest.setAttribute('role','img');
   const patchImage=document.createElement('img');
   patchImage.className='bpd-gold-grade-art';
   patchImage.src=GRADE_ASSETS[grade?.key]||GRADE_ASSETS.acp;
   patchImage.alt='';
   patchImage.loading='eager';
   patchImage.decoding='async';
   chest.append(patchImage);
   stage.append(chest);
   if(rack?.medals)stage.append(rack.medals);
   outer.append(stage);
   return outer;
  }

  // Approved silver TEST artwork and its proven name/grade coordinates.
  // All layers share ONE native 603:469 stage; no old pixel zoom is applied.
  const stage=document.createElement('span');
  stage.className='bpd-silver-stage';
  const image=document.createElement('img');
  image.className='bpd-silver-coat';
  image.src=SILVER_BASE;
  image.alt='';
  image.loading=large?'eager':'lazy';
  image.decoding='async';
  image.draggable=false;
  stage.append(image);
  stage.append(makeSilverWovenNameplate(person));
  const rack=window.BPDDecorations?.uniformRack(person.awards);
  if(rack?.ribbons)stage.append(rack.ribbons);
  const patch=document.createElement('span');
  patch.className='bpd-chest-insignia bpd-silver-cloth-rank';
  patch.dataset.grade=grade?.key||'unknown';
  patch.setAttribute('role','img');
  patch.setAttribute('aria-label','Geborduurde gradenplaat: '+(grade?.label||'Onbekend'));
  const patchImage=document.createElement('img');
  patchImage.className='bpd-silver-grade-art';
  patchImage.src=GRADE_ASSETS[grade?.key]||GRADE_ASSETS.ap;
  patchImage.alt='';
  patchImage.loading='eager';
  patchImage.decoding='async';
  patch.append(patchImage);
  stage.append(patch);
  if(rack?.medals)stage.append(rack.medals);
  outer.append(stage);
  return outer;
 }
 window.BPDPoliceUniform=Object.freeze({gradeFor,trimFor,makeBadge,makePortrait,makeNameplate,nameplateData,asset:GOLD_BASE,legacyAsset:BASE,silverAsset:SILVER_BASE});
})();
