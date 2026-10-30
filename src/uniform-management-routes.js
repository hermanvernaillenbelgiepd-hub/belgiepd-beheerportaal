// Uniform placement is purely visual; it cannot alter rank, personnel or Discord access.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {isUserManager} from './user-access.js';
import {roleForDepartment} from './leave-policy.js';

export const UNIFORM_LAYOUTS='bpd_uniform_visual_layouts';
export const UNIFORM_LAYOUT_AUDIT='bpd_uniform_visual_layout_audit';
export const UNIFORM_NAMEPLATES='bpd_uniform_nameplate_layouts';
export const UNIFORM_SERVICES=Object.freeze(['politie','brandweer','ambulance','depannage','burger']);
export const UNIFORM_VARIANTS=Object.freeze({
 politie:['silver','gold'],
 brandweer:['default'],ambulance:['default'],depannage:['default'],burger:['default']
});
const DEFAULTS=Object.freeze({
 politie_silver:{left:62.3,top:56.75,width:26.6,height:12.25},
 politie_gold:{left:56.2,top:58.9,width:19.5,height:12.1},
 brandweer_default:{left:62,top:55,width:24,height:12},
 ambulance_default:{left:62,top:55,width:24,height:12},
 depannage_default:{left:62,top:55,width:24,height:12},
 burger_default:{left:62,top:55,width:24,height:12}
});
const NAMEPLATE_DEFAULTS=Object.freeze({
 politie_silver:{left:10.25,top:56.2,width:27.75,height:13.15},
 politie_gold:{left:21.2,top:58.9,width:20.1,height:12.1},
 brandweer_default:{left:11,top:55,width:27,height:12},
 ambulance_default:{left:11,top:55,width:27,height:12},
 depannage_default:{left:11,top:55,width:27,height:12},
 burger_default:{left:11,top:55,width:27,height:12}
});
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
 const placement=validateUniformLayout(input);
 return placement;
}
export function installUniformManagementRoutes(app,{requireUser}){
 app.get('/api/uniform-management/layouts',requireUser,async(req,res)=>{
  try{
   const db=getFirestore();
   const [snaps,nameSnap]=await Promise.all([
    db.collection(UNIFORM_LAYOUTS).limit(20).get(),
    db.collection(UNIFORM_NAMEPLATES).limit(20).get()
   ]);
   const stored=new Map(snaps.docs.map(d=>[d.id,d.data()]));
   const nameStored=new Map(nameSnap.docs.map(d=>[d.id,d.data()]));
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
     ...place,configured:valid};
   });
   res.set('Cache-Control','private, no-store');
   return res.json({layouts,nameplates,canEdit:req.bpd?.role==='beheerder',
    editableDepartments:UNIFORM_SERVICES.filter(d=>mayEdit(req.bpd,d))});
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
    const next={left:data.left,top:data.top,width:data.width,height:data.height};
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
