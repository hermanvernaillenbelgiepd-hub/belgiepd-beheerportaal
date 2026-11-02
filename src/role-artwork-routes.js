// Portaal-native badge/logo storage. Images have NO relation to access permissions.
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {isUserManager} from './user-access.js';
import {roleForDepartment} from './leave-policy.js';

export const ROLE_ARTWORK_META='bpd_role_artwork_meta';
export const ROLE_ARTWORK_IMAGES='bpd_role_artwork_images';
export const ROLE_ARTWORK_AUDIT='bpd_role_artwork_audit';
const ID=/^\d{15,22}$/;
const VARIANT=/^[a-z][a-z0-9_]{0,39}$/;
const DEPTS=['politie','brandweer','ambulance','depannage','burger','beveiliging'];
export const VISUAL_ARTWORK_KINDS=Object.freeze(['rank','specialty','uniform','medal','helmet','profession','logo','pictogram','patch','award']);
const ARTWORK_KEY=/^(?:\d{15,22}_[a-z][a-z0-9_]{0,39}|(?:rank|specialty|uniform|medal|helmet|profession|logo|pictogram|patch|award)_(?:politie|brandweer|ambulance|depannage|burger|beveiliging)_[a-z0-9][a-z0-9_]{0,39})$/;
const CODE=/^[a-z0-9][a-z0-9_]{0,39}$/;
const MAX_BYTES=140*1024;
const keyFor=(roleId,variant)=>roleId+'_'+variant;
const fail=(code,message)=>Object.assign(new Error(message),{publicStatus:code});
const error=(res,e)=>{
 if(e?.publicStatus)return res.status(e.publicStatus).json({error:e.message});
 console.error('Logo- en patchbeheer:',e?.code||'storage_error');
 return res.status(503).json({error:'Logobeheer tijdelijk niet beschikbaar'});
};
const allowed=(req,res,next)=>isUserManager(req.bpd)?next():
 res.status(403).json({error:'Alleen gemachtigd Officierenkader, Korpsleiding en beheer'});
