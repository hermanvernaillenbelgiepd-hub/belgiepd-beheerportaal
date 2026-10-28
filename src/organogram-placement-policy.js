// TEST organogram only. Manual metadata NEVER changes authorization, user
// grants, operational rank, board appointments or the personnel master.
export const COLLECTION='bpd_organogram_display_placements';
export const DEPTS=Object.freeze(['politie','brandweer','ambulance','depannage','burger']);
export const DISPLAY_DEPTS=Object.freeze(['bestuur',...DEPTS]);
export const LEADERSHIP_LEVELS=Object.freeze({
 bestuur:[],politie:['Korpsleiding','Officierenkader','Middenkader'],
 brandweer:['Zoneleiding','Officieren','Middenkader'],
 ambulance:['AZLS-leiding','Medische coördinatie'],
 depannage:['Leiding / AWV'],burger:['Burgerraad']
});
export const SPECIALTIES=Object.freeze({
 bestuur:[],
 politie:['INTERVENTIEDIENST','RADIO/BM','SIGNALISATIE','MOTARD','SEMI ANONIEM',
  'K9','RAGO','DISP','TO','AE','RECHERCHE',
  // Historical specializations not silently deleted when an existing record is edited.
  'Prioritair rijden','EHBO'],
 brandweer:['Duiker','Ladderwagen','Logistiek','Signalisatie','RED team','Gevaarlijke stoffen','Bosbestrijding'],
 ambulance:['MIP','HELI','PIT','PIT-MOTOR','Medicatie','Basis TR'],
 depannage:['F.A.S.T','CRANE','Wegenwerken','LSRA','Signalisatie'],
 burger:['Burgerproject','Burger IO']
});
// Historic manual labels remain readable but are not offered for new assignments.
// The display model maps them to the new stable BelgiumPD police branches.
const LEGACY_POLICE_SPECIALTIES=Object.freeze([
 'Motor','SIV/WPR','Dispatch','Radio BM','Signalisatie',
 'Motard','Semi-anoniem','Semi-anonieme','K-9','Lokale Recherche',
 'Prioritair rijden','EHBO'
]);
const POLICE_DISPLAY_ALIASES=new Map([
 ['Motor','MOTARD'],['Motard','MOTARD'],
 ['SIV/WPR','SIGNALISATIE'],['Signalisatie','SIGNALISATIE'],
 ['Dispatch','DISP'],['Radio BM','RADIO/BM'],
 ['Semi-anoniem','SEMI ANONIEM'],['Semi-anonieme','SEMI ANONIEM'],
 ['K-9','K9'],['Lokale Recherche','RECHERCHE']
]);
const normalizedStoredSpecialty=(dept,label)=>
 dept==='politie'?(POLICE_DISPLAY_ALIASES.get(label)||label):label;
const validStoredSpecialty=(dept,label)=>SPECIALTIES[dept]?.includes(label)||
 (dept==='politie'&&LEGACY_POLICE_SPECIALTIES.includes(label));
const ID=/^\d{15,22}$/;
const strip=v=>String(v??'').trim();
export const personKey=(dept,id)=>DISPLAY_DEPTS.includes(dept)&&ID.test(String(id||''))?dept+'_'+id:null;
export function validatePlacement(body,dept){
 if(!DISPLAY_DEPTS.includes(dept)||!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['boardRole','leadershipTier','teachingRoles','specialties','reason'].includes(k)))
   throw Error('Ongeldige organograminstelling');
 const boardRole=body.boardRole;
 const leadershipTier=body.leadershipTier;
 if(leadershipTier!=='none'&&!LEADERSHIP_LEVELS[dept]?.includes(leadershipTier))
  throw Error('Kies uitsluitend een leidingniveau van deze dienst');
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
 return {boardRole,leadershipTier,teachingRoles:[...teachingRoles],specialties:[...specialties],reason};
}
export function manualDisplay(raw,dept){
 if(!raw||raw.status!=='active'||raw.dept!==dept)return null;
 const boardRole=['bestuur','bestuur-ai'].includes(raw.boardRole)?raw.boardRole:'none';
 const teachingRoles=Array.isArray(raw.teachingRoles)?[...new Set(raw.teachingRoles.filter(x=>['docent','instructeur'].includes(x)))]:[];
 const specialties=Array.isArray(raw.specialties)?
  [...new Set(raw.specialties.filter(x=>validStoredSpecialty(dept,x))
    .map(x=>normalizedStoredSpecialty(dept,x)))].slice(0,12):[];
 const leadershipTier=LEADERSHIP_LEVELS[dept]?.includes(raw.leadershipTier)?raw.leadershipTier:'none';
 return {boardRole,leadershipTier,teachingRoles,specialties};
}
const INSTRUCTORS=Object.freeze({
 politie:Object.freeze({
  '1359656762289946755':'MOTARD','1345302115689431061':'K9',
  '1393050551188721865':'RAGO','1337156006597103746':'AE',
  '1393050971604516904':'DISP'}),
 brandweer:Object.freeze({'1309532437952466989':'Basis TR'}),
 ambulance:Object.freeze({'1309532437952466988':'MIP'}),
 depannage:Object.freeze({}),burger:Object.freeze({})
});
// Known full-membership Discord roles. We deliberately exclude training-only
// IO/selection roles and never assume somebody belongs to an unverified unit.
const POLICE_MEMBER_ROLES=Object.freeze({
 '1358148694297415741':'MOTARD',
 '1309532437977497699':'K9',
 '1309532437977497700':'RAGO',
 '1309532438019706963':'DISP',
 '1309542190409580594':'AE',
 '1310674604821581894':'AE',
 '1309532438019706962':'TO',
 '1380843428354592780':'RECHERCHE'
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
 const memberNames=dept==='politie'?Object.entries(POLICE_MEMBER_ROLES)
  .filter(([id])=>roles.has(id)).map(([,name])=>name):[];
 return {boardRole:roles.has(BOARD_DISCORD_ROLE)?'bestuur':'none',
  teachingRoles:instructorNames.length?['instructeur']:[],
  specialties:[...new Set([...instructorNames,...memberNames])]
   .filter(x=>SPECIALTIES[dept]?.includes(x)),
  synced:true};
}
export function mergePlacement(person,manual,auto){
 // Explicit manual entries supplement verified roles, never grant rights.
 const specialtyValues=Array.isArray(person.specialties)?
  person.specialties.filter(x=>x&&typeof x.label==='string'&&
   /^(ja|behaald|voltooid|geslaagd|true)$/i.test(strip(x.value))&&
   validStoredSpecialty(person.dept,x.label))
    .map(x=>normalizedStoredSpecialty(person.dept,x.label)):[];
 const boardRole=manual?.boardRole&&manual.boardRole!=='none'?
  manual.boardRole:auto?.boardRole||'none';
 return {dept:person.dept,name:strip(person.name).slice(0,90),
  call:strip(person.call).slice(0,24),rank:strip(person.rank).slice(0,95),
  boardRole,leadershipTier:manual?.leadershipTier||'none',teachingRoles:[...new Set([...(manual?.teachingRoles||[]),...(auto?.teachingRoles||[])])],
  specialties:[...new Set([...(manual?.specialties||[]),...(auto?.specialties||[]),...specialtyValues]
   .map(label=>normalizedStoredSpecialty(person.dept,label)))].slice(0,12),
  source:manual&&auto?.synced?'handmatig + Discord':manual?'handmatig':auto?.synced?'Discord':'personeelslijst'};
}
export const canManagePlacements=actor=>actor?.role==='beheerder'&&
 typeof actor?.uid==='string'&&actor.uid.length>0;
