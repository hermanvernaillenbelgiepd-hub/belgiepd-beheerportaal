// A compact read-only projection of the existing member directory.
// No Discord ID, service permission, rank or specialization is inferred here.
const norm=v=>String(v??'').trim();
export const DIRECTORY_DEPTS=Object.freeze([
  {key:'all',label:'Alle diensten'},
  {key:'Politie',label:'Politie'},
  {key:'Brandweer',label:'Brandweer'},
  {key:'Ambulance',label:'Ambulance'},
  {key:'Depannage',label:'Depannage'},
  {key:'Burger',label:'Burger'}
]);
export function directoryStatusKind(value){
 const status=norm(value).toLocaleUpperCase('nl-BE').replace(/\s+/g,' ');
 if(status==='ACTIEF')return 'active';
 if(status==='VERLOF')return 'leave';
 if(status==='INACTIEF')return 'inactive';
 if(status==='50/50'||status==='50 / 50')return 'warning';
 if(['STAGE','AANGEMELD','OPLEIDING!','RESTRICTED','BLACKLISTED'].includes(status))
  return 'warning';
 if(status==='VERWIJDERD'||status==='ONTSLAG'||status==='BANNED')return 'muted';
 return 'neutral';
}
export function activeDirectorySpecialties(person){
 if(person?.hasPoliceEntry===false&&!person?.serviceDept)return [];
 const values=Array.isArray(person?.specialties)?person.specialties:[];
 const shown=[],seen=new Set();
 for(const item of values){
  const name=norm(item?.label),value=norm(item?.value).toLocaleUpperCase('nl-BE');
  if(!name||seen.has(name.toLocaleLowerCase('nl-BE')))continue;
  // A "Nee", unknown or restricted field never becomes a qualification.
  if(!(/^(JA|ACTIEF|BEHAALD|INSTRUCTEUR|DOCENT|LEIDING|TEAMLEADER|STAGE|AANGEMELD|SPECIALISATIE)$/.test(value)||
   /^AE[-_ ](?:I|T|F|INSTRUCTEUR|TEAMLEADER)$/.test(value)))continue;
  shown.push(name==='INTERVENTIEDIENST'?'Interventie':name==='Motor'?'Motard':
   name==='LRD (Recherche)'?'LRD':name);
  seen.add(name.toLocaleLowerCase('nl-BE'));
 }
 return shown.slice(0,30);
}
export function filterCompactDirectory(records,filters={}){
 const query=norm(filters.query).toLocaleLowerCase('nl-BE');
 const dept=norm(filters.department)||'all',series=norm(filters.series)||'all';
 const status=norm(filters.status)||'all';
 return (Array.isArray(records)?records:[]).filter(person=>{
  if(!person||!norm(person.name))return false;
  if(dept!=='all'&&!((person.services||[]).includes(dept)))return false;
  if(series!=='all'&&norm(person.series)!==series)return false;
  if(status!=='all'&&directoryStatusKind(person.status)!==status)return false;
  if(!query)return true;
  const visible=[person.call,person.rank,person.name,person.series,person.status,
    ...(Array.isArray(person.services)?person.services:[]),
    ...activeDirectorySpecialties(person)];
  return visible.some(value=>norm(value).toLocaleLowerCase('nl-BE').includes(query));
 });
}
export function directorySeriesOptions(records){
 const names=new Set();
 for(const p of Array.isArray(records)?records:[]){
  if(!p?.hasPoliceEntry)continue;
  const s=norm(p.series);
  if(s&&s!=='—'&&s.length<80)names.add(s);
 }
 return [...names].sort((a,b)=>a.localeCompare(b,'nl-BE',{numeric:true})).slice(0,50);
}


// Only a previously authorized /api/personnel/overview response can be
// projected to the "Mijn dienst" read-only viewer. This projection deliberately
// removes Discord IDs, audit data, edit flags, activity and private dossier data.
// The caller must NEVER fall back to a requested client-side service role.
export function scopedServiceDirectory(records,departments){
 const allowed=new Set((Array.isArray(departments)?departments:[])
  .filter(x=>['politie','brandweer','ambulance','depannage','burger'].includes(x)));
 const labels={politie:'Politie',brandweer:'Brandweer',
  ambulance:'Ambulance',depannage:'Depannage',burger:'Burger'};
 return (Array.isArray(records)?records:[]).filter(p=>p&&allowed.has(p.dept)&&
  typeof p.name==='string'&&p.name.trim()).slice(0,1200).map(p=>({
  name:String(p.name).slice(0,90),
  call:String(p.call||'—').slice(0,24),
  rank:String(p.rank||'—').slice(0,95),
  status:String(p.status||'').slice(0,30),
  series:p.dept==='politie'?String(p.series||'—').slice(0,85):'—',
  hasPoliceEntry:p.dept==='politie',
  services:[labels[p.dept]],serviceDept:p.dept,
  specialties:(Array.isArray(p.specialties)?p.specialties:[])
   .filter(x=>x&&typeof x.label==='string'&&typeof x.value==='string')
   .slice(0,20).map(x=>({label:x.label.slice(0,64),value:x.value.slice(0,50)}))
 }));
}