const mayEditDepartment=(actor,department)=>{
 if(actor?.role==='beheerder')return true;
 return isUserManager(actor)&&actor?.departments?.includes(department)===true&&
  ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,department));
};
const metaData=d=>{
 const v=d.data();
 return {key:d.id,roleId:v.roleId||'',variant:v.variant||'',label:v.label,
  kind:v.kind||'role',code:v.code||'',department:v.department||'politie',
  sourceArtworkKey:v.sourceArtworkKey||'',
  imageUrl:'/api/role-artwork/file/'+d.id+'?v='+encodeURIComponent(v.version),
  updatedAt:v.updatedAt?.toDate?.()?.toISOString()||null};
};
export function validateRoleArtwork(body){
 if(!body||Array.isArray(body)||typeof body!=='object'||
  Object.keys(body).some(x=>!['roleId','variant','label','department','dataUrl','reason'].includes(x)))
  throw fail(400,'Ongeldige logoaanvraag');
 const roleId=String(body.roleId||'').trim(),variant=String(body.variant||'').trim();
 const label=typeof body.label==='string'?body.label.trim():'';
 const department=String(body.department||'politie').trim();
 if(!DEPTS.includes(department))throw fail(400,'Ongeldige hulpdienst voor het rollenlogo');
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(!ID.test(roleId)||!VARIANT.test(variant))throw fail(400,'Ongeldig Discord-rol-ID of variant');
 if(label.length<2||label.length>75||/[<>\x00-\x1f]/.test(label))throw fail(400,'Naam moet 2–75 tekens bevatten');
 if(reason.length<8||reason.length>300||/[<>\x00-\x1f]/.test(reason))
  throw fail(400,'Motivering moet 8–300 tekens bevatten');
 const raw=typeof body.dataUrl==='string'?body.dataUrl:'';
 const match=/^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
 if(!match||match[1].length>Math.ceil(MAX_BYTES*4/3)+8)
  throw fail(400,'Upload een WebP-afbeelding van maximaal 140 KB');
 const data=Buffer.from(match[1],'base64');
 if(data.length>MAX_BYTES)
  throw fail(400,'Upload een WebP-afbeelding van maximaal 140 KB');
 if(data.length<30||data.toString('base64')!==match[1]||
  data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WEBP'||
  !['VP8 ','VP8L','VP8X'].includes(data.toString('ascii',12,16))||
  data.readUInt32LE(4)!==data.length-8)
  throw fail(400,'Ongeldige of te grote WebP-afbeelding');
 return {roleId,variant,label,department,reason,key:keyFor(roleId,variant),base64:match[1]};
}
// Grade and specialty logos are independent visual resources; they are not
// bound to Discord roles, rank changes or a dossier authorization.
export function validatePersonnelArtwork(body){
 if(!body||Array.isArray(body)||typeof body!=='object'||
  Object.keys(body).some(x=>!['kind','department','code','label','reason','dataUrl'].includes(x)))
  throw fail(400,'Ongeldige graad- of specialisatie-upload');
 const kind=String(body.kind||'');
 const department=String(body.department||'politie');
 const code=String(body.code||'').toLowerCase().trim();
 if(!VISUAL_ARTWORK_KINDS.includes(kind)||!DEPTS.includes(department)||!CODE.test(code))
  throw fail(400,'Ongeldige graad, specialisatie, assetsoort, code of hulpdienst');
 // Reuse all binary/motivation/label checks from the role uploader while
 // avoiding the need for a fake Discord role ID.
 const validated=validateRoleArtwork({
  roleId:'100000000000000',variant:'standard',department,
  label:body.label,reason:body.reason,dataUrl:body.dataUrl
 });
 return {kind,department,code,label:validated.label,
  reason:validated.reason,key:kind+'_'+department+'_'+code,
  base64:validated.base64};
}
export function installRoleArtworkRoutes(app,{requireUser}){
 // Serve approved image bytes without exposing credentials; assets are decorative,
 // and role IDs/photos stored here never constitute grants or verified roles.
 app.get('/api/role-artwork/file/:key',async(req,res)=>{
  const key=String(req.params.key||'');
  if(!ARTWORK_KEY.test(key))return res.sendStatus(404);
  try{
   const db=getFirestore(),meta=await db.collection(ROLE_ARTWORK_META).doc(key).get();
   if(!meta.exists||meta.get('active')!==true)return res.sendStatus(404);
   const linkedKey=meta.get('sourceArtworkKey');
   let sourceMeta=meta,sourceKey=key;
   if(linkedKey){
    if(typeof linkedKey!=='string'||!ARTWORK_KEY.test(linkedKey))return res.sendStatus(404);
    const linked=await db.collection(ROLE_ARTWORK_META).doc(linkedKey).get();
    if(!linked.exists||linked.get('active')!==true||
      linked.get('department')!==meta.get('department')||
      !['specialty','patch'].includes(linked.get('kind')))return res.sendStatus(404);
    sourceMeta=linked;sourceKey=linkedKey;
   }
   // New library files live in Cloud Storage; legacy WebP records remain in Firestore.
   const storagePath=sourceMeta.get('storagePath');
   if(typeof storagePath==='string'&&storagePath){
    const department=sourceMeta.get('department'),kind=sourceMeta.get('kind'),code=sourceMeta.get('code');
    const prefix='uniformbibliotheek/'+department+'/'+kind+'/'+code+'/';
    if(!storagePath.startsWith(prefix)||!/^[a-f0-9-]{36}\.(?:webp|png|jpg)$/.test(storagePath.slice(prefix.length)))
     return res.sendStatus(404);
    const bucketName=process.env.BPD_UNIFORM_LIBRARY_BUCKET||process.env.FIREBASE_STORAGE_BUCKET;
    if(!bucketName)return res.sendStatus(503);
    const mime=sourceMeta.get('mime');
    if(!['image/webp','image/png','image/jpeg'].includes(mime))return res.sendStatus(404);
    const [bytes]=await getStorage().bucket(bucketName).file(storagePath).download();
    if(!bytes||bytes.length>4*1024*1024)return res.sendStatus(404);
    res.set({'Content-Type':mime,'X-Content-Type-Options':'nosniff',
     'Cross-Origin-Resource-Policy':'same-origin','Cache-Control':linkedKey?'no-store':'public, max-age=180'});
    return res.send(bytes);
   }
   const assetId=sourceMeta.get('assetId');
   if(typeof assetId!=='string'||!/^[a-f0-9-]{36}$/.test(assetId))return res.sendStatus(404);
   const asset=await db.collection(ROLE_ARTWORK_IMAGES).doc(assetId).get();
   if(!asset.exists||asset.get('key')!==sourceKey||asset.get('mime')!=='image/webp')
    return res.sendStatus(404);
   const bytes=Buffer.from(asset.get('base64')||'','base64');
   if(bytes.length>MAX_BYTES||bytes.toString('ascii',0,4)!=='RIFF')return res.sendStatus(404);
   res.set({'Content-Type':'image/webp','X-Content-Type-Options':'nosniff',
    'Cross-Origin-Resource-Policy':'same-origin','Cache-Control':linkedKey?'no-store':'public, max-age=180'});
   return res.send(bytes);
  }catch(e){console.error('Badgebeeld:',e.code||'storage_error');return res.sendStatus(503)}
 });
 app.get('/api/role-artwork/manifest',requireUser,async(_req,res)=>{
  try{
   const snap=await getFirestore().collection(ROLE_ARTWORK_META).limit(1200).get();
   res.set('Cache-Control','private, no-store');
   return res.json({artworks:snap.docs.filter(d=>d.get('active')===true).map(metaData)});
  }catch(e){return error(res,e)}
 });
 app.get('/api/role-artwork/manage',requireUser,allowed,async(_req,res)=>{
  try{
   const snap=await getFirestore().collection(ROLE_ARTWORK_META).limit(1200).get();
   res.set('Cache-Control','private, no-store');
   return res.json({canEdit:true,artworks:snap.docs.filter(d=>mayEditDepartment(_req.bpd,d.get('department')||'politie')).map(d=>({...metaData(d),
    active:d.get('active')===true,updatedBy:d.get('updatedBy')||''}))});
  }catch(e){return error(res,e)}
 });
 app.put('/api/role-artwork/link',requireUser,allowed,async(req,res)=>{
  const b=req.body||{},department=String(b.department||''),
   roleId=String(b.roleId||'').trim(),variant=String(b.variant||'standard').trim().toLowerCase(),
   sourceArtworkKey=String(b.sourceArtworkKey||''),label=String(b.label||'').trim(),
   reason=String(b.reason||'').trim();
  if(!DEPTS.includes(department)||!ID.test(roleId)||!VARIANT.test(variant)||
     !new RegExp('^(?:specialty|patch)_'+department+'_[a-z0-9][a-z0-9_]{0,39}$').test(sourceArtworkKey)||
     label.length<2||label.length>75||reason.length<8||reason.length>300||
     /[<>\x00-\x1f]/.test(label+reason))
   return res.status(400).json({error:'Ongeldige visuele Discord-koppeling'});
  if(!mayEditDepartment(req.bpd,department))
   return res.status(403).json({error:'Geen rechten voor deze hulpdienst'});
  try{
   const db=getFirestore(),key=keyFor(roleId,variant);
   const ref=db.collection(ROLE_ARTWORK_META).doc(key);
   const src=db.collection(ROLE_ARTWORK_META).doc(sourceArtworkKey);
   const version=Date.now().toString(36)+'-'+randomUUID().slice(0,8);
   await db.runTransaction(async tx=>{
    const [before,asset]=await Promise.all([tx.get(ref),tx.get(src)]);
    if(!asset.exists||asset.get('active')!==true||
       asset.get('department')!==department||
       !['specialty','patch'].includes(asset.get('kind')))
     throw fail(400,'Deze patch is niet actief voor deze hulpdienst');
    const old=before.exists?before.data():null;
    if(old&&!mayEditDepartment(req.bpd,old.department||'politie'))
     throw fail(403,'Geen toegang tot de bestaande rolpatch');
    tx.set(ref,{roleId,variant,label,department,sourceArtworkKey,
     active:true,version,updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid});
    tx.create(db.collection(ROLE_ARTWORK_AUDIT).doc(),{
     key,action:'link_existing_artwork',previous:old||null,sourceArtworkKey,
     actorUid:req.bpd.uid,reason,at:FieldValue.serverTimestamp()});
   });
   res.json({saved:true,key,permissionsChanged:false});
  }catch(e){error(res,e)}
 });
 app.put('/api/role-artwork/personnel',requireUser,allowed,async(req,res)=>{
  let input;try{input=validatePersonnelArtwork(req.body)}catch(e){return error(res,e)}
  if(!mayEditDepartment(req.bpd,input.department))
   return res.status(403).json({error:'Geen logobeheerrechten voor deze hulpdienst'});
  try{
   const db=getFirestore(),ref=db.collection(ROLE_ARTWORK_META).doc(input.key);
   const assetId=randomUUID(),asset=db.collection(ROLE_ARTWORK_IMAGES).doc(assetId);
   const version=Date.now().toString(36)+'-'+assetId.slice(0,8);
   await db.runTransaction(async tx=>{
    const before=await tx.get(ref),previous=before.exists?before.data():null;
    if(previous&&!mayEditDepartment(req.bpd,previous.department||'politie'))
     throw fail(403,'Geen toegang tot dit bestaande logo');
    // An old-style WebP replacement must not orphan the current Cloud version.
    if(previous?.storagePath){
     tx.create(db.collection('bpd_uniform_library_versions').doc(),{
      key:input.key,kind:previous.kind,department:previous.department,
      code:previous.code,label:previous.label,storagePath:previous.storagePath,
      assetId:null,mime:previous.mime||'image/webp',
      version:previous.version,createdBy:previous.updatedBy||'',
      createdAt:FieldValue.serverTimestamp(),historic:true});
    }
    tx.create(asset,{key:input.key,base64:input.base64,mime:'image/webp',
     createdAt:FieldValue.serverTimestamp(),createdBy:req.bpd.uid});
    tx.set(ref,{kind:input.kind,code:input.code,department:input.department,
     label:input.label,active:true,version,assetId,
     updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid});
    tx.create(db.collection(ROLE_ARTWORK_AUDIT).doc(),{
     key:input.key,action:previous?'replace_personnel_art':'upload_personnel_art',
     previousAssetId:previous?.assetId||null,newAssetId:assetId,
     actorUid:req.bpd.uid,reason:input.reason,at:FieldValue.serverTimestamp()});
   });
   return res.json({saved:true,key:input.key,version,permissionsChanged:false});
  }catch(e){return error(res,e)}
 });
 app.put('/api/role-artwork',requireUser,allowed,async(req,res)=>{
  let input;try{input=validateRoleArtwork(req.body)}catch(e){return error(res,e)}
  if(!mayEditDepartment(req.bpd,input.department))return res.status(403).json({error:'Geen logobeheerrechten voor deze hulpdienst'});
  try{
   const db=getFirestore(),ref=db.collection(ROLE_ARTWORK_META).doc(input.key);
   const assetId=randomUUID(),asset=db.collection(ROLE_ARTWORK_IMAGES).doc(assetId);
   const audit=db.collection(ROLE_ARTWORK_AUDIT).doc();
   const version=Date.now().toString(36)+'-'+assetId.slice(0,8);
   await db.runTransaction(async tx=>{
    const before=await tx.get(ref);
    const old=before.exists?before.data():null;
    if(old&&!mayEditDepartment(req.bpd,old.department||'politie'))throw fail(403,'Geen recht op dit bestaande logo');
    // Existing assets are retained for audit/recovery; only the metadata pointer changes.
    tx.create(asset,{key:input.key,base64:input.base64,mime:'image/webp',
     createdAt:FieldValue.serverTimestamp(),createdBy:req.bpd.uid});
    tx.set(ref,{roleId:input.roleId,variant:input.variant,label:input.label,department:input.department,
     active:true,version,assetId,updatedAt:FieldValue.serverTimestamp(),
     updatedBy:req.bpd.uid});
    tx.create(audit,{key:input.key,action:old?'replace':'upload',label:input.label,
     previousAssetId:old?.assetId||null,newAssetId:assetId,actorUid:req.bpd.uid,
     reason:input.reason,at:FieldValue.serverTimestamp()});
   });
   return res.json({saved:true,key:input.key,version,permissionsChanged:false});
  }catch(e){return error(res,e)}
 });
 app.delete('/api/role-artwork/:key',requireUser,allowed,async(req,res)=>{
  const key=String(req.params.key||''),reason=String(req.body?.reason||'').trim();
  if(!ARTWORK_KEY.test(key)||
   reason.length<8||reason.length>300||/[<>\x00-\x1f]/.test(reason))
   return res.status(400).json({error:'Ongeldig rolslot of motivering (8–300 tekens)'});
  try{
   const db=getFirestore(),ref=db.collection(ROLE_ARTWORK_META).doc(key);
   await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    if(!old.exists)throw fail(404,'Geen logo gevonden');
    if(!mayEditDepartment(req.bpd,old.get('department')||'politie'))throw fail(403,'Geen recht op dit logo');
    tx.update(ref,{active:false,updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid});
    tx.create(db.collection(ROLE_ARTWORK_AUDIT).doc(),{
     key,action:'deactivate',previousAssetId:old.get('assetId')||null,
     actorUid:req.bpd.uid,reason,at:FieldValue.serverTimestamp()});
   });
   res.json({saved:true,permissionsChanged:false});
  }catch(e){return error(res,e)}
 });
}
