/* BelgiumPD organogram, only visual. NEVER use grade display as authorization. */
(function(){
 'use strict';
 const BASE='/assets/organogram-police-formal.webp';
 // Approved cord-free silver jacket from TEST, shared by middle, basic and agent cadres.
 const SILVER_BASE='/assets/bpd-uniform-zilver-zonder-medaille-rood-20261029.svg';
 // A single source jacket for corps leadership AND the officer cadre.
 // Native pixel recolouring is done once, without SVG/CSS image filters;
 // the approved golden trim remains unaffected. No rank data is changed.
 const GOLD_BASE='/assets/bpd-gold-officer-corps-zonder-medaille-rood-20261029.svg';
 // Both approved source coats have small baked-in burgundy pixels at the
 // shirt/tie junction. The SVG overlays remove the medal and most of the red
 // ribbon, but leave red antialiased wedges on certain screen sizes.
 // Recolour only visibly red pixels in the central *base artwork*;
 // do not touch the separately rendered rank, name, specialty or award layers.
 function cleanBakedInNeckRed(pixels,width,height){
  const data=pixels.data;
  const x0=Math.floor(width*.33),x1=Math.ceil(width*.67);
  const y0=Math.floor(height*.045),y1=Math.ceil(height*.56);
  for(let y=y0;y<y1;y++){
   for(let x=x0;x<x1;x++){
    const i=(y*width+x)*4;
    const r=data[i],g=data[i+1],b=data[i+2];
    if(data[i+3]===0||r<60)continue;
    // Red fabric and its pink anti-aliased edges, not white shirt or blue tie.
    const chroma=r-Math.max(g,b);
    if(chroma<9||r<g*1.055||r<b*1.055)continue;
    const amount=Math.min(1,Math.max(0,(chroma-6)/13));
    // Above the upper lapel: white shirt. Beneath it: uniform navy.
    const shirt=y<height*.30;
    const target=shirt?[239,243,248]:[13,36,62];
    data[i]=Math.round(r*(1-amount)+target[0]*amount);
    data[i+1]=Math.round(g*(1-amount)+target[1]*amount);
    data[i+2]=Math.round(b*(1-amount)+target[2]*amount);
   }
  }
 }
 // Silver cadres use exactly the same cleanup as the officer uniform.
 let matchedSilverSource=null,matchedSilverPromise=null;
 function matchedSilverNavy(){
  if(matchedSilverSource)return Promise.resolve(matchedSilverSource);
  if(matchedSilverPromise)return matchedSilverPromise;
  matchedSilverPromise=new Promise(resolve=>{
   const done=src=>{matchedSilverSource=src;resolve(src);};
   try{
    const raw=new Image();
    raw.onerror=()=>done(SILVER_BASE);
    raw.onload=()=>{
     try{
      const canvas=document.createElement('canvas');
      canvas.width=raw.naturalWidth;canvas.height=raw.naturalHeight;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(!ctx)throw Error('No canvas 2D context');
      ctx.drawImage(raw,0,0);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
      cleanBakedInNeckRed(pixels,canvas.width,canvas.height);
      ctx.putImageData(pixels,0,0);
      done(canvas.toDataURL('image/webp',.93));
     }catch(_err){done(SILVER_BASE)}
    };
    raw.src=SILVER_BASE;
   }catch(_err){done(SILVER_BASE)}
  });
  return matchedSilverPromise;
 }
 function setMatchedSilverCoat(img){
  img.src=SILVER_BASE;
  if(typeof Image!=='function')return;
  img.style.opacity='0';
  matchedSilverNavy().then(src=>{
   img.onload=()=>{img.style.opacity='1'};
   img.onerror=()=>{img.onload=null;img.src=SILVER_BASE;img.style.opacity='1'};
   img.src=src;
   if(img.complete&&img.naturalWidth>0)img.style.opacity='1';
  }).catch(()=>{img.src=SILVER_BASE;img.style.opacity='1'});
 }
 let matchedGoldSource=null, matchedGoldPromise=null;
 function matchedGoldNavy(){
  if(matchedGoldSource)return Promise.resolve(matchedGoldSource);
  if(matchedGoldPromise)return matchedGoldPromise;
  matchedGoldPromise=new Promise(resolve=>{
   const done=src=>{matchedGoldSource=src;resolve(src);};
   try{
    const raw=new Image();
    raw.onerror=()=>done(GOLD_BASE);
    raw.onload=()=>{
     try{
      const canvas=document.createElement('canvas');
      canvas.width=raw.naturalWidth;canvas.height=raw.naturalHeight;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(!ctx)throw Error('No canvas 2D context');
      ctx.drawImage(raw,0,0);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
      const data=pixels.data;
      // The two original blue samples are RGB(28,56,96) and (1,33,74).
      // Restrict adjustment to blue-dominant cloth pixels: white/red/gold
      // collar, tie, shoulder details and braids stay original.
      for(let i=0;i<data.length;i+=4){
       const r=data[i],g=data[i+1],b=data[i+2];
       if(data[i+3]===0)continue;
       const blue=Math.max(0,Math.min(1,(b-r-18)/20));
       const redLimit=Math.max(0,Math.min(1,(160-r)/40));
       const greenLimit=Math.max(0,Math.min(1,(180-g)/40));
       const strength=blue*redLimit*greenLimit;
       if(strength===0)continue;
       data[i]=Math.max(0,r-27*strength);
       data[i+1]=Math.max(0,g-23*strength);
       data[i+2]=Math.max(0,b-22*strength);
      }
      cleanBakedInNeckRed(pixels,canvas.width,canvas.height);
      ctx.putImageData(pixels,0,0);
      done(canvas.toDataURL('image/webp',.9));
     }catch(_err){done(GOLD_BASE)}
    };
    raw.src=GOLD_BASE;
   }catch(_err){done(GOLD_BASE)}
  });
  return matchedGoldPromise;
 }
 function setMatchedGoldCoat(img){
  // The static URL is a safe fallback for non-browser renderers and tests.
  img.src=GOLD_BASE;
  if(typeof Image!=='function')return;
  img.style.opacity='0';
  matchedGoldNavy().then(src=>{
   img.onload=()=>{img.style.opacity='1'};
   img.onerror=()=>{img.onload=null;img.src=GOLD_BASE;img.style.opacity='1'};
   img.src=src;
   if(img.complete&&img.naturalWidth>0)img.style.opacity='1';
  }).catch(()=>{img.src=GOLD_BASE;img.style.opacity='1'});
 }
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
 let uniformArtworkOverrides=new Map(),uniformPlacementOverrides=new Map();
 let uniformNameplateOverrides=new Map(),uniformCoatOverrides=new Map();
 function setUniformManagementData(items,layouts,nameplates=[],coats=[]){
  const uniformImages=new Map(),uniformCoords=new Map();
  for(const row of Array.isArray(items)?items:[]){
   const key=String(row?.key||''),url=String(row?.imageUrl||'');
   if(!/^uniform_politie_(silver|gold)$/.test(key)||
    !/^\/api\/role-artwork\/file\/uniform_politie_(silver|gold)\?v=[a-zA-Z0-9-]+$/.test(url))
    continue;
   uniformImages.set(key.slice('uniform_politie_'.length),url);
  }
  for(const entry of Array.isArray(layouts)?layouts:[]){
   if(!/^politie_(silver|gold)$/.test(entry?.key||''))continue;
   if(!['left','top','width','height'].every(k=>typeof entry[k]==='number'&&
    entry[k]>=0&&entry[k]<=100))continue;
   if(entry.left+entry.width>100||entry.top+entry.height>100)continue;
   uniformCoords.set(entry.variant,entry);
  }
  const nameCoords=new Map();
  for(const entry of Array.isArray(nameplates)?nameplates:[]){
   if(!/^politie_(silver|gold)$/.test(String(entry?.key||''))||entry.configured!==true)continue;
   if(!['left','top','width','height'].every(k=>typeof entry[k]==='number'&&
    Number.isFinite(entry[k])&&entry[k]>=0&&entry[k]<=100))continue;
   if(entry.left+entry.width>100||entry.top+entry.height>100)continue;
   nameCoords.set(entry.variant,entry);
  }
  uniformArtworkOverrides=uniformImages;uniformPlacementOverrides=uniformCoords;
  uniformNameplateOverrides=nameCoords;
  const coatCoords=new Map();
  for(const row of Array.isArray(coats)?coats:[]){
   if(!/^politie_(gold|silver)$/.test(String(row?.key||''))||row.configured!==true)continue;
   if(![row.offsetX,row.offsetY,row.zoom].every(Number.isFinite)||
    Math.abs(row.offsetX)>50||Math.abs(row.offsetY)>50||row.zoom<50||row.zoom>200)continue;
   coatCoords.set(row.variant,row);
  }
  uniformCoatOverrides=coatCoords;
 }
 function applyUniformInsigniaPlacement(node,variant){
  const layout=uniformPlacementOverrides.get(variant);
  if(!layout)return;
  node.style.left=layout.left+'%';
  node.style.top=layout.top+'%';
  node.style.width=layout.width+'%';
  node.style.height=layout.height+'%';
 }
 function adaptAssignedUniform(stage,img){
  const apply=()=>{
   if(!img.naturalWidth||!img.naturalHeight)return;
   const ratio=img.naturalWidth/img.naturalHeight;
   stage.style.aspectRatio=img.naturalWidth+'/'+img.naturalHeight;
   stage.style.width=Math.min(120,Math.max(30,ratio*(226/198)*98))+'%';
   stage.style.height='auto';
   img.style.objectFit='contain';
  };
  img.addEventListener('load',apply,{once:true});
  if(img.complete&&img.naturalWidth)apply();
 }
 function applyUniformCanvas(stage,img,variant){
  const cfg=uniformCoatOverrides.get(variant);
  if(!cfg||!Number.isInteger(cfg.canvasWidth)||!Number.isInteger(cfg.canvasHeight)||
   cfg.canvasWidth<160||cfg.canvasHeight<160||cfg.canvasWidth>4096||cfg.canvasHeight>4096)return;
  const ratio=cfg.canvasWidth/cfg.canvasHeight;
  // Detail portrait (198×226): fit a vertical coat inside the available
  // portrait without cropping it; previous 603×469 defaults remain unchanged.
  const width=Math.min(120,Math.max(30,ratio*(226/198)*98));
  stage.style.aspectRatio=cfg.canvasWidth+'/'+cfg.canvasHeight;
  stage.style.width=width+'%';
  stage.style.height='auto';
  img.style.objectFit=cfg.keepAspectRatio===false?'fill':'contain';
 }
 function applyUniformCoatPlacement(node,variant,stage=null){
  const placement=uniformCoatOverrides.get(variant);
  if(!placement)return;
  const scale=placement.zoom/100;
  // Always transform the full scene, including nameplate, rank and awards.
  // Old 603:469 fallback uniforms previously zoomed only the jacket image,
  // causing the decorations to remain tiny inside the stitched chest slots.
  if(stage){
   stage.style.transform='translate(-50%,-50%) translate('+
    placement.offsetX+'%,'+placement.offsetY+'%) scale('+scale+')';
   stage.style.transformOrigin='center';
   node.style.transform='';
  }else{
   node.style.transform='translate('+placement.offsetX+'%,'+placement.offsetY+'%) scale('+scale+')';
   node.style.transformOrigin='center';
  }
 }
 function factoryChestPlacement(pos,kind){
  if(!pos)return true;
  const close=(a,b)=>Math.abs(Number(a)-b)<0.65;
  // Respect intentional manual positions, but repair the legacy defaults.
  return kind==='name'?
   (close(pos.left,18)&&close(pos.top,56)&&close(pos.width,27)&&close(pos.height,11))||
   (close(pos.left,21.2)&&close(pos.top,60.2)&&close(pos.width,20.1)):
   (close(pos.left,57)&&close(pos.top,56)&&close(pos.width,25)&&close(pos.height,10))||
   (close(pos.left,56.2)&&close(pos.top,58.9)&&close(pos.width,19.5));
 }
 function snapAssignedPortraitPlates(image,person,nameplate,rankplate){
  const apply=()=>{
   if(!image.naturalWidth||!image.naturalHeight||
      image.naturalHeight/image.naturalWidth<1.04)return;
   const layout=window.BPDUniformAssignments?.forPerson?.(person)?.visualLayout;
   // Chest slots of the new portrait coat; percentages refer to the
   // actual image, not to the retired 603:469 landscape backdrop.
   const slots=[
    [nameplate,'name',{left:27.2,top:34.7,width:15.8,height:7.9}],
    [rankplate,'rank',{left:55.3,top:34.7,width:15.6,height:7.9}]
   ];
   for(const [node,kind,slot] of slots){
    if(layout?.[kind]?.visible===false||
       !factoryChestPlacement(layout?.[kind],kind))continue;
    for(const axis of ['left','top','width','height'])
     node.style[axis]=slot[axis]+'%';
   }
  };
  image.addEventListener('load',apply,{once:true});
  if(image.complete&&image.naturalWidth)apply();
 }
 function nameplateTextData(person,variant){
  const base=nameplateData(person),cfg=uniformNameplateOverrides.get(variant);
  return {...base,bottom:(cfg?.prefix||'BELGIEPD')+' - '+base.call,
   nameScale:cfg?.nameScale??100,callScale:cfg?.callScale??100};
 }
 function applyUniformNameplatePlacement(node,variant){
  const layout=uniformNameplateOverrides.get(variant);
  if(!layout)return;
  node.style.left=layout.left+'%';
  node.style.top=layout.top+'%';
  node.style.width=layout.width+'%';
  node.style.height=layout.height+'%';
 }
 let gradeArtworkOverrides=new Map();
 function setGradeArtworkManifest(items){
  const next=new Map();
  for(const x of Array.isArray(items)?items:[]){
   const key=String(x?.key||''),url=String(x?.imageUrl||'');
   const m=/^rank_politie_([a-z0-9][a-z0-9_]{0,39})$/.exec(key);
   if(!m||!/^\/api\/role-artwork\/file\/rank_politie_[a-z0-9][a-z0-9_]{0,39}\?v=[A-Za-z0-9-]+$/.test(url))
    continue;
   next.set(m[1],url);
  }
  gradeArtworkOverrides=next;
 }
 const gradeArt=grade=>gradeArtworkOverrides.get(grade?.key)||GRADE_ASSETS[grade?.key]||null;
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
  const source=gradeArt(grade);
  if(!source)return svg;
  const bounds=GRADE_ALPHA_BOUNDS[grade.key];
  if(!bounds){svg.append(svgEl('image',{href:source,x:0,y:0,width:512,height:160,preserveAspectRatio:'none'}));return svg;}
  if(gradeArtworkOverrides.has(grade?.key)){
   svg.append(svgEl('image',{href:source,x:0,y:0,width:512,height:160,preserveAspectRatio:'none'}));return svg;
  }
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
 // Both base images show the standard navy tie without fixed red neck ribbon or medal. Real name, call,
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
  const details=nameplateTextData(person,'gold');
  const plate=document.createElement('span');
  plate.className='bpd-personal-nameplate bpd-gold-nameplate';
  plate.dataset.call=details.call;
  plate.setAttribute('role','img');
  plate.setAttribute('aria-label','Naamplaat: '+details.name+', '+details.bottom);
  const first=document.createElement('span');
  first.className='bpd-gold-name';
  // Same dynamic uppercase embroidery as the user-approved TEST preview.
  first.textContent=details.name.toLocaleUpperCase('nl');
  first.style.transform='scale('+(details.nameScale/100)+')';
  const second=document.createElement('span');
  second.className='bpd-gold-call';
  second.textContent=details.bottom;
  second.style.transform='scale('+(details.callScale/100)+')';
  plate.append(first,second);
  return plate;
 }
 function makeSilverWovenNameplate(person){
  // Same woven cloth as gold, with TEST-approved silver-coat positioning.
  const details=nameplateTextData(person,'silver');
  const plate=document.createElement('span');
  plate.className='bpd-personal-nameplate bpd-silver-woven-nameplate';
  plate.dataset.call=details.call;
  plate.setAttribute('role','img');
  plate.setAttribute('aria-label','Naamplaat: '+details.name+', '+details.bottom);
  const name=document.createElement('span');
  name.className='bpd-silver-woven-name';
  name.textContent=details.name.toLocaleUpperCase('nl');
  name.style.transform='scale('+(details.nameScale/100)+')';
  const call=document.createElement('span');
  call.className='bpd-silver-woven-call';
  call.textContent=details.bottom;
  call.style.transform='scale('+(details.callScale/100)+')';
  plate.append(name,call);
  return plate;
 }
 function applyCompositePlace(node,person,kind){
  const data=window.BPDUniformAssignments?.forPerson?.(person)?.visualLayout?.[kind];
  if(!node||!data)return;
  if(data.visible===false){node.style.display='none';return;}
  for(const prop of ['left','top','width','height'])
   if(typeof data[prop]==='number'&&data[prop]>=0&&data[prop]<=100)
    node.style[prop]=data[prop]+'%';
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
  if(window.BPDUniformAssignments?.forPerson?.(person)?.uniformUrl)outer.classList.add('bpd-assigned-coat');
  outer.setAttribute('role','img');
  outer.setAttribute('aria-label','Belgisch geïnspireerd formeel politie-uniform'+(grade?' · '+grade.label:'')+' · sjabloon, geen persoonlijke foto');

  if(!isSilver){
   // Fit the approved 603:469 coat AS-IS; scale all dynamic panels together.
   // This stage is purely visual and never modifies personnel records.
   const stage=document.createElement('span');
   stage.className='bpd-gold-stage';
   const img=document.createElement('img');
   img.className='bpd-gold-coat';
   const individualGold=window.BPDUniformAssignments?.forPerson?.(person)?.uniformUrl;
   if(individualGold)img.src=individualGold;
   else if(uniformArtworkOverrides.has('gold'))img.src=uniformArtworkOverrides.get('gold');
   else setMatchedGoldCoat(img);
   img.alt='';
   img.loading=large?'eager':'lazy';
   img.decoding='async';
   img.draggable=false;
   applyUniformCanvas(stage,img,'gold');
   if(individualGold)adaptAssignedUniform(stage,img);
   applyUniformCoatPlacement(img,'gold',stage);
   stage.append(img);
   const plate=makeGoldNameplate(person);
   applyUniformNameplatePlacement(plate,'gold');
   applyCompositePlace(plate,person,'name');
   stage.append(plate);
   const rack=window.BPDDecorations?.uniformRack(person.awards);
   if(rack?.ribbons){applyCompositePlace(rack.ribbons,person,'ribbons');stage.append(rack.ribbons);}
   const chest=document.createElement('span');
   chest.className='bpd-chest-insignia bpd-gold-cloth-rank';
   chest.dataset.grade=grade?.key||'unknown';
   chest.setAttribute('aria-label','Geborduurde gradenplaat: '+(grade?.label||'Onbekend'));
   chest.setAttribute('role','img');
   const patchImage=document.createElement('img');
   patchImage.className='bpd-gold-grade-art';
   patchImage.src=window.BPDUniformAssignments?.forPerson?.(person)?.rankUrl||gradeArtworkOverrides.get(window.BPDUniformAssignments?.forPerson?.(person)?.callSeries)||gradeArt(grade)||GRADE_ASSETS.acp;
   patchImage.alt='';
   patchImage.loading='eager';
   patchImage.decoding='async';
   chest.append(patchImage);
   applyUniformInsigniaPlacement(chest,'gold');
   applyCompositePlace(chest,person,'rank');
   stage.append(chest);
   if(rack?.medals){applyCompositePlace(rack.medals,person,'medals');stage.append(rack.medals);}
   if(individualGold)snapAssignedPortraitPlates(img,person,plate,chest);
   window.BPDVisualAssets?.appendTo?.(stage,person,'gold');
   outer.append(stage);
   return outer;
  }

  // Approved silver TEST artwork and its proven name/grade coordinates.
  // All layers share ONE native 603:469 stage; no old pixel zoom is applied.
  const stage=document.createElement('span');
  stage.className='bpd-silver-stage';
  const image=document.createElement('img');
  image.className='bpd-silver-coat';
  const individualSilver=window.BPDUniformAssignments?.forPerson?.(person)?.uniformUrl;
  if(individualSilver)image.src=individualSilver;
  else if(uniformArtworkOverrides.has('silver'))image.src=uniformArtworkOverrides.get('silver');
  else setMatchedSilverCoat(image);
  image.alt='';
  image.loading=large?'eager':'lazy';
  image.decoding='async';
  image.draggable=false;
  applyUniformCanvas(stage,image,'silver');
  if(individualSilver)adaptAssignedUniform(stage,image);
  applyUniformCoatPlacement(image,'silver',stage);
  stage.append(image);
  const nameplate=makeSilverWovenNameplate(person);
  applyUniformNameplatePlacement(nameplate,'silver');
   applyCompositePlace(nameplate,person,'name');
  stage.append(nameplate);
  const rack=window.BPDDecorations?.uniformRack(person.awards);
  if(rack?.ribbons){applyCompositePlace(rack.ribbons,person,'ribbons');stage.append(rack.ribbons);}
  const patch=document.createElement('span');
  patch.className='bpd-chest-insignia bpd-silver-cloth-rank';
  patch.dataset.grade=grade?.key||'unknown';
  patch.setAttribute('role','img');
  patch.setAttribute('aria-label','Geborduurde gradenplaat: '+(grade?.label||'Onbekend'));
  const patchImage=document.createElement('img');
  patchImage.className='bpd-silver-grade-art';
  patchImage.src=window.BPDUniformAssignments?.forPerson?.(person)?.rankUrl||gradeArtworkOverrides.get(window.BPDUniformAssignments?.forPerson?.(person)?.callSeries)||gradeArt(grade)||GRADE_ASSETS.ap;
  patchImage.alt='';
  patchImage.loading='eager';
  patchImage.decoding='async';
  patch.append(patchImage);
  applyUniformInsigniaPlacement(patch,'silver');
   applyCompositePlace(patch,person,'rank');
  stage.append(patch);
  if(rack?.medals){applyCompositePlace(rack.medals,person,'medals');stage.append(rack.medals);}
  if(individualSilver)snapAssignedPortraitPlates(image,person,nameplate,patch);
  window.BPDVisualAssets?.appendTo?.(stage,person,'silver');
  outer.append(stage);
  return outer;
 }
 window.BPDPoliceUniform=Object.freeze({gradeFor,trimFor,makeBadge,makePortrait,makeNameplate,nameplateData,setGradeArtworkManifest,setUniformManagementData,asset:GOLD_BASE,legacyAsset:BASE,silverAsset:SILVER_BASE});
})();
