import {chartStatuses,chartAbsence,chartHoursSources,chartHoursRank} from '/activity-charts-model.js';
const $=id=>document.getElementById(id);
const colors={active:'#27976e',half:'#e2a044',inactive:'#d85c65',
 leave:'#4c90d5',checking:'#9074d1',other:'#8394a7',
 low:'#27976e',review:'#bc5d73',unknown:'#8394a7'};
const text=(parent,tag,value,cls)=>{
 const e=document.createElement(tag);e.textContent=String(value);
 if(cls)e.className=cls;parent.append(e);return e;
};
const pretty=n=>n.toLocaleString('nl-BE',{maximumFractionDigits:1});
let input={people:[],sources:{}},wired=false;
function chartRing(target,sections){
 target.replaceChildren();
 const total=sections.reduce((n,x)=>n+x.value,0);
 const layout=text(target,'div','','activity-graph-ring-layout');
 const holder=text(layout,'div','','activity-graph-ring-svg');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 180 180');svg.setAttribute('role','img');
 svg.setAttribute('aria-label',sections.map(x=>x.label+' '+x.value).join(', '));
 const length=2*Math.PI*63;let offset=0;
 function ring(color,dash,distance){
  const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
  const attrs={cx:90,cy:90,r:63,fill:'none',stroke:color,'stroke-width':23,
   'stroke-dasharray':dash+' '+length,'stroke-dashoffset':-distance,
   transform:'rotate(-90 90 90)'};
  for(const [k,v] of Object.entries(attrs))circle.setAttribute(k,String(v));
  svg.append(circle);
 }
 ring('#829ab23b',length,0);
 for(const item of sections){
  if(!item.value||!total)continue;
  const portion=length*item.value/total;ring(colors[item.key]||colors.other,portion,offset);
  offset+=portion;
 }
 for(const [value,y,size] of [[total,91,27],['dossiers',111,11]]){
  const label=document.createElementNS('http://www.w3.org/2000/svg','text');
  label.setAttribute('x','90');label.setAttribute('y',String(y));
  label.setAttribute('text-anchor','middle');label.setAttribute('font-size',String(size));
  label.setAttribute('fill','currentColor');label.setAttribute('font-weight',size===27?'800':'500');
  label.textContent=value;svg.append(label);
 }
 holder.append(svg);
 const legend=text(layout,'ul','','activity-graph-legend');
 for(const part of sections){
  const li=text(legend,'li','');
  const dot=text(li,'span','','activity-graph-dot');dot.style.background=colors[part.key]||colors.other;
  text(li,'span',part.label);text(li,'strong',String(part.value));
 }
}
function chartBars(target,items,max,suffix=''){
 target.replaceChildren();
 if(!items.length){text(target,'p','Geen beschikbare metingen.','activity-graph-note');return}
 const highest=Number.isFinite(max)?max:Math.max(0,...items.map(x=>x.value));
 for(const x of items){
  const row=text(target,'div','','activity-graph-row');
  const header=text(row,'div','','activity-graph-head');
  text(header,'span',x.label);text(header,'strong',pretty(x.value)+suffix);
  const track=text(row,'div','','activity-graph-track');
  track.setAttribute('role','img');track.setAttribute('aria-label',x.label+': '+pretty(x.value)+suffix);
  const bar=text(track,'span','','activity-graph-bar');
  bar.style.background=colors[x.key]||'#507ed2';
  bar.style.width=(highest>0?Math.min(100,x.value/highest*100):0)+'%';
 }
}
function render(){
 const {people,sources}=input;
 chartRing($('activityGraphStatus'),chartStatuses(people));
 chartBars($('activityGraphAbsence'),
  chartAbsence(people,sources.approvedLeaveComplete),people.length,' dossiers');
 const choices=chartHoursSources(people),select=$('activityGraphHoursSource'),previous=select.value;
 select.replaceChildren();
 for(const src of choices)select.add(new Option(src.label,src.key));
 if(choices.some(x=>x.key===previous))select.value=previous;
 const chosen=choices.find(x=>x.key===select.value);
 $('activityGraphHoursControl').hidden=!chosen;
 if(!chosen){
  $('activityGraphHoursNote').textContent='Geen bruikbare geverifieerde of historische speeluurmetingen in deze selectie.';
  $('activityGraphMost').replaceChildren();$('activityGraphLeast').replaceChildren();return;
 }
 $('activityGraphHoursNote').textContent=chosen.type==='verified'?
  chosen.count+' geverifieerde maandmetingen.':
  chosen.count+' historische RECORDS-peilstanden voor '+chosen.label.slice(18)+
  '. Dit is géén afgeronde kalendermaand en mag niet leiden tot automatische pings.';
 const ranking=chartHoursRank(people,chosen);
 const largest=Math.max(0,...ranking.all.map(x=>x.hours));
 const toBars=items=>items.map(p=>({label:p.call+' · '+p.name,value:p.hours,key:'hours'}));
 chartBars($('activityGraphMost'),toBars(ranking.top),largest,' uur');
 chartBars($('activityGraphLeast'),toBars(ranking.bottom),largest,' uur');
}
export function renderActivityGraphs({people,sources}){
 input={people:Array.isArray(people)?people:[],sources:sources||{}};
 if(!wired){
  wired=true;
  $('activityGraphHoursSource').addEventListener('change',render);
 }
 if($('activityGraphs').open)render();
}
