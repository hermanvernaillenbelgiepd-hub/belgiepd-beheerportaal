import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {USER_COLLECTION} from './user-access.js';
import {COLLECTION,DEPTS,DISPLAY_DEPTS,SPECIALTIES,LEADERSHIP_LEVELS,personKey,
 validatePlacement,manualDisplay,verifiedSyncRoles,mergePlacement,canManagePlacements
} from './organogram-placement-policy.js';

const idOK=id=>/^\d{15,22}$/.test(String(id||''));
const fault=(code,msg)=>Object.assign(new Error(msg),{publicStatus:code});
const respond=(res,e)=>{
 if(e.publicStatus)return res.status(e.publicStatus).json({error:e.message});
 console.error('Organogramfuncties:',e.code||'unknown_error');
 return res.status(503).json({error:'Organogramgegevens tijdelijk niet beschikbaar'});
};
const safeName=x=>String(x||'').trim().slice(0,90);
const DEFAULT_PLACEMENT=Object.freeze({boardRole:'none',leadershipTier:'none',
 displayOrder:0,teachingRoles:[],specialties:[]});
const rawDisplay=snap=>snap?.exists?{
 boardRole:snap.get('boardRole')||'none',
 leadershipTier:snap.get('leadershipTier')||'none',
 displayOrder:snap.get('displayOrder')||0,
 teachingRoles:snap.get('teachingRoles')||[],
 specialties:snap.get('specialties')||[]
}:{...DEFAULT_PLACEMENT};
const hasUndo=data=>Boolean(data&&data.status==='active'&&
 data.undo&&typeof data.undo==='object');
