// Read-only projection of verified BelgiumPD member-API roles onto personnel
// roster specializations. This must NEVER persist evidence, modify an
// operational rank, or grant portal/dossier permissions.
const ID=/^\d{15,22}$/;
const DEPTS=new Set(['politie','brandweer','ambulance','depannage']);
const PRIORITY=Object.freeze({Stage:1,AANGEMELD:1,Ja:2,INSTRUCTEUR:3,LEIDING:4});
const EMPTY=new Set(['Nee','Neen','Niet ingevuld','Niet gecontroleerd','n.v.t.','NVT','']);

export function overlayVerifiedRosterSpecialties(records,apiSnapshot,linksByDept){
 if(!Array.isArray(records)||apiSnapshot?.status!=='ok'||
    !(apiSnapshot.entries instanceof Map)||!(linksByDept instanceof Map))return records;
 // Do not assign a Discord account to multiple records in the same service.
 // A single account may legitimately work in more than one service.
 const seen=new Set(),duplicates=new Set();
 for(const p of records){
  if(!DEPTS.has(p?.dept)||!ID.test(String(p?.personId||'')))continue;
  const key=p.dept+':'+p.personId;
  if(seen.has(key))duplicates.add(key);
  seen.add(key);
 }
 return records.map(p=>{
  if(!DEPTS.has(p?.dept)||!ID.test(String(p?.personId||''))||
     duplicates.has(p.dept+':'+p.personId)||
     !apiSnapshot.entries.has(p.personId)||!Array.isArray(p.specialties))return p;
  const roles=apiSnapshot.entries.get(p.personId);
  if(!Array.isArray(roles)||roles.length>500||!roles.every(id=>
    typeof id==='string'&&ID.test(id)))return p;
  const have=new Set(roles),links=linksByDept.get(p.dept)||[];
  const best=new Map();
  for(const x of links){
   if(!x||typeof x.label!=='string'||!x.label||
      typeof x.roleId!=='string'||!ID.test(x.roleId)||
      !have.has(x.roleId)||!Object.hasOwn(PRIORITY,x.value))continue;
   const old=best.get(x.label);
   if(!old||PRIORITY[x.value]>PRIORITY[old.value])best.set(x.label,x);
  }
  if(!best.size)return p;
  const specialties=p.specialties.map(x=>x&&typeof x==='object'?{...x}:x);
  let changed=false;
  for(const item of specialties){
   if(!item||typeof item!=='object'||item.source==='manual')continue;
   const match=best.get(item.label);
   if(!match)continue;
   item.value=match.value;
   item.source='discord-verified';
   item.level=String(match.level||'').slice(0,45);
   item.roleId=match.roleId;
   if(match.assetKey)item.assetKey=String(match.assetKey).slice(0,90);
   changed=true;
  }
  // Only project known, existing specialty columns. New qualifications
  // belong in the controlled specialist registry rather than a guessed row.
  if(!changed)return p;
  const special=specialties.filter(x=>x&&typeof x==='object'&&
    !EMPTY.has(x.value)).map(x=>x.label+': '+x.value).join(' · ');
  return {...p,specialties,special:special||'Geen geregistreerde specialisaties'};
 });
}
