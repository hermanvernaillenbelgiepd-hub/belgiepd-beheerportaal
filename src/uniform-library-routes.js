// Versioned Cloud Storage assets and visual-only per-service/person selections.
// Existing Firestore-hosted artwork stays valid and is never rewritten here.
import {randomUUID,createHash} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {isUserManager} from './user-access.js';
import {roleForDepartment} from './leave-policy.js';
import {ROLE_ARTWORK_META,ROLE_ARTWORK_AUDIT} from './role-artwork-routes.js';

export const UNIFORM_LIBRARY_VERSIONS='bpd_uniform_library_versions';
export const UNIFORM_LIBRARY_RULES='bpd_uniform_library_rules';
export const UNIFORM_LIBRARY_RULE_AUDIT='bpd_uniform_library_rule_audit';
export const UNIFORM_LIBRARY_PREFIX='uniformbibliotheek/';
export const UNIFORM_LIBRARY_KINDS=Object.freeze([
 'rank','uniform','specialty','medal','helmet','profession','logo','pictogram','patch','award'
]);
export const UNIFORM_LIBRARY_RULE_KINDS=Object.freeze([
 'rank','helmet','profession','logo','pictogram','patch','specialty'
]);
const DEPTS=['politie','brandweer','ambulance','depannage','burger','beveiliging'];
const SCOPES=['service','cadre','rank','person'];
const CODE=/^[a-z0-9][a-z0-9_]{0,39}$/;
const PERSON=/^\d{15,22}$/;
const KEY=/^(rank|uniform|specialty|medal|helmet|profession|logo|pictogram|patch|award)_(politie|brandweer|ambulance|depannage|burger|beveiliging)_([a-z0-9][a-z0-9_]{0,39})$/;
const MAX_BYTES=4*1024*1024;
const err=(code,message)=>Object.assign(new Error(message),{publicStatus:code});
const fail=(res,e)=>{
 if(e?.publicStatus)return res.status(e.publicStatus).json({error:e.message});
 console.error('Uniformbibliotheek:',e?.code||'storage_error');
 return res.status(503).json({error:'Uniformbibliotheek tijdelijk niet beschikbaar'});
};
export const bucketName=(env=process.env)=>
 String(env.BPD_UNIFORM_LIBRARY_BUCKET||env.FIREBASE_STORAGE_BUCKET||'').trim();
