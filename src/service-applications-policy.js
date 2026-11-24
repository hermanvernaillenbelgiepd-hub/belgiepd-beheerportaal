import {createHmac,timingSafeEqual} from 'node:crypto';
import {mayReadFortnightReport} from './fortnight-report-policy.js';
import {roleForDepartment} from './leave-policy.js';
export const SERVICE_APPLICATION_DEPARTMENTS=Object.freeze(['brandweer','ambulance','depannage']);
export const SERVICE_APPLICATION_COLLECTION='bpd_service_applications';
export const SERVICE_EVIDENCE_COLLECTION='bpd_fivem_verified_playtime';
export const SERVICE_APPLICATION_HOURS=10;
export const SERVICE_APPLICATION_DAYS=5;
const ID=/^\d{15,22}$/;
const MS_DAY=86400000;
const ISO=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)&&
 Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const error=(message,status=400)=>Object.assign(Error(message),{status});
export const serviceApplicationsReady=env=>env?.BPD_ENABLE_SERVICE_APPLICATIONS==='true'&&
 typeof env?.BPD_FIVEM_EVIDENCE_SECRET==='string'&&env.BPD_FIVEM_EVIDENCE_SECRET.length>=32;
export const serviceEvidenceIngestReady=env=>serviceApplicationsReady(env)&&
 env.BPD_ENABLE_FIVEM_EVIDENCE_INGEST==='true';
export const applicationKey=(dept,id)=>SERVICE_APPLICATION_DEPARTMENTS.includes(dept)&&ID.test(String(id||''))?
 dept+'_'+id:null;
export function cleanServiceApplication(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='department'&&k!=='motivation'))
  throw error('Onbekende velden in sollicitatie');
 if(!SERVICE_APPLICATION_DEPARTMENTS.includes(body.department))
  throw error('Kies Brandweer, Ambulance of Depannage');
 const motivation=typeof body.motivation==='string'?body.motivation.trim():'';
 if(motivation.length<40||motivation.length>3000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(motivation))
  throw error('Motivering moet tussen 40 en 3000 tekens bevatten');
 return {department:body.department,motivation};
}
export function cleanServiceDecision(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['action','reason','expectedRevision'].includes(k)))
  throw error('Ongeldige beoordeling');
 const action=body.action;
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(!['start_review','accept','reject'].includes(action)||reason.length<10||reason.length>1000||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(reason)||
    !Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1)
  throw error('Kies een geldige beslissing met motivering en correcte revisie');
 return {action,reason,expectedRevision:body.expectedRevision};
}
export function nextServiceApplicationStatus(status,action){
 if(status==='submitted'&&action==='start_review')return 'reviewing';
 if((status==='submitted'||status==='reviewing')&&action==='reject')return 'rejected';
 if(status==='reviewing'&&action==='accept')return 'accepted';
 throw error('Deze beslissing past niet bij de huidige sollicitatiestatus',409);
}
export function canViewServiceApplications(actor,dept,roster=[]){
 if(!SERVICE_APPLICATION_DEPARTMENTS.includes(dept)||!actor)return false;
 if(actor.uid!=='discord:'+actor.discordId)return false;
 if(actor.portalTechnicalMode===true&&actor.profileTechnicalAvailable===true&&actor.role==='beheerder')return true;
 return mayReadFortnightReport(actor,dept,roster);
}
export function canReviewServiceApplications(actor,dept,roster=[]){
 if(!canViewServiceApplications(actor,dept,roster)||actor?.portalDeveloperReadOnly===true)
  return false;
 if(actor.portalTechnicalMode===true)return true;
 if(!actor.departments?.includes(dept))return false;
 if(roster.filter(p=>p?.dept===dept&&p.personId===actor.discordId).length!==1)return false;
 if(dept==='brandweer')return actor.fireZoneChief===true||
  actor.fireAccessLevel==='leadership'&&['officierenkader','korpsleiding'].includes(roleForDepartment(actor,'brandweer'));
 if(dept==='ambulance')return actor.reportServiceRoles?.ambulanceAzls===true||
  actor.ambulanceReportVerified===true;
 if(dept==='depannage')return actor.reportServiceRoles?.depannageAwv===true;
 return false;
}
export function normalizeServiceEvidenceBody(data,now=new Date()){
 if(!data||typeof data!=='object'||Array.isArray(data)||
  Object.keys(data).sort().join(',')!=='discordId,firstServerJoinAt,totalPlaySeconds')
  throw error('Ongeldige FiveM-bewijslading');
 if(!ID.test(String(data.discordId||''))||!Number.isSafeInteger(data.totalPlaySeconds)||
    data.totalPlaySeconds<0||data.totalPlaySeconds>100000000||
    !ISO(data.firstServerJoinAt)||Date.parse(data.firstServerJoinAt)>now.getTime())
  throw error('Geen valide FiveM-identiteit of servergegevens');
 return {discordId:data.discordId,totalPlaySeconds:data.totalPlaySeconds,
  firstServerJoinAt:ISO(data.firstServerJoinAt)};
}
const evidenceText=e=>['bpd-evidence-v1',e.discordId,e.totalPlaySeconds,
 e.firstServerJoinAt,e.verifiedAt].join('\n');
export function signServiceEvidence(e,secret){
 if(typeof secret!=='string'||secret.length<32)throw Error('No trusted evidence secret');
 return createHmac('sha256',secret).update(evidenceText(e),'utf8').digest('hex');
}
export function evaluateSignedServiceEvidence(data,id,secret,now=new Date()){
 const output={verified:false,reason:'verification_required',metHours:false,
  metDays:false,eligible:false,verifiedAt:null};
 if(!ID.test(String(id||''))||data?.discordId!==id||!ISO(data?.verifiedAt)||
  !ISO(data?.firstServerJoinAt)||!Number.isSafeInteger(data?.totalPlaySeconds)||
  data.totalPlaySeconds<0||data.totalPlaySeconds>100000000||
  typeof data.signature!=='string'||!/^[a-f0-9]{64}$/.test(data.signature)||
  typeof secret!=='string'||secret.length<32)return output;
 const expected=signServiceEvidence(data,secret);
 if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(data.signature,'hex')))return output;
 const age=now.getTime()-Date.parse(data.verifiedAt);
 if(age<0||age>24*3600000||Date.parse(data.firstServerJoinAt)>Date.parse(data.verifiedAt))
  return {...output,reason:'evidence_stale'};
 const metHours=data.totalPlaySeconds>=36000;
 const metDays=now.getTime()-Date.parse(data.firstServerJoinAt)>=5*MS_DAY;
 return {verified:true,reason:metHours&&metDays?'eligible':'not_yet_eligible',
  eligible:metHours&&metDays,metHours,metDays,verifiedAt:data.verifiedAt};
}
export function publicServiceApplication(record){
 if(!record||typeof record!=='object')return null;
 return {department:record.department,discordId:record.discordId,
  status:record.status,revision:record.revision,createdAt:record.createdAt||null,
  updatedAt:record.updatedAt||null,motivation:record.motivation||'',
  decisionReason:record.decisionReason||null,decidedBy:record.decidedBy||null};
}
