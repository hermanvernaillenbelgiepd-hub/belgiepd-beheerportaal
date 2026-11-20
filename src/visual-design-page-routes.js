// Per-page visual style config. Never accepts CSS selectors, HTML or arbitrary tokens.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {canEditVisualDesign} from './visual-design-routes.js';
import {mayDelegateVisualDesign} from './visual-design-grants.js';
import {
 DESIGN_PAGE_CATALOG,DESIGN_PAGE_COLLECTION,DESIGN_PAGE_AUDIT,
 validDesignPageKey,validatedDesignPageWrite,pageDesignStylesFrom,pageDesignSlotKey
} from './visual-design-page-policy.js';
export function installVisualDesignPageRoutes(app,{requireUser,dbFactory=getFirestore}){
 const ref=(db,key)=>db.collection(DESIGN_PAGE_COLLECTION).doc(key);
 app.get('/api/visual-design/pages/catalog',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!await canEditVisualDesign(dbFactory(),req.bpd))
   return res.status(403).json({error:'Geen toegang tot Vormgeving. Controleer jouw portaalprofiel of vraag een aparte machtiging.'});
  return res.json({pages:DESIGN_PAGE_CATALOG,canDelegate:mayDelegateVisualDesign(req.bpd)});
 });
 app.get('/api/visual-design/pages/:key',async(req,res)=>{
  res.set('Cache-Control','public, max-age=15');
  if(!validDesignPageKey(req.params.key))
   return res.status(404).json({error:'Onbekende portaalpagina'});
  try{
   const snap=await ref(dbFactory(),req.params.key).get();
   return res.json({page:req.params.key,styles:pageDesignStylesFrom(snap.get('styles')),
    revision:Number.isSafeInteger(snap.get('revision'))?snap.get('revision'):0});
  }catch(e){
   console.warn('Paginaopmaak lezen:',e?.code||'databasefout');
   return res.json({page:req.params.key,styles:{},revision:0,fallback:true});
  }
 });
 app.get('/api/visual-design/pages/:key/history',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!validDesignPageKey(req.params.key))return res.status(404).json({error:'Pagina onbekend'});
  if(!await canEditVisualDesign(dbFactory(),req.bpd))
   return res.status(403).json({error:'Geen recht om vormgeving te bekijken'});
  try{
   const docs=await dbFactory().collection(DESIGN_PAGE_AUDIT)
    .doc(req.params.key).collection('history').orderBy('at','desc').limit(20).get();
   return res.json({history:docs.docs.map(doc=>({
    id:doc.id,slot:doc.get('slot'),theme:doc.get('theme'),
    actorDiscordId:doc.get('actorDiscordId'),reason:doc.get('reason'),
    at:doc.get('at')?.toDate?.().toISOString()||null
   }))});
  }catch(e){
   console.warn('Opmaakgeschiedenis ophalen:',e?.code||'databasefout');
   return res.status(503).json({error:'Wijzigingsgeschiedenis tijdelijk niet beschikbaar'});
  }
 });
 app.put('/api/visual-design/pages/:key',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!validDesignPageKey(req.params.key))
   return res.status(404).json({error:'Onbekende portaalpagina'});
  if(!await canEditVisualDesign(dbFactory(),req.bpd))
   return res.status(403).json({error:'Geen recht om deze pagina vorm te geven'});
  let input;
  try{input=validatedDesignPageWrite(req.body)}
  catch(e){return res.status(e.status||400).json({error:e.message})}
  try{
   const db=dbFactory(),doc=ref(db,req.params.key),entry=pageDesignSlotKey(input.slot,input.theme);
   const audit=db.collection(DESIGN_PAGE_AUDIT).doc(req.params.key).collection('history').doc();
   const result=await db.runTransaction(async tx=>{
    const snap=await tx.get(doc);
    const revision=Number.isSafeInteger(snap.get('revision'))?snap.get('revision'):0;
    if(revision!==input.expectedRevision)
     throw Object.assign(Error('Een andere vormgever heeft deze pagina gewijzigd. Herlaad en probeer opnieuw.'),{status:409});
    const previous=pageDesignStylesFrom(snap.get('styles'));
    const before=previous[entry]||{};
    if(JSON.stringify(before)===JSON.stringify(input.style))
     return {changed:false,revision};
    const next={...previous};
    if(Object.keys(input.style).length)next[entry]=input.style;
    else delete next[entry];
    if(Object.keys(next).length>120)
     throw Object.assign(Error('Maximum 120 aparte kaderinstellingen per pagina'),{status:422});
    const at=FieldValue.serverTimestamp();
    tx.set(doc,{styles:next,revision:revision+1,updatedAt:at,updatedBy:req.bpd.discordId});
    tx.create(audit,{page:req.params.key,slot:input.slot,theme:input.theme,
     actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,
     before,after:input.style,reason:input.reason,revision:revision+1,at});
    return {changed:true,revision:revision+1};
   });
   return res.json({saved:true,...result,rightsChanged:false,personnelChanged:false});
  }catch(e){
   if(e.status)return res.status(e.status).json({error:e.message});
   console.error('Paginaopmaak bewaren:',e?.code||'databasefout');
   return res.status(503).json({error:'Paginaopmaak niet opgeslagen; vorige versie blijft actief'});
  }
 });
}