const validRow=p=>DEPTS.includes(p?.dept)&&idOK(p.personId)&&safeName(p.name);
function manager(req,res,next){
 if(!canManagePlacements(req.bpd))return res.status(403).json({error:'Alleen technisch beheer mag weergavefuncties aanpassen'});
 next();
}
const chunks=(a,n)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,i*n+n));
let syncCache={expires:0,entries:new Map(),failed:false};
async function identityMap(db,ids,guild){
 const now=Date.now(),unique=[...new Set(ids)].filter(idOK).slice(0,650);
 if(syncCache.expires>now&&unique.every(id=>syncCache.entries.has(id)))
  return syncCache;
 const out=new Map();let failed=false;
 for(const subset of chunks(unique,100)){
  try{
   const docs=await db.getAll(...subset.map(id=>db.collection('bpd_discord_auth').doc(id)));
   docs.forEach((doc,i)=>out.set(subset[i],doc.exists?doc.data():null));
  }catch(_err){failed=true;subset.forEach(id=>out.set(id,null))}
 }
 syncCache={entries:out,failed,expires:now+90000};
 return syncCache;
}
const manualMap=docs=>new Map(docs.map(d=>[d.id,d.data()]));
const safePublic=p=>({
 dept:p.dept,name:p.name,call:p.call,rank:p.rank,specialties:p.specialties,
 teachingRoles:p.teachingRoles,boardRole:p.boardRole,leadershipTier:p.leadershipTier,displayOrder:p.displayOrder,source:p.source
});
export function installOrganogramPlacementRoutes(app,{requireUser,getSnapshot}){
 const store=()=>getFirestore();
 // All returned attributes are display-only. Public output NEVER includes
 // Discord identifiers, access grants, source documents or audit history.
 app.get('/api/organogram/hierarchie',requireUser,async(_req,res)=>{
  try{
   const db=store(),snapshot=await getSnapshot(),roster=snapshot.data.filter(validRow).slice(0,1200);
   const manualSnap=await db.collection(COLLECTION).limit(1500).get();
   if(manualSnap.size>=1500)return res.status(503).json({error:'Organogramregisterlimiet bereikt'});
   const manual=manualMap(manualSnap.docs);
   const boardOnly=manualSnap.docs.filter(d=>d.get('dept')==='bestuur'&&
    d.get('status')==='active'&&['bestuur','bestuur-ai'].includes(d.get('boardRole')))
    .map(d=>d.get('personId')).filter(idOK).slice(0,100);
   const byId=new Map();
   for(const ids of chunks(boardOnly,100)){
    const accounts=await db.getAll(...ids.map(id=>db.collection(USER_COLLECTION).doc(id)));
    for(const account of accounts)if(account.exists&&account.get('status')==='approved')
     byId.set(account.id,account.data());
   }
   const peopleIds=roster.map(p=>p.personId);
   const roles=await identityMap(db,peopleIds,process.env.DISCORD_GUILD_ID);
   const records=[],boardById=new Map();
   for(const p of roster){
    const key=personKey(p.dept,p.personId);
    const override=manualDisplay(manual.get(key),p.dept);
    const synced=verifiedSyncRoles(roles.entries.get(p.personId),p.dept,process.env.DISCORD_GUILD_ID);
    const merged=mergePlacement(p,override,synced);
    records.push(safePublic(merged));
    if(merged.boardRole!=='none'){
     const old=boardById.get(p.personId);
     if(!old||merged.boardRole==='bestuur-ai')
      boardById.set(p.personId,{name:merged.name,call:merged.call,role:merged.boardRole,source:merged.source});
    }
   }
   // Board-only accounts may have no operational personnel row. Only explicitly
   // approved portal accounts and ACTIVE manually assigned display role qualify.
   for(const [id,user] of byId){
    const m=manualDisplay(manual.get(personKey('bestuur',id)),'bestuur');
    if(m?.boardRole&&m.boardRole!=='none'){
     const old=boardById.get(id);
     if(!old||m.boardRole==='bestuur-ai')
      boardById.set(id,{name:safeName(user.username)||'Bestuurslid',
        call:'',role:m.boardRole,source:'handmatig'});
    }
   }
   return res.json({readOnly:true,stale:snapshot.stale===true,
    syncAvailable:!roles.failed,records,board:[...boardById.values()].slice(0,50)});
  }catch(e){return respond(res,e)}
 });
 // Only technical management receives the IDs necessary for a precise manual
 // selection. An identical name can never cause cross-person edits.
 app.get('/api/organogram/placements/admin',requireUser,manager,async(_req,res)=>{
  try{
   const db=store(),[snapshot,manualSnap,usersSnap]=await Promise.all([
    getSnapshot(),db.collection(COLLECTION).limit(1500).get(),
    db.collection(USER_COLLECTION).where('status','==','approved').limit(500).get()
   ]);
   if(manualSnap.size>=1500)return res.status(503).json({error:'Registratielimiet bereikt'});
   const manual=manualMap(manualSnap.docs);
   const accounts=usersSnap.docs.filter(d=>idOK(d.id)).map(d=>({dept:'bestuur',personId:d.id,
    name:safeName(d.get('username'))||'Goedgekeurd account',call:'',rank:'',
    placement:manualDisplay(manual.get(personKey('bestuur',d.id)),'bestuur'),
    undoAvailable:hasUndo(manual.get(personKey('bestuur',d.id)))}));
   const people=snapshot.data.filter(validRow).slice(0,1200).map(p=>({
    dept:p.dept,personId:p.personId,name:safeName(p.name),
    call:String(p.call||'').slice(0,24),rank:String(p.rank||'').slice(0,95),
    placement:manualDisplay(manual.get(personKey(p.dept,p.personId)),p.dept),
    undoAvailable:hasUndo(manual.get(personKey(p.dept,p.personId)))
   }));
   return res.json({readOnly:false,displayOnly:true,people:[...accounts,...people],
    specialties:SPECIALTIES,leadershipLevels:LEADERSHIP_LEVELS,stale:snapshot.stale===true});
  }catch(e){return respond(res,e)}
 });
 app.put('/api/organogram/placements/:dept/:personId',requireUser,manager,async(req,res)=>{
  const {dept,personId}=req.params;
  const key=personKey(dept,personId);
  if(!key)return res.status(400).json({error:'Ongeldige dienst of identiteit'});
  let values;try{values=validatePlacement(req.body,dept)}catch(e){
   return res.status(400).json({error:e.message});
  }
  try{
   const db=store(),snapshot=await getSnapshot();
   const personnel=snapshot.data.some(p=>validRow(p)&&p.dept===dept&&p.personId===personId);
   if(dept!=='bestuur'&&!personnel)return res.status(409).json({error:'Geen gekoppeld personeelslid in deze dienst'});
   if(dept==='bestuur'){
    const account=await db.collection(USER_COLLECTION).doc(personId).get();
    if(!account.exists||account.get('status')!=='approved')
     return res.status(409).json({error:'Selecteer een goedgekeurd portaalaccount voor Bestuur'});
   }
   const ref=db.collection(COLLECTION).doc(key);
   await db.runTransaction(async tx=>{
    const before=await tx.get(ref);
    const saved={dept,personId,status:'active',boardRole:values.boardRole,
     leadershipTier:values.leadershipTier,displayOrder:values.displayOrder,
     undo:rawDisplay(before),
     teachingRoles:values.teachingRoles,specialties:values.specialties,
     updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid,displayOnly:true};
    tx.set(ref,saved);
    tx.create(ref.collection('audit').doc(),{
     action:'manual_display_assignment',previous:before.exists?{
      boardRole:before.get('boardRole')||'none',
      leadershipTier:before.get('leadershipTier')||'none',
      displayOrder:before.get('displayOrder')||0,
      teachingRoles:before.get('teachingRoles')||[],
      specialties:before.get('specialties')||[]
     }:null,next:{boardRole:values.boardRole,teachingRoles:values.teachingRoles,
      specialties:values.specialties,leadershipTier:values.leadershipTier,
      displayOrder:values.displayOrder},reason:values.reason,
     actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
   });
   syncCache.expires=0; // New manual override should take effect immediately.
   return res.json({saved:true,displayOnly:true,accessRightsChanged:false});
  }catch(e){return respond(res,e)}
 });
 // One-click revert for the most recent manual change on THIS PERSON.
 // Previous state is stored together with the placement, so a Git rollback
 // does not depend on overwriting personnel or Discord roles.
 app.post('/api/organogram/placements/:dept/:personId/undo',requireUser,manager,async(req,res)=>{
  const {dept,personId}=req.params;
  const key=personKey(dept,personId);
  if(!key)return res.status(400).json({error:'Ongeldige organogramidentiteit'});
  const reason=String(req.body?.reason||'').trim();
  if(reason.length<8||reason.length>300)
   return res.status(400).json({error:'Geef een motivering van 8 tot 300 tekens'});
  try{
   const db=store(),ref=db.collection(COLLECTION).doc(key);
   await db.runTransaction(async tx=>{
    const existing=await tx.get(ref);
    if(!hasUndo(existing.data()))throw fault(409,'Geen vorige handmatige instelling beschikbaar');
    const current=rawDisplay(existing);
    const previous=existing.get('undo');
    if(!previous||!Array.isArray(previous.teachingRoles)||!Array.isArray(previous.specialties))
     throw fault(409,'Vorige instelling kan niet betrouwbaar hersteld worden');
    const payload={...previous,reason};
    const restored=validatePlacement(payload,dept);
    tx.set(ref,{
     dept,personId,status:'active',boardRole:restored.boardRole,
     leadershipTier:restored.leadershipTier,displayOrder:restored.displayOrder,
     teachingRoles:restored.teachingRoles,specialties:restored.specialties,
     undo:current,updatedAt:FieldValue.serverTimestamp(),
     updatedBy:req.bpd.uid,displayOnly:true
    });
    tx.create(ref.collection('audit').doc(),{
     action:'manual_display_undo',previous:current,
     next:{boardRole:restored.boardRole,leadershipTier:restored.leadershipTier,
      displayOrder:restored.displayOrder,teachingRoles:restored.teachingRoles,
      specialties:restored.specialties},reason,actorUid:req.bpd.uid,
     at:FieldValue.serverTimestamp()
    });
   });
   return res.json({restored:true,displayOnly:true,accessRightsChanged:false});
  }catch(e){return respond(res,e)}
 });

}
