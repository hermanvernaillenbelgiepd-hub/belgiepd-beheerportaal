import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore';
import {readPoliceCallOccupation} from './police-call-availability.js';
import {personnelCallClaimId} from './personnel-editor-policy.js';
import {canDecide, canReview, checkApplicant, eligibility, isDiscordId} from './callsign-utils.js';
import {getPolicePlan, performPoliceSync} from './callsign-sync.js';
import {initialFixedCallSpecialties,PERSONNEL_SPECIALIZATIONS_COLLECTION} from './specialization-policy.js';
import {ensurePoliceSeries} from './police-series-store.js';
import {actorFromPersonnel} from './registrations.js';
const s=x=>String(x??'').trim();
const timestamp=x=>x?.toDate?.().toISOString()||null;
const enabled=()=>process.env.BPD_ENABLE_CALLSIGN_REQUESTS==='true';
const syncEnabled=()=>process.env.BPD_ENABLE_SHEETS_SYNC==='true';
const fail=(res,error)=>{console.error('Roepnummeraanvraag:',error?.code||error?.message||'onbekend');return res.status(503).json({error:'De aanvraag kon niet worden verwerkt. Controleer de serverlog en de Google Sheets-toegang.'});};
export function installCallsignRoutes(app,{requireUser,getSnapshot,onPersonnelChanged=()=>{}}) {
  const permit=(req)=>req.bpd.departments.includes('politie')&&(req.bpd.portalTechnicalMode===true||canReview(req.bpd.role));
  const officer=(req)=>req.bpd.departments.includes('politie')&&(req.bpd.portalTechnicalMode===true||canDecide(req.bpd.role));
  const actor=async req=>actorFromPersonnel(req.bpd,(await getSnapshot()).data);
  const collection=()=>getFirestore().collection('bpd_callsign_requests');
  // Preview and approval use one policy. Existing sheet slots stay the
  // authoritative target for this legacy fixed-call workflow.
  const planFirstFree=async(data,preferredCall)=>{
    const snap=await getSnapshot({forceRefresh:true});
    if(snap.stale)throw Object.assign(new Error('De personeelsbron is niet actueel'),{status:503});
    const occupation=await readPoliceCallOccupation(snap.data);
    return getPolicePlan(process.env.PERSONNEL_SPREADSHEET_ID,data,{
      preferredCall,unavailableCalls:[...occupation.occupied]});
  };
  app.get('/api/callsigns/settings',requireUser,(req,res)=>{
    if(!permit(req))return res.status(403).json({error:'Alleen bevoegd politiekader heeft toegang'});
    res.json({role:req.bpd.role,requestsEnabled:enabled(),sheetSyncEnabled:syncEnabled(),canApprove:officer(req)});
  });
  app.get('/api/callsigns/requests',requireUser,async(req,res)=>{
    if(!permit(req))return res.status(403).json({error:'Geen toegang'});
    try{const snaps=await collection().orderBy('createdAt','desc').limit(80).get();res.json({requests:snaps.docs.map(d=>{const x=d.data();return {discordId:d.id,name:x.name,temporaryCall:x.temporaryCall,status:x.status,joinedOn:x.verification?.joinedOn||null,playHours:x.verification?.playHours??null,assignedCall:x.assignedCall||null,verifiedBy:x.verification?.by?.name||(x.verification?.source==='fivem-bot-en-discord-api'?'DC-bot + Discord API':null),verificationSource:x.verification?.source||null,createdAt:timestamp(x.createdAt),lastError:x.status==='sync_needs_review'?'Synchronisatie vraagt handmatige controle. Niet opnieuw goedkeuren.':null};})});}catch(e){fail(res,e)}
  });
  // Eerste fase: intake door kader op basis van /info member. Aanvragers-selfservice volgt na geverifieerde Discord OAuth.
  app.post('/api/callsigns/requests',requireUser,async(req,res)=>{
    if(!permit(req))return res.status(403).json({error:'Geen bevoegdheid'});
    if(!enabled())return res.status(503).json({error:'Aanvraagmodule staat nog uit (BPD_ENABLE_CALLSIGN_REQUESTS)'});
    let details;try{details=checkApplicant(req.body||{});}catch(e){return res.status(400).json({error:e.message})}
    try{const a=await actor(req);if(!a)return res.status(403).json({error:'Koppel je aanmeldaccount eerst aan je eigen Discord ID'});
      // Document-ID is de Discord ID: geen twee gelijktijdige dossiers per kandidaat.
      await collection().doc(details.discordId).create({...details,status:'submitted',submittedBy:a,submittedUid:req.bpd.uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      res.status(201).json({created:true,discordId:details.discordId,status:'submitted'});
    }catch(e){if(e.code===6||e.code==='already-exists')return res.status(409).json({error:'Deze Discord ID heeft al een aanvraag'});fail(res,e)}
  });
  app.post('/api/callsigns/requests/:discordId/verify',requireUser,async(req,res)=>{
    if(!permit(req))return res.status(403).json({error:'Geen controlebevoegdheid'});
    if(!enabled())return res.status(503).json({error:'Aanvraagmodule staat uit'});
    const id=req.params.discordId;if(!isDiscordId(id))return res.status(400).json({error:'Ongeldige Discord ID'});
    let result;try{result=eligibility(req.body||{});}catch(e){return res.status(400).json({error:e.message})}
    try{const a=await actor(req);if(!a)return res.status(403).json({error:'Geen gekoppeld personeelslid'});const ref=collection().doc(id);await getFirestore().runTransaction(async tx=>{const d=await tx.get(ref);if(!d.exists)throw Object.assign(new Error('Aanvraag niet gevonden'),{status:404});if(!['submitted','needs_verification','verified'].includes(d.get('status')))throw Object.assign(new Error('Aanvraag kan niet meer worden gewijzigd'),{status:409});tx.update(ref,{status:result.eligible?'verified':'needs_verification',verification:{...result,source:'/info member (handmatig gecontroleerd)',by:a,verifiedByUid:req.bpd.uid,checkedAt:new Date().toISOString()},updatedAt:FieldValue.serverTimestamp()});});res.json({verified:result.eligible,...result});}
    catch(e){if(e.status)return res.status(e.status).json({error:e.message});fail(res,e)}
  });
  app.post('/api/callsigns/requests/:discordId/reject',requireUser,async(req,res)=>{
    if(!officer(req))return res.status(403).json({error:'Alleen officierenkader en korpsleiding mogen afwijzen'});
    if(!enabled())return res.status(503).json({error:'Aanvraagmodule staat uit'});
    const id=req.params.discordId,reason=s(req.body?.reason);
    if(!isDiscordId(id)||reason.length<8||reason.length>1000)return res.status(400).json({error:'Discord ID of motivering ongeldig (minimaal 8 tekens)'});
    try{const by=await actor(req);if(!by)return res.status(403).json({error:'Geen gekoppeld personeelslid'});
      await getFirestore().runTransaction(async tx=>{const ref=collection().doc(id),doc=await tx.get(ref);
        if(!doc.exists)throw Object.assign(new Error('Aanvraag niet gevonden'),{status:404});
        if(!['submitted','needs_verification','verified'].includes(doc.get('status')))throw Object.assign(new Error('Aanvraag is al verwerkt'),{status:409});
        const temp=String(doc.get('temporaryCall')||'');
        const reservation=/^\d{3}$/.test(temp)?
          getFirestore().collection('bpd_temporary_call_reservations').doc(temp):null;
        const reserved=reservation?await tx.get(reservation):null;
        tx.update(ref,{status:'rejected',decision:{type:'afgewezen',reason,by,byUid:req.bpd.uid,at:new Date().toISOString()},updatedAt:FieldValue.serverTimestamp()});
        if(reserved?.exists&&reserved.get('discordId')===id)tx.delete(reservation);
      });res.json({rejected:true});
    }catch(e){if(e.status)return res.status(e.status).json({error:e.message});fail(res,e)}
  });
  app.get('/api/callsigns/requests/:discordId/preview',requireUser,async(req,res)=>{
    if(!officer(req))return res.status(403).json({error:'Alleen officierenkader en korpsleiding mogen een toekenning voorbereiden'});
    const id=req.params.discordId;if(!isDiscordId(id))return res.status(400).json({error:'Ongeldige Discord ID'});
    try{const d=await collection().doc(id).get();if(!d.exists)return res.status(404).json({error:'Aanvraag niet gevonden'});if(d.get('status')!=='verified')return res.status(409).json({error:'Voorwaarden zijn nog niet bevestigd'});
      const plan=await planFirstFree(d.data());res.json({preview:plan,sheetSyncEnabled:syncEnabled()});}
    catch(e){if(e.status)return res.status(e.status).json({error:e.message});if(/Discord ID bestaat|Personeelsnaam bestaat|Geen vrij|onvolledig/i.test(e.message))return res.status(409).json({error:e.message});fail(res,e)}
  });
  app.post('/api/callsigns/requests/:discordId/approve',requireUser,async(req,res)=>{
    if(!officer(req))return res.status(403).json({error:'Uitsluitend officierenkader en korpsleiding mogen goedkeuren'});
    if(!enabled()||!syncEnabled())return res.status(503).json({error:'Goedkeuring en Sheets-schrijfkoppeling zijn nog niet ingeschakeld'});
    const id=req.params.discordId;if(!isDiscordId(id))return res.status(400).json({error:'Ongeldige Discord ID'});
    let plan,approvedBy,locked=false;
    try{const current=await collection().doc(id).get();if(!current.exists)return res.status(404).json({error:'Aanvraag niet gevonden'});
      if(current.get('status')!=='verified')return res.status(409).json({error:'Aanvraag is niet gecontroleerd of reeds verwerkt'});
      approvedBy=await actor(req);if(!approvedBy)return res.status(403).json({error:'Account is niet aan een personeelsfiche gekoppeld'});
      const identity=await getSnapshot({forceRefresh:true,includeArchived:true});
      if(identity.stale)return res.status(503).json({error:'Archiefcontrole niet actueel'});
      if(identity.data.some(p=>p.dept==='politie'&&
        ['archived','pending'].includes(p.lifecycleState)&&
        (p.personId===id||p.personId!==id&&
          String(p.name||'').trim().toLocaleLowerCase('nl-BE')===
          String(current.get('name')||'').trim().toLocaleLowerCase('nl-BE'))))
        return res.status(409).json({error:'Mogelijk gearchiveerd dossier: herintreding of DC-ID-overdracht eerst controleren'});
      plan=await planFirstFree(current.data(),req.body?.preferredCall);
      await getFirestore().runTransaction(async tx=>{
        const ref=collection().doc(id),claim=getFirestore().collection('bpd_callsign_reservations').doc(String(plan.call));
        const manualRef=getFirestore().collection('bpd_personnel_call_claims')
         .doc(personnelCallClaimId('politie',String(plan.call)));
        const prefixedRef=getFirestore().collection('bpd_personnel_call_claims')
         .doc(personnelCallClaimId('politie','S'+plan.call));
        const [doc,already,manual,prefixed]=await Promise.all([
         tx.get(ref),tx.get(claim),tx.get(manualRef),tx.get(prefixedRef)]);
        if(!doc.exists||doc.get('status')!=='verified')throw Object.assign(new Error('Aanvraag werd ondertussen gewijzigd'),{status:409});
        if(already.exists||manual.exists||prefixed.exists)
         throw Object.assign(new Error('Roepnummer ondertussen gereserveerd; controleer het volgende vrije nummer'),{status:409});
        tx.create(claim,{discordId:id,approvedBy,createdAt:FieldValue.serverTimestamp()});
        tx.update(ref,{status:'syncing',selectedPlan:plan,approvedBy,approvedUid:req.bpd.uid,updatedAt:FieldValue.serverTimestamp()});
      });locked=true;
      const synced=await performPoliceSync(process.env.PERSONNEL_SPREADSHEET_ID,plan);
      const store=getFirestore(),batch=store.batch();
      const request=collection().doc(id),caseRef=store.collection('bpd_cases').doc('politie_'+id);
      const notice=store.collection('bpd_notices').doc('politie').collection('events').doc();
      const specialtyRef=store.collection(PERSONNEL_SPECIALIZATIONS_COLLECTION).doc('politie_'+id);
      const specialtyCurrent=await specialtyRef.get();
      const defaults=initialFixedCallSpecialties({discordId:id,status:'approved',
        assignedCall:plan.call,sync:synced});
      // Set new members' RADIO/BM and SIV/WPR to Ja, including when an
      // otherwise empty specialization register was created beforehand.
      // Preserve any explicit/manual review (including Nee or Niet ingevuld).
      if(defaults){
        const existing=specialtyCurrent.data();
        const values=existing?.values&&typeof existing.values==='object'?
          existing.values:{};
        const added=Object.fromEntries(Object.entries(defaults).filter(([label])=>{
          const old=values[label];
          return !old || (old.source!=='manual'&&
            (old.value===undefined||old.value===null||old.value==='Niet ingevuld'));
        }));
        if(Object.keys(added).length){
          const at=FieldValue.serverTimestamp();
          const revision=specialtyCurrent.exists?
            (Number.isSafeInteger(existing?.revision)?existing.revision:0)+1:1;
          if(!specialtyCurrent.exists){
            batch.create(specialtyRef,{dept:'politie',discordId:id,revision,
              values:added,source:'approved_fixed_callsign',
              updatedAt:at,updatedByUid:req.bpd.uid,
              updatedByDiscordId:req.bpd.discordId});
          }else{
            // FieldPath handles spaces and slashes in official skill labels.
            // The updateTime precondition avoids overwriting concurrent edits.
            const fields=Object.entries(added).flatMap(([label,value])=>
              [new FieldPath('values',label),value]);
            batch.update(specialtyRef,...fields,
              new FieldPath('revision'),revision,
              new FieldPath('updatedAt'),at,
              new FieldPath('updatedByUid'),req.bpd.uid,
              new FieldPath('updatedByDiscordId'),req.bpd.discordId,
              {lastUpdateTime:specialtyCurrent.updateTime});
          }
          for(const label of Object.keys(added)){
            batch.create(specialtyRef.collection('audit').doc(),{
              action:'initial_fixed_callsign_specialty',label,
              previous:values[label]?.value||'Niet ingevuld',
              value:'Ja',source:'automatic',
              reason:'Automatisch na gecontroleerde en gesynchroniseerde uitgifte van vast roepnummer 200–299',
              revision,actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,at});
            batch.create(caseRef.collection('entries').doc(),{
              type:'activiteit',reportCategory:'activiteit',dept:'politie',
              subjectDiscordId:id,subjectNameAtCreation:plan.name,
              subjectCallAtCreation:String(plan.call),
              eventDate:new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Brussels'}),
              details:label+': automatisch op Ja na gecontroleerde uitgifte vast roepnummer '+plan.call,
              registeredBy:approvedBy,source:'automatic_fixed_callsign_specialty',
              createdAt:at,modifiedAt:null});
          }
        }
      }
      batch.update(request,{status:'approved',assignedCall:plan.call,sync:synced,syncedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      batch.set(caseRef,{dept:'politie',discordId:id,name:plan.name,call:String(plan.call),rank:plan.rank,createdFrom:'vaste_roepnummer_aanvraag',createdAt:FieldValue.serverTimestamp()},{merge:true});
      // De overgang van tijdelijk naar vast hoort bij dezelfde Discord-ID:
      // één dossier, met een tijdgestempelde personeelsbeweging in het lopende
      // weekrapport. De rang blijft Agent; dit is geen graadpromotie.
      batch.create(caseRef.collection('entries').doc(),{
        type:'personeelsbeweging',reportCategory:'personeelsbeweging',
        movement:current.get('temporaryCall')?'Tijdelijk naar vast roepnummer':'Eerste vaste roepnummertoekenning',
        dept:'politie',subjectDiscordId:id,subjectNameAtCreation:plan.name,
        subjectCallAtCreation:String(plan.call),
        eventDate:new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Brussels'}),
        previousCall:String(current.get('temporaryCall')||''),
        newCall:String(plan.call),
        details:'Vast roepnummer toegekend: '+String(current.get('temporaryCall')||'—')+
          ' → '+String(plan.call)+'. Zelfde Discord-ID en personeelsdossier; geen rangpromotie.',
        registeredBy:approvedBy,source:'approved_fixed_callsign',
        createdAt:FieldValue.serverTimestamp(),modifiedAt:null
      });
      batch.create(notice,{type:'roepnummer_toegekend',dept:'politie',caseId:`politie_${id}`,createdAt:FieldValue.serverTimestamp()});
      const reservedCall=String(current.get('temporaryCall')||'');
      if(/^\d{3}$/.test(reservedCall)){
        const tempRef=store.collection('bpd_temporary_call_reservations').doc(reservedCall);
        const reservation=await tempRef.get();
        if(reservation.exists&&reservation.get('discordId')===id)batch.delete(tempRef);
      }
      await batch.commit();onPersonnelChanged();
      // Sheet sync has already been verified. A separate, idempotent
      // Firestore transaction records the least-populated operational series.
      // A failed allocation never reverses a completed fixed-call assignment.
      let series=null,seriesPending=false;
      try{
       const roster=await getSnapshot({forceRefresh:true});
       if(roster.stale)throw Error('Reeksbalans is niet actueel');
       const subject=roster.data.find(p=>p.dept==='politie'&&p.personId===id)||
        {dept:'politie',personId:id,call:String(plan.call),series:'Instroom'};
       series=await ensurePoliceSeries(subject,roster.data,{
        actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,
        reason:'Eerste vaste roepnummer: automatische evenwichtige reeksindeling'});
      }catch(err){
       seriesPending=true;
       console.warn('Vast roepnummer gesynchroniseerd; reeks nog te controleren:',
        err?.code||err?.message||'onbekend');
      }
      onPersonnelChanged();
      res.json({approved:true,...synced,series,seriesPending});
    }catch(e){if(locked){try{await collection().doc(id).update({status:'sync_needs_review',updatedAt:FieldValue.serverTimestamp()});}catch{}} if(e.status)return res.status(e.status).json({error:e.message});if(!locked&&/Discord ID bestaat|Personeelsnaam bestaat|Geen vrij|gewijzigd/i.test(e.message))return res.status(409).json({error:e.message});if(locked)return res.status(503).json({error:'Schrijfactie moet handmatig gecontroleerd worden. NIET opnieuw goedkeuren. Bekijk POLITIE, PolitieInfo en Firestore.'});return fail(res,e)}
  });
}
