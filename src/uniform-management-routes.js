// Uniform placement is purely visual; it cannot alter rank, personnel or Discord access.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {isUserManager} from './user-access.js';
import {roleForDepartment} from './leave-policy.js';

export const UNIFORM_LAYOUTS='bpd_uniform_visual_layouts';
export const UNIFORM_LAYOUT_AUDIT='bpd_uniform_visual_layout_audit';
export const UNIFORM_NAMEPLATES='bpd_uniform_nameplate_layouts';
export const UNIFORM_COATS='bpd_uniform_coat_layouts';
export const UNIFORM_SERVICES=Object.freeze(['politie','brandweer','ambulance','depannage','burger','beveiliging']);
export const UNIFORM_VARIANTS=Object.freeze({
 politie:['silver','gold'],
 brandweer:['default'],ambulance:['default'],depannage:['default'],burger:['default'],beveiliging:['default']
});
const DEFAULTS=Object.freeze({
 politie_silver:{left:62.3,top:56.75,width:26.6,height:12.25},
 politie_gold:{left:56.2,top:58.9,width:19.5,height:12.1},
 brandweer_default:{left:62,top:55,width:24,height:12},
 ambulance_default:{left:62,top:55,width:24,height:12},
 depannage_default:{left:62,top:55,width:24,height:12},
 burger_default:{left:62,top:55,width:24,height:12},
 beveiliging_default:{left:62,top:55,width:24,height:12}
});
const NAMEPLATE_DEFAULTS=Object.freeze({
 politie_silver:{left:10.25,top:56.2,width:27.75,height:13.15},
 politie_gold:{left:21.2,top:58.9,width:20.1,height:12.1},
 brandweer_default:{left:11,top:55,width:27,height:12},
 ambulance_default:{left:11,top:55,width:27,height:12},
 depannage_default:{left:11,top:55,width:27,height:12},
 burger_default:{left:11,top:55,width:27,height:12},
 beveiliging_default:{left:11,top:55,width:27,height:12}
});
const COAT_DEFAULTS=Object.freeze(Object.fromEntries(
 Object.keys(DEFAULTS).map(key=>[key,{offsetX:0,offsetY:0,zoom:100}])
));
const defaultPrefix=department=>({
 politie:'BELGIEPD',brandweer:'BRANDWEER',ambulance:'AZLS',
 depannage:'DEPANNAGE',burger:'BURGER',beveiliging:'BEVEILIGING'
})[department]||'BELGIEPD';
const err=(status,message)=>Object.assign(new Error(message),{publicStatus:status});
const error=(res,e)=>{
 if(e?.publicStatus)return res.status(e.publicStatus).json({error:e.message});
 console.error('Uniformbeheer:',e?.code||'storage_error');
 return res.status(503).json({error:'Uniformbeheer tijdelijk niet beschikbaar'});
};
function mayEdit(actor,dept){
 if(actor?.role==='beheerder')return true;
 return isUserManager(actor)&&actor?.departments?.includes(dept)===true&&
  ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,dept));
}
export function validateUniformLayout(input){
 if(!input||Array.isArray(input)||typeof input!=='object'||
  Object.keys(input).some(x=>!['department','variant','left','top','width','height','reason'].includes(x)))
  throw err(400,'Ongeldige uniformindeling');
 const department=String(input.department||''),variant=String(input.variant||'');
 if(!UNIFORM_VARIANTS[department]?.includes(variant))throw err(400,'Onbekende hulpdienst of uniformvariant');
 const coords={};
 for(const key of ['left','top','width','height']){
  if(typeof input[key]!=='number'||!Number.isFinite(input[key])||
   input[key]<0||input[key]>100)throw err(400,'De positie moet tussen 0 en 100 liggen');
  coords[key]=Math.round(input[key]*100)/100;
 }
 if(coords.width<3||coords.height<2||
  coords.left+coords.width>100||coords.top+coords.height>100)
  throw err(400,'De gradenplaat moet volledig binnen het uniform blijven');
 const reason=typeof input.reason==='string'?input.reason.trim():'';
 if(reason.length<8||reason.length>300||/[<>\x00-\x1f]/.test(reason))
  throw err(400,'Motivering van 8–300 tekens verplicht');
 return {department,variant,key:department+'_'+variant,...coords,reason};
}
export function validateUniformNameplate(input){
 if(!input||Array.isArray(input)||typeof input!=='object'||
  Object.keys(input).some(k=>!['department','variant','left','top','width','height','reason',
   'nameScale','callScale','prefix'].includes(k)))throw err(400,'Ongeldige naamplaatinstellingen');
 const placement=validateUniformLayout(Object.fromEntries(
  ['department','variant','left','top','width','height','reason'].map(k=>[k,input[k]])
 ));
 const scale=(k)=>{
  const n=input[k]===undefined?100:input[k];
  if(typeof n!=='number'||!Number.isFinite(n)||n<50||n>250)
   throw err(400,'Lettergrootte moet tussen 50% en 250% liggen');
  return Math.round(n);
 };
 const prefix=input.prefix===undefined?defaultPrefix(placement.department):input.prefix;
 if(typeof prefix!=='string'||prefix.length<2||prefix.length>30||
  !/^[A-Za-zÀ-ÿ0-9 .&/–_-]+$/.test(prefix))
  throw err(400,'Ongeldige naamplaattekst (2–30 tekens)');
 return {...placement,nameScale:scale('nameScale'),callScale:scale('callScale'),prefix:prefix.trim()};
}
export function validateUniformCoat(input){
 if(!input||Array.isArray(input)||typeof input!=='object'||
  Object.keys(input).some(k=>!['department','variant','offsetX','offsetY','zoom','canvasWidth','canvasHeight','keepAspectRatio','reason'].includes(k)))
  throw err(400,'Ongeldige uniformpositie');
 const department=String(input.department||''),variant=String(input.variant||'');
 if(!UNIFORM_VARIANTS[department]?.includes(variant))throw err(400,'Onbekende hulpdienst of uniformvariant');
 for(const key of ['offsetX','offsetY','zoom']){
  if(typeof input[key]!=='number'||!Number.isFinite(input[key]))
   throw err(400,'Ongeldige uniformpositie of vergroting');
 }
 if(Math.abs(input.offsetX)>50||Math.abs(input.offsetY)>50||
   input.zoom<50||input.zoom>200)throw err(400,'Uniformpositie of zoom buiten veilige grenzen');
 const canvasWidth=input.canvasWidth===undefined?603:input.canvasWidth;
 const canvasHeight=input.canvasHeight===undefined?469:input.canvasHeight;
 const keepAspectRatio=input.keepAspectRatio===undefined?true:input.keepAspectRatio;
 if(!Number.isInteger(canvasWidth)||!Number.isInteger(canvasHeight)||
  canvasWidth<160||canvasWidth>4096||canvasHeight<160||canvasHeight>4096||
  canvasWidth*canvasHeight>8000000)
  throw err(400,'Canvas moet tussen 160 en 4096 px liggen, maximaal 8 megapixel');
 if(typeof keepAspectRatio!=='boolean')throw err(400,'Ongeldige beeldverhoudingsinstelling');
 const reason=typeof input.reason==='string'?input.reason.trim():'';
 if(reason.length<8||reason.length>300||/[<>\x00-\x1f]/.test(reason))
  throw err(400,'Motivering van 8–300 tekens verplicht');
 return {department,variant,key:department+'_'+variant,
  offsetX:Math.round(input.offsetX*100)/100,
  offsetY:Math.round(input.offsetY*100)/100,
  zoom:Math.round(input.zoom*100)/100,canvasWidth,canvasHeight,keepAspectRatio,reason};
}
export function installUniformManagementRoutes(app,{requireUser}){
 app.get('/api/uniform-management/layouts',requireUser,async(req,res)=>{
  try{
   const db=getFirestore();
   const [snaps,nameSnap,coatSnap]=await Promise.all([
    db.collection(UNIFORM_LAYOUTS).limit(20).get(),
    db.collection(UNIFORM_NAMEPLATES).limit(20).get(),
    db.collection(UNIFORM_COATS).limit(20).get()
   ]);
   const stored=new Map(snaps.docs.map(d=>[d.id,d.data()]));
   const nameStored=new Map(nameSnap.docs.map(d=>[d.id,d.data()]));
   const coatStored=new Map(coatSnap.docs.map(d=>[d.id,d.data()]));
   const layouts=Object.entries(DEFAULTS).map(([key,defaultLayout])=>{
    const row=stored.get(key);
    const placement=row&&['left','top','width','height'].every(k=>typeof row[k]==='number')
     ?Object.fromEntries(['left','top','width','height'].map(k=>[k,row[k]])):defaultLayout;
    return {key,department:key.split('_')[0],variant:key.split('_')[1],...placement};
   });
   const nameplates=Object.entries(NAMEPLATE_DEFAULTS).map(([key,defaults])=>{
    const saved=nameStored.get(key);
    const valid=Boolean(saved)&&['left','top','width','height'].every(
     k=>typeof saved[k]==='number'&&Number.isFinite(saved[k])&&saved[k]>=0&&saved[k]<=100
    )&&saved.left+saved.width<=100&&saved.top+saved.height<=100;
    const place=valid?Object.fromEntries(
     ['left','top','width','height'].map(k=>[k,saved[k]])):defaults;
    return {key,department:key.split('_')[0],variant:key.split('_')[1],
     ...place,configured:valid,
     nameScale:valid&&typeof saved.nameScale==='number'?saved.nameScale:100,
     callScale:valid&&typeof saved.callScale==='number'?saved.callScale:100,
     prefix:valid&&typeof saved.prefix==='string'?saved.prefix:
      defaultPrefix(key.split('_')[0])};
   });
   const coats=Object.entries(COAT_DEFAULTS).map(([key,defaults])=>{
    const saved=coatStored.get(key);
    const valid=Boolean(saved)&&Number.isFinite(saved.offsetX)&&
     Number.isFinite(saved.offsetY)&&Number.isFinite(saved.zoom)&&
     Math.abs(saved.offsetX)<=50&&Math.abs(saved.offsetY)<=50&&
     saved.zoom>=50&&saved.zoom<=200;
    return {key,department:key.split('_')[0],variant:key.split('_')[1],
     ...(valid?{offsetX:saved.offsetX,offsetY:saved.offsetY,zoom:saved.zoom}:defaults),
     canvasWidth:valid&&Number.isInteger(saved.canvasWidth)&&saved.canvasWidth>=160&&saved.canvasWidth<=4096?saved.canvasWidth:603,
     canvasHeight:valid&&Number.isInteger(saved.canvasHeight)&&saved.canvasHeight>=160&&saved.canvasHeight<=4096?saved.canvasHeight:469,
     keepAspectRatio:valid&&typeof saved.keepAspectRatio==='boolean'?saved.keepAspectRatio:true,
     configured:valid};
   });
   res.set('Cache-Control','private, no-store');
   return res.json({layouts,nameplates,coats,canEdit:req.bpd?.role==='beheerder',
    editableDepartments:UNIFORM_SERVICES.filter(d=>mayEdit(req.bpd,d))});
  }catch(e){return error(res,e)}
 });
 app.put('/api/uniform-management/coat',requireUser,async(req,res)=>{
  let data;try{data=validateUniformCoat(req.body)}catch(e){return error(res,e)}
  if(!mayEdit(req.bpd,data.department))
   return res.status(403).json({error:'Geen toestemming om het uniform van deze hulpdienst te wijzigen'});
  try{
   const db=getFirestore(),ref=db.collection(UNIFORM_COATS).doc(data.key);
   await db.runTransaction(async tx=>{
    const old=await tx.get(ref),previous=old.exists?old.data():null;
    const current={offsetX:data.offsetX,offsetY:data.offsetY,zoom:data.zoom,
     canvasWidth:data.canvasWidth,canvasHeight:data.canvasHeight,keepAspectRatio:data.keepAspectRatio};
    tx.set(ref,{department:data.department,variant:data.variant,...current,
     updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid});
    tx.create(db.collection(UNIFORM_LAYOUT_AUDIT).doc(),{
     action:'uniform_coat_transform',key:data.key,
     previous:previous?{offsetX:previous.offsetX,offsetY:previous.offsetY,zoom:previous.zoom,
      canvasWidth:previous.canvasWidth||603,canvasHeight:previous.canvasHeight||469,
      keepAspectRatio:previous.keepAspectRatio??true}:null,
     current,reason:data.reason,actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
   });
   return res.json({saved:true,key:data.key,permissionsChanged:false});
  }catch(e){return error(res,e)}
 });
 app.put('/api/uniform-management/nameplate',requireUser,async(req,res)=>{
  let data;try{data=validateUniformNameplate(req.body)}catch(e){return error(res,e)}
  if(!mayEdit(req.bpd,data.department))
   return res.status(403).json({error:'Geen toestemming om naamplaten van deze hulpdienst te wijzigen'});
  try{
   const db=getFirestore(),ref=db.collection(UNIFORM_NAMEPLATES).doc(data.key);
   await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    const previous=old.exists?old.data():null;
    const next={left:data.left,top:data.top,width:data.width,height:data.height,
     nameScale:data.nameScale,callScale:data.callScale,prefix:data.prefix};
    tx.set(ref,{department:data.department,variant:data.variant,...next,
     updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid});
    tx.create(db.collection(UNIFORM_LAYOUT_AUDIT).doc(),{
     action:'uniform_nameplate_placement',key:data.key,
     previous:previous?Object.fromEntries(
      ['left','top','width','height'].map(k=>[k,previous[k]??null])):null,
     current:next,reason:data.reason,actorUid:req.bpd.uid,
     at:FieldValue.serverTimestamp()});
   });
   return res.json({saved:true,key:data.key,permissionsChanged:false});
  }catch(e){return error(res,e)}
 });
 app.put('/api/uniform-management/layout',requireUser,async(req,res)=>{
  let data;try{data=validateUniformLayout(req.body)}catch(e){return error(res,e)}
  if(!mayEdit(req.bpd,data.department))
   return res.status(403).json({error:'Geen toestemming om uniformen van deze hulpdienst te wijzigen'});
  try{
   const db=getFirestore(),ref=db.collection(UNIFORM_LAYOUTS).doc(data.key);
   await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    const previous=old.exists?old.data():null;
    tx.set(ref,{department:data.department,variant:data.variant,
     left:data.left,top:data.top,width:data.width,height:data.height,
     updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid});
    tx.create(db.collection(UNIFORM_LAYOUT_AUDIT).doc(),{
     action:'uniform_grade_placement',key:data.key,
     previous:previous?{
      left:previous.left,top:previous.top,width:previous.width,height:previous.height}:null,
     current:{left:data.left,top:data.top,width:data.width,height:data.height},
     reason:data.reason,actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
   });
   return res.json({saved:true,key:data.key,permissionsChanged:false});
  }catch(e){return error(res,e)}
 });
}
