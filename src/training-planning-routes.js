import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {TRAINING_REQUEST_COURSE_CATALOG} from '../public/training-course-catalog.js';
import {PATHWAY_COLLECTION,PERSONAL_PATHWAY_COLLECTION,keyName,basePathwayCourses} from './training-pathway-policy.js';
import {getBelgiumPdDisplayRoles} from './bpd-discord-users-display.js';
import {
 PLANNING_TRACKS,PLANNING_ASSIGNMENTS,PLANNING_CONFIG,PLANNING_STATUSES,
 planningTrack,planningManager,planningConfigurator,planningOwnMembership,
 eligiblePlanningMembers,planningAEVariants,planningAudienceMatch,planningCourseAllowed,
 validatePlanningAudience,validatePlanningAssignment,planningAssignmentKey
} from './training-planning-policy.js';

const deny=(status,message)=>Object.assign(Error(message),{status});
const error=(res,e)=>{
 if(e?.status)return res.status(e.status).json({error:e.message});
 console.warn('Opleidingsplanning:',e?.code||e?.message||'storage_error');
 return res.status(503).json({error:'Opleidingsplanning tijdelijk niet beschikbaar'});
};
const db=()=>getFirestore();
const plans=()=>db().collection(PLANNING_ASSIGNMENTS);
const personal=()=>db().collection(PERSONAL_PATHWAY_COLLECTION);
const configs=()=>db().collection(PLANNING_CONFIG);
const hash=v=>createHash('sha256').update(v).digest('hex');
const did=req=>req.bpd?.discordId;
const author=req=>({discordId:did(req),role:req.bpd?.role||''});
const bodyObject=v=>v&&typeof v==='object'&&!Array.isArray(v);
const dateName=s=>typeof s==='string'?s.trim().slice(0,120):'';
const ownConfig=v=>({
 extraCourses:Array.isArray(v?.extraCourses)?v.extraCourses.filter(x=>typeof x==='string').slice(0,40):[],
 audiences:Array.isArray(v?.audiences)?v.audiences.filter(x=>x&&typeof x==='object').slice(0,25):[]
});
const builtins=()=>[
 {id:'alle',kind:'alle',value:'',label:'Alle personeelsleden (handmatig aanvinken)'},
 {id:'kandidaten',kind:'kandidaten',value:'',label:'Nieuwe kandidaten zonder specialisatie'}
];
const aeAudiences=[
 {id:'ae_alle',kind:'ae_variant',value:'alle',label:'AE · alle varianten'},
 {id:'ae_i',kind:'ae_variant',value:'AE-I',label:'AE-I · SRT'},
 {id:'ae_t',kind:'ae_variant',value:'AE-T',label:'AE-T · DSU'},
 {id:'ae_f',kind:'ae_variant',value:'AE-F',label:'AE-F'},
 {id:'ae_instructeur',kind:'ae_variant',value:'instructeur',label:'AE-instructeurs'},
 {id:'ae_leiding',kind:'ae_variant',value:'leiding',label:'AE-leiding'}
];
const safeConfig=(conf,track)=>({extraCourses:conf.extraCourses,
 audiences:[...builtins(),...(track.id==='politie:ae'?aeAudiences:[]),...conf.audiences]});
