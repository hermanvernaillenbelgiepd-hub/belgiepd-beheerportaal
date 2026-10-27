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
  // Vector artwork: do not upscale the old low-resolution 10-row raster.
  // This is a BelgiumPD drawing following the Belgian symbol conventions.
  const svg=svgEl('svg',{viewBox:'0 0 160 70',preserveAspectRatio:'xMidYMid meet',
    'aria-hidden':'true',focusable:'false',class:'bpd-grade-vector'});
  const add=(tag,attrs)=>svg.append(svgEl(tag,attrs));
  add('rect',{x:0,y:0,width:160,height:70,fill:'#0e1929'});
  add('rect',{x:127,y:0,width:33,height:70,fill:'#182b3f'});
  for(let k=0;k<5;k++){
   const x=131+k*7;
   add('path',{d:'M'+x+' 0 L'+(x-18)+' 70',stroke:'#9eb4c8',
    'stroke-width':'1.4',fill:'none',opacity:'.95'});
  }
  // Subtle sewn edge; every unit is resolution-independent.
  add('path',{d:'M1 1 H159 V69 H1 Z',stroke:'#8d9daa','stroke-width':.8,
   fill:'none',opacity:'.75'});
  if(!grade)return svg;
  const metal=grade.kind==='crown'?'#e9c56f':'#e0e8f3';
  const outline=grade.kind==='crown'?'#9f782a':'#91a5b9';
  const shadow=grade.kind==='crown'?'#b38b35':'#a8b6c8';
  function crown(cx,cy){
   // Crown silhouette with three raised points, jewels and a lined base.
   const left=cx-11,right=cx+11;
   add('path',{
    d:'M'+left+' '+(cy+6)+' L'+(left-1)+' '+(cy-6)+
      ' L'+(cx-6)+' '+(cy-1)+' L'+cx+' '+(cy-13)+
      ' L'+(cx+6)+' '+(cy-1)+' L'+(right+1)+' '+(cy-6)+
      ' L'+right+' '+(cy+6)+' Q'+cx+' '+(cy+10)+' '+left+' '+(cy+6)+' Z',
    fill:metal,stroke:outline,'stroke-width':1,'stroke-linejoin':'round'});
   add('path',{d:'M'+(left+2)+' '+(cy+2)+' Q'+cx+' '+(cy+6)+' '+(right-2)+' '+(cy+2),
     stroke:shadow,'stroke-width':1.2,fill:'none'});
   for(const bx of [cx-9,cx,cx+9])add('circle',{
    cx:bx,cy:cy-7,r:1.35,fill:'#f8f5e5',stroke:outline,'stroke-width':.4});
   add('rect',{x:left,y:cy+7,width:22,height:4,rx:.8,fill:metal,stroke:outline,'stroke-width':.65});
   add('rect',{x:left+2,y:cy+8.2,width:18,height:.85,fill:shadow});
  }
  function star(cx,cy){
   const pts=[];
   for(let k=0;k<10;k++){
    const a=k*Math.PI/5-Math.PI/2,r=k%2?6.7:13;
    pts.push((cx+Math.cos(a)*r).toFixed(2)+','+(cy+Math.sin(a)*r).toFixed(2));
   }
   add('polygon',{points:pts.join(' '),fill:metal,stroke:outline,
    'stroke-width':1,'stroke-linejoin':'round'});
   add('circle',{cx,cy,r:2.1,fill:'#fff',opacity:'.75'});
  }
  if(grade.kind==='bars'){
   for(const x of [54,82])add('rect',{x,y:15,width:7,height:39,rx:.8,
    fill:metal,stroke:outline,'stroke-width':.6});
  }else{
   const positions=grade.count===1?[63]:grade.count===2?[44,82]:[31,63,95];
   for(const cx of positions){
    if(grade.kind==='star')star(cx,grade.line?27:34);
    else crown(cx,grade.line?27:33);
   }
  }
  // "Eerste" is always represented by a line UNDER the badges.
  // In particular: 1-INP, 1-HINP, 1-CP and 1-HCP.
  if(grade.line){
   add('line',{x1:grade.count===3?17:25,y1:58,
    x2:grade.count===3?111:103,y2:58,
    stroke:metal,'stroke-width':3.1,'stroke-linecap':'square'});
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
  // SVG keeps the embroidered silver text and diagonal seams crisp even
  // when the browser zooms in. One single patch: no nested dark name box.
  const svg=svgEl('svg',{viewBox:'0 0 320 100',preserveAspectRatio:'none',
    'aria-hidden':'true',focusable:'false',class:'bpd-nameplate-vector'});
  const add=(tag,attrs)=>{const e=svgEl(tag,attrs);svg.append(e);return e};
  add('rect',{x:0,y:0,width:320,height:100,fill:'#0d1522'});
  add('rect',{x:0,y:0,width:80,height:100,fill:'#101b2b'});
  const stroke='#b9c6d4';
  for(let i=0;i<4;i++){
   const x=i*20-17;
   add('path',{d:'M'+x+' 100 L'+(x+37)+' 0',fill:'none',
    stroke,'stroke-width':3.5,opacity:'.94'});
  }
  // Threading and seam borders are deliberately silver, never ochre.
  add('rect',{x:1.2,y:1.2,width:317.6,height:97.6,fill:'none',
   stroke:'#b0bdca','stroke-width':2});
  add('line',{x1:94,y1:50,x2:305,y2:50,stroke,
   'stroke-width':2.6});
  const name=details.name.length>27?details.name.slice(0,26)+'…':details.name;
  const nameSize=name.length>21?14:name.length>16?17:21;
  const first=add('text',{x:199,y:37,'text-anchor':'middle',
   'font-family':'system-ui,Segoe UI,Arial,sans-serif',
   'font-size':nameSize,'font-weight':750,
   fill:'#e2ebf5','letter-spacing':'.2'});
  first.textContent=name;
  const second=add('text',{x:199,y:77,'text-anchor':'middle',
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
