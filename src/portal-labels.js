// Presentation-only portal labels: no changes to routes, roles or records.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {mayEditTechnicalSettings} from './technical-center-config.js';
import {roleForDepartment} from './leave-policy.js';

const COLLECTION='bpd_portal_presentation_settings';
const DOCUMENT='labels';
const AUDIT='bpd_portal_presentation_labels_audit';
const ID=/^\d{15,22}$/;
const VALID_KEY=/^[^<>\x00-\x1f\x7f]{2,90}$/;
const defaults=Object.freeze({'Personeelsbeheer':'Personeelslijst','Personeelsbeheer (lijst)':'Personeelslijst','Centraal personeelsbeheer':'Personeelslijst'});
function canEdit(actor){
  return mayEditTechnicalSettings(actor)||Boolean(actor&&
    ID.test(String(actor.discordId||''))&&actor.uid==='discord:'+actor.discordId&&
    actor.portalTechnicalMode!==true&&actor.role==='korpsleiding'&&
    actor.departments?.includes('politie')===true&&
    roleForDepartment(actor,'politie')==='korpsleiding');
}
function sanitize(raw){
  const labels={...defaults};
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
    for(const [key,value] of Object.entries(raw)){
      if(VALID_KEY.test(key)&&typeof value==='string'&&value.length<=90&&
        value.trim().length>=2&&!/[<>\x00-\x1f\x7f]/.test(value)){
        labels[key]=value.trim();
      }
    }
  }
  return labels;
}
function state(data){
  return {revision:Number.isSafeInteger(data?.revision)&&data.revision>=0?data.revision:0,
    labels:sanitize(data?.labels)};
}
export function installPortalLabelRoutes(app,{requireUser,dbFactory=getFirestore}){
  app.get('/api/portal-labels',async(_req,res)=>{
    try{
      const doc=await dbFactory().collection(COLLECTION).doc(DOCUMENT).get();
      res.set('Cache-Control','public, max-age=30');
      res.json({labels:state(doc.data()).labels});
    }catch(_error){res.status(503).json({error:'Benamingen tijdelijk niet beschikbaar'});}
  });
  app.get('/api/portal-labels/manage',requireUser,async(req,res)=>{
    if(!canEdit(req.bpd))return res.status(403).json({error:'Alleen Korpsleiding of geverifieerd Technisch Beheer'});
    try{
      const doc=await dbFactory().collection(COLLECTION).doc(DOCUMENT).get();
      res.set('Cache-Control','private, no-store');res.json(state(doc.data()));
    }catch(_error){res.status(503).json({error:'Benamingen konden niet worden geladen'});}
  });
  app.put('/api/portal-labels/manage',requireUser,async(req,res)=>{
    if(!canEdit(req.bpd))return res.status(403).json({error:'Onvoldoende rechten om benamingen te wijzigen'});
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).some(k=>!['revision','labels','reason'].includes(k))||
       !Number.isSafeInteger(body.revision)||body.revision<0||
       !Array.isArray(body.labels)||body.labels.length>100||
       typeof body.reason!=='string'||body.reason.trim().length<8||
       body.reason.length>240||/[<>\x00-\x1f\x7f]/.test(body.reason))
      return res.status(400).json({error:'Ongeldige instellingen of motivering (minimaal 8 tekens)'});
    const supplied={};
    for(const entry of body.labels){
      if(!Array.isArray(entry)||entry.length!==2||
        typeof entry[0]!=='string'||!VALID_KEY.test(entry[0])||
        typeof entry[1]!=='string'||entry[1].trim().length<2||
        entry[1].length>90||/[<>\x00-\x1f\x7f]/.test(entry[1])||
        Object.hasOwn(supplied,entry[0]))
        return res.status(400).json({error:'Elke oorspronkelijke en nieuwe benaming moet uniek en geldig zijn'});
      supplied[entry[0]]=entry[1].trim();
    }
    try{
      const db=dbFactory(),ref=db.collection(COLLECTION).doc(DOCUMENT);
      const config=await db.runTransaction(async tx=>{
        const snap=await tx.get(ref),previous=state(snap.data());
        if(previous.revision!==body.revision)
          throw Object.assign(new Error('Benamingen intussen gewijzigd: laad opnieuw'),{status:409});
        const next={revision:previous.revision+1,labels:supplied};
        tx.set(ref,{...next,updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.discordId});
        tx.create(db.collection(AUDIT).doc(),{
          actorUid:req.bpd.uid,at:FieldValue.serverTimestamp(),reason:body.reason.trim(),
          before:previous,after:state(next)});
        return state(next);
      });
      res.set('Cache-Control','private, no-store');res.json({saved:true,...config});
    }catch(error){
      if(error.status)return res.status(error.status).json({error:error.message});
      res.status(503).json({error:'Benamingen niet opgeslagen; vorige versie blijft behouden'});
    }
  });
}
