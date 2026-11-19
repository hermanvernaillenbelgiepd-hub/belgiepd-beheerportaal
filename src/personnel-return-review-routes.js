import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {mayAdministerDcTransfer} from './dc-id-transfer-policy.js';
import {canReadPersonnelSubject} from './personnel-editor-policy.js';
import {normalizedIdentityName} from './personnel-identity-policy.js';

// Officer-only, read-only workflow queue. It never approves, merges, restores,
// grants roles or matches a person solely by name.
const ID=/^\d{15,22}$/;
const ALERTS='bpd_personnel_reentry_alerts';
const isPending=x=>['pending','submitted','verified'].includes(x);
const safe=x=>String(x||'').slice(0,120);
export function installPersonnelReturnReviewRoutes(app,{requireUser,getSnapshot}){
 app.get('/api/personnel-return-review',requireUser,async(req,res)=>{
  if(!mayAdministerDcTransfer(req.bpd))
    return res.status(403).json({error:'Alleen geverifieerd Officierenkader, Korpsleiding of Technisch Beheer'});
  try{
   const store=getFirestore();
   const [snap,users,calls,alerts,transfers]=await Promise.all([
    getSnapshot({includeArchived:true}),
    store.collection('bpd_portal_users').limit(251).get(),
    store.collection('bpd_callsign_requests').limit(251).get(),
    store.collection(ALERTS).limit(251).get(),
    store.collection('bpd_dc_id_transfer_requests').limit(251).get()
   ]);
   if(snap.stale||[users,calls,alerts,transfers].some(s=>s.size===251))
     return res.status(503).json({error:'Controlelijst is onvolledig; geen automatische beslissing mogelijk'});
   const personnel=snap.data||[],byId=new Map(),archived=[];
   for(const p of personnel){
    if(!ID.test(String(p.personId||'')))continue;
    const list=byId.get(p.personId)||[];list.push(p);byId.set(p.personId,list);
    if(['archived','pending'].includes(p.lifecycleState))archived.push(p);
   }
   const queue=new Map();
   function put(id,partial,priority){
    if(!ID.test(String(id||''))||id===req.bpd.discordId)return;
    const old=queue.get(id);
    if(old&&old.priority>priority)return;
    queue.set(id,{...(old||{}),...partial,discordId:id,priority});
   }
   for(const d of users.docs){
    if(d.get('status')!=='pending')continue;
    const departments=Array.isArray(d.get('candidateDepartments'))?
      d.get('candidateDepartments'):[];
    if(departments.length&&!departments.includes('politie'))continue;
    put(d.id,{kind:'onbekende_dc',name:safe(d.get('username'))||'Discord-lid',
      detail:'Nieuwe of nog niet goedgekeurde DC-aanmelding; identiteit controleren',
      href:'/gebruikersbeheer.html'},1);
   }
   for(const d of calls.docs){
    if(!isPending(d.get('status')))continue;
    put(d.id,{kind:'roepnummeraanvraag',name:safe(d.get('name'))||'Aanvrager',
      detail:'Roepnummeraanvraag vraagt controle door bevoegde politieleiding',
      href:'/personeelsbeheer.html'},2);
   }
   for(const d of alerts.docs){
    if(d.get('status')!=='pending')continue;
    put(d.id,{kind:'herinstroomcontrole',name:safe(d.get('name'))||'Aanvrager',
      alertId:d.id,
      detail:d.get('kind')==='archived_callsign_attempt'?
        'Gearchiveerde identiteit probeerde nieuw roepnummer: eerst herinstroom beoordelen':
        'Mogelijk oud dossier onder andere DC-ID. Alleen handmatige identiteitscontrole.',
      href:'/personeelsbeheer.html'},4);
   }
   for(const d of transfers.docs){
    if(d.get('status')!=='pending')continue;
    const newId=d.get('newDiscordId');
    put(newId,{kind:'dc_overdracht',name:'DC-ID-overdracht',
      detail:'Openstaande gecontroleerde overdracht; bestaande gegevens niet overschrijven',
      href:'/dc-id-overdracht.html'},5);
   }
   const rows=[...queue.values()].map(x=>{
    const roster=byId.get(x.discordId)||[];
    const oldSame=roster.find(p=>['archived','pending'].includes(p.lifecycleState)&&
      (p.dept==='politie'||req.bpd.portalTechnicalMode===true));
    const possible=archived.filter(p=>p.personId!==x.discordId&&
      normalizedIdentityName(p.name)===normalizedIdentityName(x.name)&&
      normalizedIdentityName(x.name)!=='');
    const readable=possible.filter(p=>canReadPersonnelSubject(req.bpd,p));
    const oldReadable=oldSame&&canReadPersonnelSubject(req.bpd,oldSame);
    // A matching name is a flag, NEVER an automatic identity link.
    return {discordId:x.discordId,name:x.name,kind:x.kind,detail:x.detail,
      href:x.href,alertId:x.alertId||null,
      // Even the existence of a protected archived dossier is sensitive.
      // Do not return boolean hints from subjects outside this actor's scope.
      archivedSameId:Boolean(oldReadable),
      archivedCall:oldReadable?safe(oldSame.call):null,
      possiblePriorRecord:readable.length>0,
      priorDiscordId:readable.length===1&&possible.length===1?readable[0].personId:null,
      priorDept:readable.length===1&&possible.length===1?readable[0].dept:null};
   });
   rows.sort((a,b)=>Number(b.archivedSameId||b.possiblePriorRecord)-
     Number(a.archivedSameId||a.possiblePriorRecord)||a.name.localeCompare(b.name,'nl-BE'));
   res.set('Cache-Control','private, no-store');
   res.json({rows,requiresHumanReview:true,rolesChanged:false,dossiersMerged:false});
  }catch(e){
   console.warn('Personeelsherinstroomoverzicht:',e?.code||'onbekende fout');
   res.status(503).json({error:'Controlelijst tijdelijk niet beschikbaar'});
  }
 });
 app.post('/api/personnel-return-review/:discordId/acknowledge',requireUser,async(req,res)=>{
  if(!mayAdministerDcTransfer(req.bpd))
    return res.status(403).json({error:'Geen bevoegdheid voor deze melding'});
  const id=req.params.discordId,reason=String(req.body?.reason||'').trim();
  if(!ID.test(id)||reason.length<10||reason.length>500||
     /[<>\x00-\x1f\x7f]/.test(reason))
    return res.status(400).json({error:'Geldige DC-ID en reden van 10 tot 500 tekens verplicht'});
  try{
   const ref=getFirestore().collection(ALERTS).doc(id);
   await getFirestore().runTransaction(async tx=>{
    const item=await tx.get(ref);
    if(!item.exists||item.get('status')!=='pending')
      throw Object.assign(Error('Geen openstaande melding'),{status:409});
    const at=FieldValue.serverTimestamp();
    tx.update(ref,{status:'reviewed',reviewedAt:at,reviewedBy:req.bpd.discordId,
      reviewReason:reason});
    tx.create(ref.collection('audit').doc(),{action:'acknowledged',reason,
      actorDiscordId:req.bpd.discordId,at});
   });
   res.json({reviewed:true,identityTransferred:false,personnelActivated:false});
  }catch(e){
   if(e?.status)return res.status(e.status).json({error:e.message});
   res.status(503).json({error:'Melding niet bijgewerkt'});
  }
 });
}
