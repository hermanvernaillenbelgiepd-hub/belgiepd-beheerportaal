// Central presentation configuration. Public GET returns only vetted tokens;
// saving requires a verified management account and an audited transaction.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {
 VISUAL_DESIGN_COLLECTION,VISUAL_DESIGN_AUDIT,VISUAL_DESIGN_DOC,
 DEFAULT_VISUAL_DESIGN,visualDesignFrom,canManageVisualDesign,
 validateVisualDesignWrite,isVisualDesignSame
} from './visual-design-policy.js';

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
   if(!canManageVisualDesign(req.bpd))
     return res.status(403).json({error:'Geen bevoegdheid om centrale vormgeving te beheren'});
   try{
     const db=dbFactory(),doc=await ref(db).get(),
       changes=await db.collection(VISUAL_DESIGN_AUDIT)
         .orderBy('at','desc').limit(12).get();
     return res.json({canEdit:true,settings:visualDesignFrom(doc.data()),
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
   if(!canManageVisualDesign(req.bpd))
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
}
