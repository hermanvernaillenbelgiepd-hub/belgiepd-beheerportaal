// Read-only Police grouping based exclusively on the existing verified
// organogram projection. Never assign roles, specializations, cadre or access.
export const POLICE_SPECIALTY_GROUPS=Object.freeze([
 {key:'MOTARD',label:'MOTARD',icon:'🏍️'},
 {key:'K9',label:'K9',icon:'🐕'},
 {key:'AE',label:'Arrestatie-eenheid (AE)',icon:'🛡️'},
 {key:'DISP',label:'Dispatch',icon:'📻'},
 {key:'RAGO',label:'RAGO',icon:'🚁'},
 {key:'TO',label:'Terreinondersteuner (TO)',icon:'🧭'},
 {key:'SIV/WPR',label:'SIV/WPR',icon:'🚓'},
 {key:'SIGNALISATIE',label:'Signalisatie',icon:'🚧'},
 {key:'RADIO/BM',label:'Radio BM',icon:'📡'},
 {key:'INTERVENTIEDIENST',label:'Interventie',icon:'🚔'},
 {key:'SEMI ANONIEM',label:'Semi-anoniem',icon:'🚘'},
 {key:'RECHERCHE',label:'Recherche (LRD)',icon:'🔎'}
]);
const normal=x=>String(x??'').trim().toLocaleUpperCase('nl-BE')
 .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .replace(/[_–—.]/g,' ').replace(/\s+/g,' ');
export function canonicalPoliceSpecialty(label){
 const raw=normal(label);
 const joined=raw.replace(/[\s/-]/g,'');
 const alias={
  MOTOR:'MOTARD',MOTARD:'MOTARD',
  K9:'K9',K9IO:'K9',K9INSTUCTEUR:'K9',
  ARRESTATIEEENHEID:'AE',AE:'AE',AEI:'AE',AET:'AE',
  DISP:'DISP',DISPATCH:'DISP',DISPATCHSELECTIE:'DISP',
  RAGO:'RAGO',RAGOIO:'RAGO',
  TO:'TO',TERREINONDERSTEUNER:'TO',
  SIVWPR:'SIV/WPR',WPR:'SIV/WPR',SIV:'SIV/WPR',
  SIGNALISATIE:'SIGNALISATIE',
  RADIOBM:'RADIO/BM',RADIO:'RADIO/BM',
  INTERVENTIE:'INTERVENTIEDIENST',INTERVENTIEDIENST:'INTERVENTIEDIENST',
  SEMIANO:'SEMI ANONIEM',SEMIANONIEM:'SEMI ANONIEM',
  RECHERCHE:'RECHERCHE',LRD:'RECHERCHE',LRDRECHERCHE:'RECHERCHE'
 };
 return alias[joined]||raw;
}
const list=value=>Array.isArray(value)?value:[];
const specialtiesOf=p=>new Set(list(p?.specialties).map(canonicalPoliceSpecialty));
const seriesOf=p=>{
 const raw=String(p?.series||'').trim();
 const result=raw.match(/^(?:reeks|serie|series|r)\s*0?([1-4])$/i)||raw.match(/^0?([1-4])$/);
 return result?result[1]:null;
};
const policeRecords=records=>list(records).filter(p=>
 p?.dept==='politie'&&typeof p.name==='string'&&p.name.trim()&&
 typeof p.call==='string'&&p.call.trim()).slice(0,1200);