async function verifiedRoles(req){
 const id=did(req);
 if(!/^\d{15,22}$/.test(String(id||'')))return [];
 const snap=await db().collection('bpd_discord_auth').doc(id).get();
 const d=snap.data()||{},now=Date.now();
 if(!snap.exists||d.guildId!==process.env.DISCORD_GUILD_ID||
    !Number.isSafeInteger(d.verifiedAt)||d.verifiedAt>now||
    now-d.verifiedAt>24*60*60*1000||!Array.isArray(d.roleIds))return [];
 return d.roleIds;
}
async function scoped(req,getSnapshot){
 const data=await getSnapshot();
 if(data.stale||!Array.isArray(data.data))throw deny(503,'Personeelsbron is niet actueel');
 const roles=await verifiedRoles(req);
 const roster=data.data;
 const tracks=PLANNING_TRACKS.filter(t=>
   planningOwnMembership(req.bpd,roster,t.department)&&
   planningManager(req.bpd,t,roles));
 return {tracks,roster,roles};
}
function allowedTrack(scopedData,id){
 const track=scopedData.tracks.find(t=>t.id===id);
 if(!track)throw deny(403,'Geen bevoegdheid voor deze opleidingsspecialisatie');
 return track;
}
async function configFor(track){
 const d=await configs().doc(track.id).get();
 return ownConfig(d.data()||{});
}
async function subjectSelection(req,getSnapshot,trackId,audienceId){
 const scope=await scoped(req,getSnapshot),track=allowedTrack(scope,trackId);
 const configuration=await configFor(track);
 const audience=safeConfig(configuration,track).audiences.find(x=>x.id===audienceId);
 if(!audience)throw deny(400,'Kies een geldige doelgroep voor deze specialisatie');
 // Verified member API is DISPLAY EVIDENCE ONLY. Instructor permissions
 // are checked against their separate authenticated authorization record.
 const upstream=track.id==='politie:ae'?await getBelgiumPdDisplayRoles():null;
 const roleMap=upstream?.status==='ok'&&upstream.entries instanceof Map?
   upstream.entries:new Map();
 const eligible=eligiblePlanningMembers(scope.roster,track.department);
 const people=eligible.filter(p=>planningAudienceMatch(p,track,audience,
   roleMap.get(p.personId)||[]));
 if(people.length>1000)throw deny(503,'Doelgroep te groot; beperk je selectie');
 const raw=scope.roster.filter(p=>p?.dept===track.department&&
   !['archived','pending'].includes(p.lifecycleState));
 return {track,configuration,audience,people,scope,roleMap,
   skipped:Math.max(0,raw.length-eligible.length),
   roleSource:upstream?.status==='ok'?'geverifieerd':'personeelslijst'};
}
function publicPerson(p,track,roleMap){
 return {discordId:p.personId,name:dateName(p.name)||'Onbekende medewerker',
  call:dateName(p.call),rank:dateName(p.rank),
  series:dateName(p.seriesRaw||p.series),
  variants:track.id==='politie:ae'?
    planningAEVariants(p,roleMap.get(p.personId)||[]):[]};
}
async function allAvailableCourses(dept){
 const snapshot=await db().collection(PATHWAY_COLLECTION).where('department','==',dept).limit(201).get();
 if(snapshot.size>200)throw deny(503,'Opleidingscatalogus onvolledig');
 return [...new Set([...(TRAINING_REQUEST_COURSE_CATALOG[dept]||[]),
   ...snapshot.docs.filter(d=>d.get('active')!==false).map(d=>d.get('name'))
     .filter(x=>typeof x==='string')])];
}
function responseScope(track,config,actor){
 return {id:track.id,department:track.department,label:track.label,
  courses:[...new Set([...track.courses,...config.extraCourses])],
  canConfigureCourses:planningConfigurator(actor,track),
  audiences:safeConfig(config,track).audiences};
}
export function installTrainingPlanningRoutes(app,{requireUser,getSnapshot}){
 app.get('/api/training-planning/context',requireUser,async(req,res)=>{
  try{
   const scope=await scoped(req,getSnapshot);
   const configsFound=await Promise.all(scope.tracks.map(configFor));
   const result=scope.tracks.map((t,i)=>responseScope(t,configsFound[i],req.bpd));
   // Every member sees only their own planning items, not colleagues' dossier.
   const own=await plans().where('subjectDiscordId','==',did(req)).limit(201).get();
   if(own.size>200)throw deny(503,'Eigen planningsoverzicht onvolledig');
   res.set('Cache-Control','private, no-store');
   res.json({tracks:result,mine:own.docs.map(d=>({id:d.id,...d.data()}))
    .map(x=>({id:x.id,trackId:x.trackId,trackLabel:x.trackLabel,
      courseName:x.courseName,status:x.status,plannedDay:x.plannedDay||'',
      note:x.note||'',department:x.department}))
    .filter(x=>x.status!=='geannuleerd')});
  }catch(e){error(res,e)}
 });
 app.get('/api/training-planning/people',requireUser,async(req,res)=>{
  try{
   const id=String(req.query?.trackId||''),aud=String(req.query?.audienceId||'alle');
   const {people,track,audience,roleMap,skipped,roleSource}=
     await subjectSelection(req,getSnapshot,id,aud);
   res.set('Cache-Control','private, no-store');
   res.json({trackId:track.id,department:track.department,audience,
    people:people.map(p=>publicPerson(p,track,roleMap)),
    skippedUnlinked:skipped,aeRoleSource:roleSource});
  }catch(e){error(res,e)}
 });
 app.get('/api/training-planning/assigned',requireUser,async(req,res)=>{
  try{
   const scope=await scoped(req,getSnapshot);
   const id=String(req.query?.trackId||'');
   const track=allowedTrack(scope,id);
   const result=await plans().where('trackId','==',track.id).limit(301).get();
   if(result.size>300)throw deny(503,'Planningsoverzicht te groot; kan niet volledig worden getoond');
   const actual=new Map(eligiblePlanningMembers(scope.roster,track.department)
     .map(p=>[p.personId,p]));
   res.set('Cache-Control','private, no-store');
   res.json({trackId:track.id,items:result.docs.map(d=>({id:d.id,...d.data()}))
    .filter(x=>actual.has(x.subjectDiscordId))
    .map(x=>({id:x.id,courseName:x.courseName,status:x.status,
      mandatoryProposal:x.mandatoryProposal===true,
      name:dateName(actual.get(x.subjectDiscordId).name),
      call:dateName(actual.get(x.subjectDiscordId).call),
      plannedDay:x.plannedDay||'',subjectDiscordId:x.subjectDiscordId,
      updatedAt:x.updatedAt?.toDate?.()?.toISOString()||null}))
    .sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))});
  }catch(e){error(res,e)}
 });
 app.post('/api/training-planning/audiences',requireUser,async(req,res)=>{
  try{
   const data=validatePlanningAudience(req.body);
   const scope=await scoped(req,getSnapshot);
   const track=allowedTrack(scope,data.trackId);
   const ref=configs().doc(track.id),by=author(req),at=FieldValue.serverTimestamp();
   let id='';
   await db().runTransaction(async tx=>{
    const snap=await tx.get(ref),conf=ownConfig(snap.data()||{});
    if(conf.audiences.length>=20)throw deny(409,'Maximum 20 eigen doelgroepen per specialisatie');
    if(conf.audiences.some(a=>a.kind===data.kind&&keyName(a.value)===keyName(data.value)&&
       keyName(a.label)===keyName(data.label)))
      throw deny(409,'Deze doelgroep bestaat al');
    id='groep_'+hash(track.id+'|'+data.kind+'|'+keyName(data.value)+'|'+keyName(data.label)).slice(0,22);
    const audiences=[...conf.audiences,{id,...data}];
    tx.set(ref,{audiences,updatedAt:at},{merge:true});
    tx.create(ref.collection('audit').doc(),{type:'audience_created',id,by,at,body:data});
   });
   res.status(201).json({saved:true,id});
  }catch(e){error(res,e)}
 });
 app.post('/api/training-planning/audiences/remove',requireUser,async(req,res)=>{
  try{
   if(!bodyObject(req.body)||Object.keys(req.body).some(k=>!['trackId','audienceId'].includes(k)))
     throw deny(400,'Ongeldige doelgroep');
   const scope=await scoped(req,getSnapshot),track=allowedTrack(scope,req.body.trackId);
   const id=req.body.audienceId;
   if(typeof id!=='string'||!/^groep_[a-f0-9]{22}$/.test(id))
     throw deny(400,'Alleen eigen doelgroepen kunnen worden verwijderd');
   const ref=configs().doc(track.id),by=author(req),at=FieldValue.serverTimestamp();
   await db().runTransaction(async tx=>{
    const snap=await tx.get(ref),conf=ownConfig(snap.data()||{});
    if(!conf.audiences.some(x=>x.id===id))throw deny(404,'Doelgroep niet gevonden');
    tx.set(ref,{audiences:conf.audiences.filter(x=>x.id!==id),updatedAt:at},{merge:true});
    tx.create(ref.collection('audit').doc(),{type:'audience_removed',id,by,at});
   });
   res.json({saved:true});
  }catch(e){error(res,e)}
 });
 app.get('/api/training-planning/catalog',requireUser,async(req,res)=>{
  try{
   const scope=await scoped(req,getSnapshot),track=allowedTrack(scope,String(req.query?.trackId||''));
   if(!planningConfigurator(req.bpd,track))throw deny(403,'Alleen dienstleiding mag cursusrechten beheren');
   const available=await allAvailableCourses(track.department);
   const config=await configFor(track);
   res.set('Cache-Control','private, no-store');
   res.json({available,selected:config.extraCourses,defaults:track.courses});
  }catch(e){error(res,e)}
 });
 app.post('/api/training-planning/catalog',requireUser,async(req,res)=>{
  try{
   const data=req.body;
   if(!bodyObject(data)||Object.keys(data).some(x=>!['trackId','extraCourses'].includes(x))||
      !Array.isArray(data.extraCourses)||data.extraCourses.length>30||
      data.extraCourses.some(x=>typeof x!=='string'||x.length>150))
      throw deny(400,'Kies maximaal 30 bestaande opleidingen');
   const scope=await scoped(req,getSnapshot),track=allowedTrack(scope,data.trackId);
   if(!planningConfigurator(req.bpd,track))throw deny(403,'Alleen dienstleiding mag cursusrechten wijzigen');
   const available=await allAvailableCourses(track.department);
   if(data.extraCourses.some(x=>!available.some(y=>keyName(y)===keyName(x))))
     throw deny(400,'Opleiding is niet beschikbaar voor deze dienst');
   const normalized=[...new Set(data.extraCourses.map(x=>
     available.find(y=>keyName(x)===keyName(y))))].filter(x=>
     !track.courses.some(y=>keyName(y)===keyName(x)));
   const ref=configs().doc(track.id),at=FieldValue.serverTimestamp(),by=author(req);
   const batch=db().batch();batch.set(ref,{extraCourses:normalized,updatedAt:at},{merge:true});
   batch.create(ref.collection('audit').doc(),{type:'course_scope_updated',
     extraCourses:normalized,by,at});
   await batch.commit();res.json({saved:true,courses:normalized});
  }catch(e){error(res,e)}
 });
 app.post('/api/training-planning/assign',requireUser,async(req,res)=>{
  try{
   const data=validatePlanningAssignment(req.body);
   const {track,people,configuration}=await subjectSelection(req,getSnapshot,
     data.trackId,data.audienceId);
   if(!planningCourseAllowed(data.courseName,track,configuration))
     throw deny(403,'Deze opleider mag de gekozen opleiding niet plannen');
   const personMap=new Map(people.map(p=>[p.personId,p]));
   if(data.subjectIds.some(id=>!personMap.has(id)))
     throw deny(403,'Een of meer personen horen niet tot deze doelgroep');
   let courseRef=null,courseName=data.courseName;
   if(data.proposeMandatory){
    const catalog=await db().collection(PATHWAY_COLLECTION)
      .where('department','==',track.department).limit(201).get();
    if(catalog.size>200)throw deny(503,'Opleidingscatalogus onvolledig');
    const matches=catalog.docs.filter(d=>d.get('active')!==false&&!d.get('zone')&&
      keyName(d.get('name'))===keyName(data.courseName));
    if(matches.length>1)throw deny(409,'Dubbele opleiding in catalogus; controle vereist');
    if(matches.length===1){courseRef=matches[0].ref;courseName=matches[0].get('name')}
    else{
     const existing=basePathwayCourses(track.department).find(x=>
       keyName(x.name)===keyName(data.courseName));
     if(!existing)throw deny(409,
       'Voeg deze opleiding eerst toe aan de Opleidingsmatrix voor verplichte voorstellen');
     courseName=existing.name;
     courseRef=db().collection(PATHWAY_COLLECTION).doc(
       'planning'+hash(track.department+'|'+keyName(courseName)).slice(0,28));
    }
   }
   const by=author(req),at=FieldValue.serverTimestamp();
   const refs=data.subjectIds.map(id=>plans().doc(
     planningAssignmentKey(track.id,data.courseName,id,hash)));
   const mandatoryRefs=courseRef?data.subjectIds.map(id=>
     personal().doc(courseRef.id+'_'+id)):[];
   await db().runTransaction(async tx=>{
    // Firestore requires ALL reads to precede the first write.
    const existing=await Promise.all(refs.map(ref=>tx.get(ref)));
    const currentCourse=courseRef?await tx.get(courseRef):null;
    const existingRequirements=await Promise.all(mandatoryRefs.map(ref=>tx.get(ref)));
    if(currentCourse?.exists&&
       (currentCourse.get('department')!==track.department||
        keyName(currentCourse.get('name'))!==keyName(courseName)||
        currentCourse.get('active')===false||Boolean(currentCourse.get('zone'))))
       throw deny(409,'Opleidingscatalogus gewijzigd; vernieuw de pagina');
    if(existingRequirements.some(x=>x.exists&&x.get('pending')))
       throw deny(409,'Er loopt al een verplichtingsvoorstel voor een geselecteerde deelnemer');
    if(courseRef&&!currentCourse.exists){
     tx.create(courseRef,{department:track.department,name:courseName,
       description:'Bestaande opleiding',zone:'',source:'standaard',
       active:true,mandatory:false,targetKind:'alle',targetValue:'',
       effectiveDate:null,validMonths:0,pending:null,
       createdAt:at,updatedAt:at,createdBy:by});
    }
    for(let i=0;i<refs.length;i++){
     const subject=personMap.get(data.subjectIds[i]),old=existing[i];
     const current={department:track.department,trackId:track.id,
       trackLabel:track.label,courseName:data.courseName,
       subjectDiscordId:subject.personId,subjectName:dateName(subject.name),
       subjectCall:dateName(subject.call),audienceId:data.audienceId,
       status:data.status,plannedDay:data.plannedDay,note:data.note,
       mandatoryProposal:data.proposeMandatory===true,
       assignedBy:by.discordId,updatedAt:at};
     if(old.exists)tx.update(refs[i],current);
     else tx.create(refs[i],{...current,createdAt:at});
     tx.create(refs[i].collection('audit').doc(),
       {type:old.exists?'planning_updated':'planning_assigned',by,at,
        status:data.status,plannedDay:data.plannedDay,audienceId:data.audienceId,
        mandatoryProposal:data.proposeMandatory,
        previousStatus:old.exists?old.get('status')||null:null});
     if(courseRef){
      const reqRef=mandatoryRefs[i],oldReq=existingRequirements[i];
      // An already approved individual requirement remains valid; no repeat.
      if(oldReq.exists&&oldReq.get('active')===true)continue;
      const proposal={mandatory:true,effectiveDate:new Date().toISOString().slice(0,10),
        validMonths:0,reason:data.mandatoryReason,stage:'ok',
        proposedBy:by.discordId,okBy:null};
      const document={courseId:courseRef.id,courseName,department:track.department,
        zone:'',subjectDiscordId:subject.personId,subjectName:dateName(subject.name),
        subjectCall:dateName(subject.call),pending:proposal,updatedAt:at};
      if(oldReq.exists)tx.update(reqRef,document);
      else tx.create(reqRef,{...document,active:false,effectiveDate:null,
        validMonths:0,createdAt:at});
      tx.create(reqRef.collection('audit').doc(),
        {type:'person_requirement_proposed_from_planning',by,at,
         proposal,trackId:track.id});
     }
    }
   });
   res.json({saved:true,participants:data.subjectIds.length,status:data.status,
     mandatoryProposed:data.proposeMandatory,
     note:'Plannen of voorstellen maakt een opleiding pas verplicht na goedkeuring van OK en KL'});
  }catch(e){error(res,e)}
 });
 app.post('/api/training-planning/cancel',requireUser,async(req,res)=>{
  try{
   const id=String(req.body?.id||''),trackId=String(req.body?.trackId||'');
   if(!/^[a-f0-9]{36}$/.test(id)||!planningTrack(trackId))
     throw deny(400,'Ongeldige opleidingstoewijzing');
   const scope=await scoped(req,getSnapshot),track=allowedTrack(scope,trackId);
   const ref=plans().doc(id),at=FieldValue.serverTimestamp(),by=author(req);
   await db().runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists||snap.get('trackId')!==track.id)
      throw deny(404,'Planning niet gevonden voor deze specialisatie');
    tx.update(ref,{status:'geannuleerd',updatedAt:at});
    tx.create(ref.collection('audit').doc(),{type:'planning_cancelled',by,at,
      previousStatus:snap.get('status')||null});
   });
   res.json({saved:true});
  }catch(e){error(res,e)}
 });
}
