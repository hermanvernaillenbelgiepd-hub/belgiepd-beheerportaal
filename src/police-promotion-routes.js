import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {brusselsEventDate} from './personnel-event-date.js';
import {POLICE_RANK_CHOICES,policeRankByName,policeCallNumber,
  canChangePoliceGrade,allowedPoliceGradeChoices} from './personnel-rank-policy.js';
import {orderedCallNumbers} from './callsign-utils.js';
import {PERSONNEL_EDITS_COLLECTION,personnelCallClaimId} from './personnel-editor-policy.js';
import {PERSONNEL_ACTIVITY_COLLECTION} from './personnel-activity.js';
import {personnelDataEnabled} from './personnel-create.js';
import {mayWriteManagement} from './management-utils.js';
import {canReadPersonnelSubject} from './personnel-editor-policy.js';

// A proposal never changes grade, callsign, Discord roles or specialties.
// The approval is a single Firestore transaction and creates one effective movement.
export const POLICE_PROMOTION_PROPOSALS='bpd_police_promotion_proposals';
const validId=x=>/^\d{15,22}$/.test(String(x||''));
const validRef=x=>/^[a-zA-Z0-9_-]{12,120}$/.test(String(x||''));
const fail=(status,message)=>Object.assign(new Error(message),{status});
const respond=(res,e)=>{
 if(Number.isInteger(e?.status))return res.status(e.status).json({error:e.message});
 console.error('Politiepromoties:',e?.code||e?.message||'onbekend');
 return res.status(503).json({error:'Promotievoorstellen tijdelijk niet beschikbaar'});
};
export function nextPromotionRank(rank){
 const index=POLICE_RANK_CHOICES.findIndex(item=>item.rank===rank);
 return index<0||index>=POLICE_RANK_CHOICES.length-1?
   null:POLICE_RANK_CHOICES[index+1].rank;
}
export function recommendedPromotionCall(rank,used){
 const option=policeRankByName(rank);
 if(!option)return null;
 const busy=new Set([...used].map(Number));
 // Agent's permanent grade calls are 2xx; 1xx are temporary recruit
 // calls and must NOT be offered for an effective demotion to Agent.
 const hundreds=rank==='Agent'?[2]:option.hundreds;
 const choices=hundreds.flatMap(h=>orderedCallNumbers(h*100,h*100+99))
   .filter(n=>n!==900&&n!==910&&(Math.floor(n/100)!==9||n>=920));
 return choices.find(n=>!busy.has(n))??null;
}
export function validatePromotionDecision(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).some(k=>!['decision','newRank','newCall','reason'].includes(k)))
  throw fail(400,'Ongeldig promotiebesluit');
 if(!['approve','reject'].includes(body.decision))throw fail(400,'Kies goedkeuren of afwijzen');
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(reason.length<20||reason.length>500||/[<>\x00-\x1f\x7f]/.test(reason))
  throw fail(400,'Motivering moet 20 tot 500 tekens bevatten');
 if(body.decision==='reject')return {decision:'reject',reason};
 const newRank=String(body.newRank||'').trim(),newCall=String(body.newCall||'').trim();
 const option=policeRankByName(newRank),number=policeCallNumber(newCall);
 if(!option||number===null||!option.hundreds.includes(Math.floor(number/100))||
   number===900||number===910||(Math.floor(number/100)===9&&number<920))
  throw fail(400,'Kies een geldige graad met een bijpassend roepnummer');
 return {decision:'approve',reason,newRank,newCall:String(number),number};
}
export async function policeOccupiedNumbers(db,roster){
 const [claims,reservations]=await Promise.all([
  db.collection('bpd_personnel_call_claims').where('dept','==','politie').limit(1500).get(),
  db.collection('bpd_callsign_reservations').limit(1500).get()
 ]);
 if(claims.size===1500||reservations.size===1500)
  throw fail(503,'Roepnummerbron te groot om veilig een nummer te kiezen');
 const busy=new Set();
 for(const p of roster)if(p.dept==='politie'){
  const n=policeCallNumber(p.call);if(n!==null)busy.add(n);
 }
 for(const d of [...claims.docs,...reservations.docs]){
  const n=policeCallNumber(d.get('call')||d.id);
  if(n!==null)busy.add(n);
 }
 return busy;
}
const exactSubject=(snapshot,id)=>{
 const matches=snapshot.data.filter(p=>p.dept==='politie'&&p.personId===id);
 if(matches.length!==1)throw fail(409,'Politiepersoneelsfiche is niet eenduidig');
 return matches[0];
};
export function installPolicePromotionRoutes(app,{requireUser,getSnapshot}){
 const db=()=>getFirestore();
 const effectivePromotionEnabled=()=>personnelDataEnabled(process.env)&&
  process.env.BPD_ENABLE_PERSONNEL_WRITES==='true'&&
  process.env.BPD_PERSONNEL_OVERRIDES_ACTIVE==='true'&&
  process.env.BPD_ENABLE_PERSONNEL_RANK_CHANGES==='true';
 const proposals=()=>db().collection(POLICE_PROMOTION_PROPOSALS);
 const requireCurrent=async()=>{
  const roster=await getSnapshot({forceRefresh:true});
  if(roster.stale)throw fail(503,'Personeelsbron moet actueel zijn');
  return roster;
 };
 // Suggestions never reserve a number, and require real approval authority.
 app.get('/api/police-promotions/suggestion',requireUser,async(req,res)=>{
  try{
   const id=String(req.query.discordId||''),rank=String(req.query.rank||'');
   if(!validId(id)||!policeRankByName(rank))throw fail(400,'Ongeldige promotievraag');
   const roster=await requireCurrent(),person=exactSubject(roster,id);
   // A verified officer may draft a movement proposal even when the
   // independent effective-rank write permission is unavailable on that fiche.
   // This read-only suggestion does not grant or perform a personnel edit.
   const maySuggest=canChangePoliceGrade(req.bpd,person)||
     (mayWriteManagement(req.bpd,'politie','personeelsbeweging')&&
      canReadPersonnelSubject(req.bpd,person));
   if(!maySuggest)throw fail(403,'Geen bevoegdheid om een roepnummervoorstel op te vragen');
   const choices=allowedPoliceGradeChoices(req.bpd);
   const current=policeRankByName(person.rank),wanted=policeRankByName(rank);
   // A read-only preview is allowed for either an effective promotion
   // or an effective demotion, never for an unchanged rank.
   if(!choices.includes(rank)||!current||!wanted||wanted.grade===current.grade)
    throw fail(403,'De gekozen nieuwe graad valt buiten jouw rangbevoegdheid');
   const used=await policeOccupiedNumbers(db(),roster.data);
   res.set('Cache-Control','private, no-store');
   return res.json({rank,call:recommendedPromotionCall(rank,used),
     currentRank:person.rank,currentCall:person.call,series:person.series||''});
  }catch(e){return respond(res,e)}
 });
 app.get('/api/police-promotions/pending',requireUser,async(req,res)=>{
  try{
   const roster=await requireCurrent();
   const [rows,used]=await Promise.all([
    proposals().where('status','==','pending').limit(150).get(),
    policeOccupiedNumbers(db(),roster.data)
   ]);
   const pending=[];
   for(const row of rows.docs){
    const data=row.data(),id=data.discordId;
    if(!validId(id))continue;
    const person=roster.data.find(p=>p.dept==='politie'&&p.personId===id);
    if(!person||!canChangePoliceGrade(req.bpd,person))continue;
    const current=policeRankByName(person.rank);
    if(!current)continue;
    const choices=allowedPoliceGradeChoices(req.bpd)
      .filter(rank=>(policeRankByName(rank)?.grade??-1)>current.grade);
    if(!choices.length)continue;
    const suggested=choices.includes(data.proposedRank)?data.proposedRank:
      (choices.includes(nextPromotionRank(person.rank))?nextPromotionRank(person.rank):choices[0]);
    pending.push({id:row.id,discordId:id,name:person.name,call:person.call,
     currentRank:person.rank,series:person.series||'',
     proposedRank:data.proposedRank,details:String(data.details||'').slice(0,4000),
     proposedBy:String(data.proposedByName||'Bevoegd kader').slice(0,120),
     eventDate:data.eventDate,createdAt:data.createdAt?.toDate?.()?.toISOString?.()||null,
     choices,suggestedRank:suggested,suggestedCall:recommendedPromotionCall(suggested,used)});
   }
   pending.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
   res.set('Cache-Control','private, no-store');
   return res.json({pending,limited:rows.size===150});
  }catch(e){return respond(res,e)}
 });
 app.post('/api/police-promotions/:id/decision',requireUser,async(req,res)=>{
  try{
   const id=String(req.params.id||'');
   if(!validRef(id))throw fail(400,'Ongeldige promotieverwijzing');
   const input=validatePromotionDecision(req.body);
   if(input.decision==='approve'&&!effectivePromotionEnabled())
    throw fail(503,'Effectieve rangwijzigingen staan in deze omgeving nog niet aan');
   const proposalRef=proposals().doc(id),initial=await proposalRef.get();
   if(!initial.exists||initial.get('status')!=='pending')
    throw fail(409,'Voorstel bestaat niet meer of is reeds behandeld');
   const discordId=initial.get('discordId');
   if(!validId(discordId))throw fail(409,'Personeelsidentiteit ontbreekt');
   const roster=await requireCurrent(),person=exactSubject(roster,discordId);
   if(!canChangePoliceGrade(req.bpd,person))
    throw fail(403,'Alleen bevoegd Officierenkader of Korpsleiding mag goedkeuren');
   if(req.bpd.discordId===discordId)throw fail(403,'Eigen promotie goedkeuren is niet toegestaan');
   if(input.decision==='approve'&&initial.get('currentRank')!==person.rank)
    throw fail(409,'Rang is sinds indiening veranderd. Het verouderde voorstel kan worden afgewezen');
   const before=policeRankByName(person.rank),after=policeRankByName(input.newRank);
   const allowed=allowedPoliceGradeChoices(req.bpd);
   if(input.decision==='approve'&&(!before||!after||after.grade<=before.grade||
     !allowed.includes(input.newRank)))
    throw fail(403,'De nieuwe rang is niet toegestaan voor jouw bevoegdheid');
   if(input.decision==='approve'){
    const busy=await policeOccupiedNumbers(db(),roster.data);
    // An officer's old callsign may be reused by the same officer, but
    // an approved promotion always crosses a callsign hundred.
    if(busy.has(input.number))throw fail(409,'Het gekozen roepnummer is reeds bezet of gereserveerd');
   }
   const store=db(),editRef=store.collection(PERSONNEL_EDITS_COLLECTION).doc('politie_'+discordId);
   const caseRoot=store.collection('bpd_cases').doc('politie_'+discordId);
   const caseRef=caseRoot.collection('entries').doc(id);
   const eventRef=caseRoot.collection('entries').doc();
   const notice=store.collection('bpd_notices').doc('politie').collection('events').doc();
   const activity=store.collection(PERSONNEL_ACTIVITY_COLLECTION).doc();
   const newClaim=input.decision==='approve'?store.collection('bpd_personnel_call_claims')
      .doc(personnelCallClaimId('politie',input.newCall)):null;
   const oldClaim=input.decision==='approve'?store.collection('bpd_personnel_call_claims')
      .doc(personnelCallClaimId('politie',person.call)):null;
   const reservation=input.decision==='approve'?store.collection('bpd_callsign_reservations')
      .doc(input.newCall):null;
   const at=FieldValue.serverTimestamp();
   const result=await store.runTransaction(async tx=>{
    const [current,entry,edit,newHold,oldHold,fixed]=await Promise.all([
      tx.get(proposalRef),tx.get(caseRef),tx.get(editRef),
      newClaim?tx.get(newClaim):null,
      oldClaim&&newClaim.id!==oldClaim.id?tx.get(oldClaim):null,
      reservation?tx.get(reservation):null
    ]);
    if(!current.exists||current.get('status')!=='pending'||
      current.get('discordId')!==discordId)throw fail(409,'Voorstel werd intussen behandeld');
    if(!entry.exists||entry.get('type')!=='promotievoorstel'||
      entry.get('proposalStatus')!=='pending')
      throw fail(409,'Het oorspronkelijke voorstel is niet meer geldig');
    if(input.decision==='approve'){
      const data=edit.data()||{},revision=Number.isSafeInteger(data.revision)?data.revision:0;
      if((data.approvedRankEdit===true&&data.rank!==person.rank)||
        (data.call&&data.call!==person.call))
        throw fail(409,'De personeelsfiche is intussen gewijzigd. Vernieuw eerst');
      if(newHold?.exists&&newHold.get('discordId')!==discordId||
         fixed?.exists&&fixed.get('discordId')!==discordId)
        throw fail(409,'Roepnummer is intussen bezet of gereserveerd');
      // Preserve the existing series for ALL grade changes; in particular
      // Aspirant Inspecteur -> Inspecteur stays in the same basiskaderreeks.
      tx.set(editRef,{dept:'politie',discordId,
        name:data.name??person.name,status:data.status??person.status,
        rank:input.newRank,call:input.newCall,approvedRankEdit:true,
        revision:revision+1,updatedAt:at,
        updatedByUid:req.bpd.uid,updatedByDiscordId:req.bpd.discordId},{merge:true});
      tx.set(newClaim,{dept:'politie',discordId,call:input.newCall,updatedAt:at});
      if(oldClaim.id!==newClaim.id&&oldHold?.exists&&oldHold.get('discordId')===discordId)
        tx.delete(oldClaim);
      tx.create(editRef.collection('audit').doc(),{
        action:'promotion',source:'approved_promotion_proposal',
        proposalId:id,previousRank:person.rank,newRank:input.newRank,
        previousCall:person.call,newCall:input.newCall,
        reason:input.reason,revision:revision+1,actorUid:req.bpd.uid,
        actorDiscordId:req.bpd.discordId,at
      });
      tx.create(eventRef,{
        type:'personeelsbeweging',reportCategory:'personeelsbeweging',
        source:'approved-promotion-proposal',promotionProposalId:id,
        dept:'politie',subjectDiscordId:discordId,
        subjectNameAtCreation:person.name,subjectCallAtCreation:person.call,
        subjectRankAtCreation:person.rank,eventDate:brusselsEventDate(),
        movement:'Promotie',previousRank:person.rank,newRank:input.newRank,
        previousCall:person.call,newCall:input.newCall,
        details:'Promotie na goedkeuring voorstel '+id+': '+person.rank+
         ' ('+person.call+') → '+input.newRank+' ('+input.newCall+
         '). Motivering: '+input.reason+
         '. Discord-roltoewijzing afzonderlijk controleren.',
        registeredBy:{discordId:req.bpd.discordId,name:req.bpd.name||'Bevoegd kader',
          call:req.bpd.call||''},submittedBy:{uid:req.bpd.uid,email:req.bpd.email||null},
        createdAt:at,modifiedAt:null
      });
      tx.create(notice,{caseId:'politie_'+discordId,entryId:eventRef.id,
        type:'personeelsbeweging',dept:'politie',createdAt:at});
      tx.create(activity,{type:'promotion',dept:'politie',discordId,
        name:person.name,before:person.rank,after:input.newRank,
        previousCall:person.call,newCall:input.newCall,reason:input.reason,
        dossierCaseLogged:true,actorDiscordId:req.bpd.discordId,at});
      if(person.call!==input.newCall)
        tx.create(store.collection(PERSONNEL_ACTIVITY_COLLECTION).doc(),{
          type:'callsign_changed',rankMovement:true,dept:'politie',discordId,
          name:person.name,before:person.call,after:input.newCall,
          reason:input.reason,actorDiscordId:req.bpd.discordId,at});
    }
    const status=input.decision==='approve'?'approved':'rejected';
    tx.update(proposalRef,{status,decidedAt:at,decidedByDiscordId:req.bpd.discordId,
      decisionReason:input.reason,
      ...(status==='approved'?{approvedRank:input.newRank,approvedCall:input.newCall,
        movementEntryId:eventRef.id}:{})});
    tx.update(caseRef,{proposalStatus:status,
      decisionReason:input.reason,decidedByDiscordId:req.bpd.discordId,
      decidedAt:at,...(status==='approved'?{
        effectiveRank:input.newRank,effectiveCall:input.newCall,
        approvedMovementEntryId:eventRef.id}:{})});
    tx.create(proposalRef.collection('audit').doc(),{
      action:status,byDiscordId:req.bpd.discordId,reason:input.reason,
      ...(status==='approved'?{rank:input.newRank,call:input.newCall}:{}),at});
    return {approved:status==='approved',status,rank:input.newRank||null,
      call:input.newCall||null,entryId:status==='approved'?eventRef.id:null};
   });
   res.set('Cache-Control','private, no-store');
   return res.json({saved:true,...result,discordRolesChanged:false,
     manualDiscordRoleReview:result.approved,
     semiAnonymousAutomatic:result.approved&&input.number>=400});
  }catch(e){return respond(res,e)}
 });
}
