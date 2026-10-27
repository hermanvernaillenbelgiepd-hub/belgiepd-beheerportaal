/* BelgiumPD organogram, only visual. NEVER use grade display as authorization. */
(function(){
 'use strict';
 const BASE='/assets/organogram-police-formal.webp';
 const ranks=[
  {key:'1hcp',label:'Eerste hoofdcommissaris',abbr:'1-HCP',kind:'crown',count:3,line:true},
  {key:'1cp',label:'Eerste commissaris',abbr:'1-CP',kind:'crown',count:2,line:true},
  {key:'acp',label:'Aspirant-commissaris',abbr:'A-CP',kind:'crown',count:1},
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
 function makeBadge(person,large=false){
  const grade=gradeFor(person);
  if(!grade)return null;
  const badge=document.createElement('span');
  badge.className='bpd-grade-badge'+(large?' bpd-grade-badge-large':'');
  badge.setAttribute('role','img');
  badge.setAttribute('aria-label','BelgiumPD-graadteken '+grade.label);
  badge.title=grade.abbr+' · '+grade.label;
  badge.append(drawing(grade));
  return badge;
 }
 function makePortrait(person,large=false){
  if(person?.dept!=='politie')return null;
  const grade=gradeFor(person);
  const outer=document.createElement('span');
  outer.className='portrait bpd-police-formal'+(large?' large':'');
  outer.dataset.dept='politie';
  outer.setAttribute('role','img');
  outer.setAttribute('aria-label','Belgisch geïnspireerd formeel politie-uniform'+(grade?' · '+grade.label:'')+' · sjabloon, geen persoonlijke foto');
  const image=document.createElement('img');
  image.src=BASE;
  image.alt='';
  image.loading=large?'eager':'lazy';
  image.decoding='async';
  image.draggable=false;
  outer.append(image);
  // Replace the original 1-HCP chest insignia completely with a dynamic patch.
  const patch=document.createElement('span');
  patch.className='bpd-chest-insignia';
  patch.setAttribute('aria-hidden','true');
  patch.append(drawing(grade));
  outer.append(patch);
  return outer;
 }
 window.BPDPoliceUniform=Object.freeze({gradeFor,makeBadge,makePortrait,asset:BASE});
})();
