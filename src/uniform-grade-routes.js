// Visual mappings: which rank/helmet/profession artwork belongs on which coat.
// These are not personnel ranks or entitlements. The existing library authorization applies.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {canEditLibrary} from './uniform-library-routes.js';
import {ROLE_ARTWORK_META} from './role-artwork-routes.js';

export const UNIFORM_GRADE_CHOICES='bpd_uniform_grade_choices';
export const UNIFORM_GRADE_CHOICE_AUDIT='bpd_uniform_grade_choice_audit';
const CODE=/^[a-z0-9][a-z0-9_]{0,39}$/;
const POLICE=new Set(['100','200','300','400','500','600','700','800','900','910','920','930']);
const MEDICAL=new Set(['ambulancier','vpk','arts','dirmed']);
const KINDS=['rank','helmet','profession'];
const DEPTS=['politie','brandweer','ambulance','depannage','burger'];
const problem=(status,message)=>Object.assign(new Error(message),{status});
function validChoice(body,remove=false){
 if(!body||Array.isArray(body)||typeof body!=='object'||
  Object.keys(body).some(k=>!['department','uniformCode','kind','scope','selector','assetCode','reason'].includes(k)))
  throw problem(400,'Ongeldige uniformkeuze');
 const department=String(body.department||'');
 const uniformCode=String(body.uniformCode||'').trim().toLowerCase();
 const kind=String(body.kind||'');
 const scope=String(body.scope||'');
 const selector=String(body.selector||'').trim().toLowerCase();
 const assetCode=String(body.assetCode||'').trim().toLowerCase();
 const reason=String(body.reason||'').trim();
 if(!DEPTS.includes(department)||!CODE.test(uniformCode)||
  !KINDS.includes(kind)||!CODE.test(selector)||
  !(department==='politie'&&kind==='rank'&&scope==='call'&&POLICE.has(selector)||
   department==='ambulance'&&kind==='profession'&&scope==='function'&&MEDICAL.has(selector)||
   department==='brandweer'&&['rank','helmet'].includes(kind)&&scope==='rank'||
   ['depannage','burger'].includes(department)&&kind==='rank'&&scope==='rank')||
  (!remove&&!CODE.test(assetCode)))
  throw problem(400,'Kies een geldige dienst, uniform, graad en afbeelding');
 if(reason.length<8||reason.length>300||/[<>\x00-\x1f]/.test(reason))
  throw problem(400,'Motivering van 8 tot 300 tekens verplicht');
 const key=[department,uniformCode,kind,scope,selector].join('__');
 return {key,department,uniformCode,kind,scope,selector,assetCode,reason};
}
export const validateUniformGradeChoice=validChoice;
const fail=(res,error)=>{
 if(error?.status)return res.status(error.status).json({error:error.message});
 console.error('Uniform-gradenkeuze:',error?.code||'storage_error');
 return res.status(503).json({error:'Uniformkeuzes tijdelijk niet beschikbaar'});
};
export function installUniformGradeRoutes(app,{requireUser}){
 app.get('/api/uniform-grade-choices',requireUser,async(req,res)=>{
  try{
   const snap=await getFirestore().collection(UNIFORM_GRADE_CHOICES).limit(700).get();
   res.set('Cache-Control','private, no-store');
   return res.json({choices:snap.docs.map(d=>{
    const x=d.data();return {department:x.department,uniformCode:x.uniformCode,
     kind:x.kind,scope:x.scope,selector:x.selector,assetCode:x.assetCode};
   })});
  }catch(e){return fail(res,e)}
 });
 app.put('/api/uniform-grade-choices',requireUser,async(req,res)=>{
  let choice;try{choice=validChoice(req.body)}catch(e){return fail(res,e)}
  if(!canEditLibrary(req.bpd,choice.department))
   return res.status(403).json({error:'Geen rechten om uniformen van deze dienst te bewerken'});
  try{
   const db=getFirestore();
   const coat=db.collection(ROLE_ARTWORK_META).doc('uniform_'+choice.department+'_'+choice.uniformCode);
   const insignia=db.collection(ROLE_ARTWORK_META).doc(choice.kind+'_'+choice.department+'_'+choice.assetCode);
   const [a,b]=await Promise.all([coat.get(),insignia.get()]);
   if(!a.exists||a.get('active')!==true||a.get('kind')!=='uniform'||a.get('department')!==choice.department)
    return res.status(400).json({error:'Kies eerst een geüpload uniform van dezelfde hulpdienst'});
   if(!b.exists||b.get('active')!==true||b.get('kind')!==choice.kind||b.get('department')!==choice.department)
    return res.status(400).json({error:'Kies een geldige gradenplaat uit de afbeeldingenbibliotheek'});
   const ref=db.collection(UNIFORM_GRADE_CHOICES).doc(choice.key);
   const {key,reason,...visible}=choice;
   await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    tx.set(ref,{...visible,updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid});
    tx.create(db.collection(UNIFORM_GRADE_CHOICE_AUDIT).doc(),{
     key,action:'select',previous:old.exists?old.data():null,selected:visible,
     reason,actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
   });
   return res.json({saved:true,permissionsChanged:false});
  }catch(e){return fail(res,e)}
 });
 app.delete('/api/uniform-grade-choices',requireUser,async(req,res)=>{
  let choice;try{choice=validChoice(req.body,true)}catch(e){return fail(res,e)}
  if(!canEditLibrary(req.bpd,choice.department))
   return res.status(403).json({error:'Geen rechten om deze keuze te wissen'});
  try{
   const db=getFirestore(),ref=db.collection(UNIFORM_GRADE_CHOICES).doc(choice.key);
   await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    if(!old.exists)throw problem(404,'Geen afzonderlijke koppeling aanwezig');
    tx.delete(ref);
    tx.create(db.collection(UNIFORM_GRADE_CHOICE_AUDIT).doc(),{
     key:choice.key,action:'restore_default',previous:old.data(),
     reason:choice.reason,actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
   });
   return res.json({saved:true,permissionsChanged:false});
  }catch(e){return fail(res,e)}
 });
}
