export const FIRE_ROLES=Object.freeze({member:'1309532438053130324',middle:'1554906632897560787',leadership:'1395115819020714105',teacher:'1309532437952466989'});
export const FIRE_COURSES=Object.freeze([
{name:'Logistiek / Signalisatie',roleId:'1309532437952466986'},
{name:'Ladderwagen',roleId:'1399000349037166664'},
{name:'Duiker',roleId:'1309532437952466985'},
{name:'Bosbestrijding',roleId:'1399006120965570670'},
{name:'Brandweer-AMBU',roleId:'1466508322566967609'},
{name:'RED-TEAM',roleId:null},
{name:'Gevaarlijke stoffen',roleId:null},
{name:'Basistraining',roleId:null}
]);
const ID=new RegExp('^[0-9]{15,22}$');
export function verifiedFireRoles(member,guildId,now=Date.now()){
 if(!ID.test(String(guildId||''))||!member||member.guildId!==guildId||
 !Number.isSafeInteger(member.verifiedAt)||member.verifiedAt>now||
 now-member.verifiedAt>15*60*1000||!Array.isArray(member.roleIds)||
 !member.roleIds.every(id=>ID.test(id)))return null;
 return new Set(member.roleIds);
}
export function fireSubjectClass(subject,roles){
 if(!subject||subject.dept!=='brandweer')return 'none';
 if(!roles)return 'unverified';
 if(roles.has(FIRE_ROLES.leadership))return 'leadership';
 if(roles.has(FIRE_ROLES.middle))return 'middle';
 if(roles.has(FIRE_ROLES.member))return 'member';
 const label=String(subject.call||'')+' '+String(subject.rank||'');
 return /STAG/i.test(label)?'trainee':'unverified';
}
export function fireActorClass(actor,roles){
 if(!actor?.departments?.includes('brandweer'))return 'none';
 if(actor.fireZoneChief===true)return 'zone';
 if(!roles)return 'none';
 if(roles.has(FIRE_ROLES.leadership))return 'leadership';
 if(roles.has(FIRE_ROLES.middle))return 'middle';
 return 'none';
}
export function mayOpenFireSubject(actor,subject,subjectRoles){
 if(actor?.boardPersonnelAdmin===true||actor?.fireZoneChief===true)return true;
 return ['leadership','middle'].includes(actor?.fireAccessLevel)&&
 ['member','trainee'].includes(fireSubjectClass(subject,subjectRoles));
}
export function fireRecordVisibility(actor,subject,subjectRoles){
 if(!mayOpenFireSubject(actor,subject,subjectRoles))return 'none';
 if(actor?.fireZoneChief===true||actor?.boardPersonnelAdmin===true)return 'full';
 return actor?.fireAccessLevel==='leadership'?'leadership':'identity';
}
export function fireMayCreate(actor,subject,subjectRoles,type){
 const scope=fireRecordVisibility(actor,subject,subjectRoles);
 if(actor?.boardPersonnelAdmin===true&&!actor?.fireZoneChief)return false;
 return scope==='identity'?type==='observatie':
 scope==='leadership'||scope==='full'?['observatie','notitie','sanctie'].includes(type):false;
}
