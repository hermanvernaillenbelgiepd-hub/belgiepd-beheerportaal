// Protected read-only registration statistics; no new actions or role grants.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {canManageCadreActivity,canReadCadreActivity,
 CADRE_ACTIVITY_SETTINGS_COLLECTION,CADRE_ACTIVITY_SETTINGS_DOC,
 CADRE_ACTIVITY_DEPARTMENTS,CADRE_ACTIVITY_OPTIONAL,
 cadreActivitySettings,validateCadreActivityToggle,isCadreActivitySubject,
 cadreActivityPeriod,cadreActivityCounts} from './cadre-activity-policy.js';

const validId=id=>/^\d{15,22}$/.test(String(id||''));
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',
 year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fail=(res,code=503)=>res.status(code).json({
 error:code===403?'Geen toegang tot deze kaderstatistieken':
  'Kaderstatistieken tijdelijk niet volledig controleerbaar'});
function uniquePeople(personnel,dept){
 const selected=personnel.filter(p=>p?.dept===dept&&validId(p.personId)&&
    p.lifecycleState!=='archived');
 const counts=new Map();
 for(const p of selected)counts.set(p.personId,(counts.get(p.personId)||0)+1);
 return selected.filter(p=>counts.get(p.personId)===1);
}
async function querySources(db,subjects,dept,period){
 const cases=[],trainings=[];
 let incomplete=false,examined=0;
 // Read scoped per personnel subject; never a global collection-group scan.
 // Any capped result marks the dashboard incomplete rather than claiming zero.
 for(let i=0;i<subjects.length;i+=12){
   const group=subjects.slice(i,i+12);
   const results=await Promise.all(group.map(async person=>{
     const key=dept+'_'+person.personId;
     const sources=[
       db.collection(dept==='burger'?'bpd_citizen_staff_dossiers':'bpd_cases')
         .doc(dept==='burger'?person.personId:key).collection('entries')
         .where('eventDate','>=',period.start).limit(151).get(),
       dept==='burger'?Promise.resolve({docs:[],size:0}):
         db.collection('bpd_training').doc(key).collection('records')
           .where('eventDate','>=',period.start).limit(151).get()
     ];
     return Promise.all(sources);
   }));
   results.forEach(([caseDocs,trainingDocs])=>{
     examined++;
     if(caseDocs.size>=151||trainingDocs.size>=151)incomplete=true;
     for(const doc of caseDocs.docs.slice(0,150)){
       const value=doc.data();
       if(dept==='burger'){
         cases.push({type:value.kind==='observatie'?'observatie':
           value.kind==='sanctie'?'sanctie':'notitie',
           eventDate:value.eventDate,
           registeredBy:{discordId:value.byDiscordId},
           deletedAt:value.deletedAt||null});
       }else cases.push(value);
     }
     for(const doc of trainingDocs.docs.slice(0,150))trainings.push(doc.data());
   });
 }
 return {cases,trainings,incomplete,examined};
}
export function installCadreActivityRoutes(app,{requireUser,getSnapshot,getDb=getFirestore}){
 const settingsRef=()=>getDb().collection(CADRE_ACTIVITY_SETTINGS_COLLECTION)
   .doc(CADRE_ACTIVITY_SETTINGS_DOC);
 const live=async()=>{
   const snapshot=await getSnapshot();
   if(snapshot?.stale||!Array.isArray(snapshot?.data))
     throw Error('roster-unavailable');
   return snapshot.data;
 };
 app.get('/api/cadre-activity/config',requireUser,async(req,res)=>{
   res.set('Cache-Control','private, no-store');
   try{
     const roster=await live();
     const settings=cadreActivitySettings((await settingsRef().get()).data());
     const manager=canManageCadreActivity(req.bpd);
     const allowed=CADRE_ACTIVITY_DEPARTMENTS.filter(d=>
       canReadCadreActivity(req.bpd,d,settings,roster));
     if(!allowed.length&&!manager)return fail(res,403);
     return res.json({canManage:manager,departments:allowed,
       settings:manager?settings:{enabled:Object.fromEntries(allowed.map(d=>[d,true]))},
       revision:manager?settings.revision:null,
       policeAlwaysEnabled:true});
   }catch(e){console.warn('Kaderactiviteit config',e?.code||'read-failed');return fail(res)}
 });
 app.put('/api/cadre-activity/config',requireUser,async(req,res)=>{
   res.set('Cache-Control','private, no-store');
   if(!canManageCadreActivity(req.bpd))return fail(res,403);
   let value;
   try{value=validateCadreActivityToggle(req.body)}
   catch(e){return res.status(400).json({error:e.message})}
   try{
     const db=getDb(),ref=settingsRef(),audit=db.collection('bpd_cadre_activity_audit').doc();
     let revision;
     await db.runTransaction(async tx=>{
       const old=(await tx.get(ref)).data(),current=cadreActivitySettings(old);
       if(current.revision!==value.expectedRevision)
         throw Object.assign(Error('Instellingen gewijzigd: vernieuw het overzicht'),{httpStatus:409});
       if(current.enabled[value.department]===value.enabled)
         throw Object.assign(Error('Geen wijziging om te bewaren'),{httpStatus:409});
       const enabled={...current.enabled,[value.department]:value.enabled};
       enabled.politie=true;
       revision=current.revision+1;
       tx.set(ref,{enabled,revision,updatedAt:FieldValue.serverTimestamp(),
         updatedByDiscordId:req.bpd.discordId},{merge:true});
       tx.create(audit,{department:value.department,previous:current.enabled[value.department],
         enabled:value.enabled,reason:value.reason,revision,actorDiscordId:req.bpd.discordId,
         at:FieldValue.serverTimestamp()});
     });
     return res.json({saved:true,revision,department:value.department,
       enabled:value.enabled,policeAlwaysEnabled:true});
   }catch(e){
     if(e?.httpStatus===409)return res.status(409).json({error:e.message});
     console.warn('Kaderactiviteit instellingen',e?.code||'write-failed');
     return fail(res);
   }
 });
 app.get('/api/cadre-activity/overview',requireUser,async(req,res)=>{
   res.set('Cache-Control','private, no-store');
   const dept=String(req.query?.department||'politie');
   if(!CADRE_ACTIVITY_DEPARTMENTS.includes(dept))return fail(res,403);
   let period;
   try{period=cadreActivityPeriod(req.query?.days||'30',today())}
   catch(e){return res.status(400).json({error:e.message})}
   try{
     const db=getDb(),[roster,saved]=await Promise.all([live(),settingsRef().get()]);
     if(!canReadCadreActivity(req.bpd,dept,cadreActivitySettings(saved.data()),roster))
       return fail(res,403);
     const personnel=uniquePeople(roster,dept);
     if(personnel.length>250)return fail(res);
     const cadre=personnel.filter(isCadreActivitySubject);
     const {cases,trainings,incomplete,examined}=await querySources(
       db,personnel,dept,period);
     const people=cadreActivityCounts(cadre,cases,trainings,period);
     const totals={observaties:0,notities:0,sancties:0,opvolgingen:0,overig:0,
       opleidingsregistraties:0,overgenomen:0,correcties:0};
     for(const person of people)
       for(const key of Object.keys(totals))totals[key]+=person[key];
     return res.json({department:dept,period,people,totals,incomplete,
       examinedSubjects:examined,cadreMembers:cadre.length,
       info:'Aantallen zijn geregistreerde acties, niet automatisch gegeven lessen of kwaliteitsbeoordelingen. Historische overnames en correcties staan apart.',
       dataSource:'Firestore-dossiers en opleidingsregistraties',readOnly:true});
   }catch(e){
     console.warn('Kaderactiviteit overzicht',e?.code||'query-failed');
     return fail(res);
   }
 });
}
