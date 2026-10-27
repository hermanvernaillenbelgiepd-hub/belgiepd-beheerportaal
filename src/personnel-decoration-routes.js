import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {PERSONNEL_ACTIVITY_COLLECTION} from './personnel-activity.js';
import {PERSONNEL_DECORATIONS_COLLECTION,DECORATION_CATALOG,CATALOG_BY_ID,
  brusselsToday,validateDecoration,canManagePoliceDecoration,awardKey,manageDecorations}
  from './personnel-decoration-policy.js';

const text=(value,max=120)=>typeof value==='string'?value.trim().slice(0,max):'';
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
     return res.status(403).json({error:'Alleen geverifieerd officierenkader of korpsleiding mag voor lagere politiegraden onderscheidingen beheren'});
   req.decorationSubject=subject;
   return next();
  }catch(error){return failure(res,error)}
 }
 const readDoc=subject=>getFirestore().collection(PERSONNEL_DECORATIONS_COLLECTION)
   .doc(awardKey(subject.dept,subject.personId));
 app.get('/api/personnel-awards/manage',requireUser,secureSubject,async(req,res)=>{
  try{
   const snap=await readDoc(req.decorationSubject).get();
   res.set('Cache-Control','private, no-store');
   return res.json({canManage:true,catalog:DECORATION_CATALOG,
    entries:manageDecorations(snap.get('entries')||[])});
  }catch(error){return failure(res,error)}
 });
 app.post('/api/personnel-awards/grant',requireUser,secureSubject,async(req,res)=>{
  let input;
  try{input=validateDecoration({
   catalogId:req.body?.catalogId,startDate:req.body?.startDate,
   endDate:req.body?.endDate,public:req.body?.public,reason:req.body?.reason
  })}catch(error){return res.status(400).json({error:error.message})}
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
      name:subject.name,label:CATALOG_BY_ID.get(input.catalogId).label,
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
   const store=getFirestore(),ref=readDoc(subject);
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
      name:subject.name,label:CATALOG_BY_ID.get(selected.catalogId)?.label||'Onderscheiding',
      before:'Toegekend',after:'Ingetrokken',reason,
      awardId:id,actorDiscordId:req.bpd.discordId,at:FieldValue.serverTimestamp()
    });
   });
   return res.json({saved:true});
  }catch(error){if(error.status===404)return res.status(404).json({error:error.message});
   return failure(res,error)}
 });
}