export function policeMemberOrder(a,b){
 const number=p=>Number(String(p.call||'').match(/(\d{3})$/)?.[1]||-1);
 return number(b)-number(a)||String(a.name).localeCompare(String(b.name),'nl-BE');
}
export function groupPoliceSeries(records){
 const definitions=[
  {key:'1',title:'Reeks 1',color:'series-1'},
  {key:'2',title:'Reeks 2',color:'series-2'},
  {key:'3',title:'Reeks 3',color:'series-3'},
  {key:'4',title:'Reeks 4',color:'series-4'},
  {key:'vlinder',title:'Vlinder',color:'series-vlinder'},
  {key:'kader',title:'Officierenkader / Korpsleiding',color:'series-kader'},
  {key:'overig',title:'Nog geen reeks toegewezen',color:'series-overig'}
 ];
 const groups=new Map(definitions.map(def=>[def.key,{...def,heads:[],members:[]}]));
 for(const p of policeRecords(records)){
  const head=String(p.reekshoofdReeks||'').trim();
  const n=seriesOf(p);
  const call=Number(String(p.call).match(/(\d{3})$/)?.[1]||0);
  const cadre=call>=900||/commissaris|korpsleiding|officierenkader/i.test(String(p.rank||''));
  const group=n||(/vlinder/i.test(String(p.series||''))||head==='VLINDER'||
    call>=600&&call<900?'vlinder':cadre?'kader':'overig');
  const row=groups.get(group);
  if(!row)continue;
  // Only the official organogram reekshoofd projection determines heads.
  (n&&head.toLocaleLowerCase('nl-BE')==='reeks '+Number(n)?
    row.heads:row.members).push(p);
 }
 return definitions.map(def=>{
  const g=groups.get(def.key);
  g.heads.sort(policeMemberOrder);g.members.sort(policeMemberOrder);
  return {...g,total:g.heads.length+g.members.length};
 });
}
const isInstructor=(p,key)=>list(p.instructorSpecialties).some(x=>
 canonicalPoliceSpecialty(x)===key);
const isTeacher=(p,key)=>list(p.teacherSpecialties).some(x=>
 canonicalPoliceSpecialty(x)===key);
const patchFor=(p,key)=>list(p.specialtyPatches).find(x=>
 canonicalPoliceSpecialty(x?.label)===key&&
 typeof x?.imageUrl==='string'&&x.imageUrl.startsWith('/api/role-artwork/file/'));
const patchLevel=(p,key)=>normal(patchFor(p,key)?.level);
export function policeSpecialtyTier(person,key){
 const p=person||{},instructor=isInstructor(p,key)||isTeacher(p,key);
 const patch=patchLevel(p,key);
 if(key==='AE'){
  const levels=new Set([...list(p.aeRoles),p.aeRole,p.aeManual].map(normal));
  if(p.aeTeamleader===true||levels.has('TEAMLEADER')||
     /\b(TEAMLEADER|LEIDING)\b/.test(patch))return 'leadership';
  if(instructor||levels.has('INSTRUCTEUR')||/INSTRUCTEUR/.test(patch))
   return 'instructors';
  if(levels.has('AE I')&&!levels.has('AE T')||
     /OPLEIDING|AANGEMELD|STAGE/.test(patch))return 'trainees';
  return 'members';
 }
 const role=normal(key==='K9'?p.k9Role:key==='MOTARD'?p.motardRole:
  key==='DISP'?p.dispRole:'');
 if(instructor||role==='INSTRUCTEUR'||/INSTRUCTEUR|DOCENT/.test(patch))
  return 'instructors';
 if(key==='K9'&&role==='GELEIDER IN STAGE'||role==='IN OPLEIDING'||
    key==='RAGO'&&!specialtiesOf(p).has('RAGO')&&
       list(p.specialties).some(x=>normal(x)==='RAGO IO')||
    /IN OPLEIDING|SELECTIE|AANGEMELD|STAGE/.test(patch))
  return 'trainees';
 if(/TEAMLEADER|LEIDING/.test(patch))return 'leadership';
 return 'members';
}
export function groupPoliceSpecialties(records){
 const people=policeRecords(records);
 const extras=new Set();
 for(const p of people)for(const item of list(p.specialties)){
  const key=canonicalPoliceSpecialty(item);
  if(key&&key.length<=64&&!POLICE_SPECIALTY_GROUPS.some(d=>d.key===key)&&
     !['RAGO IO','AE I','AE T'].includes(key))extras.add(key);
 }
 const definitions=[...POLICE_SPECIALTY_GROUPS,
  ...[...extras].sort((a,b)=>a.localeCompare(b,'nl-BE'))
  .slice(0,20).map(key=>({key,label:key,icon:'🏷️'}))];
 return definitions.map(def=>{
  const groups={leadership:[],instructors:[],members:[],trainees:[]};
  for(const p of people){
   const active=specialtiesOf(p);
   if(!active.has(def.key))continue;
   groups[policeSpecialtyTier(p,def.key)].push(p);
  }
  for(const arr of Object.values(groups))arr.sort(policeMemberOrder);
  return {...def,groups,total:Object.values(groups).reduce((n,x)=>n+x.length,0)};
 });
}
