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
  const svg=svgEl('svg',{viewBox:'0 0 128 58','aria-hidden':'true',focusable:'false'});
  const add=(tag,attrs)=>svg.append(svgEl(tag,attrs));
  add('rect',{width:128,height:58,fill:'#101826'});
  add('rect',{x:95,y:0,width:33,height:58,fill:'#152b43'});
  for(let i=0;i<4;i++)add('path',{d:'M'+(104+i*7)+' 0 L'+(91+i*7)+' 58',stroke:'#ce9b34','stroke-width':2,fill:'none'});
  if(!grade)return svg;
  const metal=grade.kind==='crown'?'#efca72':'#e5ebf4';
  if(grade.kind==='bars'){
   for(const x of [35,65])add('rect',{x,y:11,width:6,height:35,rx:1,fill:metal});
  }else{
   const xs=grade.count===1?[47]:grade.count===2?[31,66]:[19,47,75];
   for(const x of xs){
    if(grade.kind==='star'){
     const points=[];
     for(let k=0;k<10;k++){const a=k*Math.PI/5-Math.PI/2,r=k%2?5:11;
      points.push((x+Math.cos(a)*r).toFixed(1)+','+((grade.line?22:30)+Math.sin(a)*r).toFixed(1));}
     add('polygon',{points:points.join(' '),fill:metal,stroke:'#fff','stroke-width':.5});
    }else{
     const y=grade.line?24:30;
     const d='M'+(x-11)+' '+(y+5)+' L'+(x-11)+' '+(y-6)+' L'+(x-5)+' '+(y-1)+' L'+x+' '+(y-12)+' L'+(x+5)+' '+(y-1)+' L'+(x+11)+' '+(y-6)+' L'+(x+11)+' '+(y+5)+' Z';
     add('path',{d,fill:metal,stroke:'#fffa','stroke-width':.6});
     add('rect',{x:x-11,y:y+5,width:22,height:5,rx:1,fill:metal});
    }
   }
   if(grade.line)add('rect',{x:grade.count===3?5:15,y:47,width:grade.count===3?85:66,height:3,rx:1,fill:metal});
  }
  return svg;
 }
 const spriteOrder=['ap','ainp','inp','1inp','ahinp','hinp','1hinp','acp','1cp','1hcp'];
 function useBelgianBadgeArtwork(container,grade){
  if(!grade){container.append(drawing(grade));return}
  const index=spriteOrder.indexOf(grade.key);
  if(index<0){container.append(drawing(grade));return}
  container.classList.add('bpd-photo-rank');
  container.style.setProperty('--bpd-grade-y',(100*index/9).toFixed(3)+'%');
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
 window.BPDPoliceUniform=Object.freeze({gradeFor,trimFor,makeBadge,makePortrait,asset:BASE});
})();
