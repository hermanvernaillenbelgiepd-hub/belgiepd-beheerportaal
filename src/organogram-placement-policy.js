// MAIN organogram display only. Manual metadata NEVER changes authorization, user
// grants, operational rank, board appointments or the personnel master.
export const COLLECTION='bpd_organogram_display_placements';
export const DEPTS=Object.freeze(['politie','brandweer','ambulance','depannage','burger']);
export const DISPLAY_DEPTS=Object.freeze(['bestuur',...DEPTS]);
export const LEADERSHIP_LEVELS=Object.freeze({
 bestuur:[],politie:['Korpsleiding','Officierenkader','Middenkader','Basiskader','Agentenkader'],
 brandweer:['Zoneleiding','Officieren','Middenkader','Basiskader','Stagiairs'],
 ambulance:['DIRMED','HARTS','HVPK','HAMB','ARTS','VPK','AMB','STAG'],
 depannage:['Leiding / AWV'],burger:['Burgerraad']
});
export const SPECIALTIES=Object.freeze({
 bestuur:[],
 politie:['INTERVENTIEDIENST','RADIO/BM','SIGNALISATIE','MOTARD','SEMI ANONIEM',
  'K9','RAGO','RAGO-IO','DISP','TO','AE','RECHERCHE',
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
    Object.keys(body).some(k=>!['boardRole','leadershipTier','teachingRoles','displayLabels','specialties','instructorSpecialties','teacherSpecialties','displayOrder','reason'].includes(k)))
   throw Error('Ongeldige organograminstelling');
 const boardRole=body.boardRole;
 const leadershipTier=body.leadershipTier;
 const displayOrder=body.displayOrder;
 if(!Number.isSafeInteger(displayOrder)||displayOrder<0||displayOrder>999)
  throw Error('Volgorde moet een geheel getal tussen 0 en 999 zijn (0 = automatisch)');
 if(leadershipTier!=='none'&&!LEADERSHIP_LEVELS[dept]?.includes(leadershipTier))
  throw Error('Kies uitsluitend een leidingniveau van deze dienst');
 if(dept==='bestuur'&&((body.teachingRoles||[]).length||(body.displayLabels||[]).length||(body.specialties||[]).length))
  throw Error('Bestuur heeft geen dienstspecialisaties of personeelslabels');
 if(!['none','bestuur','bestuur-ai'].includes(boardRole))throw Error('Kies een geldige bestuursweergave');
 const teachingRoles=body.teachingRoles,specialties=body.specialties;
 const displayLabels=body.displayLabels??[];
 const instructorSpecialties=body.instructorSpecialties??[];
 const teacherSpecialties=body.teacherSpecialties??[];
 const validTeachingList=(list)=>Array.isArray(list)&&list.length<=SPECIALTIES[dept].length&&
  new Set(list).size===list.length&&list.every(x=>typeof x==='string'&&SPECIALTIES[dept].includes(x));
 if(!validTeachingList(instructorSpecialties)||!validTeachingList(teacherSpecialties))
  throw Error('Kies uitsluitend geldige instructeur-/docentspecialisaties van de dienst');
 if(dept==='bestuur'&&(instructorSpecialties.length||teacherSpecialties.length))
  throw Error('Bestuur heeft geen opleidingsspecialisaties');
 if(dept==='politie'&&(instructorSpecialties.includes('RAGO-IO')||teacherSpecialties.includes('RAGO-IO')))
  throw Error('RAGO-IO is een opleidingsstatus, geen instructeursfunctie');
 if(instructorSpecialties.some(x=>!specialties.includes(x))||
    teacherSpecialties.some(x=>!specialties.includes(x)))
  throw Error('Een instructeur of docent moet ook lid zijn van de specialisatie');
 if(!Array.isArray(displayLabels)||displayLabels.length>1||
     displayLabels.some(x=>!['stage','lid'].includes(x))||
     new Set(displayLabels).size!==displayLabels.length)
  throw Error('Kies STAGE of LID als weergavelabel (niet beide)');
 if(!Array.isArray(teachingRoles)||teachingRoles.length>2||
    teachingRoles.some(x=>!['docent','instructeur'].includes(x))||
    new Set(teachingRoles).size!==teachingRoles.length)
   throw Error('Kies docent/instructeur zonder dubbele functies');
 if(!Array.isArray(specialties)||specialties.length>SPECIALTIES[dept].length||
    specialties.some(x=>typeof x!=='string'||!SPECIALTIES[dept].includes(x))||
    new Set(specialties).size!==specialties.length)
   throw Error('Kies uitsluitend specialisaties van deze dienst');
 const reason=strip(body.reason);
 if(reason.length<8||reason.length>300)throw Error('Motivering van 8 tot 300 tekens verplicht');
 return {boardRole,leadershipTier,displayOrder,teachingRoles:[...teachingRoles],displayLabels:[...displayLabels],specialties:[...specialties],
  instructorSpecialties:[...instructorSpecialties],teacherSpecialties:[...teacherSpecialties],reason};
}
// OFF/KL may maintain police specialization *display* only. Other manual
// placement properties (board, tier, global labels and order) are not editable.
export function validatePoliceSpecialtyEdit(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).some(k=>!['specialties','instructorSpecialties','teacherSpecialties','k9Role','motardRole','dispRole','reason'].includes(k)))
  throw Error('Ongeldige specialisatiewijziging');
 const specialties=body.specialties,ins=body.instructorSpecialties,teachers=body.teacherSpecialties;
 const allowed=SPECIALTIES.politie;
 const valid=list=>Array.isArray(list)&&list.length<=allowed.length&&
  list.every(x=>typeof x==='string'&&allowed.includes(x))&&
  new Set(list).size===list.length;
 if(!valid(specialties)||!valid(ins)||!valid(teachers))
  throw Error('Selecteer uitsluitend bestaande politie-specialisaties');
 const withoutInstruction=new Set(['SIGNALISATIE','RADIO/BM','SEMI ANONIEM','RAGO-IO']);
 if([...ins,...teachers].some(x=>withoutInstruction.has(x)))
  throw Error('Deze specialisatie heeft geen instructeur- of docentfunctie');
 if([...ins,...teachers].some(x=>!specialties.includes(x)))
  throw Error('Een instructeur of docent moet ook lid zijn van de specialisatie');
 const k9Role=String(body.k9Role??'');
 if(!['','instructeur','geleider','geleider_in_stage'].includes(k9Role))
  throw Error('Ongeldige K9-functie');
 if(k9Role&&!specialties.includes('K9'))
  throw Error('Selecteer K9-lidmaatschap voor deze functie');
 const motardRole=String(body.motardRole??'');
 if(!['','in_opleiding','volwaardig','instructeur'].includes(motardRole))
  throw Error('Ongeldige MOTARD-functie');
 if(motardRole&&!specialties.includes('MOTARD'))
  throw Error('Selecteer eerst MOTARD-lidmaatschap');
 if(motardRole==='instructeur'&&!ins.includes('MOTARD'))
  throw Error('MOTARD-instructeur vereist de instructeursselectie');
 if(motardRole&&motardRole!=='instructeur'&&ins.includes('MOTARD'))
  throw Error('MOTARD heeft één functieniveau tegelijk');
 const dispRole=String(body.dispRole??'');
 if(!['','in_opleiding','volwaardig','instructeur'].includes(dispRole))
  throw Error('Ongeldige DISP-functie');
 if(dispRole&&!specialties.includes('DISP'))
  throw Error('Selecteer eerst DISP-lidmaatschap');
 if(dispRole==='instructeur'&&!ins.includes('DISP'))
  throw Error('DISP-instructeur vereist de instructeursselectie');
 if(dispRole&&dispRole!=='instructeur'&&ins.includes('DISP'))
  throw Error('DISP heeft één functieniveau tegelijk');
 const reason=strip(body.reason);
 if(reason.length<8||reason.length>300)
  throw Error('Motivering van 8 tot 300 tekens verplicht');
 return {specialties:[...specialties],instructorSpecialties:[...ins],
  teacherSpecialties:[...teachers],k9Role,motardRole,dispRole,reason};
}
export function manualDisplay(raw,dept){
 if(!raw||raw.status!=='active'||raw.dept!==dept)return null;
 const boardRole=['bestuur','bestuur-ai'].includes(raw.boardRole)?raw.boardRole:'none';
 const teachingRoles=Array.isArray(raw.teachingRoles)?[...new Set(raw.teachingRoles.filter(x=>['docent','instructeur'].includes(x)))]:[];
 const displayLabels=Array.isArray(raw.displayLabels)?
  [...new Set(raw.displayLabels.filter(x=>['stage','lid'].includes(x)))].slice(0,1):[];
 const specialties=Array.isArray(raw.specialties)?
  [...new Set(raw.specialties.filter(x=>validStoredSpecialty(dept,x))
    .map(x=>normalizedStoredSpecialty(dept,x)))].slice(0,SPECIALTIES[dept].length):[];
 const leadershipTier=LEADERSHIP_LEVELS[dept]?.includes(raw.leadershipTier)?raw.leadershipTier:'none';
 const displayOrder=Number.isSafeInteger(raw.displayOrder)&&raw.displayOrder>=1&&raw.displayOrder<=999?raw.displayOrder:0;
 const selected=list=>Array.isArray(list)?[...new Set(list.filter(x=>validStoredSpecialty(dept,x))
  .map(x=>normalizedStoredSpecialty(dept,x)))].slice(0,SPECIALTIES[dept].length):[];
 return {boardRole,leadershipTier,displayOrder,teachingRoles,displayLabels,specialties,
  instructorSpecialties:selected(raw.instructorSpecialties),
  teacherSpecialties:selected(raw.teacherSpecialties)};
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
export const RAGO_IO_DISCORD_ROLE='1490841316656156802';
export const MOTARD_IO_DISCORD_ROLE='1365602771855740958';
export const DISP_SELECTION_DISCORD_ROLE='1337852029611016233';
const POLICE_MEMBER_ROLES=Object.freeze({
 '1358148694297415741':'MOTARD',
 '1309532437977497699':'K9',
 '1309532437977497700':'RAGO',
 '1309532438019706963':'DISP',
 '1309542190409580594':'AE',
 '1310674604821581894':'AE',
 '1337775768083632158':'AE',
 '1309532438019706962':'TO',
 '1380843428354592780':'RECHERCHE'
});
// The four current AE roles share one public specialty: AE. Function level
// is derived only from recent, guild-bound verified Discord role snapshots.
export const AE_DISCORD_ROLES=Object.freeze({
 ae_i:'1309542190409580594',
 ae_t:'1310674604821581894',
 teamleader:'1337775768083632158',
 instructeur:'1337156006597103746'
});
export const AE_DISPLAY_LABELS=Object.freeze({
 ae_i:'AE-I',ae_t:'AE-T',
 teamleader:'TEAMLEADER / LEIDING',instructeur:'AE-INSTRUCTEUR'
});
export const BOARD_DISCORD_ROLE='1309532438082355251';
export function verifiedSyncRoles(identity,dept,guildId,now=Date.now()){
 if(!identity||!DISPLAY_DEPTS.includes(dept)||!ID.test(guildId)||
    identity.guildId!==guildId||!Number.isSafeInteger(identity.verifiedAt)||
    identity.verifiedAt>now+60000||now-identity.verifiedAt>7*86400000||
    !Array.isArray(identity.roleIds)||identity.roleIds.some(x=>!ID.test(x)))
  return {boardRole:'none',teachingRoles:[],specialties:[],instructorSpecialties:[],
    teacherSpecialties:[],aeRoles:[],aeTeamleader:false,aeRole:'',synced:false};
 const roles=new Set(identity.roleIds);
 const aeRoles=dept==='politie'?Object.entries(AE_DISCORD_ROLES)
  .filter(([,id])=>roles.has(id)).map(([label])=>label):[];
 const aeRole=aeRoles.includes('teamleader')?'teamleader':
  aeRoles.includes('instructeur')?'instructeur':
  aeRoles.includes('ae_t')?'ae_t':aeRoles.includes('ae_i')?'ae_i':'';
 const instructorNames=Object.entries(INSTRUCTORS[dept]||{})
  .filter(([id])=>roles.has(id)).map(([,name])=>name);
 const memberNames=dept==='politie'?Object.entries(POLICE_MEMBER_ROLES)
  .filter(([id])=>roles.has(id)).map(([,name])=>name):[];
 // RAGO-IO is a training membership only, NOT the full RAGO unit role.
 // Existing RAGO full members may retain their trainee role in Discord.
 if(dept==='politie'&&roles.has(RAGO_IO_DISCORD_ROLE)&&
    !memberNames.includes('RAGO')&&!instructorNames.includes('RAGO'))
  memberNames.push('RAGO-IO');
 // MOTARD trainee role is display-only and does not constitute full training.
 if(dept==='politie'&&roles.has(MOTARD_IO_DISCORD_ROLE)&&
    !memberNames.includes('MOTARD')&&!instructorNames.includes('MOTARD'))
  memberNames.push('MOTARD');
 // Dispatch Selectie is in training only; never classified as full DISP.
 if(dept==='politie'&&roles.has(DISP_SELECTION_DISCORD_ROLE)&&
    !memberNames.includes('DISP')&&!instructorNames.includes('DISP'))
  memberNames.push('DISP');
 return {boardRole:roles.has(BOARD_DISCORD_ROLE)?'bestuur':'none',
  teachingRoles:instructorNames.length?['instructeur']:[],
  instructorSpecialties:instructorNames.filter(x=>SPECIALTIES[dept]?.includes(x)),
  teacherSpecialties:[],aeRoles,aeTeamleader:aeRoles.includes('teamleader'),aeRole,
  specialties:[...new Set([...instructorNames,...memberNames])]
   .filter(x=>SPECIALTIES[dept]?.includes(x)),
  synced:true};
}
export function mergePlacement(person,manual,auto){
 // Explicit manual entries supplement verified roles, never grant rights.
 const specialtyValues=Array.isArray(person.specialties)?
  person.specialties.filter(x=>x&&typeof x.label==='string'&&
   (/^(ja|behaald|voltooid|geslaagd|true)$/i.test(strip(x.value))||
     (person.dept==='politie'&&x.label==='AE'&&/^(instructeur|leiding|teamleader|ae[-_ ]?[it])$/i.test(strip(x.value))))&&
   validStoredSpecialty(person.dept,x.label))
    .map(x=>normalizedStoredSpecialty(person.dept,x.label)):[];
 const boardRole=manual?.boardRole&&manual.boardRole!=='none'?
  manual.boardRole:auto?.boardRole||'none';
 return {dept:person.dept,name:strip(person.name).slice(0,90),
  call:strip(person.call).slice(0,24),rank:strip(person.rank).slice(0,95),
  boardRole,leadershipTier:manual?.leadershipTier||'none',displayOrder:manual?.displayOrder||0,
  teachingRoles:[...new Set([...(manual?.teachingRoles||[]),...(auto?.teachingRoles||[])])],
  displayLabels:[...(manual?.displayLabels||[])],
  aeRole:auto?.aeRole||'',aeRoles:auto?.aeRoles||[],aeTeamleader:auto?.aeTeamleader===true,
  instructorSpecialties:[...new Set([...(manual?.instructorSpecialties||[]),
   ...(auto?.instructorSpecialties||[])].map(label=>normalizedStoredSpecialty(person.dept,label)))].slice(0,SPECIALTIES[person.dept]?.length||12),
  teacherSpecialties:[...new Set([...(manual?.teacherSpecialties||[]),
   ...(auto?.teacherSpecialties||[])].map(label=>normalizedStoredSpecialty(person.dept,label)))].slice(0,SPECIALTIES[person.dept]?.length||12),
  specialties:(()=>{
   const found=[...new Set([...(manual?.specialties||[]),...(auto?.specialties||[]),...specialtyValues]
    .map(label=>normalizedStoredSpecialty(person.dept,label)))];
   // A verified full RAGO specialization supersedes its IO training badge.
   return found.filter(label=>label!=='RAGO-IO'||!found.includes('RAGO')).slice(0,SPECIALTIES[person.dept]?.length||12);
  })(),
  source:manual&&auto?.synced?'handmatig + Discord':manual?'handmatig':auto?.synced?'Discord':'personeelslijst'};
}
export const canManagePlacements=actor=>actor?.role==='beheerder'&&
 typeof actor?.uid==='string'&&actor.uid.length>0;
