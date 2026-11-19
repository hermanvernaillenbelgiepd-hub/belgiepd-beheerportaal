// Server-authorized, per-service leave-return review workflow.
// The state CHECKING is a separate activity review; actual personnel status
// edits, Discord pings, dismissal and rank/role changes are never implicit.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {canViewPersonnel,canReadPersonnelSubject} from './personnel-editor-policy.js';
import {roleForDepartment} from './leave-policy.js';
import {RETURN_CHECK_COLLECTION,RETURN_CHOICES,brusselsDay,dueLeaveReturns,
 returnCheckPublic} from './activity-return-policy.js';

const ID=/^\d{15,22}$/;
const REF=/^(politie|brandweer|ambulance|depannage)_\d{15,22}_\d{4}-\d{2}-\d{2}$/;
const CADRE=new Set(['middenkader','officierenkader','korpsleiding']);
const enabled=env=>env.BPD_ENABLE_LEAVE_RETURN_CHECKS==='true';
const invalid=(status,message)=>Object.assign(new Error(message),{status});
const permitted=(actor,person)=>Boolean(person&&
 canViewPersonnel(actor,person.dept)&&canReadPersonnelSubject(actor,person)&&
 actor.discordId!==person.personId&&CADRE.has(roleForDepartment(actor,person.dept))&&
 actor.dossierNativeDepartments?.includes(person.dept));
const actorKey=actor=>String(actor?.uid||'').slice(0,128);

async function visibleOpenChecks(actor,roster,db){
 const allowed=new Map((roster||[]).filter(p=>permitted(actor,p))
  .map(p=>[p.dept+':'+p.personId,p]));
 if(!allowed.size)return {rows:[],limited:false};
 const snap=await db.collection(RETURN_CHECK_COLLECTION)
  .where('status','==','CHECKING').limit(501).get();
 if(snap.size>500)throw invalid(503,'Te veel openstaande verlofcontroles voor een volledig overzicht');
 const key=actorKey(actor),rows=[];
 for(const doc of snap.docs){
  const data=doc.data(),p=allowed.get(data.dept+':'+data.discordId);
  if(!p||!REF.test(doc.id)||p.lifecycleState==='archived')continue;
  const info=returnCheckPublic(data);
  if(!info||info.id!==doc.id)continue;
  rows.push({...info,subjectName:String(p.name||info.subjectName).slice(0,120),
   subjectCall:String(p.call||info.subjectCall).slice(0,24),
   readAt:data.readBy?.[key]?.toDate?.()?.toISOString?.()||null});
 }
 rows.sort((a,b)=>a.readAt===null&&b.readAt!==null?-1:
   b.readAt===null&&a.readAt!==null?1:b.endDate.localeCompare(a.endDate));
 return {rows,limited:false};
}
export function installActivityReturnRoutes(app,{requireUser,getSnapshot,env=process.env}){
 app.get('/api/activity-return/checks',requireUser,async(req,res)=>{
  if(!enabled(env))return res.json({enabled:false,checks:[],unread:0,actionRequired:0});
  try{
   const snapshot=await getSnapshot();
   if(snapshot.stale||!Array.isArray(snapshot.data))
    return res.status(503).json({error:'Personeelsbron niet controleerbaar'});
   const {rows}=await visibleOpenChecks(req.bpd,snapshot.data,getFirestore());
   res.set('Cache-Control','private, no-store');
   return res.json({enabled:true,checks:rows,unread:rows.filter(x=>!x.readAt).length,
    actionRequired:rows.length});
  }catch(e){
   console.warn('Verlofterugkeer meldingen:',e?.code||'controle_mislukt');
   return res.status(e.status||503).json({error:e.status?e.message:'Verlofterugkeer tijdelijk niet beschikbaar'});
  }
 });
 async function checkAccess(req){
  if(!enabled(env))throw invalid(503,'Verlofterugkeercontroles staan nog uit');
  const id=String(req.params.id||'');
  if(!REF.test(id))throw invalid(400,'Ongeldige verlofcontrole');
  const snapshot=await getSnapshot();
  if(snapshot.stale||!Array.isArray(snapshot.data))
   throw invalid(503,'Personeelsbron niet controleerbaar');
  const positions=id.split('_');
  const dept=positions[0],discordId=positions[1];
  const matches=snapshot.data.filter(p=>p.dept===dept&&p.personId===discordId);
  if(matches.length!==1||!permitted(req.bpd,matches[0]))
   throw invalid(403,'Geen bevoegdheid voor dit personeelsdossier');
  return {id,dept,discordId,subject:matches[0]};
 }
 app.post('/api/activity-return/checks/:id/read',requireUser,async(req,res)=>{
  try{
   const scope=await checkAccess(req),key=actorKey(req.bpd),db=getFirestore();
   if(!key)throw invalid(403,'Registrator niet geverifieerd');
   const doc=db.collection(RETURN_CHECK_COLLECTION).doc(scope.id);
   await db.runTransaction(async tx=>{
    const snap=await tx.get(doc);
    if(!snap.exists||snap.get('dept')!==scope.dept||
      snap.get('discordId')!==scope.discordId)
     throw invalid(404,'Verlofcontrole niet gevonden');
    const readBy={...(snap.get('readBy')||{})};
    if(Object.hasOwn(readBy,key))return;
    readBy[key]=FieldValue.serverTimestamp();
    tx.update(doc,{readBy});
   });
   return res.json({ok:true,read:true,personal:true});
  }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Leesbevestiging niet opgeslagen'})}
 });
 app.post('/api/activity-return/checks/:id/resolve',requireUser,async(req,res)=>{
  try{
   const scope=await checkAccess(req),status=req.body?.status;
   const reason=typeof req.body?.reason==='string'?req.body.reason.trim():'';
   if(!RETURN_CHOICES.includes(status)||reason.length<10||reason.length>500||
     Object.keys(req.body||{}).some(k=>!['status','reason'].includes(k)))
    throw invalid(400,'Kies ACTIEF of 50/50 en geef een motivering van 10–500 tekens');
   const db=getFirestore(),ref=db.collection(RETURN_CHECK_COLLECTION).doc(scope.id);
   const entry=db.collection('bpd_cases').doc(scope.dept+'_'+scope.discordId)
     .collection('entries').doc();
   const serviceNotice=db.collection('bpd_notices').doc(scope.dept)
     .collection('events').doc();
   const date=brusselsDay(),actor={name:String(req.bpd.name||'Bevoegd kaderlid').slice(0,120),
    call:String(req.bpd.call||'').slice(0,24),discordId:req.bpd.discordId};
   await db.runTransaction(async tx=>{
    const prior=await tx.get(ref);
    if(!prior.exists||prior.get('status')!=='CHECKING')
     throw invalid(409,'Deze verlofcontrole is al behandeld of bestaat niet meer');
    if(prior.get('dept')!==scope.dept||prior.get('discordId')!==scope.discordId)
     throw invalid(409,'Verlofcontrole komt niet overeen met het personeelsdossier');
    const now=FieldValue.serverTimestamp();
    tx.update(ref,{status,reason,resolvedAt:now,resolvedBy:actor,
     resolvedByUid:req.bpd.uid});
    tx.create(entry,{type:'activiteit',reportCategory:'activiteit',
     dept:scope.dept,subjectDiscordId:scope.discordId,
     subjectNameAtCreation:scope.subject.name,
     subjectCallAtCreation:scope.subject.call,
     eventDate:date,createdAt:now,modifiedAt:null,
     source:'leave_return_followup',leaveReturnId:scope.id,
     details:'Verlofterugkeer gecontroleerd: CHECKING → '+status+
      '. Verlof eindigde op '+prior.get('endDate')+'. Reden: '+reason+
      '. Dit is een opvolgbeslissing; officiële personeelsstatus wordt afzonderlijk aangepast.',
     registeredBy:actor,submittedBy:{uid:req.bpd.uid}});
    tx.create(serviceNotice,{caseId:scope.dept+'_'+scope.discordId,entryId:entry.id,
     type:'activiteit',dept:scope.dept,createdAt:now,
     source:'leave_return_followup'});
   });
   return res.json({ok:true,status,loggedInDossier:true,reportCategory:'activiteit',
    officialPersonnelStatusUnchanged:true});
  }catch(e){
   return res.status(e.status||503).json({error:e.status?e.message:'Verlofcontrole niet opgeslagen'});
  }
 });
}

