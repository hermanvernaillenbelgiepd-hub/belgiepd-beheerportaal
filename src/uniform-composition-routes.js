// Uniformatelier: one visual composition per effective grade/function.
// Templates control presentation only; medals are still granted per person.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {DEPANNAGE_FUNCTIONS,AMBULANCE_FUNCTIONS} from '../public/uniform-profile-policy.js';
import {canEditLibrary} from './uniform-library-routes.js';
import {ROLE_ARTWORK_META} from './role-artwork-routes.js';
import {DECORATION_CATALOG,PERSONNEL_DECORATION_CATALOG_COLLECTION,customCatalogItem,decorationCatalogExtras} from './personnel-decoration-policy.js';

export const COMPOSITIONS='bpd_uniform_compositions';
export const COMPOSITION_AUDIT='bpd_uniform_composition_audit';
const DEPTS=['politie','brandweer','ambulance','depannage','burger'];
const GRADES=new Set(['100','200','300','400','500','600','700','800',
 '900','910','920','930']);
const FUNCTIONS=new Set(AMBULANCE_FUNCTIONS.map(([code])=>code));
const BURGER_GRADES=new Set(['burgerraad','burger','burger_in_opleiding']);
const TOWING_FUNCTIONS=new Set(DEPANNAGE_FUNCTIONS.map(([code])=>code));
const CODE=/^[a-z0-9][a-z0-9_]{0,39}$/;
const LAYERS=['name','rank','ribbons','medals','helmet','profession','logo'];
const assetTypes=['uniform','rank','helmet','profession','logo'];
const bad=(status,message)=>Object.assign(new Error(message),{publicStatus:status});
const defaults=Object.freeze({
 name:{left:18,top:56,width:22,height:10,visible:true},
 rank:{left:57,top:56,width:23,height:12,visible:true},
 ribbons:{left:57,top:51,width:21,height:5,visible:true},
 medals:{left:57,top:70,width:24,height:19,visible:true},
 helmet:{left:19,top:4,width:62,height:32,visible:true},
 profession:{left:55,top:42,width:24,height:12,visible:true},
 logo:{left:72,top:26,width:14,height:14,visible:true}
});
export function validateComposition(body){
 if(!body||Array.isArray(body)||typeof body!=='object'||
  Object.keys(body).some(k=>!['department','scope','selector','assets','layers','reason'].includes(k)))
  throw bad(400,'Ongeldige uniformopmaak');
 const department=String(body.department||''),scope=String(body.scope||'');
 const selector=String(body.selector||'').toLowerCase();
 if(!DEPTS.includes(department)||!CODE.test(selector)||
  !(department==='politie'&&scope==='call'&&GRADES.has(selector)||
    department==='ambulance'&&scope==='function'&&FUNCTIONS.has(selector)||
    department==='depannage'&&scope==='function'&&TOWING_FUNCTIONS.has(selector)||
    ['brandweer','depannage'].includes(department)&&scope==='rank'||
    department==='burger'&&scope==='rank'&&BURGER_GRADES.has(selector)))
  throw bad(400,'Kies een geldige hulpdienst en graad of hoedanigheid');
 const reason=String(body.reason||'').trim();
 if(reason.length<8||reason.length>300||/[<>\x00-\x1f]/.test(reason))
  throw bad(400,'Geef een geldige motivering');
 if(!body.assets||Array.isArray(body.assets)||typeof body.assets!=='object'||
  Object.keys(body.assets).some(k=>!assetTypes.includes(k)))
  throw bad(400,'Ongeldige afbeeldingskeuze');
 const assets={};
 for(const kind of assetTypes){
  const value=body.assets[kind]===undefined?'':body.assets[kind];
  if(typeof value!=='string'||(value&&!CODE.test(value)))
   throw bad(400,'Ongeldige code voor '+kind);
  assets[kind]=value;
 }
 if(!assets.uniform)throw bad(400,'Kies een basisuniform voor deze graad');
 if(['silver','gold','default'].includes(assets.uniform))
  throw bad(400,'Het oude standaarduniform kan niet meer worden geselecteerd');
 if(!body.layers||Array.isArray(body.layers)||typeof body.layers!=='object'||
  Object.keys(body.layers).some(k=>!LAYERS.includes(k)))
  throw bad(400,'Ongeldige uniformeigenschappen');
 const layers={};
 for(const kind of LAYERS){
  const raw=body.layers[kind]||defaults[kind];
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
   Object.keys(raw).some(k=>!['left','top','width','height','visible'].includes(k)))
   throw bad(400,'Ongeldige plaatsing voor '+kind);
  const val={};
  for(const axis of ['left','top','width','height']){
   const n=raw[axis];
   if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>100)
    throw bad(400,'Positie buiten het uniform');
   val[axis]=Math.round(n*100)/100;
  }
  if(val.width<2||val.height<2||val.left+val.width>100.01||
    val.top+val.height>100.01||typeof raw.visible!=='boolean')
   throw bad(400,'Uniformonderdeel moet volledig binnen het vak passen');
  layers[kind]={...val,visible:raw.visible};
 }
 return {key:department+'__'+scope+'__'+selector,
  department,scope,selector,assets,layers,reason};
}
function error(res,e){
 if(e?.publicStatus)return res.status(e.publicStatus).json({error:e.message});
 console.error('Uniformatelier:',e?.code||'storage_error');
 return res.status(503).json({error:'Uniformatelier tijdelijk niet beschikbaar'});
}
export function installUniformCompositionRoutes(app,{requireUser}){
 app.get('/api/uniform-compositions/award-catalog',requireUser,async(req,res)=>{
  if(!canEditLibrary(req.bpd,'politie'))return res.json({catalog:[]});
  try{
   const snap=await getFirestore().collection(PERSONNEL_DECORATION_CATALOG_COLLECTION).limit(120).get();
   const custom=snap.docs.map(d=>customCatalogItem(d)).filter(Boolean);
   const overrides=decorationCatalogExtras(snap.docs);
   res.set('Cache-Control','private, no-store');
   return res.json({catalog:[...DECORATION_CATALOG.map(x=>overrides.get(x.id)||x),...custom]
    .filter(x=>['medal','ribbon','badge'].includes(x.kind))
    .map(x=>({id:x.id,label:x.label,kind:x.kind,imageUrl:x.imageUrl||null}))});
  }catch(e){return error(res,e)}
 });
 app.get('/api/uniform-compositions',requireUser,async(_req,res)=>{
  try{
   const snap=await getFirestore().collection(COMPOSITIONS).limit(650).get();
   res.set('Cache-Control','private, no-store');
   return res.json({compositions:snap.docs.map(d=>{
    const x=d.data();
    return {department:x.department,scope:x.scope,selector:x.selector,
     assets:x.assets,layers:x.layers};
   })});
  }catch(e){return error(res,e)}
 });
 app.put('/api/uniform-compositions',requireUser,async(req,res)=>{
  let input;try{input=validateComposition(req.body)}catch(e){return error(res,e)}
  if(!canEditLibrary(req.bpd,input.department))
   return res.status(403).json({error:'Geen uniformbeheerrechten voor deze dienst'});
  try{
   const db=getFirestore(),ref=db.collection(COMPOSITIONS).doc(input.key);
   const imageRefs=Object.entries(input.assets).filter(([,code])=>code)
    .map(([kind,code])=>({kind,doc:db.collection(ROLE_ARTWORK_META)
     .doc(kind+'_'+input.department+'_'+code)}));
   await db.runTransaction(async tx=>{
    const [old,...imageSnaps]=await Promise.all([
     tx.get(ref),...imageRefs.map(({doc})=>tx.get(doc))]);
    for(let i=0;i<imageRefs.length;i++){
     const record=imageSnaps[i],{kind}=imageRefs[i];
     if(!record.exists||record.get('active')!==true||
      record.get('department')!==input.department||record.get('kind')!==kind)
      throw bad(400,'Afbeelding bestaat niet of hoort niet bij deze hulpdienst: '+kind);
    }
    const {key,reason,...safe}=input;
    tx.set(ref,{...safe,updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid});
    tx.create(db.collection(COMPOSITION_AUDIT).doc(),{
     key,action:old.exists?'update':'create',before:old.exists?old.data():null,
     after:safe,reason,actorUid:req.bpd.uid,at:FieldValue.serverTimestamp(),
     permissionsChanged:false});
   });
   return res.json({saved:true,permissionsChanged:false});
  }catch(e){return error(res,e)}
 });
}
