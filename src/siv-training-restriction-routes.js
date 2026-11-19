import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {canReadPersonnelSubject,canViewPersonnel} from './personnel-editor-policy.js';
import {roleForDepartment} from './leave-policy.js';
import {isRetired} from './dossier-retirement-policy.js';
import {SIV_TRAINING_RESTRICTIONS,priorityToday,isSivTrainingSanction,
 sivRestrictionStatus,sivRestrictionItem} from './siv-training-restriction-policy.js';

const db=()=>getFirestore();
const ID=/^\d{15,22}$/;
const fail=(status,message)=>Object.assign(new Error(message),{status});
const error=(res,e)=>{
 if(e.status)return res.status(e.status).json({error:e.message});
 console.warn('SIV/WPR-opleidingsbeperking:',e?.code||e?.message||'onbekend');
 return res.status(503).json({error:'Opleidingsbeperkingen tijdelijk niet beschikbaar'});
};
const asPerson=(people,id)=>people.filter(x=>x.dept==='politie'&&x.personId===id
  &&!['archived','pending'].includes(x.lifecycleState));
const recordRef=(id,sanctionId)=>db().collection('bpd_cases')
 .doc('politie_'+id).collection('entries').doc(sanctionId);
const summary=doc=>({id:doc.id,...doc.data()});
const publicPerson=(p,row)=>({...row,name:String(p.name||'Personeelslid').slice(0,110),
 call:String(p.call||'').slice(0,24),series:String(p.seriesRaw||p.series||'').slice(0,60)});

async function seedSanctions(){
 const docs=await db().collection('bpd_notices').doc('politie')
  .collection('events').orderBy('createdAt','desc').limit(601).get();
 // Paginated notice indexing is deliberately bounded; no global dossier
 // collectionGroup query, broad Firestore scan or unverified text guessing.
 const relevant=docs.docs.filter(x=>x.get('type')==='sanctie').slice(0,100);
 for(let i=0;i<relevant.length;i+=12){
  await Promise.all(relevant.slice(i,i+12).map(async notice=>{
   const caseId=String(notice.get('caseId')||'');
   const id=caseId.startsWith('politie_')?caseId.slice(8):'';
   const sanctionId=String(notice.get('entryId')||'');
   if(!ID.test(id)||!/^[\w-]{8,120}$/.test(sanctionId))return;
   const record=await recordRef(id,sanctionId).get(),sanction=record.data();
   if(!record.exists||isRetired(sanction)||!isSivTrainingSanction(sanction)||
      sanction.subjectDiscordId!==id||sanction.dept!=='politie')return;
   const doc=db().collection(SIV_TRAINING_RESTRICTIONS).doc('politie_'+id+'_'+sanctionId);
   const initial=sivRestrictionStatus(sanction,[],priorityToday()).state;
   try{await doc.create({
    dept:'politie',subjectDiscordId:id,sanctionId,
    eventDate:sanction.eventDate,endDate:sanction.endDate,
    courseName:'PRIORITAIR RIJDEN',status:initial,
    source:'existing-sanction',createdAt:FieldValue.serverTimestamp()
   })}catch(e){if(e.code!==6&&e.code!=='already-exists')throw e}
  }));
 }
 return {scanned:docs.size,noticeLimitReached:docs.size===601};
}

