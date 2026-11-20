// Central presentation configuration. Public GET returns only vetted tokens;
// saving requires a verified management account and an audited transaction.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {USER_COLLECTION,approvedManagedEntry} from './user-access.js';
import {DESIGN_GRANTS_COLLECTION,DESIGN_GRANTS_AUDIT,
 mayDelegateVisualDesign,isActiveVisualDesignGrant,validateVisualDesignGrantWrite}
 from './visual-design-grants.js';
import {
 VISUAL_DESIGN_COLLECTION,VISUAL_DESIGN_AUDIT,VISUAL_DESIGN_DOC,
 DEFAULT_VISUAL_DESIGN,visualDesignFrom,canManageVisualDesign,
 validateVisualDesignWrite,isVisualDesignSame
} from './visual-design-policy.js';

// This check reads Firestore on every delegated request (no cache). A revoked
// design-only grant cannot keep saving via an old session or cached UI state.
async function canEditVisualDesign(db,actor){
 if(canManageVisualDesign(actor))return true;
 try{
  const id=String(actor?.discordId||'');
  if(actor?.uid!=='discord:'+id||!/^\d{15,22}$/.test(id))return false;
  const snap=await db.collection(DESIGN_GRANTS_COLLECTION).doc(id).get();
  return isActiveVisualDesignGrant(actor,snap.data());
 }catch(e){console.warn('Vormgevingsmachtiging controleren:',e?.code||'databasefout');return false}
}
export function installVisualDesignRoutes(app,{requireUser,dbFactory=getFirestore}){
 const ref=db=>db.collection(VISUAL_DESIGN_COLLECTION).doc(VISUAL_DESIGN_DOC);
 app.get('/api/visual-design/public',async(_req,res)=>{
   res.set('Cache-Control','public, max-age=30');
   try{
     const doc=await ref(dbFactory()).get();
     return res.json({settings:visualDesignFrom(doc.data()),
       revision:Number.isSafeInteger(doc.get('revision'))?doc.get('revision'):0});
   }catch(e){
     console.warn('Portaalvormgeving ophalen:',e?.code||'databasefout');
     // A Firestore outage cannot break pages, authentication, or the default UI.
     return res.json({settings:DEFAULT_VISUAL_DESIGN,revision:0,fallback:true});
   }
 });
 app.get('/api/visual-design/admin',requireUser,async(req,res)=>{
   res.set('Cache-Control','private, no-store');
   if(!await canEditVisualDesign(dbFactory(),req.bpd))
     return res.status(403).json({error:'Geen bevoegdheid om centrale vormgeving te beheren'});
   try{
     const db=dbFactory(),doc=await ref(db).get(),
       changes=await db.collection(VISUAL_DESIGN_AUDIT)
         .orderBy('at','desc').limit(12).get();
     return res.json({canEdit:true,canDelegate:mayDelegateVisualDesign(req.bpd),
       settings:visualDesignFrom(doc.data()),
       revision:Number.isSafeInteger(doc.get('revision'))?doc.get('revision'):0,
       history:changes.docs.map(x=>({
         id:x.id,reason:String(x.get('reason')||'').slice(0,240),
         at:x.get('at')?.toDate?.().toISOString()||null
       }))});
   }catch(e){
     console.warn('Vormgevingsbeheer ophalen:',e?.code||'databasefout');
     return res.status(503).json({error:'Vormgeving tijdelijk niet beschikbaar'});
   }
 });
 app.put('/api/visual-design/admin',requireUser,async(req,res)=>{
   res.set('Cache-Control','private, no-store');
   if(!await canEditVisualDesign(dbFactory(),req.bpd))
     return res.status(403).json({error:'Geen bevoegdheid om centrale vormgeving te wijzigen'});
   let input;
   try{input=validateVisualDesignWrite(req.body)}
   catch(e){return res.status(e.status||400).json({error:e.message})}
   try{
     const db=dbFactory(),docRef=ref(db),audit=db.collection(VISUAL_DESIGN_AUDIT).doc();
     const result=await db.runTransaction(async tx=>{
       const oldSnap=await tx.get(docRef);
       const before=visualDesignFrom(oldSnap.data());
       const oldRevision=Number.isSafeInteger(oldSnap.get('revision'))?
         oldSnap.get('revision'):0;
       if(oldRevision!==input.expectedRevision)
         throw Object.assign(Error('Instellingen intussen gewijzigd; herlaad ze'),{status:409});
       if(isVisualDesignSame(before,input))
         return {changed:false,revision:oldRevision,settings:before};
       const settings=visualDesignFrom(input),revision=oldRevision+1,
         at=FieldValue.serverTimestamp();
       tx.set(docRef,{...settings,revision,updatedAt:at,updatedBy:req.bpd.discordId});
       tx.create(audit,{actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,
         reason:input.reason,before,after:settings,revision,at,
         rightsChanged:false,personnelChanged:false,serviceColorsChanged:false});
       return {changed:true,revision,settings};
     });
     return res.json({saved:true,...result,
       permissionsChanged:false,discordRolesChanged:false});
   }catch(e){
     if(e.status===409)return res.status(409).json({error:e.message});
     console.error('Vormgeving opslaan:',e?.code||'databasefout');
     return res.status(503).json({error:'Vormgeving niet bewaard; vorige versie blijft actief'});
   }
 });

 // Only independently verified Technisch Beheer can create or revoke this
 // *single* design.edit grant. Recipients never see these endpoints.
 app.get('/api/visual-design/grants',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!mayDelegateVisualDesign(req.bpd))
   return res.status(403).json({error:'Alleen Technisch Beheer kan vormgevingsrechten beheren'});
  try{
   const snap=await dbFactory().collection(DESIGN_GRANTS_COLLECTION).limit(101).get();
   return res.json({grants:snap.docs.slice(0,100).map(doc=>{
    const row=doc.data()||{};
    return {discordId:doc.id,enabled:row.enabled===true,
     expiresOn:row.expiresOn||null,
     revision:Number.isSafeInteger(row.revision)?row.revision:0};
   }),more:snap.docs.length>100});
  }catch(e){
   console.warn('Vormgevingsrechten ophalen:',e?.code||'databasefout');
   return res.status(503).json({error:'Rechtenlijst tijdelijk niet beschikbaar'});
  }
 });
 app.put('/api/visual-design/grants/:discordId',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!mayDelegateVisualDesign(req.bpd))
   return res.status(403).json({error:'Alleen Technisch Beheer mag deze rechten wijzigen'});
  let input;
  try{input=validateVisualDesignGrantWrite(req.params.discordId,req.body)}
  catch(e){return res.status(e.status||400).json({error:e.message})}
  try{
   const db=dbFactory(),docRef=db.collection(DESIGN_GRANTS_COLLECTION).doc(input.discordId);
   if(input.action==='grant'){
    const account=await db.collection(USER_COLLECTION).doc(input.discordId).get();
    if(!approvedManagedEntry(account.data(),input.discordId))
     return res.status(422).json({error:'Selecteer eerst een goedgekeurd portaalaccount met een geldige Discord-koppeling'});
   }
   const audit=db.collection(DESIGN_GRANTS_AUDIT).doc();
   const result=await db.runTransaction(async tx=>{
    const snap=await tx.get(docRef);
    const prev=snap.data()||{};
    const revision=Number.isSafeInteger(prev.revision)?prev.revision:0;
    if(revision!==input.expectedRevision)
     throw Object.assign(Error('Rechtenlijst intussen gewijzigd; herlaad eerst'),{status:409});
    const enabled=input.action==='grant',expiresOn=enabled?input.expiresOn:null;
    if(prev.enabled===enabled&&(prev.expiresOn||null)===expiresOn)
     return {changed:false,revision};
    const at=FieldValue.serverTimestamp();
    tx.set(docRef,{discordId:input.discordId,enabled,expiresOn,
     revision:revision+1,updatedAt:at,updatedBy:req.bpd.discordId});
    tx.create(audit,{actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,
     targetDiscordId:input.discordId,action:input.action,reason:input.reason,
     before:{enabled:prev.enabled===true,expiresOn:prev.expiresOn||null},
     after:{enabled,expiresOn},at});
    return {changed:true,revision:revision+1};
   });
   return res.json({saved:true,...result});
  }catch(e){
   if(e.status)return res.status(e.status).json({error:e.message});
   console.error('Vormgevingsrechten wijzigen:',e?.code||'databasefout');
   return res.status(503).json({error:'Machtiging niet gewijzigd'});
  }
 });
}
