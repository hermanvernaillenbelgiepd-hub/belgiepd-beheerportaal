// TEST organogram only. Manual metadata NEVER changes authorization, user
// grants, operational rank, board appointments or the personnel master.
export const COLLECTION='bpd_organogram_display_placements';
export const DEPTS=Object.freeze(['politie','brandweer','ambulance','depannage','burger']);
export const DISPLAY_DEPTS=Object.freeze(['bestuur',...DEPTS]);
export const SPECIALTIES=Object.freeze({
 bestuur:[],
 politie:['Motor','SIV/WPR','K9','RAGO','Dispatch','AE','Radio BM','Signalisatie','TO','Prioritair rijden','EHBO'],
 brandweer:['Duiker','Ladderwagen','Logistiek','Signalisatie','RED team','Gevaarlijke stoffen','Bosbestrijding'],
 ambulance:['MIP','HELI','PIT','PIT-MOTOR','Medicatie','Basis TR'],
 depannage:['F.A.S.T','CRANE','Wegenwerken','LSRA','Signalisatie'],
 burger:['Burgerproject','Burger IO']
});
const ID=/^\d{15,22}$/;
const strip=v=>String(v??'').trim();
export const personKey=(dept,id)=>DISPLAY_DEPTS.includes(dept)&&ID.test(String(id||''))?dept+'_'+id:null;
export function validatePlacement(body,dept){
 if(!DISPLAY_DEPTS.includes(dept)||!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['boardRole','teachingRoles','specialties','reason'].includes(k)))
   throw Error('Ongeldige organograminstelling');
 const boardRole=body.boardRole;
 if(dept==='bestuur'&&boardRole==='none')throw Error('Kies een bestuursfunctie');
 if(dept==='bestuur'&&((body.teachingRoles||[]).length||(body.specialties||[]).length))throw Error('Bestuur heeft geen dienstspecialisaties');
 if(!['none','bestuur','bestuur-ai'].includes(boardRole))throw Error('Kies een geldige bestuursweergave');
 const teachingRoles=body.teachingRoles,specialties=body.specialties;
 if(!Array.isArray(teachingRoles)||teachingRoles.length>2||
    teachingRoles.some(x=>!['docent','instructeur'].includes(x))||
    new Set(teachingRoles).size!==teachingRoles.length)
   throw Error('Kies docent/instructeur zonder dubbele functies');
 if(!Array.isArray(specialties)||specialties.length>12||
    specialties.some(x=>typeof x!=='string'||!SPECIALTIES[dept].includes(x))||
    new Set(specialties).size!==specialties.length)
   throw Error('Kies uitsluitend specialisaties van deze dienst');
 const reason=strip(body.reason);
 if(reason.length<8||reason.length>300)throw Error('Motivering van 8 tot 300 tekens verplicht');
 return {boardRole,teachingRoles:[...teachingRoles],specialties:[...specialties],reason};
}
export function manualDisplay(raw,dept){
 if(!raw||raw.status!=='active'||raw.dept!==dept)return null;
 const boardRole=['bestuur','bestuur-ai'].includes(raw.boardRole)?raw.boardRole:'none';
 const teachingRoles=Array.isArray(raw.teachingRoles)?[...new Set(raw.teachingRoles.filter(x=>['docent','instructeur'].includes(x)))]:[];
 const specialties=Array.isArray(raw.specialties)?
  [...new Set(raw.specialties.filter(x=>SPECIALTIES[dept]?.includes(x)))].slice(0,12):[];
 return {boardRole,teachingRoles,specialties};
}
const INSTRUCTORS=Object.freeze({
 politie:Object.freeze({
  '1359656762289946755':'Motor','1345302115689431061':'K9',
  '1393050551188721865':'RAGO','1337156006597103746':'AE',
  '1393050971604516904':'Dispatch'}),
 brandweer:Object.freeze({'1309532437952466989':'Basis TR'}),
 ambulance:Object.freeze({'1309532437952466988':'MIP'}),
 depannage:Object.freeze({}),burger:Object.freeze({})
});
export const BOARD_DISCORD_ROLE='1309532438082355251';
export function verifiedSyncRoles(identity,dept,guildId,now=Date.now()){
 if(!identity||!DISPLAY_DEPTS.includes(dept)||!ID.test(guildId)||
    identity.guildId!==guildId||!Number.isSafeInteger(identity.verifiedAt)||
    identity.verifiedAt>now+60000||now-identity.verifiedAt>7*86400000||
    !Array.isArray(identity.roleIds)||identity.roleIds.some(x=>!ID.test(x)))
  return {boardRole:'none',teachingRoles:[],specialties:[],synced:false};
 const roles=new Set(identity.roleIds);
 const instructorNames=Object.entries(INSTRUCTORS[dept]||{})
  .filter(([id])=>roles.has(id)).map(([,name])=>name);
 return {boardRole:roles.has(BOARD_DISCORD_ROLE)?'bestuur':'none',
  teachingRoles:instructorNames.length?['instructeur']:[],
  specialties:instructorNames.filter(x=>SPECIALTIES[dept]?.includes(x)),
  synced:true};
}
export function mergePlacement(person,manual,auto){
 // Explicit manual entries supplement verified roles, never grant rights.
 const specialtyValues=Array.isArray(person.specialties)?
  person.specialties.filter(x=>x&&typeof x.label==='string'&&
   /^(ja|behaald|voltooid|geslaagd|true)$/i.test(strip(x.value))&&
   SPECIALTIES[person.dept]?.includes(x.label)).map(x=>x.label):[];
 const boardRole=manual?.boardRole&&manual.boardRole!=='none'?
  manual.boardRole:auto?.boardRole||'none';
 return {dept:person.dept,name:strip(person.name).slice(0,90),
  call:strip(person.call).slice(0,24),rank:strip(person.rank).slice(0,95),
  boardRole,teachingRoles:[...new Set([...(manual?.teachingRoles||[]),...(auto?.teachingRoles||[])])],
  specialties:[...new Set([...(manual?.specialties||[]),...(auto?.specialties||[]),...specialtyValues])].slice(0,12),
  source:manual&&auto?.synced?'handmatig + Discord':manual?'handmatig':auto?.synced?'Discord':'personeelslijst'};
}
export const canManagePlacements=actor=>actor?.role==='beheerder'&&
 typeof actor?.uid==='string'&&actor.uid.length>0;