async function reconcileOne(doc){
 const index=doc.data(),personId=String(index.subjectDiscordId||'');
 const sanctionId=String(index.sanctionId||'');
 if(!ID.test(personId)||!/^[\w-]{8,120}$/.test(sanctionId))return;
 const sanctionSnap=await recordRef(personId,sanctionId).get();
 const sanction=sanctionSnap.data();
 // Never manufacture a completion based on a removed / amended sanction.
 let state={state:'ingetrokken',releaseDate:priorityToday()};
 if(sanctionSnap.exists&&isSivTrainingSanction(sanction)&&!isRetired(sanction)){
  const history=await db().collection('bpd_training').doc('politie_'+personId)
   .collection('records').orderBy('createdAt','desc').limit(151).get();
  if(history.size>=151)return; // fail closed on incomplete training history
  state=sivRestrictionStatus(sanction,history.docs.map(x=>x.data()),priorityToday());
 }
 if(state.state==='actief')return;
 const entry=db().collection('bpd_cases').doc('politie_'+personId)
  .collection('entries').doc();
 const notification=db().collection('bpd_notices').doc('politie')
  .collection('events').doc();
 await db().runTransaction(async tx=>{
  const latest=await tx.get(doc.ref);
  if(!latest.exists||latest.get('status')!=='actief')return;
  const now=FieldValue.serverTimestamp(),date=priorityToday();
  const method=state.state==='voltooid'?'geslaagde en goedgekeurde opleiding Prioritair rijden':
    state.state==='verlopen'?'verstrijken van de einddatum '+index.endDate:
    'intrekking of wijziging van de oorspronkelijke sanctie';
  tx.update(doc.ref,{status:state.state,releaseDate:state.releaseDate,
   updatedAt:now,releaseSource:method});
  tx.create(entry,{
   type:'activiteit',reportCategory:'activiteit',
   source:'siv-training-restriction-auto-release',dept:'politie',
   subjectDiscordId:personId,eventDate:date,createdAt:now,modifiedAt:null,
   linkedSanctionId:sanctionId,
   details:'SIV/WPR-rijbeperking automatisch beëindigd door '+method+
    '. Oorspronkelijke sanctie blijft ongewijzigd in het dossier.',
   registeredBy:{name:'Systeem · Opleidingscontrole',call:''},
   submittedBy:{uid:'system:siv-training-restrictions'}
  });
  tx.create(notification,{caseId:'politie_'+personId,entryId:entry.id,
   type:'activiteit',dept:'politie',createdAt:now,
   source:'siv-training-restriction-auto-release'});
 });
}
let running=false;
export async function reconcileSivTrainingRestrictions(){
 if(running)return {busy:true};
 running=true;
 try{
  const seeded=await seedSanctions();
  const active=await db().collection(SIV_TRAINING_RESTRICTIONS)
   .where('status','==','actief').limit(151).get();
  // Explicit cap prevents a partial list from being called complete.
  if(active.size>=151){
   console.warn('SIV-restricties: meer dan 150 open dossiers; uitbreiding van paginering nodig');
   return {...seeded,limited:true};
  }
  for(let i=0;i<active.size;i+=10)
   await Promise.all(active.docs.slice(i,i+10).map(reconcileOne));
  return {...seeded,checked:active.size};
 }finally{running=false}
}
export function scheduleSivTrainingRestrictions(){
 if(process.env.BPD_ENABLE_SIV_RESTRICTION_AUTOMATION!=='true')return;
 const safe=()=>void reconcileSivTrainingRestrictions().catch(e=>
   console.warn('Automatische SIV/WPR-controle:',e?.code||e?.message||'onbekend'));
 safe();
 const timer=setInterval(safe,15*60*1000);
 timer.unref?.();
}

export function installSivTrainingRestrictionRoutes(app,{requireUser,getSnapshot}){
 app.get('/api/siv-training-restrictions',requireUser,async(req,res)=>{
  try{
   const actor=req.bpd,viewer=String(actor?.discordId||'');
   if(!ID.test(viewer)||actor?.uid!=='discord:'+viewer)
    throw fail(403,'Gebruik een geverifieerd Discord-account');
   const snapshot=await getSnapshot();
   if(snapshot.stale)throw fail(503,'Personeelsbron tijdelijk niet actueel');
   const own=asPerson(snapshot.data,viewer);
   const cadre=canViewPersonnel(actor,'politie')&&
    ['middenkader','officierenkader','korpsleiding'].includes(
      roleForDepartment(actor,'politie'));
   if(own.length!==1&&!cadre)
    throw fail(403,'Geen geverifieerde politiepersoneelsfiche');
   const rows=await db().collection(SIV_TRAINING_RESTRICTIONS).limit(501).get();
   if(rows.size===501)throw fail(503,'Beperkingenoverzicht onvolledig; geen onjuiste vrijgave tonen');
   const mine=[],review=[];
   for(const doc of rows.docs){
    const row=summary(doc),person=asPerson(snapshot.data,row.subjectDiscordId);
    if(person.length!==1)continue;
    const visible={id:row.id,discordId:row.subjectDiscordId,
      label:'SIV/WPR · rijbeperking',courseName:'PRIORITAIR RIJDEN',
      endDate:String(row.endDate||'').slice(0,10),
      status:['actief','verlopen','voltooid','ingetrokken'].includes(row.status)?
        row.status:'onbekend'};
    if(row.subjectDiscordId===viewer)mine.push(publicPerson(person[0],visible));
    if(cadre&&canReadPersonnelSubject(actor,person[0]))
     review.push(publicPerson(person[0],visible));
   }
   res.set('Cache-Control','private, no-store');
   res.json({mine,review,canReview:cadre,
    applicationUrl:'/opleidingscentrum.html',requestCourse:'PRIORITAIR RIJDEN'});
  }catch(e){error(res,e)}
 });
}
