// One display name per verified Discord identity, never per call sign.
// Historical source records remain unchanged and individually auditable.
export const PERSONNEL_IDENTITY_NAMES='bpd_personnel_identity_names';
const ID=/^\d{15,22}$/;
const cleanName=x=>typeof x==='string'&&x.trim().length>=2&&
  x.trim().length<=120&&!/[<>\x00-\x1f\x7f]/.test(x)?x.trim():null;
export const normalizedIdentityName=x=>String(x||'').trim().toLocaleLowerCase('nl-BE');
export function canonicalRosterName(records,discordId){
  if(!ID.test(String(discordId||'')))return null;
  const matches=(records||[]).filter(p=>p?.personId===discordId&&cleanName(p.name));
  // Police is the authoritative source when a member is in several services.
  // Ambiguous duplicate police identities are NOT silently reconciled.
  const preferred=matches.filter(p=>p.dept==='politie');
  const source=preferred.length?preferred:matches;
  const names=[...new Set(source.map(p=>cleanName(p.name)))];
  return names.length===1?names[0]:null;
}
export function projectCanonicalPersonnelNames(records,identityDocs=[]){
  const trusted=new Map();
  for(const doc of identityDocs||[]){
    const d=typeof doc?.data==='function'?doc.data():doc;
    const id=typeof doc?.id==='string'?doc.id:d?.discordId;
    if(ID.test(String(id||''))&&d?.discordId===id&&cleanName(d.name)&&
       !trusted.has(id))trusted.set(id,cleanName(d.name));
  }
  const grouped=new Map();
  for(const person of records||[]){
    const id=person?.personId;
    if(!ID.test(String(id||'')))continue;
    const arr=grouped.get(id)||[];arr.push(person);grouped.set(id,arr);
  }
  const names=new Map();
  for(const [id,persons] of grouped){
    const name=trusted.get(id)||canonicalRosterName(persons,id);
    if(name)names.set(id,name);
  }
  return (records||[]).map(p=>names.has(p.personId)?{...p,name:names.get(p.personId)}:p);
}
