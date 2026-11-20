import {roleForDepartment} from './leave-policy.js';
import {TRAINING_ROLE_IDS} from './role-catalog.js';

export const DOCUMENT_DEPARTMENTS=Object.freeze([
  'politie','brandweer','ambulance','depannage','burger','multidisciplinair'
]);
const SERVICES=DOCUMENT_DEPARTMENTS.filter(x=>x!=='multidisciplinair');
const CADRE=new Set(['middenkader','officierenkader','korpsleiding']);
const COMMAND=new Set(['officierenkader','korpsleiding']);
const ID=/^\d{15,22}$/;
const all=()=>[...DOCUMENT_DEPARTMENTS];

export function verifiedDocumentRoles(member,guildId,now=Date.now()){
  if(!ID.test(guildId)||member?.guildId!==guildId||
     !Number.isSafeInteger(member.verifiedAt)||member.verifiedAt>now||
     now-member.verifiedAt>24*60*60*1000||
     !Array.isArray(member.roleIds)||member.roleIds.length>500||
     !member.roleIds.every(x=>typeof x==='string'&&ID.test(x)))return [];
  return [...new Set(member.roleIds)];
}

// Portal identity and service memberships have already passed independent server
// approval and lifecycle checks. A temporary callsign or missing roster row
// may NEVER prevent reading a handbook intended for verified service members.
export function documentScopes(actor,roster,verifiedRoleIds=[]){
  const empty={read:[],write:[],manage:[],review:[],members:[],instructors:[],
    manualReaderId:null};
  if(!actor||!ID.test(actor.discordId)||!Array.isArray(actor.departments)||
     !Array.isArray(roster))return empty;
  const manualReaderId=actor.discordId;
  const technical=actor.portalTechnicalMode===true&&
    actor.profileTechnicalAvailable===true&&actor.uid==='discord:'+actor.discordId;
  const unique=(dept)=>actor.departments.includes(dept)&&
    roster.filter(p=>p.dept===dept&&p.personId===actor.discordId).length===1;
  // Approval is limited to verified police Officierenkader and Korpsleiding.
  // Technical/admin access can maintain records, but cannot approve a service
  // leader's draft without also holding a current police officer appointment.
  const highPolice=unique('politie')&&COMMAND.has(roleForDepartment(actor,'politie'));
  if(highPolice)return {read:all(),write:all(),manage:all(),review:all(),
    members:all(),instructors:all(),manualReaderId};
  if(technical||actor.boardPersonnelAdmin===true||actor.role==='beheerder')
    return {read:all(),write:all(),manage:all(),review:[],
      members:all(),instructors:all(),manualReaderId};
  const members=SERVICES.filter(d=>actor.departments.includes(d));
  if(members.length)members.push('multidisciplinair');
  const verified=new Set(verifiedRoleIds),instructors=[],write=[];
  for(const dept of SERVICES){
    if(!unique(dept))continue;
    const cadre=CADRE.has(roleForDepartment(actor,dept));
    const leadership=(TRAINING_ROLE_IDS[dept]?.leadership||[]).some(id=>verified.has(id));
    const instructor=(TRAINING_ROLE_IDS[dept]?.instructors||[]).some(id=>verified.has(id));
    if(cadre||leadership)write.push(dept);
    if(cadre||leadership||instructor)instructors.push(dept);
  }
  if(instructors.length)instructors.push('multidisciplinair');
  return {read:[...new Set([...members,...instructors])],write,manage:[],review:[],
    members,instructors,manualReaderId};
}

export function mayReadDocument(scopes,entry){
  if(!entry||entry.status!=='active')return false;
  const dept=entry.department;
  if(!DOCUMENT_DEPARTMENTS.includes(dept))return false;
  if(scopes.manage?.includes(dept))return true;
  const manual=ID.test(scopes.manualReaderId)&&
    Array.isArray(entry.readerIds)&&entry.readerIds.includes(scopes.manualReaderId);
  if(manual)return true;
  if(!scopes.read?.includes(dept))return false;
  switch(entry.audience){
    case 'leden':return scopes.members?.includes(dept)===true;
    case 'instructeurs':return scopes.instructors?.includes(dept)===true;
    case 'leiding':return scopes.write?.includes(dept)===true||
      (dept==='multidisciplinair'&&scopes.write?.length>0);
    case 'toegewezen':return false;
    default:return false;
  }
}
export function mayWriteDocuments(scopes,department){
  return DOCUMENT_DEPARTMENTS.includes(department)&&scopes.write?.includes(department)===true;
}
// Published files are permanently owned by BelgiumPD, not by their uploader.
export function mayManageDocuments(scopes,department){
  return DOCUMENT_DEPARTMENTS.includes(department)&&scopes.manage?.includes(department)===true;
}

export function mayApproveDocuments(scopes,department){
  return DOCUMENT_DEPARTMENTS.includes(department)&&
    scopes.review?.includes(department)===true;
}
// Never use audience membership as a substitute for review/author ownership:
// a pending item is NOT a published handbook.
export function mayInspectPendingDocument(scopes,entry,actorUid){
  return entry?.status==='pending'&&
    (mayApproveDocuments(scopes,entry.department)||
      (entry.uploadedBy===actorUid&&
       scopes.read?.includes(entry.department)===true));
}
