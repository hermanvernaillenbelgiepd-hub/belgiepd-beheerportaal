// Privileged per-page presentation editor, completely separate from role APIs.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {canManageVisualDesign} from './visual-design-policy.js';
import {DESIGN_GRANTS_COLLECTION,isActiveVisualDesignGrant} from './visual-design-grants.js';
import {PAGE_DESIGN_COLLECTION,PAGE_DESIGN_AUDIT,listDesignPages,
 validDesignPage,cleanPageDesign,validatePageDesignWrite,equalPageDesign}
 from './visual-page-design-policy.js';

async function canEditPages(db,actor){
 if(canManageVisualDesign(actor))return true;
 const id=String(actor?.discordId||'');
 if(!/^\d{15,22}$/.test(id)||actor?.uid!=='discord:'+id)return false;
 try{
  const grant=await db.collection(DESIGN_GRANTS_COLLECTION).doc(id).get();
  return isActiveVisualDesignGrant(actor,grant.data());
 }catch(error){
  console.warn('Paginavormgevingsrechten controleren:',error?.code||'databasefout');
  return false;
 }
}
export function installVisualPageDesignRoutes(app,{requireUser,dbFactory=getFirestore}){
 const getRef=(db,page)=>db.collection(PAGE_DESIGN_COLLECTION).doc(page);
 app.get('/api/visual-design/pages',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!await canEditPages(dbFactory(),req.bpd))
   return res.status(403).json({error:'Geen toegang tot Vormgevingsstudio'});
  return res.json({pages:listDesignPages()});
 });
 app.get('/api/visual-design/page/:page',async(req,res)=>{
  res.set('Cache-Control','public, max-age=30');
  const page=req.params.page;
  if(!validDesignPage(page))return res.status(404).json({error:'Pagina niet beschikbaar'});
  try{
   const snap=await getRef(dbFactory(),page).get();
   return res.json({page,...cleanPageDesign(snap.data()),
    revision:Number.isSafeInteger(snap.get('revision'))?snap.get('revision'):0});
  }catch(e){
   console.warn('Paginavormgeving lezen:',e?.code||'databasefout');
   return res.json({page,overrides:[],revision:0,fallback:true});
  }
 });
 app.get('/api/visual-design/page-admin/:page',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!await canEditPages(dbFactory(),req.bpd))
   return res.status(403).json({error:'Geen bevoegdheid om vormgeving te wijzigen'});
  const page=req.params.page;
  if(!validDesignPage(page))return res.status(404).json({error:'Pagina niet beschikbaar'});
  try{
   const db=dbFactory(),snap=await getRef(db,page).get();
   return res.json({page,...cleanPageDesign(snap.data()),
    revision:Number.isSafeInteger(snap.get('revision'))?snap.get('revision'):0});
  }catch(e){
   console.warn('Paginavormgevingsbeheer lezen:',e?.code||'databasefout');
   return res.status(503).json({error:'Instellingen tijdelijk niet beschikbaar'});
  }
 });
 app.put('/api/visual-design/page-admin/:page',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!await canEditPages(dbFactory(),req.bpd))
   return res.status(403).json({error:'Geen bevoegdheid om vormgeving te wijzigen'});
  let input;
  try{input=validatePageDesignWrite(req.params.page,req.body)}
  catch(e){return res.status(e.status||400).json({error:e.message})}
  try{
   const db=dbFactory(),target=getRef(db,req.params.page),
    audit=db.collection(PAGE_DESIGN_AUDIT).doc();
   const result=await db.runTransaction(async tx=>{
    const prev=await tx.get(target);
    const revision=Number.isSafeInteger(prev.get('revision'))?prev.get('revision'):0;
    if(revision!==input.expectedRevision)
     throw Object.assign(Error('Instellingen gewijzigd. Herlaad eerst.'),{status:409});
    const previous=cleanPageDesign(prev.data());
    const next={overrides:input.overrides};
    if(equalPageDesign(previous,next))return {changed:false,revision};
    const at=FieldValue.serverTimestamp(),nextRevision=revision+1;
    tx.set(target,{...next,revision:nextRevision,updatedBy:req.bpd.discordId,updatedAt:at});
    tx.create(audit,{page:req.params.page,actorUid:req.bpd.uid,
     actorDiscordId:req.bpd.discordId,reason:input.reason,
     before:previous,after:next,revision:nextRevision,at});
    return {changed:true,revision:nextRevision};
   });
   return res.json({saved:true,...result,permissionsChanged:false});
  }catch(e){
   if(e.status)return res.status(e.status).json({error:e.message});
   console.error('Paginavormgeving bewaren:',e?.code||'databasefout');
   return res.status(503).json({error:'Instellingen niet bewaard; vorige versie blijft behouden'});
  }
 });
}