export async function runLeaveReturnChecks({getSnapshot,db=getFirestore(),
 env=process.env,now=new Date()}={}){
 if(!enabled(env))return {enabled:false,created:0};
 const snapshot=await getSnapshot();
 if(snapshot.stale||!Array.isArray(snapshot.data))
  return {enabled:true,created:0,skipped:'stale_roster'};
 const leaves=await db.collection('bpd_leave_requests')
   .where('status','==','approved').limit(1501).get();
 if(leaves.size>1500)return {enabled:true,created:0,skipped:'leave_limit'};
 const today=brusselsDay(now);
 const due=dueLeaveReturns(leaves.docs.map(x=>x.data()),snapshot.data,today);
 if(due.length>300)return {enabled:true,created:0,skipped:'review_limit'};
 let created=0;
 for(const item of due){
  const ref=db.collection(RETURN_CHECK_COLLECTION).doc(item.id);
  const inserted=await db.runTransaction(async tx=>{
   const snap=await tx.get(ref);
   if(snap.exists)return false;
   tx.create(ref,{...item,status:'CHECKING',readBy:{},
    createdAt:FieldValue.serverTimestamp(),source:'approved_leave_return'});
   return true;
  });
  if(inserted)created++;
 }
 return {enabled:true,created,considered:due.length};
}
export function scheduleLeaveReturnChecks({getSnapshot,env=process.env}){
 if(!enabled(env))return null;
 let running=false;
 const tick=async()=>{
  if(running)return;
  running=true;
  try{console.info('Verlofterugkeer:',JSON.stringify(
   await runLeaveReturnChecks({getSnapshot,env})))}
  catch(e){console.warn('Verlofterugkeercontrole mislukt:',e?.code||'controle_mislukt')}
  finally{running=false}
 };
 const initial=setTimeout(()=>void tick(),45000);
 const interval=setInterval(()=>void tick(),60*60*1000);
 initial.unref?.();interval.unref?.();
 return {stop:()=>{clearTimeout(initial);clearInterval(interval)}};
}
