// Presentation-only BelgiumPD police hierarchy, consuming the same
// authenticated roster as the existing organogram. Does NOT call APIs,
// move records, infer authorization, or invent a REEKS from a callsign.
import {policeWorkflowGroups,policeWorkflowSeriesNumber,policeMiddleColumns,
  orderedPoliceMiddle,orderedSpecialtyMembers} from '/assets/organogram-hierarchie-model.js';

export function buildPoliceWorkflow(item,{
  el,person,cadrePeopleList,policeInterventions,middleCadreLayout,
  state,managerReady,syncCadreToggle
}){
 const chart=el('div','police-workflow');
 chart.setAttribute('aria-label','Korpsleiding, Officierenkader en drie officiële politiereeksen');
 const levels=new Map(item.leadership.map(x=>[x.label,x.members]));
 const groups=policeWorkflowGroups(item.leadership);
 const names=['Middenkader','Basiskader','Agentenkader'];
 const numMembers=group=>names.reduce((sum,name)=>sum+(group[name]?.length||0),0);
 function groupCadre(label,members,key,isUpper=false){
  const section=el('details','level '+(isUpper?'police-workflow-top':'police-workflow-cadre'));
  section.dataset.cadreKey=key;
  section.open=state.cadreOpen[key]??true;
  section.addEventListener('toggle',()=>{
   state.cadreOpen[key]=section.open;
   syncCadreToggle();
  });
  const summary=el('summary','level-title');
  summary.title=label+' in- of uitklappen';
  summary.append(el('span','',label),
   el('span','level-count',members.length+' leden'));
  section.append(summary);
  const body=el('div','level-body');
  if(label==='Middenkader'){
   const byCall=policeMiddleColumns(members);
   // 700 and 600 belong to the SAME cadre, vertically ordered inside
   // each official REEKS. 800 stays before 700 where applicable.
   for(const [code,title] of [
    ['800','800 · Eerste hoofdinspecteurs'],
    ['700','700 · Hoofdinspecteurs'],
    ['600','600 · Aspirant-hoofdinspecteurs'],
    ['other','Overig Middenkader']
   ]){
    if(!byCall[code].length)continue;
    const sub=el('section','police-workflow-middle-group');
    sub.append(el('div','police-workflow-middle-label',title));
    const list=el('div','persons personnel-card-grid police-workflow-people');
    for(const member of orderedPoliceMiddle(byCall[code])){
     const card=person(member);
     if(policeWorkflowSeriesNumber(member.reekshoofdReeks)!==null)
      card.append(el('span','police-workflow-head-tag','REEKSHOOFD'));
     list.append(card);
    }
    sub.append(list);
    body.append(sub);
   }
  }else if(members.length){
   if(isUpper)body.append(cadrePeopleList(members,label));
   else{
    const list=el('div','persons personnel-card-grid police-workflow-people');
    for(const member of orderedSpecialtyMembers(members))list.append(person(member));
    body.append(list);
   }
  }
  if(!body.childElementCount)
   body.append(el('p','gaps','Geen personeelsleden geregistreerd'));
  section.append(body);
  return section;
 }
 // The entire command chain remains above three PEER series columns.
 for(const label of ['Korpsleiding','Officierenkader']){
  chart.append(groupCadre(label,levels.get(label)||[],
   'politie:workflow:'+label,true));
  chart.append(el('div','police-workflow-connector'));
 }
 const series=el('section','police-workflow-series');
 series.append(el('h2','police-workflow-series-heading','REEKSEN'));
 const grid=el('div','police-workflow-series-grid');
 grid.setAttribute('aria-label','Reeks 1, Reeks 2 en Reeks 3 naast elkaar');
 for(const n of [1,2,3]){
  const group=groups[String(n)];
  const section=el('details','police-workflow-reeks');
  section.dataset.series=String(n);
  const key='politie:workflow:reeks:'+n;
  section.open=state.serviceOpen[key]??true;
  section.addEventListener('toggle',()=>{state.serviceOpen[key]=section.open;});
  const summary=el('summary');
  summary.append(el('strong','','REEKS '+n),
   el('span','police-workflow-count',numMembers(group)+' leden'));
  section.append(summary);
  const inside=el('div','police-workflow-reeks-body');
  for(const label of names)
   inside.append(groupCadre(label,group[label],
    'politie:workflow:reeks:'+n+':'+label));
  section.append(inside);
  grid.append(section);
 }
 series.append(grid);
 if(numMembers(groups.unassigned)){
  const extra=el('details','police-workflow-unassigned');
  extra.append(el('summary','','Overige / niet ingedeeld · '+
   numMembers(groups.unassigned)+' leden'));
  const inside=el('div','police-workflow-reeks-body');
  for(const label of names)if(groups.unassigned[label].length)
   inside.append(groupCadre(label,groups.unassigned[label],
    'politie:workflow:unassigned:'+label));
  extra.append(inside);
  series.append(extra);
 }
 chart.append(series);
 // Specialisaties are cross-functional and DO NOT change rank or REEKS.
 // Keep the existing instructeur/opleider presentation without duplicates.
 chart.append(policeInterventions(item.branches));
 // Technical drag order requires the complete original 700/600 cohort,
 // not a partial subset inside one REEKS. Preserve that permission-gated
 // management workflow in a separate collapsed technical tool.
 if(managerReady&&!state.demo){
  const tools=el('details','police-workflow-order-tools');
  tools.append(el('summary','','Technisch beheer · globale 700/600-volgorde'));
  tools.append(middleCadreLayout(levels.get('Middenkader')||[]));
  chart.append(tools);
 }
 return chart;
}
