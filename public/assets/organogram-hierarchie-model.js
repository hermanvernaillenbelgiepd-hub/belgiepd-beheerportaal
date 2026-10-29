// BelgiumPD hierarchy preview: presentation only, never an access control.
// No identity is ever inferred from a name. Each service registration is
// retained, including repeated names or the same person in two services.
export const SERVICES=Object.freeze([
 {id:'politie',name:'Politie',icon:'👮',levels:['Korpsleiding','Officierenkader','Middenkader','Basiskader','Agentenkader']},
 {id:'brandweer',name:'Brandweer',icon:'🚒',levels:['Zoneleiding','Officieren','Middenkader']},
 {id:'ambulance',name:'Ambulance (AZLS)',icon:'🚑',levels:['AZLS-leiding','Medische coördinatie']},
 {id:'depannage',name:'Depannage',icon:'🛠',levels:['Leiding / AWV']},
 {id:'burger',name:'Burger',icon:'🏛',levels:['Burgerraad']}
]);
const clean=v=>String(v??'').trim();
const lower=v=>clean(v).toLocaleLowerCase('nl');
const numeric=call=>{
 const match=clean(call).match(/(?:^|[- ])(\d{3})(?:\b|$)/);
 return match?Number(match[1]):null;
};
export function getTier(p){
 const rank=lower(p?.rank),call=lower(p?.call),dept=p?.dept;
 const deptSettings=SERVICES.find(s=>s.id===dept);
 // Manually assigned placement changes only the visual tree, never rank/access.
 if(deptSettings?.levels.includes(p?.leadershipTier))return p.leadershipTier;
 if(dept==='politie'){
  const n=numeric(p.call);
  if(n===900||n===910)return 'Korpsleiding';
  if(n!==null&&n>=920&&n<=999)return 'Officierenkader';
  if(n!==null&&n>=600&&n<900)return 'Middenkader';
  if(n!==null&&n>=300&&n<600)return 'Basiskader';
  if(n!==null&&n>=100&&n<300)return 'Agentenkader';
  if(/hoofdcommissaris|korpschef|korpsleiding|eerste commissaris/.test(rank))return 'Korpsleiding';
  if(/commissaris|officier/.test(rank))return 'Officierenkader';
  if(/hoofdinspecteur/.test(rank))return 'Middenkader';
  if(/inspecteur/.test(rank))return 'Basiskader';
  return 'Agentenkader';
 }
 if(dept==='brandweer'){
  if(/zonechef|zonecommand|^zone\b/.test(rank+' '+call))return 'Zoneleiding';
  if(/kolonel|majoor|kapitein|luitenant|^off[- ]/.test(rank+' '+call))return 'Officieren';
  if(/adjudant|sergeant|^ooff[- ]/.test(rank+' '+call))return 'Middenkader';
  return 'Operationele leden';
 }
 if(dept==='ambulance'){
  if(/azls.{0,3}leiding|^azls[- ]/.test(rank+' '+call))return 'AZLS-leiding';
  if(/dir.?med|hoofdarts|harts/.test(rank+' '+call))return 'Medische coördinatie';
  return 'Zorgteams';
 }
 if(dept==='depannage'){
  if(/\bawv\b|agentschap|leiding/.test(rank+' '+call))return 'Leiding / AWV';
  return 'Operationele leden';
 }
 if(dept==='burger'){
  if(/burgerraad/.test(rank+' '+call))return 'Burgerraad';
  return 'Burgerleden';
 }
 return 'Overige leden';
}
const rankWeight=(p)=>{
 if(p.dept==='politie'){
  const n=numeric(p.call);return n===8?-1:n===null?0:Math.floor(n/100);
 }
 const tier=getTier(p);
 const scores={
  Zoneleiding:8,Officieren:7,Middenkader:6,'Operationele leden':3,
  'AZLS-leiding':8,'Medische coördinatie':7,Zorgteams:4,
  'Leiding / AWV':8,Burgerraad:8,Burgerleden:3
 };
 return scores[tier]??1;
};
// Police middle-cadre layout: the 700 and 600 series are independent
// numerical lanes. The less common 800 series retains a dedicated group.
// Visual manual order never changes anyone's actual police grade.
export function policeMiddleSeries(person){
 if(person?.dept!=='politie'||getTier(person)!=='Middenkader')return null;
 const n=numeric(person.call);
 if(n===null||n<600||n>=900)return null;
 return String(Math.floor(n/100)*100);
}
export function orderedPoliceMiddle(rows){
 return [...rows].sort((a,b)=>
  ((a.displayOrder||0)!==(b.displayOrder||0)?
    (a.displayOrder||1000)-(b.displayOrder||1000):0)||
  (numeric(a.call)??9999)-(numeric(b.call)??9999)||
  clean(a.name).localeCompare(clean(b.name),'nl'));
}
export function policeMiddleColumns(rows){
 const columns={'600':[],'700':[],'800':[],other:[]};
 for(const person of rows){
  const series=policeMiddleSeries(person);
  columns[series||'other'].push(person);
 }
 for(const key of ['600','700','800','other'])
  columns[key]=orderedPoliceMiddle(columns[key]);
 return columns;
}
export function isTeacher(p){
 // Explicit presentation metadata only; never interpret free-text names,
 // position/rank or specialty as proof of instructor status.
 const flags=Array.isArray(p?.teachingRoles)?p.teachingRoles:[];
 return flags.some(x=>['instructeur','docent'].includes(lower(x)));
}
// In the full membership roster of each specialisation, show everybody
// (including instructors) by operational rank. The instructor list above
// it has its own priority and may intentionally repeat the same person.
export function orderedSpecialtyMembers(rows){
 return [...rows].sort((a,b)=>
  rankWeight(b)-rankWeight(a)||
  ((numeric(a.call)!==null&&numeric(b.call)!==null&&
   Math.floor(numeric(a.call)/100)===Math.floor(numeric(b.call)/100))?
   numeric(a.call)-numeric(b.call):0)||
  clean(a.call).localeCompare(clean(b.call),'nl',{numeric:true})||
  clean(a.name).localeCompare(clean(b.name),'nl')
 );
}
export function orderedMembers(rows){
 return [...rows].sort((a,b)=>
  Number(isTeacher(b))-Number(isTeacher(a))||
  // A manually chosen order takes priority within the teacher/member group.
  // Zero means keep the original cadre/rank ordering.
  ((a.displayOrder||0)!==(b.displayOrder||0)?
   (a.displayOrder||1000)-(b.displayOrder||1000):0)||
  rankWeight(b)-rankWeight(a)||
  ((numeric(a.call)!==null&&numeric(b.call)!==null&&
   Math.floor(numeric(a.call)/100)===Math.floor(numeric(b.call)/100))?
   numeric(a.call)-numeric(b.call):0)||
  clean(a.call).localeCompare(clean(b.call),'nl',{numeric:true})||
  clean(a.name).localeCompare(clean(b.name),'nl')
 );
}
const forbidden=new Set(['korpsleiding','officierenkader','middenkader','basiskader','agentenkader','zoneleiding','azls leiding','leiding','actief']);
export function specialtyNames(p){
 if(!Array.isArray(p?.specialties))return [];
 const names=p.specialties.map(s=>{
  if(typeof s==='string')return clean(s.replace(/:\s*Ja$/i,''));
  if(s&&typeof s==='object'&&/^(ja|behaald|voltooid|geslaagd|true)$/i.test(clean(s.value)))return clean(s.label);
  return '';
 }).filter(s=>s&&!forbidden.has(lower(s)));
 return [...new Set(names)].slice(0,12);
}
export const POLICE_BRANCH_ORDER=Object.freeze([
 'INTERVENTIEDIENST','SIGNALISATIE','MOTARD','SEMI ANONIEM','K9',
 'RAGO','DISP','TO','AE','RECHERCHE'
]);
const policeNames=new Map([
 ['interventiedienst','INTERVENTIEDIENST'],
 ['radio/bm','RADIO/BM'],['radio bm','RADIO/BM'],['radio','RADIO/BM'],
 ['signalisatie','SIGNALISATIE'],['siv/wpr','SIGNALISATIE'],
 ['motard','MOTARD'],['motor','MOTARD'],['motard-off road','MOTARD'],
 ['semi anoniem','SEMI ANONIEM'],['semi-anoniem','SEMI ANONIEM'],
 ['semi anonieme','SEMI ANONIEM'],['semi-anonieme','SEMI ANONIEM'],
 ['k9','K9'],['k-9','K9'],
 ['rago','RAGO'],
 ['dispatch','DISP'],['disp','DISP'],
 ['to','TO'],['t.o.','TO'],['terreinondersteuner','TO'],
 ['ae','AE'],['ae-i','AE'],['ae-t','AE'],['ae-f','AE'],
 ['lokale recherche','RECHERCHE'],['recherche','RECHERCHE'],['lrd','RECHERCHE']
]);
export function policeSpecialtyName(name){
 const normalized=lower(name).replace(/\s+/g,' ').trim();
 return policeNames.get(normalized)||clean(name);
}
// Instruction roles are tied to a verified specialty, not to the member's
// generic DOCENT/INSTRUCTEUR flag (which would label every membership).
export function specialtyInstructorRoles(person,specialty){
 if(person?.dept!=='politie')return [];
 const name=policeSpecialtyName(specialty);
 // K9's resolved display role includes officer/KL overrides. If set,
 // it takes precedence over the instructor-only Discord specialty list.
 if(name==='K9'&&['instructeur','geleider','geleider_in_stage'].includes(person.k9Role)){
  return person.k9Role==='instructeur'?['instructeur']:[];
 }
 const normalize=list=>(Array.isArray(list)?list:[]).map(policeSpecialtyName).map(x=>
  x==='RADIO/BM'?'INTERVENTIEDIENST':x);
 const own=[];
 if(normalize(person.instructorSpecialties).includes(name))own.push('instructeur');
 if(normalize(person.teacherSpecialties).includes(name))own.push('docent');
 return own;
}
export function isSpecialtyInstructor(person,specialty){
 return specialtyInstructorRoles(person,specialty).length>0;
}
export function policeSpecializationBranches(rows){
 // This only changes the visible grouping. Existing assignments, cadre ranks,
 // permission grants, and cross-service profiles remain untouched.
 const groups=new Map([...POLICE_BRANCH_ORDER,'RADIO/BM'].map(label=>[label,[]]));
 const extra=new Map();
 const unassigned=[];
 for(const person of rows){
  const original=specialtyNames(person);
  if(!original.length){
   if(!SERVICES[0].levels.includes(getTier(person)))unassigned.push(person);
   continue;
  }
  const names=[...new Set(original.map(policeSpecialtyName))];
  for(const name of names){
   if(groups.has(name))groups.get(name).push(person);
   else{
    if(!extra.has(name))extra.set(name,[]);
    extra.get(name).push(person);
   }
  }
 }
 // Interventiedienst is a full specialization alongside the others.
 // RADIO/BM is a qualification within it, not an extra nested card.
 // If someone has BOTH assignments, display them only once per list.
 const branches=POLICE_BRANCH_ORDER.map(label=>({
  label,
  members:orderedMembers(label==='INTERVENTIEDIENST'?
   [...new Set([...(groups.get(label)||[]),...(groups.get('RADIO/BM')||[])])]:
   groups.get(label)||[]),
  ...(label==='INTERVENTIEDIENST'?{note:'RADIO/BM inbegrepen'}:{})
 }));
 const additional=[...extra].sort(([a],[b])=>a.localeCompare(b,'nl'))
  .map(([label,members])=>({label,members:orderedMembers(members)}));
 if(additional.length)branches.push({
  label:'Overige specialisaties',members:[],children:additional
 });
 if(unassigned.length)branches.push({
  label:'Overige leden (geen geregistreerde specialisatie)',
  members:orderedMembers(unassigned)
 });
 return branches;
}
export function serviceHierarchy(people,dept){
 const settings=SERVICES.find(s=>s.id===dept);
 if(!settings)throw Error('Onbekende dienst');
 const rows=(people||[]).filter(p=>p&&p.dept===dept&&clean(p.name));
 const leadership=settings.levels.map(label=>({
  label,members:(dept==='politie'&&['Basiskader','Agentenkader'].includes(label)?orderedSpecialtyMembers:orderedMembers)(rows.filter(p=>getTier(p)===label))
 }));
 const groups=new Map();
 for(const person of rows){
  const specs=specialtyNames(person);
  if(!specs.length&&settings.levels.includes(getTier(person)))continue;
  const names=specs.length?specs:['Overige leden (geen geregistreerde specialisatie)'];
  for(const spec of names){
   if(!groups.has(spec))groups.set(spec,[]);
   groups.get(spec).push(person);
  }
 }
 const branches=dept==='politie'?policeSpecializationBranches(rows):
  [...groups].map(([label,members])=>({
   label,members:orderedMembers(members)
  })).sort((a,b)=>a.label.localeCompare(b.label,'nl'));
 return {dept,title:settings.name,leadership,branches,count:rows.length};
}
export function hierarchy(people){
 return SERVICES.map(s=>serviceHierarchy(people,s.id));
}
