// Portaal-native badge/logo storage. Images have NO relation to access permissions.
import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {isUserManager} from './user-access.js';

export const ROLE_ARTWORK_META='bpd_role_artwork_meta';
export const ROLE_ARTWORK_IMAGES='bpd_role_artwork_images';
export const ROLE_ARTWORK_AUDIT='bpd_role_artwork_audit';
const ID=/^\d{15,22}$/;
const VARIANT=/^[a-z][a-z0-9_]{0,39}$/;
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
const metaData=d=>{
 const v=d.data();
 return {key:d.id,roleId:v.roleId,variant:v.variant,label:v.label,
  imageUrl:'/api/role-artwork/file/'+d.id+'?v='+encodeURIComponent(v.version),
  updatedAt:v.updatedAt?.toDate?.()?.toISOString()||null};
};
export function validateRoleArtwork(body){
 if(!body||Array.isArray(body)||typeof body!=='object'||
  Object.keys(body).some(x=>!['roleId','variant','label','dataUrl','reason'].includes(x)))
  throw fail(400,'Ongeldige logoaanvraag');
 const roleId=String(body.roleId||'').trim(),variant=String(body.variant||'').trim();
 const label=typeof body.label==='string'?body.label.trim():'';
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
 if(!data.length||data.length>MAX_BYTES||data.toString('base64')!==match[1]||
  data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WEBP'||
  data.readUInt32LE(4)!==data.length-8)
  throw fail(400,'Ongeldige of te grote WebP-afbeelding');
 return {roleId,variant,label,reason,key:keyFor(roleId,variant),base64:match[1]};
}
export function installRoleArtworkRoutes(app,{requireUser}){
 // Serve approved image bytes without exposing credentials; assets are decorative,
 // and role IDs/photos stored here never constitute grants or verified roles.
 app.get('/api/role-artwork/file/:key',async(req,res)=>{
  const key=String(req.params.key||'');
  if(!/^\d{15,22}_[a-z][a-z0-9_]{0,39}$/.test(key))return res.sendStatus(404);
  try{
   const db=getFirestore(),meta=await db.collection(ROLE_ARTWORK_META).doc(key).get();
   if(!meta.exists||meta.get('active')!==true)return res.sendStatus(404);
   const assetId=meta.get('assetId');
   if(typeof assetId!=='string'||!/^[a-f0-9-]{36}$/.test(assetId))return res.sendStatus(404);
   const asset=await db.collection(ROLE_ARTWORK_IMAGES).doc(assetId).get();
   if(!asset.exists||asset.get('key')!==key||asset.get('mime')!=='image/webp')
    return res.sendStatus(404);
   const bytes=Buffer.from(asset.get('base64')||'','base64');
   if(bytes.length>MAX_BYTES||bytes.toString('ascii',0,4)!=='RIFF')return res.sendStatus(404);
   res.set({'Content-Type':'image/webp','X-Content-Type-Options':'nosniff',
    'Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'public, max-age=180'});
   return res.send(bytes);
  }catch(e){console.error('Badgebeeld:',e.code||'storage_error');return res.sendStatus(503)}
 });
 app.get('/api/role-artwork/manifest',requireUser,async(_req,res)=>{
  try{
   const snap=await getFirestore().collection(ROLE_ARTWORK_META).limit(150).get();
   res.set('Cache-Control','private, no-store');
   return res.json({artworks:snap.docs.filter(d=>d.get('active')===true).map(metaData)});
  }catch(e){return error(res,e)}
 });
 app.get('/api/role-artwork/manage',requireUser,allowed,async(_req,res)=>{
  try{
   const snap=await getFirestore().collection(ROLE_ARTWORK_META).limit(150).get();
   res.set('Cache-Control','private, no-store');
   return res.json({canEdit:true,artworks:snap.docs.map(d=>({...metaData(d),
    active:d.get('active')===true,updatedBy:d.get('updatedBy')||''}))});
  }catch(e){return error(res,e)}
 });
 app.put('/api/role-artwork',requireUser,allowed,async(req,res)=>{
  let input;try{input=validateRoleArtwork(req.body)}catch(e){return error(res,e)}
  try{
   const db=getFirestore(),ref=db.collection(ROLE_ARTWORK_META).doc(input.key);
   const assetId=randomUUID(),asset=db.collection(ROLE_ARTWORK_IMAGES).doc(assetId);
   const audit=db.collection(ROLE_ARTWORK_AUDIT).doc();
   const version=Date.now().toString(36)+'-'+assetId.slice(0,8);
   await db.runTransaction(async tx=>{
    const before=await tx.get(ref);
    const old=before.exists?before.data():null;
    // Existing assets are retained for audit/recovery; only the metadata pointer changes.
    tx.create(asset,{key:input.key,base64:input.base64,mime:'image/webp',
     createdAt:FieldValue.serverTimestamp(),createdBy:req.bpd.uid});
    tx.set(ref,{roleId:input.roleId,variant:input.variant,label:input.label,
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
  if(!/^\d{15,22}_[a-z][a-z0-9_]{0,39}$/.test(key)||
   reason.length<8||reason.length>300||/[<>\x00-\x1f]/.test(reason))
   return res.status(400).json({error:'Ongeldig rolslot of motivering (8–300 tekens)'});
  try{
   const db=getFirestore(),ref=db.collection(ROLE_ARTWORK_META).doc(key);
   await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    if(!old.exists)throw fail(404,'Geen logo gevonden');
    tx.update(ref,{active:false,updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid});
    tx.create(db.collection(ROLE_ARTWORK_AUDIT).doc(),{
     key,action:'deactivate',previousAssetId:old.get('assetId')||null,
     actorUid:req.bpd.uid,reason,at:FieldValue.serverTimestamp()});
   });
   res.json({saved:true,permissionsChanged:false});
  }catch(e){return error(res,e)}
 });
}
