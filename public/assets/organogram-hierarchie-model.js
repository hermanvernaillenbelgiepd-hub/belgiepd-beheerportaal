// BelgiumPD hierarchy preview: presentation only, never an access control.
// No identity is ever inferred from a name. Each service registration is
// retained, including repeated names or the same person in two services.
// Operational AZLS display order. Callsigns determine visible placement;
// old manual tier labels are not authorization and are never used for access.
export const AZLS_RANK_ORDER=Object.freeze([
 'DIRMED','HARTS','HVPK','HAMB','ARTS','VPK','AMB','STAG'
]);
export const SERVICES=Object.freeze([
 {id:'politie',name:'Politie',icon:'👮',levels:['Korpsleiding','Officierenkader','Middenkader','Basiskader','Agentenkader']},
 {id:'brandweer',name:'Brandweer',icon:'🚒',levels:['Zoneleiding','Officieren','Middenkader','Basiskader','Stagiairs']},
 {id:'ambulance',name:'Ambulance (AZLS)',icon:'🚑',levels:AZLS_RANK_ORDER},
 {id:'depannage',name:'Depannage',icon:'🛠',levels:['Leiding / AWV','LSRA','FAST']},
 {id:'burger',name:'Burger',icon:'🏛',levels:['Burgerraad','Burger','Burger IO']}
]);
const clean=v=>String(v??'').trim();
const lower=v=>clean(v).toLocaleLowerCase('nl');
const numeric=call=>{
 const match=clean(call).match(/(?:^|[- ])(\d{3})(?:\b|$)/);
 return match?Number(match[1]):null;
};
// Match an exact ambulance call series first. Never match ARTS inside HARTS,
// VPK inside HVPK or AMB inside HAMB, and never invent a rank from a specialty.
export function ambulanceOrganogramRank(p){
 const call=lower(p?.call).replace(/\s+/g,'').replace(/[._]/g,'-');
 const matched=call.match(/^(dir-?med|harts|hvpk|hamb|arts|vpk|amb|stag)(?:-|\d|$)/);
 if(matched){
  const name=matched[1].replace(/-/g,'').toUpperCase();
  if(AZLS_RANK_ORDER.includes(name))return name;
 }
 const rank=lower(p?.rank);
 if(/\bdir[-_. ]?med\b|\bdirecteur\b|medisch directeur/.test(rank))return 'DIRMED';
 if(/hoofd[- ]?arts|hoofdarts/.test(rank))return 'HARTS';
 if(/hoofd[- ]?verpleegkundige|hoofdverpleegkundige/.test(rank))return 'HVPK';
 if(/hoofd[- ]?ambulancier|hoofdambulancier/.test(rank))return 'HAMB';
 if(/\barts\b|\bdoctor\b/.test(rank))return 'ARTS';
 if(/verpleegkundige|\bvpk\b/.test(rank))return 'VPK';
 if(/ambulancier|\bamb\b/.test(rank))return 'AMB';
 if(/stagiair|stagiaire|\bstag\b|\bstage\b/.test(rank))return 'STAG';
 return null;
}
// Visual Depannage groups: LSRA and FAST can overlap; CRANE is only a patch.
export function depannageOrganogramGroups(person){
 if(person?.dept!=='depannage')return [];
 const groups=new Set();
 const codes={awv:'Leiding / AWV',lsra:'LSRA',fast:'FAST'};
 const verified=Array.isArray(person.depannageGroups)?
  person.depannageGroups.filter(x=>Object.hasOwn(codes,x)):[];
 for(const code of verified)groups.add(codes[code]);
 if(!verified.length){
  const call=lower(person.call).replace(/\s+/g,'').replace(/[._]/g,'-');
  const rank=lower(person.rank);
  if(/^(?:awv|anwv)(?:-|\d|$)/.test(call)||
     /\bawv\b|agentschap wegen|\bleiding\b/.test(rank))groups.add('Leiding / AWV');
  else if(/^(?:fast|f-a-s-t)(?:-|\d|$)/.test(call)||
     /\bfast\b|f\.?a\.?s\.?t\.?/.test(rank))groups.add('FAST');
  else groups.add('LSRA');
 }
 // Existing manual placements are only a presentation preference.
 if(codes.awv===person.leadershipTier||['LSRA','FAST'].includes(person.leadershipTier))
  groups.add(person.leadershipTier);
 for(const specialty of specialtyNames(person)){
  const code=lower(specialty).replace(/[^a-z]/g,'');
  if(['lsra','lrsa'].includes(code))groups.add('LSRA');
  if(code==='fast')groups.add('FAST');
 }
 return ['Leiding / AWV','LSRA','FAST'].filter(label=>groups.has(label));
}
export function getTier(p){
 const rank=lower(p?.rank),call=lower(p?.call),dept=p?.dept;
 const deptSettings=SERVICES.find(s=>s.id===dept);
 // Verified Burgerraad membership always occupies the first citizen tier,
 // even if an older manual placement or a concurrent Burger/IO role exists.
 if(dept==='burger'&&Array.isArray(p?.burgerGroups)&&p.burgerGroups.includes('Burgerraad'))
  return 'Burgerraad';
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
  // Explicit call-prefix tests come first. OFF and OOFF are distinct series;
  // STAG must never be folded into BWM, even when rank text is incomplete.
  const fireCall=call.replace(/\s+/g,'').replace(/[._]/g,'-');
  if(/^(?:zonechef|zonecommand|zone)(?:-|\d|$)/.test(fireCall))return 'Zoneleiding';
  if(/^ooff(?:-|\d|$)/.test(fireCall))return 'Middenkader';
  if(/^off(?:-|\d|$)/.test(fireCall))return 'Officieren';
  if(/^bwm(?:-|\d|$)/.test(fireCall))return 'Basiskader';
  if(/^stag(?:-|\d|$)/.test(fireCall))return 'Stagiairs';
  // A rank is the fallback when no recognized fire-service call is available.
  if(/zonechef|zonecommandant|zonecommandante/.test(rank))return 'Zoneleiding';
  if(/kolonel|majoor|kapitein|luitenant/.test(rank))return 'Officieren';
  if(/adjudant|sergeant/.test(rank))return 'Middenkader';
  if(/korporaal|brandweerman|brandweervrouw|brandweer(?:man|vrouw)/.test(rank))
   return 'Basiskader';
  if(/stagiair|stagiaire|\bstage\b/.test(rank))return 'Stagiairs';
  return 'Overige brandweerleden';
 }
 if(dept==='ambulance'){
  return ambulanceOrganogramRank(p)||'Overige AZLS-leden';
 }
 if(dept==='depannage')return depannageOrganogramGroups(p)[0]||'LSRA';
 if(dept==='burger'){
  const verified=Array.isArray(p.burgerGroups)?p.burgerGroups:[];
  if(verified.includes('Burgerraad'))return 'Burgerraad';
  if(verified.includes('Burger'))return 'Burger';
  if(verified.includes('Burger IO'))return 'Burger IO';
  if(/burgerraad/.test(rank+' '+call))return 'Burgerraad';
  if(/burger[- ]?io|burger in opleiding|\b(io|stagiair)\b/.test(rank+' '+call))return 'Burger IO';
  return 'Burger';
 }
 return 'Overige leden';
}
const rankWeight=(p)=>{
 if(p.dept==='politie'){
  const n=numeric(p.call);return n===8?-1:n===null?0:Math.floor(n/100);
 }
 const tier=getTier(p);
 const scores={
  Zoneleiding:10,Officieren:9,Middenkader:8,Basiskader:7,Stagiairs:6,
  'Overige brandweerleden':5,'Operationele leden':3,LSRA:7,FAST:6,
  DIRMED:12,HARTS:11,HVPK:10,HAMB:9,ARTS:8,VPK:7,AMB:6,STAG:5,
  'Overige AZLS-leden':4,
  'Leiding / AWV':8,Burgerraad:8,Burger:4,'Burger IO':3
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
 return [...new Set(names)].slice(0,20);
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
  label,members:(dept==='politie'?orderedSpecialtyMembers:orderedMembers)(rows.filter(p=>dept==='depannage'?depannageOrganogramGroups(p).includes(label):getTier(p)===label))
 }));
 // Keep unknown historic/incomplete AZLS call registrations visible, but
 // never mislabel them as a medical rank. Show only if such entries exist.
 if(dept==='ambulance'){
  const other=rows.filter(p=>getTier(p)==='Overige AZLS-leden');
  if(other.length)leadership.push({
   label:'Overige AZLS-leden',members:orderedMembers(other)
  });
 }
 // Unknown historic fire ranks must not disappear from the cadre overview.
 if(dept==='brandweer'){
  const other=rows.filter(p=>getTier(p)==='Overige brandweerleden');
  if(other.length)leadership.push({
   label:'Overige brandweerleden',members:orderedMembers(other)
  });
 }
 const groups=new Map();
 for(const person of rows){
  const specs=specialtyNames(person).filter(label=>dept!=='depannage'||
   !['lsra','lrsa','fast'].includes(lower(label).replace(/[^a-z]/g,'')));
  // AZLS specialties remain a separate membership list below the rank tree:
  // an AMB without a specialisation must still appear among 'Overige leden'.
  if(!specs.length&&settings.levels.includes(getTier(person))&&
     dept!=='ambulance'&&dept!=='brandweer')continue;
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
