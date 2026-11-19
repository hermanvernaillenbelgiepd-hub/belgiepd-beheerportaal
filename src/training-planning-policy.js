import {roleForDepartment} from './leave-policy.js';
import {personSeries} from './training-request-policy.js';
import {pathwaySpecialtyLabels,keyName} from './training-pathway-policy.js';
import {TRAINING_REQUEST_COURSE_CATALOG} from '../public/training-course-catalog.js';

export const PLANNING_ASSIGNMENTS='bpd_training_planning_assignments';
export const PLANNING_CONFIG='bpd_training_planning_configuration';
export const PLANNING_STATUSES=Object.freeze(['uitgenodigd','ingepland','in_opleiding','geannuleerd']);
export const PLANNING_TRACKS=Object.freeze([
 {id:'politie:k9',department:'politie',label:'K-9',roleIds:['1345302115689431061'],courses:['K-9'],tokens:['K9','K-9']},
 {id:'politie:dispatch',department:'politie',label:'Dispatch',roleIds:['1393050971604516904'],courses:['DISPATCH'],tokens:['DISPATCH']},
 {id:'politie:rago',department:'politie',label:'RAGO',roleIds:['1393050551188721865'],courses:['RAGO'],tokens:['RAGO']},
 {id:'politie:motard',department:'politie',label:'Motard',roleIds:['1359656762289946755'],courses:['MOTARD','MOTARD-OFF ROAD'],tokens:['MOTARD','MOTOR']},
 {id:'politie:ae',department:'politie',label:'AE',roleIds:['1337156006597103746','1337775768083632158'],courses:['ERT AE-I','ERT AE-T','ERT-AE-F'],tokens:['AE','AE-I','AE-T','AE-F','SRT','DSU']},
 {id:'ambulance:algemeen',department:'ambulance',label:'Ambulanceopleidingen',roleIds:['1309532437952466988'],
   courses:[...(TRAINING_REQUEST_COURSE_CATALOG.ambulance||[])],tokens:[]},
 {id:'brandweer:algemeen',department:'brandweer',label:'Brandweeropleidingen',roleIds:['1309532437952466989'],
   courses:[...(TRAINING_REQUEST_COURSE_CATALOG.brandweer||[])],tokens:[]},
 {id:'depannage:algemeen',department:'depannage',label:'Depannageopleidingen',roleIds:[],
   courses:[...(TRAINING_REQUEST_COURSE_CATALOG.depannage||[])],tokens:[]}
]);
// AE-I, AE-T and leadership use verified exact role IDs. AE-F has
// no confirmed Discord role here; it requires an explicit roster level.
export const AE_ROLE_VARIANTS=Object.freeze({
 '1309542190409580594':'AE-I',
 '1310674604821581894':'AE-T',
 '1337156006597103746':'instructeur',
 '1337775768083632158':'leiding'
});
export function planningAEVariants(person,verifiedRoleIds=[]){
 const found=new Set();
 const roles=[...(Array.isArray(verifiedRoleIds)?verifiedRoleIds:[])];
 for(const item of (Array.isArray(person?.specialties)?person.specialties:[])){
   if(item?.source==='discord-verified'&&typeof item.roleId==='string')
     roles.push(item.roleId);
   if(!item||typeof item!=='object')continue;
   if(!/^AE(?:$|[\s_/-])/i.test(String(item.label||'')))continue;
   const status=String(item.value||'').trim().toLocaleLowerCase('nl-BE');
   if(['','nee','neen','niet ingevuld','niet gecontroleerd','n.v.t.','nvt'].includes(status))
     continue;
   found.add('AE');
   const label=[item.label,item.level,item.value].join(' ').toLocaleUpperCase('nl-BE');
   if(/\bAE[\s-]?I\b|\bSRT\b/.test(label))found.add('AE-I');
   if(/\bAE[\s-]?T\b|\bDSU\b/.test(label))found.add('AE-T');
   if(/\bAE[\s-]?F\b/.test(label))found.add('AE-F');
   if(/INSTRUCTEUR/.test(label))found.add('instructeur');
   if(/TEAMLEADER|LEIDING/.test(label))found.add('leiding');
 }
 for(const id of roles){
   if(Object.hasOwn(AE_ROLE_VARIANTS,id)){
     found.add('AE');found.add(AE_ROLE_VARIANTS[id]);
   }
 }
 return [...found];
}
const DISCORD_ID=/^\d{15,22}$/;
const V=/[<>\x00-\x1f\x7f]/;
const dayValid=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export function planningTrack(id){return PLANNING_TRACKS.find(t=>t.id===id)||null}
export function planningManager(actor,track,verifiedRoleIds=[]){
 if(!actor||!track||!Array.isArray(actor.departments)||
    !actor.departments.includes(track.department)||
    !DISCORD_ID.test(String(actor.discordId||''))||
    actor.uid!=='discord:'+actor.discordId)return false;
 const role=roleForDepartment(actor,track.department);
 if(['middenkader','officierenkader','korpsleiding'].includes(role))return true;
 return Array.isArray(verifiedRoleIds)&&track.roleIds.some(id=>verifiedRoleIds.includes(id));
}
export function planningConfigurator(actor,track){
 if(!planningManager(actor,track,[]))return false;
 return ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,track.department));
}
export function planningOwnMembership(actor,roster,department){
 return Array.isArray(roster)&&roster.filter(p=>p.personId===actor?.discordId&&
   p.dept===department&&!['pending','archived'].includes(p.lifecycleState)).length===1;
}
export function eligiblePlanningMembers(roster,department,zone=''){
 if(!Array.isArray(roster))return [];
 const all=roster.filter(p=>p?.dept===department&&
    DISCORD_ID.test(String(p.personId||''))&&!['archived','pending'].includes(p.lifecycleState)&&
    (!zone||keyName(p.zone||p.fireZone||p.zoneName||'')===keyName(zone)));
 const counts=new Map();
 for(const p of all)counts.set(p.personId,(counts.get(p.personId)||0)+1);
 return all.filter(p=>counts.get(p.personId)===1);
}
export function planningCourseAllowed(course,track,config={}){
 if(!track||typeof course!=='string')return false;
 const allowed=[...track.courses,...(Array.isArray(config.extraCourses)?config.extraCourses:[])];
 return allowed.some(c=>keyName(c)===keyName(course));
}
export function planningAudienceMatch(person,track,audience,verifiedRoleIds=[]){
 if(!person||!track||!audience)return false;
 const kind=audience.kind,value=String(audience.value||'').trim();
 if(kind==='alle')return true;
 if(kind==='rang')return Boolean(value)&&[person.rank,person.kader].some(x=>keyName(x)===keyName(value));
 if(kind==='reeks'){
   const hit=value.match(/^(?:reeks\s*)?0?([1-9]\d?)$/i);
   return Boolean(hit&&personSeries(person)===hit[1].padStart(2,'0'));
 }
 const variants=track.id==='politie:ae'?planningAEVariants(person,verifiedRoleIds):[];
 const labels=pathwaySpecialtyLabels(person).map(keyName);
 if(kind==='ae_variant'){
   if(track.id!=='politie:ae')return false;
   return value==='alle'?variants.includes('AE'):variants.includes(value);
 }
 if(kind==='specialisatie')return Boolean(value)&&(
   labels.includes(keyName(value))||
   track.id==='politie:ae'&&variants.some(v=>keyName(v)===keyName(value)));
 if(kind==='kandidaten'){
   if(track.id==='politie:ae')return !variants.includes('AE');
   return !track.tokens.some(t=>labels.some(label=>label.includes(keyName(t))));
 }
 return false;
}
export function validatePlanningAudience(v){
 if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.keys(v).some(k=>!['trackId','label','kind','value'].includes(k)))
    throw Error('Ongeldige doelgroep');
 const track=planningTrack(v.trackId),kind=v.kind;
 const label=typeof v.label==='string'?v.label.trim():'';
 const value=typeof v.value==='string'?v.value.trim():'';
 if(!track||!['alle','rang','reeks','specialisatie','kandidaten'].includes(kind)||
    label.length<3||label.length>60||V.test(label)||
    value.length>90||V.test(value)||
    (['rang','reeks','specialisatie'].includes(kind)&&value.length<2)||
    (!['rang','reeks','specialisatie'].includes(kind)&&value))
   throw Error('Vul een geldige doelgroep, naam en waarde in');
 return {trackId:track.id,label,kind,value};
}
export function validatePlanningAssignment(v){
 if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.keys(v).some(k=>!['trackId','courseName','audienceId','subjectIds','status','plannedDay','note','proposeMandatory','mandatoryReason'].includes(k)))
   throw Error('Ongeldige deelnemersplanning');
 const track=planningTrack(v.trackId);
 if(!track||typeof v.courseName!=='string'||v.courseName.length>150||
    typeof v.audienceId!=='string'||v.audienceId.length>70||
    !Array.isArray(v.subjectIds)||v.subjectIds.length<1||v.subjectIds.length>40||
    v.subjectIds.some(x=>typeof x!=='string'||!DISCORD_ID.test(x))||
    new Set(v.subjectIds).size!==v.subjectIds.length||
    !PLANNING_STATUSES.slice(0,3).includes(v.status)||
    !(v.plannedDay===''||dayValid(v.plannedDay))||
    typeof v.note!=='string'||v.note.length>300||V.test(v.note)||
    (v.proposeMandatory!==undefined&&typeof v.proposeMandatory!=='boolean')||
    (v.mandatoryReason!==undefined&&typeof v.mandatoryReason!=='string')||
    (v.proposeMandatory===true&&
      (!v.mandatoryReason||v.mandatoryReason.trim().length<10||
      v.mandatoryReason.length>500||V.test(v.mandatoryReason))))
   throw Error('Controleer de opleiding, deelnemers, status en datum (maximaal 40 personen)');
 return {trackId:track.id,courseName:v.courseName,
   audienceId:v.audienceId,subjectIds:v.subjectIds,
   status:v.status,plannedDay:v.plannedDay,note:v.note.trim(),
   proposeMandatory:v.proposeMandatory===true,
   mandatoryReason:v.proposeMandatory===true?v.mandatoryReason.trim():''};
}
export function planningAssignmentKey(trackId,courseName,personId,hash){
 return hash(trackId+'|'+keyName(courseName)+'|'+personId).slice(0,36);
}
