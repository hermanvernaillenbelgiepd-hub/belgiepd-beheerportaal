import {roleForDepartment} from './leave-policy.js';
import {TRAINING_ROLE_IDS} from './role-catalog.js';

// Never grant rights from a client-supplied rank, callsign or Discord role ID.
export const DOCUMENT_DEPARTMENTS=Object.freeze([
  'politie','brandweer','ambulance','depannage','burger','multidisciplinair'
]);
const INTERNAL=DOCUMENT_DEPARTMENTS.filter(x=>x!=='multidisciplinair');
const CADRE=new Set(['middenkader','officierenkader','korpsleiding']);
const COMMAND=new Set(['officierenkader','korpsleiding']);
const ID=/^\d{15,22}$/;

export function verifiedDocumentRoles(member,guildId,now=Date.now()){
  if(!ID.test(guildId)||member?.guildId!==guildId||
     !Number.isSafeInteger(member.verifiedAt)||member.verifiedAt>now||
     now-member.verifiedAt>24*60*60*1000||
     !Array.isArray(member.roleIds)||member.roleIds.length>500||
     !member.roleIds.every(x=>typeof x==='string'&&ID.test(x)))return [];
  return [...new Set(member.roleIds)];
}
export function documentScopes(actor,roster,verifiedRoleIds=[]){
  const empty={read:[],write:[]};
  if(!actor||!ID.test(actor.discordId)||!Array.isArray(actor.departments)||
     !Array.isArray(roster))return empty;
  const technical=actor.portalTechnicalMode===true&&
    actor.profileTechnicalAvailable===true&&actor.uid==='discord:'+actor.discordId;
  if(technical||actor.boardPersonnelAdmin===true||actor.role==='beheerder')
    return {read:[...DOCUMENT_DEPARTMENTS],write:[...DOCUMENT_DEPARTMENTS]};
  const unique=(dept)=>actor.departments.includes(dept)&&
    roster.filter(p=>p.dept===dept&&p.personId===actor.discordId).length===1;
  const highPolice=unique('politie')&&COMMAND.has(roleForDepartment(actor,'politie'));
  if(highPolice)return {read:[...DOCUMENT_DEPARTMENTS],write:[...DOCUMENT_DEPARTMENTS]};
  const read=[],write=[];
  const verified=new Set(verifiedRoleIds);
  for(const dept of INTERNAL){
    if(!unique(dept))continue;
    const cadre=CADRE.has(roleForDepartment(actor,dept));
    const leadership=(TRAINING_ROLE_IDS[dept]?.leadership||[]).some(id=>verified.has(id));
    const instructor=(TRAINING_ROLE_IDS[dept]?.instructors||[]).some(id=>verified.has(id));
    if(cadre||leadership)write.push(dept);
    if(cadre||leadership||instructor)read.push(dept);
  }
  // Global documents are readable by verified instructors and leadership
  // across services but writable only by centrally authorised command.
  if(read.length)read.push('multidisciplinair');
  return {read,write};
}
export function mayReadDocument(scopes,entry){
  return !!entry&&entry.status==='active'&&
    scopes.read.includes(entry.department)&&
    (entry.audience!=='leiding'||scopes.write.includes(entry.department)||
      entry.department==='multidisciplinair'&&scopes.write.length>0);
}
export function mayWriteDocuments(scopes,department){
  return DOCUMENT_DEPARTMENTS.includes(department)&&scopes.write.includes(department);
}
