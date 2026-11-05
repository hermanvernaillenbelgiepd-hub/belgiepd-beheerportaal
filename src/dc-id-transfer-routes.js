import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {USER_COLLECTION} from './user-access.js';
import {DC_TRANSFER_REQUESTS,DC_TRANSFER_ALIASES,DC_TRANSFER_TARGETS,TRANSFER_DEPARTMENTS,
  validTransferInput,mayAdministerDcTransfer,mayCompleteDcTransfer,freshTransferTarget,
  transferRosterPlan,transferSubjectFields} from './dc-id-transfer-policy.js';

const ID=/^\d{15,22}$/;
const UUID=/^[0-9a-f-]{36}$/i;
// These collections are about a PERSON, never Discord roles or approvals.
const PERSON_COLLECTIONS=Object.freeze([
 'bpd_cases','bpd_staff_dossiers','bpd_training',
 'bpd_personnel_created','bpd_personnel_edits','bpd_personnel_specializations',
 'bpd_personnel_lifecycle','bpd_personnel_decorations',
 'bpd_specialty_restrictions','bpd_personnel_functions'
]);
const FIELD_COLLECTIONS=Object.freeze([
 {collection:'bpd_leave_requests',field:'personDiscordId'},
 {collection:'bpd_training_requests',field:'applicantDiscordId'},
 {collection:'bpd_basic_observations',field:'subjectDiscordId'}
]);
const MAX_COPY=120,MAX_FIELD=60;
const failure=(status,message)=>Object.assign(Error(message),{status});
const safeError=(res,e)=>{
 if(e?.status)return res.status(e.status).json({error:e.message});
 console.warn('DC-ID-overdracht:',typeof e?.code==='string'?e.code:'unexpected_failure');
 res.status(503).json({error:'DC-ID-overdracht tijdelijk niet beschikbaar; gegevens zijn niet gewist'});
};
const ts=d=>d?.toDate?.()?.toISOString?.()||null;
const isSame=(a,b)=>a?.updateTime?.toMillis?.()===b?.updateTime?.toMillis?.();
const docSummary=d=>({id:d.id,status:d.get('status'),oldDiscordId:d.get('oldDiscordId'),
 newDiscordId:d.get('newDiscordId'),reason:d.get('reason')||'',
 createdBy:d.get('createdBy'),createdAt:ts(d.get('createdAt')),
 completedBy:d.get('completedBy')||null,completedAt:ts(d.get('completedAt'))});
