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
// A registered Burgerraad: Ja in the official citizen roster is legitimate
// display evidence, even if the Discord role API omits the council role.
// This is NEVER used as authorization, an appointment, or a roster write.
export function citizenOrganogramGroups(person,verified=[]){
 const groups=(Array.isArray(verified)?verified:[])
  .filter(value=>['Burgerraad','Burger','Burger IO'].includes(value));
 const council=person?.dept==='burger'&&Array.isArray(person.specialties)&&
  person.specialties.some(value=>value?.label==='Burgerraad'&&
   /^(ja|behaald|true)$/i.test(String(value.value||'').trim()));
 return council?['Burgerraad',...groups.filter(value=>value!=='Burgerraad')]:groups;
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
/** Verified, display-only Burger rank for existing records.
 * Does not write to Firestore or confer Burgerraad permissions.
 * Never resolves by name and ignores ambiguous duplicate service identities. */
export function overlayVerifiedCitizenRankDisplay(roster,upstream){
 const rows=Array.isArray(roster)?roster:[];
 if(upstream?.status!=='ok'||!(upstream.entries instanceof Map))return rows;
 const counts=new Map();
 const identity=p=>p?.personId||p?.discordId;
 for(const p of rows)if(p?.dept==='burger'&&validId(identity(p)))
  counts.set(identity(p),(counts.get(identity(p))||0)+1);
 return rows.map(p=>{
  const id=identity(p);
  if(p?.dept!=='burger'||!validId(id)||counts.get(id)!==1||
    !upstream.entries.has(id))return p;
  const groups=citizenGroupsForRoles(upstream.entries.get(id));
  if(!groups.length)return p;
  return {...p,rank:groups[0],citizenGroups:groups,
   citizenRoleSource:'discord-api-display'};
 });
}
export function projectCitizenOrganogram(roster,upstream,oauth,guildId,now=Date.now()){
 const rows=overlayVerifiedCitizenRankDisplay(roster,upstream);
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

export function councilRoleIds(upstream){
 if(upstream?.status!=='ok'||!(upstream.entries instanceof Map))return [];
 return [...upstream.entries].filter(([id,ids])=>validId(id)&&
  citizenGroupsForRoles(ids).includes('Burgerraad')).map(([id])=>id).slice(0,150);
}
// An approved existing portal account supplies the visible name for a verified
// council member who has no personnel record in any operational service.
export function projectVerifiedCouncilAccounts(roster,upstream,accounts){
 const rows=Array.isArray(roster)?roster:[];
 const seen=new Set(rows.filter(p=>p?.dept==='burger').map(p=>p.personId));
 const added=[];
 for(const [id,account] of accounts instanceof Map?accounts:[]){
  if(seen.has(id)||!validId(id)||account?.status!=='approved'||
     !citizenGroupsForRoles(upstream?.entries?.get(id)).includes('Burgerraad'))continue;
  const name=String(account.username||'').trim();
  if(!name||name.length>90)continue;
  added.push({dept:'burger',personId:id,name,call:'—',rank:'Burgerraad',
   series:'',status:'',specialties:[],citizenDisplayOnly:true});
  seen.add(id);
 }
 return [...rows,...added];
}
