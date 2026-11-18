// TEST-only read-only permission simulation. No user IDs, database reads,
// impersonation tokens or real authorisation grants are ever generated.
import {mayEditTechnicalSettings} from './technical-center-config.js';
import {roleForDepartment,mayApproveLeave} from './leave-policy.js';
import {canReadServiceDossier} from './service-dossier-access.js';
import {canReadPersonnelSubject,canEditPersonnel} from './personnel-editor-policy.js';
import {mayReviewTrainingRequest,mayInstructorReviewTrainingRequest} from './training-request-policy.js';
import {canAccessCitizenDossier,canWriteCitizenDossier} from './citizen-dossier-policy.js';
import {canManageLifecycleDepartment} from './personnel-lifecycle-access.js';
import {canManagePoliceDecoration} from './personnel-decoration-policy.js';
import {mayReadFortnightReport} from './fortnight-report-policy.js';
const TEST_SERVICE='srv-dbampoqjnfac738b1tsg';
const SYN_ID='111111111111111111',SUBJECT='222222222222222222';
export const SCENARIOS=Object.freeze([
 {id:'police_basic',label:'Politie · Basiskader',dept:'politie',role:'basiskader'},
 {id:'police_middle',label:'Politie · Middenkader',dept:'politie',role:'middenkader',discordRole:'1335578488664490057'},
 {id:'police_officer',label:'Politie · Officierenkader',dept:'politie',role:'officierenkader',discordRole:'1473474238664020151'},
 {id:'police_corps',label:'Politie · Korpsleiding',dept:'politie',role:'korpsleiding',discordRole:'1562710901080068229'},
 {id:'police_k9',label:'Politie · K9-instructeur',dept:'politie',role:'basiskader',discordRole:'1345302115689431061'},
 {id:'fire_middle',label:'Brandweer · Middenkader',dept:'brandweer',role:'middenkader',fireAccessLevel:'middle',discordRole:'1554906632897560787'},
 {id:'fire_leader',label:'Brandweer · Leiding',dept:'brandweer',role:'officierenkader',fireAccessLevel:'leadership',discordRole:'1395115819020714105'},
 {id:'fire_zone',label:'Brandweer · ZONE',dept:'brandweer',role:'korpsleiding',fireZoneChief:true,fireAccessLevel:'zone'},
 {id:'ambulance_instructor',label:'Ambulance · Medisch instructeur',dept:'ambulance',role:'middenkader',discordRole:'1309532437952466988'},
 {id:'ambulance_leader',label:'Ambulance · AZLS-leiding',dept:'ambulance',role:'officierenkader',discordRole:'1309532438053130325'},
 {id:'depannage_awv',label:'Depannage · AWV',dept:'depannage',role:'korpsleiding',discordRole:'1309532438019706969'},
 {id:'citizen_council',label:'Burger · Burgerraad',dept:'burger',role:'basiskader',discordRole:'1492485336197234728'}
]);
export const technicalSimulatorOnlyTest=env=>
 env?.RENDER_SERVICE_ID===TEST_SERVICE;
export const canRunTechnicalSimulator=(actor,env)=>
 technicalSimulatorOnlyTest(env)&&mayEditTechnicalSettings(actor);
