import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {PERSONNEL_ACTIVITY_COLLECTION} from './personnel-activity.js';
import {PERSONNEL_DECORATIONS_COLLECTION,DECORATION_CATALOG,CATALOG_BY_ID,
  brusselsToday,validateDecoration,canManagePoliceDecoration,canManagePoliceDecorationCatalog,
  awardKey,manageDecorations,customCatalogItem,PERSONNEL_DECORATION_CATALOG_COLLECTION,
  isCustomDecorationId,decorationCatalogExtras,canRenameDecorationCatalog}
  from './personnel-decoration-policy.js';

const text=(value,max=120)=>typeof value==='string'?value.trim().slice(0,max):'';
const CATALOG_LIMIT=100,MAX_IMAGE_BYTES=80*1024;
async function loadCatalog(){
 const snap=await getFirestore().collection(PERSONNEL_DECORATION_CATALOG_COLLECTION)
   .limit(CATALOG_LIMIT+20).get();
 const custom=new Map(snap.docs.map(doc=>[doc.id,customCatalogItem(doc)])
  .filter(([,item])=>item));
 if(custom.size>CATALOG_LIMIT||snap.size>=CATALOG_LIMIT+20)
  throw Error('Het maximumaantal eretekens is bereikt');
 const extras=decorationCatalogExtras(snap.docs);
 return {custom,extras,all:new Map([...CATALOG_BY_ID,...extras])};
}
export function imageUpload(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).some(k=>!['label','kind','color','imageDataUri'].includes(k)))
  throw Error('Ongeldige afbeeldingsgegevens');
 const label=text(body.label,81);
 if(label.length<3||label.length>80||/[<>\x00-\x1f]/.test(label))
  throw Error('Geef een geldige naam van 3 tot 80 tekens');
 if(!['ribbon','medal','badge'].includes(body.kind))
  throw Error('Kies lint, medaille of ereteken');
 const color=['red','silver','gold','blue','blue-gold','red-gold','blue-white',
  'red-black','blue-silver','gold-blue'].includes(body.color)?body.color:'blue';
 const m=String(body.imageDataUri||'').match(/^data:image\/(webp|png|jpeg);base64,([a-zA-Z0-9+/]+={0,2})$/);
 if(!m||m[2].length>MAX_IMAGE_BYTES*4/3+10)throw Error('Gebruik een afbeelding in WebP, PNG of JPG tot 80 KB');
 const bytes=Buffer.from(m[2],'base64');
 if(bytes.length<100||bytes.length>MAX_IMAGE_BYTES)throw Error('Afbeelding moet tussen 100 bytes en 80 KB zijn');
 const kind=m[1];
 const valid=kind==='webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':
  kind==='png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):
  bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
 if(!valid)throw Error('Ongeldig afbeeldingsbestand');
 return {label,kind:body.kind,color,mime:'image/'+kind,imageBase64:bytes.toString('base64')};
}
const failure=(res,error)=>{
 console.error('Onderscheidingen:',error?.code||error?.name||'fout');
 return res.status(503).json({error:'De onderscheidingen kunnen momenteel niet worden opgeslagen'});
};
const validateIdentity=(snapshot,call,name)=>{
 const matches=snapshot.data.filter(p=>p.dept==='politie'&&
    p.call===call&&p.name===name&&awardKey(p.dept,p.personId));
 return matches.length===1?matches[0]:null;
};
export function installPersonnelDecorationRoutes(app,{requireUser,getSnapshot}){
 // Public icon files contain no individual, private, or personnel information.
 // Images are served directly from persistent Firestore, never Render's disk.
 app.get('/api/personnel-awards/catalog-image/:id',async(req,res)=>{
  const id=String(req.params.id||'');
  if(!isCustomDecorationId(id))return res.status(404).end();
  try{
   const snap=await getFirestore().collection(PERSONNEL_DECORATION_CATALOG_COLLECTION).doc(id).get();
   if(!snap.exists||snap.get('disabled')===true)return res.status(404).end();
   const mime=snap.get('mime'),base64=snap.get('imageBase64');
   if(!['image/webp','image/png','image/jpeg'].includes(mime)||
      typeof base64!=='string'||base64.length>MAX_IMAGE_BYTES*4/3+10)return res.status(404).end();
   const bytes=Buffer.from(base64,'base64');
   res.set('Content-Type',mime);
   res.set('X-Content-Type-Options','nosniff');
   res.set('Cache-Control','public, max-age=300');
   return res.send(bytes);
  }catch(error){return failure(res,error)}
 });
 app.get('/api/personnel-awards/catalog-access',requireUser,(req,res)=>{
  res.set('Cache-Control','private, no-store');
  return res.json({canUpload:canManagePoliceDecorationCatalog(req.bpd),
   canRename:canRenameDecorationCatalog(req.bpd)});
 });
 app.get('/api/personnel-awards/catalog-labels',requireUser,async(req,res)=>{
  if(!canRenameDecorationCatalog(req.bpd))
   return res.status(403).json({error:'Alleen geverifieerd Officierenkader, Korpsleiding of Technisch Beheer'});
  try{
   const catalog=await loadCatalog();
   res.set('Cache-Control','private, no-store');
   return res.json({catalog:[...catalog.all.values()].map(item=>({
    id:item.id,label:item.label,kind:item.kind,color:item.color,
    imageUrl:item.imageUrl||null,custom:isCustomDecorationId(item.id)
   }))});
  }catch(error){return failure(res,error)}
 });
 app.patch('/api/personnel-awards/catalog-label/:id',requireUser,async(req,res)=>{
  if(!canRenameDecorationCatalog(req.bpd))
   return res.status(403).json({error:'Alleen geverifieerd Officierenkader, Korpsleiding of Technisch Beheer'});
  const id=String(req.params.id||''),body=req.body;
  if(!CATALOG_BY_ID.has(id)&&!isCustomDecorationId(id))
   return res.status(404).json({error:'Onbekende onderscheiding'});
  if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).length!==2||!Object.hasOwn(body,'label')||
     !Object.hasOwn(body,'reason'))
   return res.status(400).json({error:'Naam en motivering vereist'});
  const label=typeof body.label==='string'?body.label.trim():'',
   reason=typeof body.reason==='string'?body.reason.trim():'';
  if(label.length<3||label.length>80||/[<>\x00-\x1f\x7f]/.test(label)||
     reason.length<10||reason.length>500||/[<>\x00-\x1f\x7f]/.test(reason))
   return res.status(400).json({error:'Naam (3–80) en motivering (10–500) vereist'});
  try{
   const store=getFirestore(),ref=store.collection(PERSONNEL_DECORATION_CATALOG_COLLECTION).doc(id);
   await store.runTransaction(async tx=>{
    const before=await tx.get(ref),base=CATALOG_BY_ID.get(id);
    if(!before.exists&&!base)
     throw Object.assign(Error('Geüploade onderscheiding niet gevonden'),{status:404});
    if(before.exists&&before.get('disabled')===true)
     throw Object.assign(Error('Gearchiveerde onderscheiding'),{status:409});
    const oldLabel=before.exists?String(before.get('label')||base?.label||''):base.label;
    if(oldLabel===label)throw Object.assign(Error('De naam is niet gewijzigd'),{status:409});
    tx.set(ref,{id,label,updatedAt:FieldValue.serverTimestamp(),
     updatedByDiscordId:req.bpd.discordId},{merge:true});
    tx.create(store.collection('bpd_personnel_decoration_catalog_audit').doc(),{
     catalogId:id,kind:base?.kind||before.get('kind'),oldLabel,newLabel:label,
     reason,actorDiscordId:req.bpd.discordId,actorUid:req.bpd.uid,
     at:FieldValue.serverTimestamp()
    });
   });
   return res.json({saved:true,id,label,audited:true});
  }catch(error){if(error?.status)return res.status(error.status).json({error:error.message});
   return failure(res,error)}
 });
 app.post('/api/personnel-awards/catalog-upload',requireUser,async(req,res)=>{
  if(!canManagePoliceDecorationCatalog(req.bpd))
   return res.status(403).json({error:'Alleen geverifieerde politie-officieren en korpsleiding kunnen eretekens uploaden'});
  let image;
  try{image=imageUpload(req.body)}catch(error){return res.status(400).json({error:error.message})}
  try{
   const {custom}=await loadCatalog();
   if(custom.size>=CATALOG_LIMIT)return res.status(409).json({error:'Maximumaantal eretekens bereikt'});
   const id='custom_'+randomUUID();
   const ref=getFirestore().collection(PERSONNEL_DECORATION_CATALOG_COLLECTION).doc(id);
   await ref.create({...image,id,priority:150+custom.size,
    createdAt:FieldValue.serverTimestamp(),createdByDiscordId:req.bpd.discordId,
    disabled:false});
   return res.json({saved:true,item:customCatalogItem({id,...image})});
  }catch(error){return failure(res,error)}
 });

 async function secureSubject(req,res,next){
  if(!req.bpd)return res.status(401).json({error:'Meld je eerst aan'});
  const call=text(req.method==='GET'?req.query.call:req.body?.call,24);
  const name=text(req.method==='GET'?req.query.name:req.body?.name,120);
  if(!call||!name)return res.status(400).json({error:'Selecteer een bestaand personeelslid'});
  try{
   const snap=await getSnapshot();
   const subject=validateIdentity(snap,call,name);
   if(!subject)return res.status(404).json({error:'Personeelsregistratie niet uniek gevonden; vernieuw de lijst'});
   if(!canManagePoliceDecoration(req.bpd,subject))
     return res.status(403).json({error:'Alleen geverifieerd Officierenkader of Korpsleiding mag aan politiepersoneel onderscheidingen toekennen of intrekken'});
   req.decorationSubject=subject;
   return next();
  }catch(error){return failure(res,error)}
 }
 const readDoc=subject=>getFirestore().collection(PERSONNEL_DECORATIONS_COLLECTION)
   .doc(awardKey(subject.dept,subject.personId));
 app.get('/api/personnel-awards/manage',requireUser,secureSubject,async(req,res)=>{
  try{
   const [snap,catalog]=await Promise.all([readDoc(req.decorationSubject).get(),loadCatalog()]);
   res.set('Cache-Control','private, no-store');
   return res.json({canManage:true,catalog:[...catalog.all.values()],
    entries:manageDecorations(snap.get('entries')||[],brusselsToday(),catalog.extras)});
  }catch(error){return failure(res,error)}
 });
 app.post('/api/personnel-awards/grant',requireUser,secureSubject,async(req,res)=>{
  let input,catalog;
  try{
   catalog=await loadCatalog();
   input=validateDecoration({
    catalogId:req.body?.catalogId,startDate:req.body?.startDate,
    endDate:req.body?.endDate,public:req.body?.public,reason:req.body?.reason
   },brusselsToday(),catalog.all);
  }catch(error){return res.status(400).json({error:error.message})}
  const subject=req.decorationSubject;
  try{
   const store=getFirestore(),ref=readDoc(subject),activity=store.collection(PERSONNEL_ACTIVITY_COLLECTION).doc();
   const now=brusselsToday();
   await store.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const current=snap.get('entries')||[];
    if(!Array.isArray(current)||current.length>=100)
      throw Object.assign(Error('Maximumaantal onderscheidingen bereikt'),{status:409});
    if(current.some(a=>a.catalogId===input.catalogId&&!a.revokedAt&&
       (!a.endDate||a.endDate>=now)))
      throw Object.assign(Error('Deze onderscheiding is al actief of ingepland'),{status:409});
    const entry={...input,id:randomUUID(),grantedAt:new Date().toISOString(),
      grantedByUid:req.bpd.uid,grantedByDiscordId:req.bpd.discordId};
    tx.set(ref,{dept:'politie',discordId:subject.personId,entries:[...current,entry],
      modifiedAt:FieldValue.serverTimestamp()},{merge:true});
    tx.create(activity,{type:'award_granted',dept:'politie',discordId:subject.personId,
      name:subject.name,label:catalog.all.get(input.catalogId).label,
      before:'Niet toegekend',after:'Toegekend',
      reason:input.reason,awardId:entry.id,actorDiscordId:req.bpd.discordId,
      at:FieldValue.serverTimestamp()});
   });
   return res.json({saved:true});
  }catch(error){if(error.status===409)return res.status(409).json({error:error.message});
   return failure(res,error)}
 });
 app.post('/api/personnel-awards/revoke',requireUser,secureSubject,async(req,res)=>{
  const id=text(req.body?.id,70),reason=text(req.body?.reason,500);
  if(!/^[a-f0-9-]{36}$/i.test(id)||reason.length<10||/[\x00-\x1f\x7f<>]/.test(reason))
   return res.status(400).json({error:'Geldige onderscheiding en motivering vereist'});
  const subject=req.decorationSubject;
  try{
   const store=getFirestore(),ref=readDoc(subject),catalog=await loadCatalog();
   await store.runTransaction(async tx=>{
    const snap=await tx.get(ref),rows=snap.get('entries');
    if(!Array.isArray(rows))throw Object.assign(Error('Geen toegekende onderscheiding'),{status:404});
    const selected=rows.find(a=>a?.id===id);
    if(!selected||selected.revokedAt)
     throw Object.assign(Error('Onderscheiding reeds ingetrokken of onbekend'),{status:404});
    const updated=rows.map(a=>a?.id===id?{...a,revokedAt:new Date().toISOString(),
      revokedByUid:req.bpd.uid,revokedByDiscordId:req.bpd.discordId,revokeReason:reason}:a);
    tx.set(ref,{entries:updated,modifiedAt:FieldValue.serverTimestamp()},{merge:true});
    tx.create(store.collection(PERSONNEL_ACTIVITY_COLLECTION).doc(),{
      type:'award_revoked',dept:'politie',discordId:subject.personId,
      name:subject.name,label:catalog.all.get(selected.catalogId)?.label||'Onderscheiding',
      before:'Toegekend',after:'Ingetrokken',reason,
      awardId:id,actorDiscordId:req.bpd.discordId,at:FieldValue.serverTimestamp()
    });
   });
   return res.json({saved:true});
  }catch(error){if(error.status===404)return res.status(404).json({error:error.message});
   return failure(res,error)}
 });
}
