import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {TRAINING_ROLE_IDS} from './role-catalog.js';
import {
 PATHWAY_COLLECTION,PERSONAL_PATHWAY_COLLECTION,GROUP_PATHWAY_COLLECTION,PATHWAY_DEPARTMENTS,keyName,authorizedOwnDepartments,
 canManagePathway,canManageIndividualPathway,canApprovePathway,validPathwayCourse,validRequirement,
 validIndividualRequirement,uniquePathwaySubject,effectivePathwayCourse,
 groupRequirementApplies,pathwaySpecialtyLabels,
 basePathwayCourses,publicPathwayCourse,pathwayProgress,recordRelevantToCourse
} from './training-pathway-policy.js';

const ID=/^\d{15,22}$/;
const fail=(status,message)=>Object.assign(Error(message),{status});
const responseError=(res,e)=>{
 if(e?.status)return res.status(e.status).json({error:e.message});
 console.warn('Opleidingstraject:',e?.code||'opslag tijdelijk niet beschikbaar');
 return res.status(503).json({error:'Opleidingsmatrix tijdelijk niet beschikbaar'});
};
const db=()=>getFirestore();
const collection=()=>db().collection(PATHWAY_COLLECTION);
const personalCollection=()=>db().collection(PERSONAL_PATHWAY_COLLECTION);
const groupCollection=()=>db().collection(GROUP_PATHWAY_COLLECTION);
const actorId=req=>req.bpd?.discordId;
const auditActor=req=>({discordId:actorId(req),role:req.bpd?.role||''});
const ensureRoster=async(req,getSnapshot)=>{
 const snap=await getSnapshot();
 if(snap.stale)throw fail(503,'Personeelsbron is niet actueel');
 const departments=authorizedOwnDepartments(req.bpd,snap.data||[]);
 if(!departments.length)throw fail(403,'Geen geverifieerde eigen personeelsfiche gevonden');
 return {persons:(snap.data||[]).filter(p=>p.personId===actorId(req)&&departments.includes(p.dept)),
   departments,roster:snap.data||[]};
};
async function instructors(req){
 if(!ID.test(actorId(req)))return new Set();
 const doc=await db().collection('bpd_discord_auth').doc(actorId(req)).get();
 const d=doc.data()||{},now=Date.now();
 if(!doc.exists||d.guildId!==process.env.DISCORD_GUILD_ID||
   !Number.isSafeInteger(d.verifiedAt)||d.verifiedAt>now||
   now-d.verifiedAt>24*60*60*1000||!Array.isArray(d.roleIds))return new Set();
 return new Set(d.roleIds);
}
const manage=(req,dept,roles)=>canManagePathway(req.bpd,dept,
  (TRAINING_ROLE_IDS[dept]?.instructors||[]).some(id=>roles.has(id))&&
  req.bpd.departments?.includes(dept));