export function simulateTechnicalRights(id){
 const scenario=SCENARIOS.find(x=>x.id===id);
 if(!scenario)throw Error('Onbekend testprofiel');
 const dept=scenario.dept;
 const actor={uid:'discord:'+SYN_ID,discordId:SYN_ID,
   role:scenario.role,departments:[dept],
   departmentRoles:{[dept]:scenario.role},
   dossierAllowedDepartments:[dept],dossierNativeDepartments:[dept],
   trustedStaff:true,
   ...(scenario.fireZoneChief?{fireZoneChief:true}:{}),
   ...(scenario.fireAccessLevel?{fireAccessLevel:scenario.fireAccessLevel}:{}),
   ...(id==='police_corps'?{discordPoliceRank:'korpsleiding'}:{}),
   ...(id==='police_officer'?{discordPoliceRank:'officierenkader'}:{}),
   ...(id==='ambulance_leader'?{reportServiceRoles:{ambulanceAzls:true}}:{}),
   ...(id==='depannage_awv'?{reportServiceRoles:{depannageAwv:true}}:{})
 };
 const subject={dept,personId:SUBJECT,call:dept==='politie'?'412':'STAG-01',
   name:'Fictief testlid',rank:dept==='politie'?'Inspecteur':'STAG',
   status:'Actief'};
 if(dept==='brandweer'){
   actor.fireSubjectRoleSets=new Map([[SUBJECT,new Set(['1309532438053130324'])]]);
 }
 const roleIds=scenario.discordRole?[scenario.discordRole]:[];
 const training={department:dept,applicantDiscordId:SUBJECT,
   applicantTier:'basiskader',courseName:dept==='politie'?'K-9':'Dienstopleiding'};
 const leave={status:'pending',personDiscordId:SUBJECT,subjectDepartments:[dept],
   subjectDepartmentRoles:{[dept]:'basiskader'},
   subjectRole:'basiskader',startDate:'2027-04-05',endDate:'2027-04-14'};
 const [dossier,subjectAccess]=[
   canReadServiceDossier(actor,dept),canReadPersonnelSubject(actor,subject)];
 const council=dept==='burger'&&id==='citizen_council';
 const canReview=mayReviewTrainingRequest(actor,training);
 const canInstructor=mayInstructorReviewTrainingRequest(actor,training,roleIds);
 return {id,label:scenario.label,dept,
   note:'Gesimuleerd beleid op fictieve identiteiten; geen werkelijke inlog-, Discord- of dossiercontrole.',
   checks:{
     dossierInzien:dossier&&subjectAccess||council&&canAccessCitizenDossier(actor,true),
     personeelsficheWijzigen:canEditPersonnel(actor,subject),
     gewoneOpleidingBeoordelen:canReview,
     k9SpecialisatieInstructeur:canInstructor,
     verlofTienDagenGoedkeuren:dept!=='burger'&&mayApproveLeave(actor,leave,null,'2027-04-01'),
     dienstarchiefBeheren:canManageLifecycleDepartment(actor,dept),
     korpspluimToekennen:canManagePoliceDecoration(actor,subject),
     burgerDossierSchrijven:council&&canWriteCitizenDossier(actor,true,SUBJECT),
     weekrapportLezen:dept!=='burger'&&mayReadFortnightReport(actor,dept,
       [{...subject,personId:SYN_ID,call:dept==='ambulance'?'DIRMED':dept==='depannage'?'AWV':'ZONE'}])
   }
 };
}
export function installTechnicalSimulatorRoutes(app,{requireUser,env=process.env}={}){
 app.get('/api/technical-simulator/profiles',requireUser,(req,res)=>{
   res.set('Cache-Control','private, no-store');
   if(!technicalSimulatorOnlyTest(env))return res.status(404).json({error:'TEST-omgeving vereist'});
   if(!canRunTechnicalSimulator(req.bpd,env))return res.status(403).json({error:'Alleen geverifieerd Technisch Beheer'});
   return res.json({profiles:SCENARIOS.map(x=>({id:x.id,label:x.label})),readonly:true,realAccount:false});
 });
 app.get('/api/technical-simulator/profile/:id',requireUser,(req,res)=>{
   res.set('Cache-Control','private, no-store');
   if(!technicalSimulatorOnlyTest(env))return res.status(404).json({error:'TEST-omgeving vereist'});
   if(!canRunTechnicalSimulator(req.bpd,env))return res.status(403).json({error:'Alleen geverifieerd Technisch Beheer'});
   try{return res.json(simulateTechnicalRights(String(req.params.id||'')));}
   catch{return res.status(400).json({error:'Onbekend simulatieprofiel'});}
 });
}
