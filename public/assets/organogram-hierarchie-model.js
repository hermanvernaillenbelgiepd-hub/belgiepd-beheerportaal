// BelgiumPD hierarchy preview: presentation only, never an access control.
// No identity is ever inferred from a name. Each service registration is
// retained, including repeated names or the same person in two services.
export const SERVICES=Object.freeze([
 {id:'politie',name:'Politie',icon:'👮',levels:['Korpsleiding','Officierenkader','Middenkader']},
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
export function isTeacher(p){
 // Explicit presentation metadata only; never interpret free-text names,
 // position/rank or specialty as proof of instructor status.
 const flags=Array.isArray(p?.teachingRoles)?p.teachingRoles:[];
 return flags.some(x=>['instructeur','docent'].includes(lower(x)));
}
export function orderedMembers(rows){
 return [...rows].sort((a,b)=>
  Number(isTeacher(b))-Number(isTeacher(a))||
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
export function serviceHierarchy(people,dept){
 const settings=SERVICES.find(s=>s.id===dept);
 if(!settings)throw Error('Onbekende dienst');
 const rows=(people||[]).filter(p=>p&&p.dept===dept&&clean(p.name));
 const leadership=settings.levels.map(label=>({
  label,members:orderedMembers(rows.filter(p=>getTier(p)===label))
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
 const branches=[...groups].map(([label,members])=>({
  label,members:orderedMembers(members)
 })).sort((a,b)=>a.label.localeCompare(b.label,'nl'));
 return {dept,title:settings.name,leadership,branches,count:rows.length};
}
export function hierarchy(people){
 return SERVICES.map(s=>serviceHierarchy(people,s.id));
}