function cleanDoc(doc){return {id:doc.id,...doc.data()};}
export function installTrainingPathwayRoutes(app,{requireUser,getSnapshot}){
 app.get('/api/training-pathway',requireUser,async(req,res)=>{
  try{
   const {persons,departments}=await ensureRoster(req,getSnapshot);
   const [catalog,assignments,groupSnap,applications,...regDocs]=await Promise.all([
    collection().limit(501).get(),
    personalCollection().where('subjectDiscordId','==',actorId(req)).limit(151).get(),
    groupCollection().limit(501).get(),
    db().collection('bpd_training_requests').where('applicantDiscordId','==',actorId(req))
      .limit(151).get(),
    ...departments.map(dept=>db().collection('bpd_training')
      .doc(dept+'_'+actorId(req)).collection('records')
      .orderBy('createdAt','desc').limit(301).get())
   ]);
   if(catalog.size>500||assignments.size>150||groupSnap.size>500||applications.size>150||regDocs.some(d=>d.size>300))
     throw fail(503,'Opleidingsgegevens onvolledig; er worden geen resultaten gegist');
   const all=catalog.docs.map(cleanDoc),
     personalAssignments=assignments.docs.map(cleanDoc),
     groupRequirements=groupSnap.docs.map(cleanDoc),requests=applications.docs.map(d=>d.data());
   const roles=await instructors(req);
   const result=departments.map((dept,i)=>{
    const person=persons.find(p=>p.dept===dept);
    const records=regDocs[i].docs.map(d=>d.data());
    const custom=all.filter(c=>c.department===dept&&c.active!==false);
    const originals=basePathwayCourses(dept).filter(c=>
      !custom.some(o=>keyName(o.name)===keyName(c.name)));
    const available=[...originals,...custom].filter(c=>recordRelevantToCourse(person,c));
    return {department:dept,zone:person.zone||person.fireZone||person.zoneName||null,
      canManage:manage(req,dept,roles),
      courses:available.map(course=>{
       const individual=personalAssignments.find(a=>a.courseId===course.id&&
         a.department===dept&&a.subjectDiscordId===person.personId);
       const groupRules=groupRequirements.filter(g=>g.courseId===course.id);
       const effective=effectivePathwayCourse(person,course,groupRules,individual);
       return {...publicPathwayCourse(course),
        ...pathwayProgress(person,effective,records,requests),
        individuallyRequired:effective.mandatory===true&&
          individual?.active===true&&individual.subjectDiscordId===person.personId,
        scopedRequired:groupRules.some(g=>groupRequirementApplies(person,course,g))};
      })};
   });
   res.set('Cache-Control','private, no-store');
   res.json({departments:result,readOnlyResults:true});
  }catch(e){responseError(res,e)}
 });
 app.get('/api/training-pathway/manage',requireUser,async(req,res)=>{
  try{
   const {departments}=await ensureRoster(req,getSnapshot);
   const roles=await instructors(req),manageable=departments.filter(d=>manage(req,d,roles));
   const reviewer=canApprovePathway(req.bpd,'ok')||canApprovePathway(req.bpd,'kl');
   if(!manageable.length&&!reviewer)throw fail(403,'Geen opleidingsbeheerrechten');
   const [docs,indDocs,groupDocs]=await Promise.all([
     collection().limit(501).get(),personalCollection().limit(501).get(),
     groupCollection().limit(501).get()]);
   if(docs.size>500||indDocs.size>500||groupDocs.size>500)
     throw fail(503,'Opleidingscatalogus of verplichtingen onvolledig');
   const courses=docs.docs.map(cleanDoc).filter(d=>manageable.includes(d.department)||reviewer)
     .map(d=>({...publicPathwayCourse(d),
       createdBy:d.createdBy?.discordId||null,
       pending:d.pending?{...d.pending,
         reason:d.pending.reason||'',proposedBy:d.pending.proposedBy||null,
         okBy:d.pending.okBy||null}:null}));
   const visibleCourses=new Set(courses.map(c=>c.id));
   const individualManageable=manageable.filter(d=>
     canManageIndividualPathway(req.bpd,d));
   const assignments=indDocs.docs.map(cleanDoc)
     .filter(x=>visibleCourses.has(x.courseId)&&
       (individualManageable.includes(x.department)||reviewer))
     .map(x=>({id:x.id,courseId:x.courseId,courseName:x.courseName,
       department:x.department,zone:x.zone||'',subjectDiscordId:x.subjectDiscordId,
       subjectName:x.subjectName||'',subjectCall:x.subjectCall||'',
       active:x.active===true,effectiveDate:x.effectiveDate||null,
       pending:x.pending?{...x.pending,reason:x.pending.reason||''}:null}));
   const groupRequirements=groupDocs.docs.map(cleanDoc)
    .filter(x=>visibleCourses.has(x.courseId)&&
      (individualManageable.includes(x.department)||reviewer))
    .map(x=>({id:x.id,courseId:x.courseId,courseName:x.courseName,
      department:x.department,zone:x.zone||'',targetKind:x.targetKind,
      targetValue:x.targetValue||'',active:x.active===true,
      effectiveDate:x.effectiveDate||null,validMonths:x.validMonths||0,
      pending:x.pending?{...x.pending,reason:x.pending.reason||''}:null}));
   const availableCatalog=manageable.flatMap(dept=>
     basePathwayCourses(dept).filter(base=>
       !docs.docs.some(doc=>doc.get('department')===dept&&
         keyName(doc.get('name'))===keyName(base.name)&&!doc.get('zone')))
       .map(course=>({department:dept,name:course.name})));
   res.set('Cache-Control','private, no-store');
   res.json({manageable,individualManageable,reviewStages:{
    ok:canApprovePathway(req.bpd,'ok'),kl:canApprovePathway(req.bpd,'kl')},
    courses,assignments,groupRequirements,availableCatalog});
  }catch(e){responseError(res,e)}
 });
 // Alleen bevoegd kader kan een medewerker selecteren. Naam, roepnummer en graad
 // komen uit de actuele personeelslijst, niet uit browserinput.
 app.get('/api/training-pathway/people',requireUser,async(req,res)=>{
  try{
   const {departments,roster}=await ensureRoster(req,getSnapshot);
   const id=String(req.query?.courseId||'');
   if(!/^[A-Za-z0-9]{12,40}$/.test(id))throw fail(400,'Selecteer een opleiding');
   const snap=await collection().doc(id).get();
   if(!snap.exists||snap.get('active')===false)throw fail(404,'Opleiding niet gevonden');
   const course={id,...snap.data()};
   if(!departments.includes(course.department)||
      !canManageIndividualPathway(req.bpd,course.department))
     throw fail(403,'Alleen bevoegd kader mag individuele verplichtingen voorstellen');
   const matches=roster.filter(p=>p.dept===course.department&&
     ID.test(p.personId)&&!['archived','pending'].includes(p.lifecycleState)&&
     recordRelevantToCourse(p,course));
   if(matches.length>1000)throw fail(503,'Personeelslijst te groot voor een veilige selectie');
   const counts=new Map();
   for(const p of matches)counts.set(p.personId,(counts.get(p.personId)||0)+1);
   const people=matches.filter(p=>counts.get(p.personId)===1)
     .map(p=>({discordId:p.personId,name:String(p.name||'').slice(0,120),
       call:String(p.call||'').slice(0,30),rank:String(p.rank||'').slice(0,90)}))
     .sort((a,b)=>a.name.localeCompare(b.name,'nl')||
       a.call.localeCompare(b.call,'nl'));
   const ranks=[...new Set(matches.flatMap(p=>[p.rank,p.kader])
     .filter(x=>typeof x==='string'&&x.trim()))].sort((a,b)=>a.localeCompare(b,'nl'));
   const series=[...new Set(matches.map(p=>String(p.seriesRaw||p.series||'').trim())
     .filter(x=>/^(?:reeks\s*)?0?[1-9]\d?$/i.test(x)))].sort((a,b)=>a.localeCompare(b,'nl'));
   const specializations=[...new Set(matches.flatMap(p=>pathwaySpecialtyLabels(p)))]
     .sort((a,b)=>a.localeCompare(b,'nl'));
   res.set('Cache-Control','private, no-store');
   res.json({department:course.department,courseId:id,people,
     audiences:{ranks,series,specializations}});
  }catch(e){responseError(res,e)}
 });

 // Een bestaande opleiding uit de officiële catalogus activeren voor beheer;
 // opleidingsresultaten worden NIET gedupliceerd of aangepast.
 app.post('/api/training-pathway/catalog-activate',requireUser,async(req,res)=>{
  try{
   const {departments}=await ensureRoster(req,getSnapshot);
   const roles=await instructors(req);
   const body=req.body;
   if(!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).some(k=>!['department','name'].includes(k))||
      typeof body.name!=='string'||body.name.length>150)
     throw fail(400,'Kies een bestaande catalogusopleiding');
   const dept=String(body.department||'');
   if(!departments.includes(dept)||!manage(req,dept,roles))
     throw fail(403,'Geen recht om opleidingen voor deze dienst te beheren');
   const found=basePathwayCourses(dept).find(x=>keyName(x.name)===keyName(body.name));
   if(!found)throw fail(400,'Deze opleiding staat niet in de officiële catalogus');
   const old=await collection().where('department','==',dept).limit(201).get();
   if(old.size>200)throw fail(503,'Opleidingscatalogus onvolledig');
   if(old.docs.some(x=>keyName(x.get('name'))===keyName(found.name)&&!x.get('zone')))
     throw fail(409,'Deze opleiding is al beschikbaar in beheer');
   const ref=collection().doc(),at=FieldValue.serverTimestamp(),by=auditActor(req);
   const batch=db().batch();
   batch.create(ref,{department:dept,name:found.name,description:found.description,
     zone:'',source:'standaard',active:true,mandatory:false,
     targetKind:'alle',targetValue:'',effectiveDate:null,validMonths:0,
     pending:null,createdBy:by,createdAt:at,updatedAt:at});
   batch.create(ref.collection('audit').doc(),{type:'standard_course_activated',by,at});
   await batch.commit();
   res.status(201).json({saved:true,id:ref.id});
  }catch(e){responseError(res,e)}
 });
 // Voor iedere doelgroep een afzonderlijke, controleerbare verplichting.
 // Nieuwe reeksen, rangen en specialisaties overschrijven andere regels niet.
 app.post('/api/training-pathway/courses/:id/group-requirement',requireUser,async(req,res)=>{
  try{
   const {departments}=await ensureRoster(req,getSnapshot);
   const proposal=validRequirement(req.body),courseId=String(req.params.id||'');
   if(!/^[A-Za-z0-9]{12,40}$/.test(courseId))
     throw fail(400,'Ongeldige opleiding');
   const courseRef=collection().doc(courseId);
   const ruleHash=createHash('sha256').update(courseId+'|'+proposal.targetKind+
     '|'+keyName(proposal.targetValue)).digest('hex').slice(0,24);
   const ref=groupCollection().doc(courseId+'_'+ruleHash);
   await db().runTransaction(async tx=>{
    const [doc,old]=await Promise.all([tx.get(courseRef),tx.get(ref)]);
    if(!doc.exists||doc.get('active')===false)
      throw fail(404,'Opleiding niet gevonden');
    const course={id:courseId,...doc.data()};
    if(!departments.includes(course.department)||
       !canManageIndividualPathway(req.bpd,course.department))
      throw fail(403,'Alleen bevoegd kader kan opleidingen verplicht stellen');
    if(old.exists&&old.get('pending'))throw fail(409,'Voor deze doelgroep is al een voorstel in behandeling');
    if(!proposal.mandatory&&(!old.exists||old.get('active')!==true))
      throw fail(409,'Voor deze doelgroep bestaat geen actieve verplichting om op te heffen');
    const at=FieldValue.serverTimestamp(),by=auditActor(req),
      data={courseId,courseName:course.name,department:course.department,
       zone:course.zone||'',targetKind:proposal.targetKind,
       targetValue:proposal.targetValue,updatedAt:at,
       pending:{...proposal,stage:'ok',proposedBy:by.discordId,okBy:null}};
    if(old.exists)tx.update(ref,data);
    else tx.create(ref,{...data,active:false,effectiveDate:null,
       validMonths:0,createdAt:at});
    tx.create(ref.collection('audit').doc(),
      {type:'group_requirement_proposed',by,proposal,at});
   });
   res.json({saved:true,stage:'ok'});
  }catch(e){responseError(res,e)}
 });
 app.post('/api/training-pathway/group-requirements/:id/review',requireUser,async(req,res)=>{
  try{
   const id=String(req.params.id||'');
   if(!/^[A-Za-z0-9]{12,40}_[a-f0-9]{24}$/.test(id))
     throw fail(400,'Ongeldige groepsverplichting');
   if(!['approve','reject'].includes(req.body?.decision)||
      typeof req.body?.reason!=='string'||req.body.reason.trim().length<10||
      req.body.reason.length>500||/[<>\x00-\x1f\x7f]/.test(req.body.reason))
     throw fail(400,'Beoordeling met motivering van 10–500 tekens verplicht');
   const ref=groupCollection().doc(id);
   await db().runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists)throw fail(404,'Groepsverplichting niet gevonden');
    const data=snap.data(),pending=data.pending;
    if(!pending||!['ok','kl'].includes(pending.stage))
      throw fail(409,'Geen openstaande groepsverplichting');
    if(!canApprovePathway(req.bpd,pending.stage))
      throw fail(403,'Geen beoordelingsbevoegdheid in deze fase');
    if([pending.proposedBy,pending.okBy].includes(actorId(req)))
      throw fail(403,'De voorsteller of eerdere beoordelaar mag niet zelf goedkeuren');
    const courseRef=collection().doc(data.courseId);
    const course=await tx.get(courseRef);
    if(!course.exists||course.get('active')===false||
       course.get('department')!==data.department)
      throw fail(409,'De gekoppelde opleiding is gewijzigd');
    const at=FieldValue.serverTimestamp(),by=auditActor(req),
      reason=req.body.reason.trim();
    if(req.body.decision==='reject'){
      tx.update(ref,{pending:null,lastDecision:{decision:'rejected',
        stage:pending.stage,by:by.discordId,reason},updatedAt:at});
    }else if(pending.stage==='ok'){
      tx.update(ref,{pending:{...pending,stage:'kl',
        okBy:by.discordId,okReason:reason},updatedAt:at});
    }else{
      tx.update(ref,{active:pending.mandatory,
        effectiveDate:pending.effectiveDate,validMonths:pending.validMonths,
        pending:null,updatedAt:at,lastDecision:{decision:'approved',
         stage:'kl',by:by.discordId,reason}});
    }
    tx.create(ref.collection('audit').doc(),
      {type:'group_requirement_'+req.body.decision,
       stage:pending.stage,by,reason,at});
   });
   res.json({reviewed:true});
  }catch(e){responseError(res,e)}
 });

 app.post('/api/training-pathway/courses',requireUser,async(req,res)=>{
  try{
   const {departments}=await ensureRoster(req,getSnapshot);
   const roles=await instructors(req);
   const item=validPathwayCourse(req.body);
   if(item.mandatoryRequested)throw fail(400,
     'Voeg eerst de optionele opleiding toe en dien vervolgens een gemotiveerd verplichtingsvoorstel in');
   if(!departments.includes(item.department)||!manage(req,item.department,roles))
     throw fail(403,'Geen bevoegdheid om opleidingen bij deze dienst toe te voegen');
   const old=await collection().where('department','==',item.department).limit(201).get();
   if(old.size>200)throw fail(503,'Opleidingscatalogus onvolledig');
   if(old.docs.some(d=>d.get('active')!==false&&keyName(d.get('name'))===keyName(item.name)&&
     (d.get('zone')||'')===item.zone))throw fail(409,'Deze opleiding bestaat al voor deze dienst/zone');
   const ref=collection().doc(),at=FieldValue.serverTimestamp(),by=auditActor(req);
   const pending=item.mandatoryRequested?{stage:'ok',mandatory:true,targetKind:'alle',
     targetValue:'',effectiveDate:new Date().toISOString().slice(0,10),
     validMonths:0,reason:'Nieuw voorgestelde verplichte opleiding, inhoudelijk te beoordelen',
     proposedBy:by.discordId,okBy:null}:null;
   const batch=db().batch();
   batch.create(ref,{...item,source:'eigen',active:true,mandatory:false,
     targetKind:'alle',targetValue:'',effectiveDate:null,validMonths:0,
     pending,createdBy:by,createdAt:at,updatedAt:at});
   batch.create(ref.collection('audit').doc(),{type:'course_created',by,at,
     proposedMandatory:item.mandatoryRequested});
   await batch.commit();
   res.status(201).json({saved:true,id:ref.id,pendingStage:pending?.stage||null});
  }catch(e){responseError(res,e)}
 });
 app.post('/api/training-pathway/courses/:id/propose',requireUser,async(req,res)=>{
  try{
   const {departments}=await ensureRoster(req,getSnapshot);
   const roles=await instructors(req),proposal=validRequirement(req.body);
   const courseId=String(req.params.id||'');
   if(!/^[A-Za-z0-9]{12,40}$/.test(courseId))throw fail(400,'Ongeldige opleiding');
   const ref=collection().doc(courseId);
   await db().runTransaction(async tx=>{
    const old=await tx.get(ref);
    if(!old.exists)throw fail(404,'Opleiding niet gevonden');
    const data=old.data();
    if(!departments.includes(data.department)||!manage(req,data.department,roles))
      throw fail(403,'Geen bevoegdheid voor deze opleiding');
    if(data.pending)throw fail(409,'Er is al een verplichtingsvoorstel in behandeling');
    const at=FieldValue.serverTimestamp(),by=auditActor(req);
    tx.update(ref,{pending:{...proposal,stage:'ok',proposedBy:by.discordId,okBy:null},
      updatedAt:at});
    tx.create(ref.collection('audit').doc(),{type:'mandatory_proposed',by,proposal,at});
   });
   res.json({saved:true,stage:'ok'});
  }catch(e){responseError(res,e)}
 });
 // Individuele verplichtingen hebben eigen records. Daardoor kan dezelfde
 // cursus voor meerdere mensen verplicht zijn zonder een dienstregel te vervangen.
 app.post('/api/training-pathway/courses/:id/person-requirement',requireUser,async(req,res)=>{
  try{
   const {departments,roster}=await ensureRoster(req,getSnapshot);
   const proposal=validIndividualRequirement(req.body);
   const courseId=String(req.params.id||'');
   if(!/^[A-Za-z0-9]{12,40}$/.test(courseId))throw fail(400,'Ongeldige opleiding');
   const courseRef=collection().doc(courseId);
   const ref=personalCollection().doc(courseId+'_'+proposal.subjectDiscordId);
   await db().runTransaction(async tx=>{
    const [courseSnap,existing]=await Promise.all([tx.get(courseRef),tx.get(ref)]);
    if(!courseSnap.exists||courseSnap.get('active')===false)
      throw fail(404,'Opleiding niet gevonden');
    const course={id:courseId,...courseSnap.data()};
    if(!departments.includes(course.department)||
       !canManageIndividualPathway(req.bpd,course.department))
      throw fail(403,'Geen bevoegdheid om een persoon te verplichten');
    const subject=uniquePathwaySubject(roster,course.department,proposal.subjectDiscordId,course);
    if(!subject)throw fail(409,'Persoon is niet eenduidig actief binnen deze dienst/zone');
    if(existing.exists&&existing.get('pending'))
      throw fail(409,'Voor deze persoon bestaat al een voorstel in behandeling');
    if(!proposal.mandatory&&!existing.exists)
      throw fail(409,'Voor deze persoon bestaat nog geen individuele verplichting');
    if(!proposal.mandatory&&existing.get('active')!==true)
      throw fail(409,'Voor deze persoon is geen actieve individuele verplichting');
    const by=auditActor(req),at=FieldValue.serverTimestamp();
    const data={courseId,courseName:course.name,department:course.department,
      zone:course.zone||'',subjectDiscordId:proposal.subjectDiscordId,
      subjectName:String(subject.name||'').slice(0,120),
      subjectCall:String(subject.call||'').slice(0,30),
      pending:{mandatory:proposal.mandatory,effectiveDate:proposal.effectiveDate,
       validMonths:proposal.validMonths,reason:proposal.reason,
       stage:'ok',proposedBy:by.discordId,okBy:null},
      updatedAt:at};
    if(existing.exists)tx.update(ref,data);
    else tx.create(ref,{...data,active:false,effectiveDate:null,
      validMonths:0,createdAt:at});
    tx.create(ref.collection('audit').doc(),{
      type:'person_requirement_proposed',by,proposal,at});
   });
   res.json({saved:true,stage:'ok'});
  }catch(e){responseError(res,e)}
 });
 app.post('/api/training-pathway/person-requirements/:id/review',requireUser,async(req,res)=>{
  try{
   const id=String(req.params.id||'');
   if(!/^[A-Za-z0-9]{12,40}_\d{15,22}$/.test(id))
     throw fail(400,'Ongeldige individuele verplichting');
   if(!['approve','reject'].includes(req.body?.decision)||
      typeof req.body?.reason!=='string'||req.body.reason.trim().length<10||
      req.body.reason.length>500||/[<>\x00-\x1f\x7f]/.test(req.body.reason))
     throw fail(400,'Beoordeling met motivering van 10–500 tekens is verplicht');
   const rosterSnap=await getSnapshot();
   if(rosterSnap.stale)throw fail(503,'Personeelsbron is niet actueel');
   const ref=personalCollection().doc(id);
   await db().runTransaction(async tx=>{
    const item=await tx.get(ref);
    if(!item.exists)throw fail(404,'Individuele verplichting niet gevonden');
    const data=item.data(),pending=data.pending;
    if(!pending||!['ok','kl'].includes(pending.stage))
      throw fail(409,'Geen openstaande beoordeling');
    if(!canApprovePathway(req.bpd,pending.stage))
      throw fail(403,'Deze goedkeuringsstap behoort niet tot jouw bevoegdheden');
    if([pending.proposedBy,pending.okBy].includes(actorId(req)))
      throw fail(403,'De voorsteller of vorige beoordelaar kan niet zelf finaal goedkeuren');
    const courseRef=collection().doc(data.courseId);
    const courseSnap=await tx.get(courseRef);
    if(!courseSnap.exists||courseSnap.get('active')===false)
      throw fail(409,'De opleiding is niet meer actief');
    const course={id:data.courseId,...courseSnap.data()};
    if(req.body.decision==='approve'&&
       (!uniquePathwaySubject(rosterSnap.data||[],course.department,data.subjectDiscordId,course)||
        course.department!==data.department))
      throw fail(409,'Personeelsfiche of zone is gewijzigd; controleer eerst de selectie');
    const at=FieldValue.serverTimestamp(),by=auditActor(req),
      reason=req.body.reason.trim();
    if(req.body.decision==='reject'){
      tx.update(ref,{pending:null,lastDecision:{decision:'rejected',
        stage:pending.stage,by:by.discordId,reason},updatedAt:at});
    }else if(pending.stage==='ok'){
      tx.update(ref,{pending:{...pending,stage:'kl',okBy:by.discordId,
        okReason:reason},updatedAt:at});
    }else{
      tx.update(ref,{active:pending.mandatory,effectiveDate:pending.effectiveDate,
        validMonths:pending.validMonths,pending:null,updatedAt:at,
        lastDecision:{decision:'approved',stage:'kl',by:by.discordId,reason}});
    }
    tx.create(ref.collection('audit').doc(),{
      type:'person_requirement_'+req.body.decision,
      stage:pending.stage,by,reason,at});
   });
   res.json({reviewed:true});
  }catch(e){responseError(res,e)}
 });
 app.post('/api/training-pathway/courses/:id/review',requireUser,async(req,res)=>{
  try{
   if(!['approve','reject'].includes(req.body?.decision)||
       typeof req.body?.reason!=='string'||req.body.reason.trim().length<10||
       req.body.reason.length>500||/[<>\x00-\x1f\x7f]/.test(req.body.reason))
     throw fail(400,'Beoordeling met motivering van 10–500 tekens is verplicht');
   const id=String(req.params.id||'');
   if(!/^[A-Za-z0-9]{12,40}$/.test(id))throw fail(400,'Ongeldige opleiding');
   const ref=collection().doc(id);
   await db().runTransaction(async tx=>{
    const old=await tx.get(ref);
    if(!old.exists)throw fail(404,'Opleiding niet gevonden');
    const data=old.data(),pending=data.pending;
    if(!pending||!['ok','kl'].includes(pending.stage))throw fail(409,'Geen openstaand voorstel');
    if(!canApprovePathway(req.bpd,pending.stage))
      throw fail(403,'Deze goedkeuringsstap behoort niet tot jouw bevoegdheden');
    if([pending.proposedBy,pending.okBy].includes(actorId(req)))
      throw fail(403,'Een voorsteller of eerdere beoordelaar mag niet zelf finaal goedkeuren');
    const at=FieldValue.serverTimestamp(),by=auditActor(req),reason=req.body.reason.trim();
    if(req.body.decision==='reject'){
      tx.update(ref,{pending:null,lastDecision:{decision:'rejected',stage:pending.stage,
        by:by.discordId,reason},updatedAt:at});
    }else if(pending.stage==='ok'){
      tx.update(ref,{pending:{...pending,stage:'kl',okBy:by.discordId,
        okReason:reason},updatedAt:at});
    }else{
      tx.update(ref,{mandatory:pending.mandatory,targetKind:pending.targetKind,
        targetValue:pending.targetValue,effectiveDate:pending.effectiveDate,
        validMonths:pending.validMonths,pending:null,updatedAt:at,
        lastDecision:{decision:'approved',stage:'kl',by:by.discordId,reason}});
    }
    tx.create(ref.collection('audit').doc(),{type:'mandatory_'+req.body.decision,
      stage:pending.stage,by,reason,at});
   });
   res.json({reviewed:true});
  }catch(e){responseError(res,e)}
 });
}
