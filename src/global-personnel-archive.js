import {FieldValue} from 'firebase-admin/firestore';
import {brusselsEventDate} from './personnel-event-date.js';
import {PERSONNEL_LIFECYCLE_COLLECTION,lifecycleSourceSnapshot} from './personnel-lifecycle-policy.js';
import {PERSONNEL_ACTIVITY_COLLECTION} from './personnel-activity.js';
import {departureEvidence} from './personnel-departure-evidence.js';
import {writeLeaveEvent} from './leave-event-log.js';

// One verified Discord identity can have several service dossiers. Preparing
// every read before the first write makes archive + leave closure atomic.
const fail=(status,message)=>Object.assign(new Error(message),{status});
const ID=/^\d{15,22}$/;
const SERVICES=new Set(['politie','brandweer','ambulance','depannage','burger']);
export const GLOBAL_ARCHIVE_COLLECTION='bpd_global_personnel_archive_events';
export function identityArchiveSubjects(roster,discordId){
 if(!ID.test(String(discordId||''))||!Array.isArray(roster))
  throw fail(400,'Ongeldige personeelsidentiteit');
 const matches=roster.filter(p=>p?.personId===discordId&&SERVICES.has(p.dept));
 const byDept=new Map();
 for(const p of matches){
  if(byDept.has(p.dept))
   throw fail(409,'Dubbele dienstfiche aangetroffen; corrigeer de personeelsbron vóór archivering');
  byDept.set(p.dept,p);
 }
 if(!byDept.size)throw fail(409,'Geen dienstfiches voor de centrale archivering');
 return [...byDept.values()];
}
export async function prepareIdentityArchive(tx,db,{subjects,primaryDept,discordId}){
 if(!subjects.some(p=>p.dept===primaryDept&&p.personId===discordId))
  throw fail(409,'De gekozen dienstfiche ontbreekt in het centrale dossier');
 const others=subjects.filter(p=>p.dept!==primaryDept);
 const lifecycle=await Promise.all(others.map(async person=>{
  const ref=db.collection(PERSONNEL_LIFECYCLE_COLLECTION).doc(person.dept+'_'+discordId);
  return {person,ref,snapshot:await tx.get(ref)};
 }));
 const leaves=await tx.get(db.collection('bpd_leave_requests')
  .where('personDiscordId','==',discordId).limit(101));
 if(leaves.size===101)
  throw fail(503,'Te veel verlofregistraties om de centrale archivering volledig te controleren');
 const today=brusselsEventDate();
 const openLeaves=leaves.docs.filter(d=>{
  const data=d.data();
  return data.status==='pending'||data.status==='approved'&&
    typeof data.endDate==='string'&&data.endDate>=today;
 });
 if(openLeaves.length>30)
  throw fail(503,'Te veel openstaande verlofperiodes voor een veilige gezamenlijke archivering');
 for(const row of lifecycle){
  const state=row.snapshot.get('state');
  if(state&&!['active','pending','archived'].includes(state))
   throw fail(409,'Onbekende archiefstatus in '+row.person.dept);
 }
 return {subjects,primaryDept,discordId,lifecycle,openLeaves,today};
}
export function writeIdentityArchive(tx,db,plan,{actor,actorUid,reason,cause,source}){
 const {subjects,primaryDept,discordId,lifecycle,openLeaves,today}=plan;
 const at=FieldValue.serverTimestamp();
 const registeredBy={name:String(actor?.name||'Bevoegd kader').slice(0,120),
  call:String(actor?.call||'').slice(0,24),
  discordId:String(actor?.discordId||'')};
 const group=db.collection(GLOBAL_ARCHIVE_COLLECTION).doc();
 const allServices=subjects.map(p=>p.dept);
 const newlyArchived=[primaryDept];
 // The primary dossier is archived by the existing reviewed workflow.
 // All other memberships are retired in the SAME Firestore transaction.
 for(const {person,ref,snapshot} of lifecycle){
  if(snapshot.get('state')==='archived')continue;
  const historic=lifecycleSourceSnapshot(person);
  if(!historic)throw fail(409,'Geen verifieerbare historische dienstfiche: '+person.dept);
  const revision=Number.isSafeInteger(snapshot.get('revision'))?
   snapshot.get('revision'):0;
  const evidence=departureEvidence(historic,subjects,cause,reason);
  tx.set(ref,{dept:person.dept,discordId,state:'archived',
   revision:revision+1,snapshot:historic,cause,reason,archivedAt:at,
   updatedAt:at,updatedByUid:actorUid,updatedByDiscordId:registeredBy.discordId,
   cmsRoleSyncPending:true,restoreFromArchive:false,
   globalArchiveId:group.id,globalArchiveOrigin:primaryDept},{merge:true});
  tx.create(ref.collection('audit').doc(),{
   action:'personnel_archived_globally',source,globalArchiveId:group.id,
   originDepartment:primaryDept,cause,reason,revision:revision+1,
   actorUid,actorDiscordId:registeredBy.discordId,at
  });
  const entry=db.collection('bpd_cases').doc(person.dept+'_'+discordId)
   .collection('entries').doc();
  const notice=db.collection('bpd_notices').doc(person.dept)
   .collection('events').doc();
  tx.create(entry,{type:'personeelsbeweging',reportCategory:'personeelsbeweging',
   source:'global-personnel-archive',globalArchiveId:group.id,
   dept:person.dept,subjectDiscordId:discordId,
   subjectNameAtCreation:historic.name,subjectCallAtCreation:historic.call,
   subjectRankAtCreation:historic.rank||'',eventDate:today,
   movement:'Centrale archivering',previousRank:historic.rank||'',
   newRank:'Uit dienst',previousCall:historic.call||'',newCall:'',
   previousSeries:evidence.previousSeries,
   previousSpecialties:evidence.specialties,
   previousDepartments:allServices,
   details:'Centrale archivering vanuit '+primaryDept+' · '+evidence.details,
   registeredBy,submittedBy:{uid:actorUid},createdAt:at,modifiedAt:null
  });
  tx.create(notice,{caseId:person.dept+'_'+discordId,entryId:entry.id,
   type:'personeelsbeweging',dept:person.dept,
   source:'global-personnel-archive',createdAt:at});
  tx.create(db.collection(PERSONNEL_ACTIVITY_COLLECTION).doc(),{
   dossierCaseLogged:true,type:'personnel_archived',dept:person.dept,
   discordId,name:historic.name,call:historic.call,before:'Actief',
   after:'Uit dienst',eventDate:today,cause,reason,
   globalArchiveId:group.id,actorDiscordId:registeredBy.discordId,at
  });
  newlyArchived.push(person.dept);
 }
 // End only still-open leave, never rewrite completed historical leave.
 // The leave audit and every service dossier notification are transactional.
 for(const doc of openLeaves){
  const leave=doc.data(),prior=leave.status;
  const why='Personeelsdossier centraal gearchiveerd ('+cause+'): '+reason;
  tx.update(doc.ref,{status:'withdrawn',closedByPersonnelArchive:true,
   globalArchiveId:group.id,withdrawReason:why,withdrawnAt:at,
   withdrawnByUid:actorUid,withdrawnByDiscordId:registeredBy.discordId,
   updatedAt:at});
  writeLeaveEvent(tx,{requestRef:doc.ref,
   request:{...leave,subjectDepartments:allServices},action:'personnel_archived',
   actor:registeredBy,actorUid,eventDate:today,
   from:prior,to:'withdrawn',note:why});
 }
 tx.create(group,{discordId,originDepartment:primaryDept,services:allServices,
  newlyArchivedServices:newlyArchived,closedLeaveRequests:openLeaves.map(d=>d.id),
  cause,reason,source,actorUid,actorDiscordId:registeredBy.discordId,
  eventDate:today,at});
 return {globalArchiveId:group.id,archivedDepartments:newlyArchived,
  closedLeaveRequests:openLeaves.length};
}