const bucket=()=>{
 const name=bucketName();
 if(!name)throw err(503,'Cloud Storage is nog niet ingesteld. Stel BPD_UNIFORM_LIBRARY_BUCKET in voor deze omgeving.');
 return getStorage().bucket(name);
};
export const canEditLibrary=(actor,department)=>{
 if(actor?.role==='beheerder')return true;
 return department!=='beveiliging'&&isUserManager(actor)&&
  actor?.departments?.includes(department)===true&&
  ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,department));
};
const reasonOf=value=>{
 const reason=typeof value==='string'?value.trim():'';
 if(reason.length<8||reason.length>300||/[<>\x00-\x1f]/.test(reason))
  throw err(400,'Motivering van 8 tot 300 tekens verplicht');
 return reason;
};
const validateDepartment=d=>{
 if(!DEPTS.includes(d))throw err(400,'Ongeldige hulpdienst');
 return d;
};
const validateKey=value=>{
 const key=String(value||'');
 const m=KEY.exec(key);
 if(!m)return null;
 return {key,kind:m[1],department:m[2],code:m[3]};
};
export function validateLibraryUpload(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).some(k=>!['department','kind','code','label','reason','dataUrl'].includes(k)))
  throw err(400,'Ongeldige uploadvelden');
 const department=validateDepartment(String(body.department||''));
 const kind=String(body.kind||''),code=String(body.code||'').trim().toLowerCase();
 if(!UNIFORM_LIBRARY_KINDS.includes(kind)||!CODE.test(code))
  throw err(400,'Onbekende beeldsoort of code');
 const label=typeof body.label==='string'?body.label.trim():'';
 if(label.length<2||label.length>75||/[<>\x00-\x1f]/.test(label))
  throw err(400,'Naam moet 2 tot 75 tekens bevatten');
 const reason=reasonOf(body.reason);
 const value=typeof body.dataUrl==='string'?body.dataUrl:'';
 const match=/^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match||match[2].length>Math.ceil(MAX_BYTES*4/3)+8)
  throw err(400,'Gebruik een PNG, JPEG of WebP van maximaal 4 MB');
 const bytes=Buffer.from(match[2],'base64');
 if(bytes.length<30||bytes.length>MAX_BYTES||bytes.toString('base64')!==match[2])
  throw err(400,'Ongeldige of te grote afbeelding');
 const mime='image/'+match[1];
 const valid=mime==='image/png'?
  bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
  mime==='image/jpeg'?
   bytes[0]===255&&bytes[1]===216&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217:
   bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&
   bytes.readUInt32LE(4)===bytes.length-8;
 if(!valid)throw err(400,'Bestandstype en afbeeldingsinhoud komen niet overeen');
 return {department,kind,code,label,reason,bytes,mime,key:kind+'_'+department+'_'+code};
}
export function validateLibraryRule(body){
 if(!body||Array.isArray(body)||typeof body!=='object'||
  Object.keys(body).some(k=>!['department','kind','scope','selector','assetCode','reason'].includes(k)))
  throw err(400,'Ongeldige afbeeldingskoppeling');
 const department=validateDepartment(String(body.department||''));
 const kind=String(body.kind||''),scope=String(body.scope||'');
 const selector=String(body.selector||'').trim().toLowerCase();
 const assetCode=String(body.assetCode||'').trim().toLowerCase();
 if(!UNIFORM_LIBRARY_RULE_KINDS.includes(kind)||!SCOPES.includes(scope)||
   !(scope==='person'?(PERSON.test(selector)||/^call_[a-z0-9][a-z0-9_]{0,34}$/.test(selector)):
     scope==='service'?selector==='default':CODE.test(selector))||!CODE.test(assetCode))
  throw err(400,'Ongeldige soort, doelgroep of afbeeldingscode');
 return {key:department+'_'+kind+'_'+scope+'_'+selector,
  department,kind,scope,selector,assetCode,reason:reasonOf(body.reason)};
}
function metadataForVersion(key,record){
 return {key,kind:record.kind,department:record.department,code:record.code,
  label:record.label,storagePath:record.storagePath||null,assetId:record.assetId||null,
  mime:record.mime||'image/webp',version:record.version,active:true};
}
export function installUniformLibraryRoutes(app,{requireUser}){
 app.get('/api/uniform-library/status',requireUser,(req,res)=>{
  res.set('Cache-Control','private, no-store');
  res.json({storageReady:Boolean(bucketName()),maxUploadBytes:MAX_BYTES,
   editableDepartments:DEPTS.filter(d=>canEditLibrary(req.bpd,d))});
 });
 app.put('/api/uniform-library/assets',requireUser,async(req,res)=>{
  let input;try{input=validateLibraryUpload(req.body)}catch(e){return fail(res,e)}
  if(!canEditLibrary(req.bpd,input.department))
   return res.status(403).json({error:'Geen uploadrechten voor deze hulpdienst'});
  let saved=null;
  try{
   const store=bucket(),db=getFirestore(),id=randomUUID();
   const ext=input.mime.split('/')[1]==='jpeg'?'jpg':input.mime.split('/')[1];
   const objectPath=UNIFORM_LIBRARY_PREFIX+input.department+'/'+input.kind+'/'+input.code+'/'+id+'.'+ext;
   saved=store.file(objectPath);
   await saved.save(input.bytes,{resumable:false,validation:'crc32c',metadata:{
    contentType:input.mime,cacheControl:'private, max-age=180',
    metadata:{sha256:createHash('sha256').update(input.bytes).digest('hex')}
   }});
   const meta=db.collection(ROLE_ARTWORK_META).doc(input.key);
   const version=Date.now().toString(36)+'-'+id.slice(0,8);
   await db.runTransaction(async tx=>{
    const prev=await tx.get(meta),old=prev.exists?prev.data():null;
    if(old&&!canEditLibrary(req.bpd,old.department))throw err(403,'Geen toegang tot bestaand onderdeel');
    if(old?.active&&old.version){
     const history=db.collection(UNIFORM_LIBRARY_VERSIONS).doc();
     tx.create(history,{...metadataForVersion(input.key,old),createdAt:FieldValue.serverTimestamp(),
      createdBy:old.updatedBy||'',historic:true});
    }
    tx.create(db.collection(UNIFORM_LIBRARY_VERSIONS).doc(id),{
     key:input.key,kind:input.kind,department:input.department,code:input.code,
     label:input.label,mime:input.mime,storagePath:objectPath,
     version,createdBy:req.bpd.uid,createdAt:FieldValue.serverTimestamp()});
    tx.set(meta,{kind:input.kind,department:input.department,code:input.code,
     label:input.label,storagePath:objectPath,mime:input.mime,assetId:null,
     version,active:true,updatedBy:req.bpd.uid,updatedAt:FieldValue.serverTimestamp()});
    tx.create(db.collection(ROLE_ARTWORK_AUDIT).doc(),{
     key:input.key,action:old?'replace_cloud_library_art':'upload_cloud_library_art',
     previousAssetId:old?.assetId||null,previousStoragePath:old?.storagePath||null,
     newStoragePath:objectPath,actorUid:req.bpd.uid,reason:input.reason,
     at:FieldValue.serverTimestamp()});
   });
   return res.json({saved:true,key:input.key,version,permissionsChanged:false});
  }catch(e){
   if(saved)await saved.delete({ignoreNotFound:true}).catch(()=>{});
   return fail(res,e);
  }
 });
 app.get('/api/uniform-library/versions',requireUser,async(req,res)=>{
  const key=validateKey(req.query.key);
  if(!key)return res.status(400).json({error:'Ongeldige afbeeldingscode'});
  if(!canEditLibrary(req.bpd,key.department))
   return res.status(403).json({error:'Geen bibliotheekrechten voor deze hulpdienst'});
  try{
   const snap=await getFirestore().collection(UNIFORM_LIBRARY_VERSIONS)
    .where('key','==',key.key).limit(60).get();
   const versions=snap.docs.map(x=>({id:x.id,label:x.get('label'),
    version:x.get('version'),date:x.get('createdAt')?.toDate?.()?.toISOString()||null}))
    .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
   res.set('Cache-Control','private, no-store');
   return res.json({versions});
  }catch(e){return fail(res,e)}
 });
 app.post('/api/uniform-library/restore',requireUser,async(req,res)=>{
  const key=validateKey(req.body?.key),versionId=String(req.body?.versionId||'');
  let reason;try{reason=reasonOf(req.body?.reason)}catch(e){return fail(res,e)}
  if(!key||!/^[a-f0-9-]{36}$/.test(versionId))
   return res.status(400).json({error:'Ongeldige versie'});
  if(!canEditLibrary(req.bpd,key.department))
   return res.status(403).json({error:'Geen herstelrechten'});
  try{
   const db=getFirestore(),meta=db.collection(ROLE_ARTWORK_META).doc(key.key);
   const historic=db.collection(UNIFORM_LIBRARY_VERSIONS).doc(versionId);
   await db.runTransaction(async tx=>{
    const [previous,version]=await Promise.all([tx.get(meta),tx.get(historic)]);
    if(!previous.exists||!version.exists||version.get('key')!==key.key)
     throw err(404,'Versie niet beschikbaar');
    const old=previous.data(),pick=version.data();
    tx.update(meta,{...metadataForVersion(key.key,pick),updatedAt:FieldValue.serverTimestamp(),
     updatedBy:req.bpd.uid});
    tx.create(db.collection(ROLE_ARTWORK_AUDIT).doc(),{
     key:key.key,action:'restore_cloud_library_version',
     previousVersion:old.version,restoredVersion:pick.version,actorUid:req.bpd.uid,
     reason,at:FieldValue.serverTimestamp()});
   });
   return res.json({saved:true,permissionsChanged:false});
  }catch(e){return fail(res,e)}
 });
 app.get('/api/uniform-library/rules',requireUser,async(req,res)=>{
  try{
   const snap=await getFirestore().collection(UNIFORM_LIBRARY_RULES).limit(600).get();
   res.set('Cache-Control','private, no-store');
   return res.json({rules:snap.docs.map(d=>({key:d.id,...d.data(),
    updatedAt:undefined,updatedBy:undefined}))});
  }catch(e){return fail(res,e)}
 });
 app.put('/api/uniform-library/rules',requireUser,async(req,res)=>{
  let input;try{input=validateLibraryRule(req.body)}catch(e){return fail(res,e)}
  if(!canEditLibrary(req.bpd,input.department))
   return res.status(403).json({error:'Geen koppelrechten voor deze hulpdienst'});
  try{
   const db=getFirestore();
   const asset=await db.collection(ROLE_ARTWORK_META)
    .doc(input.kind+'_'+input.department+'_'+input.assetCode).get();
   if(!asset.exists||asset.get('active')!==true||asset.get('kind')!==input.kind||
    asset.get('department')!==input.department)
    return res.status(400).json({error:'Kies een actieve afbeelding van de juiste hulpdienst'});
   const ref=db.collection(UNIFORM_LIBRARY_RULES).doc(input.key);
   await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    const {reason,...next}=input;
    tx.set(ref,{...next,updatedBy:req.bpd.uid,updatedAt:FieldValue.serverTimestamp()});
    tx.create(db.collection(UNIFORM_LIBRARY_RULE_AUDIT).doc(),{
     key:input.key,action:'assign',previous:old.exists?old.data():null,
     current:next,actorUid:req.bpd.uid,reason:input.reason,at:FieldValue.serverTimestamp()});
   });
   return res.json({saved:true,key:input.key,permissionsChanged:false});
  }catch(e){return fail(res,e)}
 });
 app.delete('/api/uniform-library/rules',requireUser,async(req,res)=>{
  const b=req.body||{};
  const department=String(b.department||''),kind=String(b.kind||''),
   scope=String(b.scope||''),selector=String(b.selector||'').trim().toLowerCase();
  let reason;try{reason=reasonOf(b.reason)}catch(e){return fail(res,e)}
  if(!DEPTS.includes(department)||!UNIFORM_LIBRARY_RULE_KINDS.includes(kind)||
   !SCOPES.includes(scope)||!(scope==='person'?(PERSON.test(selector)||/^call_[a-z0-9][a-z0-9_]{0,34}$/.test(selector)):
   scope==='service'?selector==='default':CODE.test(selector)))
   return res.status(400).json({error:'Ongeldige doelgroep'});
  if(!canEditLibrary(req.bpd,department))return res.status(403).json({error:'Geen koppelrechten'});
  try{
   const db=getFirestore(),key=department+'_'+kind+'_'+scope+'_'+selector;
   const ref=db.collection(UNIFORM_LIBRARY_RULES).doc(key);
   await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    if(!old.exists)throw err(404,'Geen koppeling gevonden');
    tx.delete(ref);
    tx.create(db.collection(UNIFORM_LIBRARY_RULE_AUDIT).doc(),{
     key,action:'remove',previous:old.data(),actorUid:req.bpd.uid,reason,
     at:FieldValue.serverTimestamp()});
   });
   return res.json({saved:true,permissionsChanged:false});
  }catch(e){return fail(res,e)}
 });
}
