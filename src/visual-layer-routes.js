// Visual overlays are display-only. Uploading or positioning any medal never awards it.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {isUserManager} from './user-access.js';
import {roleForDepartment} from './leave-policy.js';
import {ROLE_ARTWORK_META} from './role-artwork-routes.js';

export const VISUAL_LAYER_COLLECTION='bpd_uniform_visual_layers';
export const VISUAL_LAYER_AUDIT='bpd_uniform_visual_layer_audit';
const SERVICES=['politie','brandweer','ambulance','depannage','burger','beveiliging'];
const TYPES=['medal','helmet','profession','logo','pictogram','patch','award','specialty'];
const CODE=/^[a-z0-9][a-z0-9_]{0,39}$/;
const VARIANTS={politie:['silver','gold'],brandweer:['default'],ambulance:['default'],
 depannage:['default'],burger:['default'],beveiliging:['default']};
const bad=(status,message)=>Object.assign(new Error(message),{publicStatus:status});
function canEdit(actor,dept){
 if(actor?.role==='beheerder')return true;
 return dept!=='beveiliging'&&isUserManager(actor)&&
  actor?.departments?.includes(dept)===true&&
  ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,dept));
}
function fail(res,e){
 if(e?.publicStatus)return res.status(e.publicStatus).json({error:e.message});
 console.error('Visual layers:',e?.code||'storage_error');
 return res.status(503).json({error:'Laagbeheer tijdelijk niet beschikbaar'});
}
export function validateVisualLayer(body){
 if(!body||Array.isArray(body)||typeof body!=='object'||
  Object.keys(body).some(k=>!['department','variant','kind','code','left','top',
   'width','height','zIndex','visible','reason'].includes(k)))
  throw bad(400,'Ongeldige visuele laag');
 const department=String(body.department||''),variant=String(body.variant||'');
 const kind=String(body.kind||''),code=String(body.code||'');
 if(!SERVICES.includes(department)||!VARIANTS[department]?.includes(variant)||
  !TYPES.includes(kind)||!CODE.test(code))
  throw bad(400,'Ongeldige hulpdienst, assetsoort of variant');
 const values={};
 for(const k of ['left','top','width','height']){
  if(typeof body[k]!=='number'||!Number.isFinite(body[k])||body[k]<0||body[k]>100)
   throw bad(400,'Positie en afmetingen moeten tussen 0% en 100% liggen');
  values[k]=Math.round(body[k]*100)/100;
 }
 if(values.width<2||values.height<2||values.left+values.width>100||
  values.top+values.height>100)throw bad(400,'De laag moet volledig binnen het uniform blijven');
 if(!Number.isInteger(body.zIndex)||body.zIndex<1||body.zIndex>20)
  throw bad(400,'Ongeldige laagvolgorde');
 if(typeof body.visible!=='boolean')throw bad(400,'Ongeldige zichtbaarheid');
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(reason.length<8||reason.length>300||/[<>\x00-\x1f]/.test(reason))
  throw bad(400,'Motivering van 8 tot 300 tekens verplicht');
 const assetKey=kind+'_'+department+'_'+code;
 const key=assetKey+'_v_'+variant;
 return {department,variant,kind,code,assetKey,key,...values,
  zIndex:body.zIndex,visible:body.visible,reason};
}
export function installVisualLayerRoutes(app,{requireUser}){
 app.get('/api/visual-layers',requireUser,async(req,res)=>{
  try{
   const snap=await getFirestore().collection(VISUAL_LAYER_COLLECTION).limit(350).get();
   const layers=snap.docs.map(doc=>{
    const r=doc.data();
    return {key:doc.id,department:r.department,variant:r.variant,
     kind:r.kind,code:r.code,assetKey:r.assetKey,left:r.left,top:r.top,
     width:r.width,height:r.height,zIndex:r.zIndex,visible:r.visible===true};
   });
   res.set('Cache-Control','private, no-store');
   return res.json({layers});
  }catch(e){return fail(res,e)}
 });
 app.put('/api/visual-layers',requireUser,async(req,res)=>{
  let data;try{data=validateVisualLayer(req.body)}catch(e){return fail(res,e)}
  if(!canEdit(req.bpd,data.department))
   return res.status(403).json({error:'Geen laagbeheerrechten voor deze hulpdienst'});
  try{
   const db=getFirestore();
   const asset=await db.collection(ROLE_ARTWORK_META).doc(data.assetKey).get();
   if(!asset.exists||asset.get('active')!==true||
    asset.get('department')!==data.department||asset.get('kind')!==data.kind)
    return res.status(404).json({error:'Upload eerst een actief logo voor deze laag'});
   const ref=db.collection(VISUAL_LAYER_COLLECTION).doc(data.key);
   await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    const current={department:data.department,variant:data.variant,kind:data.kind,
     code:data.code,assetKey:data.assetKey,left:data.left,top:data.top,
     width:data.width,height:data.height,zIndex:data.zIndex,visible:data.visible};
    tx.set(ref,{...current,updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid});
    tx.create(db.collection(VISUAL_LAYER_AUDIT).doc(),{
     action:'visual_layer_update',key:data.key,previous:old.exists?old.data():null,
     current,reason:data.reason,actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
   });
   return res.json({saved:true,key:data.key,permissionsChanged:false,awarded:false});
  }catch(e){return fail(res,e)}
 });
}
