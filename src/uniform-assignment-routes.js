// Uniform assignments are visual selectors. No personnel rank/roles are ever changed.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {isUserManager} from './user-access.js';
import {roleForDepartment} from './leave-policy.js';
import {ROLE_ARTWORK_META} from './role-artwork-routes.js';

export const UNIFORM_ASSIGNMENTS='bpd_uniform_visual_assignments';
export const UNIFORM_ASSIGNMENT_AUDIT='bpd_uniform_assignment_audit';
const DEPTS=new Set(['politie','brandweer','ambulance','depannage','burger']);
const SCOPES=new Set(['service','cadre','rank','person']);
const CODE=/^[a-z0-9][a-z0-9_]{0,39}$/;
const UID=/^\d{15,22}$/;
const fail=(status,message)=>Object.assign(new Error(message),{statusCode:status});
const mayEdit=(actor,department)=>actor?.role==='beheerder'||Boolean(
 isUserManager(actor)&&actor.departments?.includes(department)===true&&
 ['officierenkader','korpsleiding'].includes(roleForDepartment(actor,department))
);
const error=(res,e)=>{
 if(e?.statusCode)return res.status(e.statusCode).json({error:e.message});
 console.error('Uniformtoewijzing:',e?.code||'storage_error');
 return res.status(503).json({error:'Uniformtoewijzingen tijdelijk niet beschikbaar'});
};
export function selectorFor(scope,raw){
 const value=String(raw||'').trim().toLowerCase();
 if(scope==='service')return value==='default'?'default':null;
 if(scope==='person')return UID.test(value)?value:null;
 return CODE.test(value)?value:null;
}
export function validateUniformAssignment(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).some(k=>!['department','scope','selector','uniformCode','badgeStyle','reason'].includes(k)))
  throw fail(400,'Ongeldige uniformtoewijzing');
 const department=String(body.department||''),scope=String(body.scope||'');
 const selector=selectorFor(scope,body.selector);
 if(!DEPTS.has(department)||!SCOPES.has(scope)||!selector)
  throw fail(400,'Ongeldige hulpdienst, doelgroep of personeels-ID');
 const uniformCode=String(body.uniformCode||'').trim().toLowerCase();
 const badgeStyle=String(body.badgeStyle||'').trim().toLowerCase();
 if(uniformCode&&!CODE.test(uniformCode))throw fail(400,'Ongeldige uniformcode');
 if(!['','lokaal','federaal'].includes(badgeStyle))throw fail(400,'Ongeldige badgevariant');
 if(!uniformCode&&!badgeStyle)throw fail(400,'Kies een uniform of badgevariant; gebruik verwijderen om te herstellen');
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(reason.length<8||reason.length>300||/[<>\x00-\x1f]/.test(reason))
  throw fail(400,'Motivering van 8–300 tekens verplicht');
 return {key:department+'_'+scope+'_'+selector,department,scope,selector,uniformCode,badgeStyle,reason};
}
export function resolveUniformAssignment(person,assignments){
 const dept=String(person?.dept||'');
 if(!DEPTS.has(dept))return {uniformCode:'',badgeStyle:''};
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);
 const personId=UID.test(String(person.personId||''))?String(person.personId):null;
 const find=(scope,selector)=>assignments.find(r=>r&&r.department===dept&&
  r.scope===scope&&r.selector===selector);
 const order=[
  ...(personId?[find('person',personId)]:[]),
  find('rank',norm(person.rank)),find('cadre',norm(person.tier)),
  find('service','default')
 ];
 let uniformCode='',badgeStyle='';
 for(const r of order){
  if(!r)continue;
  if(!uniformCode&&CODE.test(r.uniformCode||''))uniformCode=r.uniformCode;
  if(!badgeStyle&&['lokaal','federaal'].includes(r.badgeStyle))badgeStyle=r.badgeStyle;
 }
 return {uniformCode,badgeStyle};
}
export function installUniformAssignmentRoutes(app,{requireUser}){
 app.get('/api/uniform-assignments',requireUser,async(req,res)=>{
  try{
   const docs=await getFirestore().collection(UNIFORM_ASSIGNMENTS).limit(400).get();
   res.set('Cache-Control','private, no-store');
   res.json({assignments:docs.docs.map(d=>{
    const r=d.data();
    return {key:d.id,department:r.department,scope:r.scope,selector:r.selector,
     uniformCode:r.uniformCode||'',badgeStyle:r.badgeStyle||''};
   }),editableDepartments:[...DEPTS].filter(d=>mayEdit(req.bpd,d))});
  }catch(e){error(res,e)}
 });
 app.put('/api/uniform-assignments',requireUser,async(req,res)=>{
  let data;try{data=validateUniformAssignment(req.body)}catch(e){return error(res,e)}
  if(!mayEdit(req.bpd,data.department))
   return res.status(403).json({error:'Geen rechten voor deze hulpdienst'});
  try{
   const db=getFirestore(),ref=db.collection(UNIFORM_ASSIGNMENTS).doc(data.key);
   if(data.uniformCode){
    const art=await db.collection(ROLE_ARTWORK_META)
     .doc('uniform_'+data.department+'_'+data.uniformCode).get();
    if(!art.exists||art.get('active')!==true||art.get('kind')!=='uniform'||
     art.get('department')!==data.department)
     return res.status(400).json({error:'Upload eerst dit uniform bij de juiste hulpdienst'});
   }
   await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    const current={department:data.department,scope:data.scope,selector:data.selector,
     uniformCode:data.uniformCode,badgeStyle:data.badgeStyle};
    tx.set(ref,{...current,actorUid:req.bpd.uid,updatedAt:FieldValue.serverTimestamp()});
    tx.create(db.collection(UNIFORM_ASSIGNMENT_AUDIT).doc(),{
     action:'assign',key:data.key,current,previous:old.exists?old.data():null,
     reason:data.reason,actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
   });
   res.json({saved:true,key:data.key,permissionsChanged:false});
  }catch(e){error(res,e)}
 });
 app.delete('/api/uniform-assignments',requireUser,async(req,res)=>{
  const body=req.body||{},department=String(body.department||''),
   scope=String(body.scope||''),selector=selectorFor(scope,body.selector);
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(!DEPTS.has(department)||!SCOPES.has(scope)||!selector||reason.length<8||reason.length>300)
   return res.status(400).json({error:'Kies een doelgroep en motiveer de verwijdering'});
  if(!mayEdit(req.bpd,department))
   return res.status(403).json({error:'Geen rechten voor deze hulpdienst'});
  try{
   const db=getFirestore(),key=department+'_'+scope+'_'+selector,
    ref=db.collection(UNIFORM_ASSIGNMENTS).doc(key);
   await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    if(!old.exists)throw fail(404,'Geen toewijzing gevonden');
    tx.delete(ref);
    tx.create(db.collection(UNIFORM_ASSIGNMENT_AUDIT).doc(),{
     action:'remove',key,previous:old.data(),reason,
     actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
   });
   res.json({saved:true,permissionsChanged:false});
  }catch(e){error(res,e)}
 });
}
