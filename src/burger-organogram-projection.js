// Display-only projection of verified citizen Discord memberships.
// Never persists a personnel record or confers operational/dossier rights.
export const BURGER_ROLE_IDS=Object.freeze({
 council:'1492485336197234728',
 member:'1309532438019706966',
 trainee:'1398985105254650007'
});
const validId=id=>/^\d{15,22}$/.test(String(id||''));
const tiers=Object.freeze([
 [BURGER_ROLE_IDS.council,'Burgerraad'],
 [BURGER_ROLE_IDS.member,'Burger'],
 [BURGER_ROLE_IDS.trainee,'Burger IO']
]);
export function citizenGroupsForRoles(ids){
 const have=new Set(Array.isArray(ids)?ids:[]);
 return tiers.filter(([id])=>have.has(id)).map(([,label])=>label);
}
export function verifiedCitizenRoles(personId,upstream,oauth,guildId,now=Date.now()){
 if(!validId(personId)||!validId(guildId))return [];
 if(upstream?.status==='ok'&&upstream.entries instanceof Map&&upstream.entries.has(personId))
  return citizenGroupsForRoles(upstream.entries.get(personId));
 const auth=oauth?.entries?.get(personId);
 if(!auth||auth.guildId!==guildId||!Number.isSafeInteger(auth.verifiedAt)||
    auth.verifiedAt>now+60000||now-auth.verifiedAt>7*86400000)return [];
 return citizenGroupsForRoles(auth.roleIds);
}
export function projectCitizenOrganogram(roster,upstream,oauth,guildId,now=Date.now()){
 const rows=Array.isArray(roster)?roster:[];
 if(!validId(guildId))return rows;
 const existing=new Set(rows.filter(p=>p?.dept==='burger'&&validId(p.personId)).map(p=>p.personId));
 const byPerson=new Map();
 // Prefer an existing police profile, but accept another known service.
 // The Discord API supplies IDs/roles, never names or registration proof.
 for(const p of rows){
  if(!p||p.dept==='burger'||!validId(p.personId)||!String(p.name||'').trim())continue;
  if(!byPerson.has(p.personId)||p.dept==='politie')byPerson.set(p.personId,p);
 }
 const projected=[];
 for(const [id,source] of byPerson){
  if(existing.has(id))continue;
  const groups=verifiedCitizenRoles(id,upstream,oauth,guildId,now);
  if(!groups.length)continue;
  const rank=groups[0];
  projected.push({
   dept:'burger',personId:id,name:String(source.name).trim().slice(0,90),
   // Cross-service callsigns are not valid citizen callsigns.
   call:'—',rank,series:'',status:'',specialties:[],
   citizenDisplayOnly:true
  });
  existing.add(id);
 }
 return [...rows,...projected];
}