async function rosterCheck(db,getSnapshot,oldId,newId){
 const snap=await getSnapshot({forceRefresh:true,includeArchived:true});
 if(snap.stale)throw failure(503,'Personeelsbron is verouderd. De overdracht blijft geblokkeerd.');
 let result;
 try{result=transferRosterPlan(snap.data,oldId,newId)}
 catch(e){throw failure(409,e.message)}
 const [oldAlias,newAlias,existingTarget,targetClaim]=await Promise.all([
  db.collection(DC_TRANSFER_ALIASES).doc(oldId).get(),
  db.collection(DC_TRANSFER_ALIASES).doc(newId).get(),
  db.collection(DC_TRANSFER_ALIASES).where('newDiscordId','==',newId).limit(2).get(),
  db.collection(DC_TRANSFER_TARGETS).doc(newId).get()
 ]);
 if(oldAlias.exists||newAlias.exists||!existingTarget.empty||targetClaim.exists)
   throw failure(409,'Eén van beide Discord-ID’s werd al eerder overgedragen. Handmatige controle nodig.');
 return result;
}
async function memberCheck(db,newId){
 const d=await db.collection('bpd_discord_auth').doc(newId).get();
 if(!freshTransferTarget(d.data(),newId,process.env.DISCORD_GUILD_ID))
  throw failure(409,'Het nieuwe account moet Discord opnieuw verifiëren (laatste 24 uur).');
 const user=await db.collection(USER_COLLECTION).doc(newId).get();
 if(user.get('status')==='blocked')
  throw failure(409,'Het nieuwe portaalaccount is geblokkeerd en kan geen overdracht ontvangen.');
 return {newPortalStatus:user.get('status')||'nog niet goedgekeurd'};
}
function checkAdmin(req,res,next){
 res.set('Cache-Control','private, no-store');
 if(!mayAdministerDcTransfer(req.bpd))
  return res.status(403).json({error:'Enkel geverifieerd Officierenkader, Korpsleiding of Technisch Beheer'});
 next();
}
// Recursively prepare a read-only list of every old document, including its
// nested audit/history; never destroy the original source documents.
async function collectTree(source,target,rows,depth=0){
 if(depth>4)throw failure(409,'Te diepe dossierhistoriek: handmatige migratie vereist');
 const snap=await source.get();
 if(snap.exists)rows.push({source,target,snap,kind:'copy'});
 if(rows.length>MAX_COPY)throw failure(409,'Meer dan 120 archiefrecords. Handmatige migratie vereist.');
 const collections=await source.listCollections();
 if(collections.length>15)throw failure(409,'Onverwacht veel dossieronderdelen');
 for(const coll of collections){
   const children=await coll.limit(MAX_COPY+1).get();
   if(children.size>MAX_COPY)throw failure(409,'Te groot dossierarchief');
   for(const d of children.docs){
     await collectTree(d.ref,target.collection(coll.id).doc(d.id),rows,depth+1);
   }
 }
}
async function collectTransfers(db,oldId,newId,depts){
 const copies=[],changes=[];
 for(const dept of depts){
   for(const name of PERSON_COLLECTIONS){
     await collectTree(db.collection(name).doc(dept+'_'+oldId),
       db.collection(name).doc(dept+'_'+newId),copies);
   }
   // Per-person uniform choice is a visual assignment, never a role grant.
   await collectTree(db.collection('bpd_uniform_visual_assignments').doc(dept+'_person_'+oldId),
     db.collection('bpd_uniform_visual_assignments').doc(dept+'_person_'+newId),copies);
 }
 for(const {collection,field} of FIELD_COLLECTIONS){
   const target=await db.collection(collection).where(field,'==',newId).limit(1).get();
   if(!target.empty)
     throw failure(409,'Het nieuwe account heeft al historische records in '+collection+'. Handmatige controle nodig.');
   const snap=await db.collection(collection).where(field,'==',oldId)
     .limit(MAX_FIELD+1).get();
   if(snap.size>MAX_FIELD)throw failure(409,'Te veel gekoppelde dossiers in '+collection);
   for(const doc of snap.docs)changes.push({doc,field,collection});
 }
 if(copies.length>MAX_COPY||changes.length>MAX_FIELD||
   copies.length+changes.length*2+9>=450)
   throw failure(409,'Te veel historische records voor één veilige overdracht');
 // A destination collision ALWAYS aborts the whole transfer.
 const destinations=await Promise.all(copies.map(x=>x.target.get()));
 if(destinations.some(x=>x.exists))
   throw failure(409,'Het nieuwe DC-ID bevat al dossiergegevens. Overdracht niet uitgevoerd.');
 return {copies,changes,counts:Object.fromEntries([
  ...PERSON_COLLECTIONS.map(name=>[
   name,copies.filter(x=>x.source.path.startsWith(name+'/')).length]),
  ...FIELD_COLLECTIONS.map(x=>[x.collection,
   changes.filter(y=>y.collection===x.collection).length])
 ])};
}
export function installDcIdTransferRoutes(app,{requireUser,getSnapshot,onCompleted=()=>{}}){
 const admin=[requireUser,checkAdmin];
 app.get('/api/dc-id-transfer/status',...admin,(_req,res)=>{
   res.json({previewAvailable:true,executionEnabled:process.env.BPD_ENABLE_DC_ID_TRANSFERS==='true',
     requiresSecondAdministrator:false});
 });
 app.get('/api/dc-id-transfer/preview',...admin,async(req,res)=>{
  try{
   const {oldDiscordId,newDiscordId}=validTransferInput({
     oldDiscordId:req.query.oldDiscordId,newDiscordId:req.query.newDiscordId,
     reason:'Voorlopige controle van de nieuwe DC-ID-koppeling'
   });
   if([oldDiscordId,newDiscordId].includes(req.bpd.discordId))
    throw failure(403,'Een beheerder mag zijn eigen account niet overdragen.');
   const db=getFirestore();
   const [roster,member]=await Promise.all([
     rosterCheck(db,getSnapshot,oldDiscordId,newDiscordId),
     memberCheck(db,newDiscordId)
   ]);
   const plan=await collectTransfers(db,oldDiscordId,newDiscordId,roster.departments);
   res.json({oldDiscordId,newDiscordId,...roster,...member,
     collectionCounts:plan.counts,
     affectedRecords:plan.copies.length+plan.changes.length,
     originalRecordsRetained:true,rolesAutomaticallyTransferred:false,
     requiresSecondAdministrator:false});
  }catch(e){safeError(res,e)}
 });
 app.get('/api/dc-id-transfer/requests',...admin,async(req,res)=>{
  try{
   const data=await getFirestore().collection(DC_TRANSFER_REQUESTS)
     .orderBy('createdAt','desc').limit(30).get();
   res.json({requests:data.docs.map(docSummary)});
  }catch(e){safeError(res,e)}
 });
 app.post('/api/dc-id-transfer/requests',...admin,async(req,res)=>{
  try{
   const fields=validTransferInput(req.body);
   if([fields.oldDiscordId,fields.newDiscordId].includes(req.bpd.discordId))
     throw failure(403,'Een beheerder mag zijn eigen account niet overdragen.');
   const db=getFirestore();
   const roster=await rosterCheck(db,getSnapshot,fields.oldDiscordId,fields.newDiscordId);
   await memberCheck(db,fields.newDiscordId);
   await collectTransfers(db,fields.oldDiscordId,fields.newDiscordId,roster.departments);
   const duplicate=await db.collection(DC_TRANSFER_REQUESTS)
     .where('oldDiscordId','==',fields.oldDiscordId).limit(30).get();
   if(duplicate.docs.some(d=>d.get('status')==='pending'))
     throw failure(409,'Er staat al een overdrachtsaanvraag open voor deze DC-ID.');
   const ref=db.collection(DC_TRANSFER_REQUESTS).doc(randomUUID());
   await ref.create({...fields,departments:roster.departments,
     personnelAtRequest:roster.personnel,status:'pending',
     createdBy:req.bpd.discordId,createdAt:FieldValue.serverTimestamp(),
     expiresAt:new Date(Date.now()+7*86400000)});
   res.status(201).json({id:ref.id,status:'pending',requiresSecondAdministrator:false});
  }catch(e){safeError(res,e)}
 });
 app.post('/api/dc-id-transfer/requests/:id/execute',...admin,async(req,res)=>{
  try{
   if(process.env.BPD_ENABLE_DC_ID_TRANSFERS!=='true')
     throw failure(503,'Definitieve overdrachten zijn nog uitgeschakeld tot de gecontroleerde TEST-proef is goedgekeurd.');
   if(!UUID.test(req.params.id))throw failure(404,'Aanvraag niet gevonden');
   if(!req.body||Object.keys(req.body).some(k=>!['confirmation','reason'].includes(k))||
      req.body.confirmation!=='OVERDRAGEN'||
      typeof req.body.reason!=='string'||req.body.reason.trim().length<20||
      req.body.reason.trim().length>500)throw failure(400,'Vul OVERDRAGEN en een motivering van minstens 20 tekens in.');
   const db=getFirestore(),requestRef=db.collection(DC_TRANSFER_REQUESTS).doc(req.params.id);
   const doc=await requestRef.get();
   if(!doc.exists||doc.get('status')!=='pending')throw failure(409,'Aanvraag niet meer in behandeling');
   const oldId=doc.get('oldDiscordId'),newId=doc.get('newDiscordId');
   if(!ID.test(oldId)||!ID.test(newId)||oldId===newId)
     throw failure(409,'Aanvraag bevat geen geldige Discord-ID’s');
   // A single authorized officer may finish their own request. Recheck the
   // actor and reject transferring either their source or target identity.
   if(!mayCompleteDcTransfer(req.bpd,oldId,newId))
     throw failure(403,'Alleen bevoegd kader mag een andere identiteit overdragen.');
   if(doc.get('expiresAt')?.toMillis?.()<Date.now())
     throw failure(409,'De aanvraag is verlopen en moet opnieuw worden gecontroleerd.');
   const [roster]=await Promise.all([
     rosterCheck(db,getSnapshot,oldId,newId),memberCheck(db,newId)
   ]);
   if(JSON.stringify(roster.departments)!==JSON.stringify(doc.get('departments')))
     throw failure(409,'De diensten zijn gewijzigd: vraag een nieuwe overdracht aan.');
   const prepared=await collectTransfers(db,oldId,newId,roster.departments);
   const alias=db.collection(DC_TRANSFER_ALIASES).doc(oldId);
   const targetClaim=db.collection(DC_TRANSFER_TARGETS).doc(newId);
   const oldAccount=db.collection(USER_COLLECTION).doc(oldId);
   const refs=[requestRef,alias,targetClaim,oldAccount,
     ...prepared.copies.flatMap(x=>[x.source,x.target]),
     ...prepared.changes.map(x=>x.doc.ref)];
   const unique=[...new Map(refs.map(x=>[x.path,x])).values()];
   await db.runTransaction(async tx=>{
     const snapshots=await Promise.all(unique.map(ref=>tx.get(ref)));
     const seen=new Map(unique.map((ref,i)=>[ref.path,snapshots[i]]));
     const reqSnap=seen.get(requestRef.path);
     if(reqSnap.get('status')!=='pending'||reqSnap.get('createdBy')!==doc.get('createdBy')||
        reqSnap.get('newDiscordId')!==newId||reqSnap.get('oldDiscordId')!==oldId)
       throw failure(409,'De overdrachtsaanvraag is inmiddels gewijzigd.');
     if(seen.get(alias.path).exists||seen.get(targetClaim.path).exists)
       throw failure(409,'De DC-ID is al overgedragen of gereserveerd.');
     for(const item of prepared.copies){
       const before=seen.get(item.source.path),after=seen.get(item.target.path);
       if(!before.exists||after.exists||!isSame(before,item.snap))
         throw failure(409,'Een dossier is ondertussen gewijzigd: voer de controle opnieuw uit.');
     }
     for(const item of prepared.changes){
       const before=seen.get(item.doc.ref.path);
       if(!isSame(before,item.doc)||before.get(item.field)!==oldId)
         throw failure(409,'Een historisch record is ondertussen gewijzigd.');
     }
     const stamp=FieldValue.serverTimestamp();
     for(const item of prepared.copies){
       const data=transferSubjectFields(item.snap.data(),oldId,newId);
       if(item.source.path.startsWith('bpd_uniform_visual_assignments/')){
         if(data.selector===oldId)data.selector=newId;
         if(data.key===item.source.id)data.key=item.target.id;
       }
       tx.create(item.target,{...data,identityTransferId:requestRef.id,
         ...(item.source.parent.parent?{}:{transferredFromDiscordId:oldId})});
     }
     for(const item of prepared.changes)
       tx.update(item.doc.ref,{[item.field]:newId,
         dcIdTransferredFrom:oldId,dcIdTransferId:requestRef.id});
     const prev=seen.get(oldAccount.path);
     tx.set(oldAccount,{
       ...(prev.exists?prev.data():{}),discordId:oldId,status:'blocked',
       dcIdTransferredTo:newId,dcIdTransferredAt:stamp,
       dcIdTransferReason:req.body.reason.trim()
     });
     tx.create(targetClaim,{oldDiscordId:oldId,requestId:requestRef.id,
       completedAt:stamp});
     tx.create(alias,{status:'completed',oldDiscordId:oldId,newDiscordId:newId,
       departments:roster.departments,requestId:requestRef.id,
       completedAt:stamp,createdBy:doc.get('createdBy'),
       completedBy:req.bpd.discordId,
       migratedCounts:prepared.counts});
     tx.update(requestRef,{status:'completed',completedAt:stamp,
       completedBy:req.bpd.discordId,completionReason:req.body.reason.trim(),
       recordsTransferred:prepared.copies.length+prepared.changes.length});
   },{maxAttempts:3});
   onCompleted(oldId);
   res.json({completed:true,oldDiscordId:oldId,newDiscordId:newId,
     affectedRecords:prepared.copies.length+prepared.changes.length,
     oldAccountBlocked:true,newRolesGranted:false,originalArchiveRetained:true});
  }catch(e){safeError(res,e)}
 });
}
