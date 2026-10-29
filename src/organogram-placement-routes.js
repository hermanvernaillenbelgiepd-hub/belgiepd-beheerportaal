import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {USER_COLLECTION} from './user-access.js';
import {MID_ORDER_COLLECTION,callMiddleSeries,validMidOrder}
 from './organogram-mid-order-policy.js';
import {COLLECTION,DEPTS,DISPLAY_DEPTS,SPECIALTIES,LEADERSHIP_LEVELS,personKey,
 validatePlacement,manualDisplay,verifiedSyncRoles,mergePlacement,canManagePlacements
} from './organogram-placement-policy.js';
import {organogramReekshoofdTitle,policeOrganogramDossierUrl} from './organogram-profile-display.js';
import {K9_ROLE_COLLECTION,K9_ROLE_IDS,canEditK9Display,verifiedK9DisplayRole,
 validManualK9Role,effectiveK9DisplayRole} from './k9-display-role.js';
import {refreshK9DisplayRoles,knownK9Candidate} from './k9-live-discord-sync.js';

const idOK=id=>/^\d{15,22}$/.test(String(id||''));
const fault=(code,msg)=>Object.assign(new Error(msg),{publicStatus:code});
const respond=(res,e)=>{
 if(e.publicStatus)return res.status(e.publicStatus).json({error:e.message});
 console.error('Organogramfuncties:',e.code||'unknown_error');
 return res.status(503).json({error:'Organogramgegevens tijdelijk niet beschikbaar'});
};
const safeName=x=>String(x||'').trim().slice(0,90);
const DEFAULT_PLACEMENT=Object.freeze({boardRole:'none',leadershipTier:'none',
 displayOrder:0,teachingRoles:[],displayLabels:[],specialties:[],
 instructorSpecialties:[],teacherSpecialties:[]});
const rawDisplay=snap=>snap?.exists?{
 boardRole:snap.get('boardRole')||'none',
 leadershipTier:snap.get('leadershipTier')||'none',
 displayOrder:snap.get('displayOrder')||0,
 teachingRoles:snap.get('teachingRoles')||[],
 displayLabels:snap.get('displayLabels')||[],
 specialties:snap.get('specialties')||[],
 instructorSpecialties:snap.get('instructorSpecialties')||[],
 teacherSpecialties:snap.get('teacherSpecialties')||[]
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
 teachingRoles:p.teachingRoles,displayLabels:p.displayLabels||[],instructorSpecialties:p.instructorSpecialties,
 teacherSpecialties:p.teacherSpecialties,k9Role:p.k9Role||'',boardRole:p.boardRole,leadershipTier:p.leadershipTier,displayOrder:p.displayOrder,source:p.source
});
export function installOrganogramPlacementRoutes(app,{requireUser,getSnapshot}){
 const store=()=>getFirestore();
 // All returned attributes are display-only. Public output NEVER includes
 // Discord identifiers, access grants, source documents or audit history.
 app.get('/api/organogram/hierarchie',requireUser,async(_req,res)=>{
  try{
   const db=store(),snapshot=await getSnapshot(),roster=snapshot.data.filter(p=>validRow(p)&&p.dept!=='burger').slice(0,1200);
   const [manualSnap,k9Snap]=await Promise.all([
    db.collection(COLLECTION).limit(1500).get(),
    db.collection(K9_ROLE_COLLECTION).limit(1500).get()
   ]);
   if(manualSnap.size>=1500)return res.status(503).json({error:'Organogramregisterlimiet bereikt'});
   const manual=manualMap(manualSnap.docs);
   const k9Manual=manualMap(k9Snap.docs);
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
   const prepared=roster.map(p=>{
    const key=personKey(p.dept,p.personId);
    const override=manualDisplay(manual.get(key),p.dept);
    const synced=verifiedSyncRoles(roles.entries.get(p.personId),p.dept,process.env.DISCORD_GUILD_ID);
    return {p,merged:mergePlacement(p,override,synced)};
   });
   // A member's own login only refreshes their own Discord identity. For
   // K9 candidates, the server bot now checks their roles independently.
   // Results never update the identity/role snapshots used for permissions.
   const k9Candidates=prepared.filter(({p,merged})=>knownK9Candidate(
    p,merged,roles.entries.get(p.personId),
    k9Manual.get(p.personId)?.role||'',Object.values(K9_ROLE_IDS)
   )).map(({p})=>p.personId);
   const liveK9=await refreshK9DisplayRoles(k9Candidates);
   const records=[],boardById=new Map();
   for(const {p,merged} of prepared){
    if(p.dept==='politie'){
     // A verified bot result (even no current K9 role) supersedes the old
     // snapshot. On bot/API failure use only still-verified OAuth data.
     const auto=liveK9.roles.has(p.personId)?
      liveK9.roles.get(p.personId):
      verifiedK9DisplayRole(roles.entries.get(p.personId),process.env.DISCORD_GUILD_ID);
     merged.k9Role=effectiveK9DisplayRole(k9Manual.get(p.personId)?.role||'',auto);
     if(merged.k9Role&&!merged.specialties.includes('K9'))merged.specialties.push('K9');
    }
    // Reuse only the public police status already visible in the member
    // personnel list. No leave history, dossier fields or sensitive data.
    const display={...safePublic(merged),
     status:p.dept==='politie'?String(p.status||'').trim().slice(0,30):'',
     reekshoofdReeks:organogramReekshoofdTitle(p),
     // URL only for this signed-in police officer/corps with subject-level
     // dossier access; never send an ID or usable URL to other viewers.
     dossierUrl:policeOrganogramDossierUrl(_req.bpd,p)};
    // IDs remain limited to verified technical beheer for drag-and-drop.
    records.push(canManagePlacements(_req.bpd)?
     {...display,personId:p.personId}:display);
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
 // K9 role editing is independent of the technical-only placement editor.
 app.get('/api/organogram/k9/admin',requireUser,async(req,res)=>{
  if(!canEditK9Display(req.bpd))return res.status(403).json({error:'Alleen politie Officierenkader en Korpsleiding'});
  try{
   const db=store(),snapshot=await getSnapshot();
   const people=snapshot.data.filter(p=>validRow(p)&&p.dept==='politie').slice(0,1200);
   const [snap,roles,placementSnap]=await Promise.all([
    db.collection(K9_ROLE_COLLECTION).limit(1500).get(),
    identityMap(db,people.map(p=>p.personId),process.env.DISCORD_GUILD_ID),
    db.collection(COLLECTION).limit(1500).get()
   ]);
   const manual=manualMap(snap.docs),placements=manualMap(placementSnap.docs);
   const k9Candidates=people.filter(p=>{
    const override=manualDisplay(placements.get(personKey(p.dept,p.personId)),p.dept);
    const auto=verifiedSyncRoles(roles.entries.get(p.personId),p.dept,process.env.DISCORD_GUILD_ID);
    const merged=mergePlacement(p,override,auto);
    return knownK9Candidate(p,merged,roles.entries.get(p.personId),
     manual.get(p.personId)?.role||'',Object.values(K9_ROLE_IDS));
   }).map(p=>p.personId);
   const liveK9=await refreshK9DisplayRoles(k9Candidates);
   return res.json({people:people.map(p=>({
    personId:p.personId,name:safeName(p.name),call:String(p.call||'').slice(0,24),
    automatic:liveK9.roles.has(p.personId)?
     liveK9.roles.get(p.personId):
     verifiedK9DisplayRole(roles.entries.get(p.personId),process.env.DISCORD_GUILD_ID),
    automaticSource:liveK9.roles.has(p.personId)?'bot':
     verifiedK9DisplayRole(roles.entries.get(p.personId),process.env.DISCORD_GUILD_ID)?
      'snapshot':'niet_bevestigd',
    manual:manual.get(p.personId)?.role||''
   })),readOnly:false});
  }catch(e){return respond(res,e)}
 });
 app.put('/api/organogram/k9/:personId',requireUser,async(req,res)=>{
  if(!canEditK9Display(req.bpd))return res.status(403).json({error:'Alleen politie Officierenkader en Korpsleiding'});
  const personId=String(req.params.personId||'');
  if(!idOK(personId))return res.status(400).json({error:'Ongeldig personeelslid'});
  let input;try{input=validManualK9Role(req.body)}catch(e){return res.status(400).json({error:e.message})}
  try{
   const db=store(),snapshot=await getSnapshot();
   if(!snapshot.data.some(p=>validRow(p)&&p.dept==='politie'&&p.personId===personId))
    return res.status(409).json({error:'Geen gekoppeld politielid'});
   const ref=db.collection(K9_ROLE_COLLECTION).doc(personId);
   await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    tx.set(ref,{dept:'politie',personId,role:input.role,updatedBy:req.bpd.uid,
     updatedAt:FieldValue.serverTimestamp(),displayOnly:true});
    tx.create(ref.collection('audit').doc(),{action:'k9_display_role',
     previous:old.exists?old.get('role')||'':'',next:input.role,
     reason:input.reason,actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
   });
   return res.json({saved:true,displayOnly:true,accessRightsChanged:false});
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
     teachingRoles:values.teachingRoles,displayLabels:values.displayLabels,specialties:values.specialties,
     instructorSpecialties:values.instructorSpecialties,teacherSpecialties:values.teacherSpecialties,
     updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid,displayOnly:true};
    tx.set(ref,saved);
    tx.create(ref.collection('audit').doc(),{
     action:'manual_display_assignment',previous:before.exists?{
      boardRole:before.get('boardRole')||'none',
      leadershipTier:before.get('leadershipTier')||'none',
      displayOrder:before.get('displayOrder')||0,
      teachingRoles:before.get('teachingRoles')||[],
      displayLabels:before.get('displayLabels')||[],
      specialties:before.get('specialties')||[],
      instructorSpecialties:before.get('instructorSpecialties')||[],
      teacherSpecialties:before.get('teacherSpecialties')||[]
     }:null,next:{boardRole:values.boardRole,teachingRoles:values.teachingRoles,
      displayLabels:values.displayLabels,specialties:values.specialties,instructorSpecialties:values.instructorSpecialties,
      teacherSpecialties:values.teacherSpecialties,leadershipTier:values.leadershipTier,
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
     teachingRoles:restored.teachingRoles,displayLabels:restored.displayLabels,specialties:restored.specialties,
     instructorSpecialties:restored.instructorSpecialties,teacherSpecialties:restored.teacherSpecialties,
     undo:current,updatedAt:FieldValue.serverTimestamp(),
     updatedBy:req.bpd.uid,displayOnly:true
    });
    tx.create(ref.collection('audit').doc(),{
     action:'manual_display_undo',previous:current,
     next:{boardRole:restored.boardRole,leadershipTier:restored.leadershipTier,
      displayOrder:restored.displayOrder,teachingRoles:restored.teachingRoles,
      displayLabels:restored.displayLabels,specialties:restored.specialties,instructorSpecialties:restored.instructorSpecialties,
      teacherSpecialties:restored.teacherSpecialties},reason,actorUid:req.bpd.uid,
     at:FieldValue.serverTimestamp()
    });
   });
   return res.json({restored:true,displayOnly:true,accessRightsChanged:false});
  }catch(e){return respond(res,e)}
 });

 // Dragging is confined to the SAME 600/700/800 rank series, and never
 // mutates the original callsign, police rank or operational permissions.
 app.post('/api/organogram/middenkader/order',requireUser,manager,async(req,res)=>{
  let payload;
  try{payload=validMidOrder(req.body)}catch(e){return res.status(400).json({error:e.message})}
  try{
   const snapshot=await getSnapshot();
   if(snapshot.stale)throw fault(409,'Personeelslijst is verouderd; probeer na synchronisatie opnieuw');
   const rows=snapshot.data.filter(p=>p?.dept==='politie'&&idOK(p.personId)&&
    callMiddleSeries(p.call)===payload.series);
   const rosterIds=rows.map(p=>p.personId);
   const expected=new Set(rosterIds);
   if(expected.size!==rosterIds.length||expected.size!==payload.personIds.length||
    payload.personIds.some(id=>!expected.has(id)))
    throw fault(409,'De reeks is intussen gewijzigd. Vernieuw de pagina en probeer opnieuw');
   const db=store(),refs=payload.personIds.map(id=>
    db.collection(COLLECTION).doc(personKey('politie',id)));
   const batchRef=db.collection(MID_ORDER_COLLECTION).doc();
   await db.runTransaction(async tx=>{
    const snapshots=await Promise.all(refs.map(ref=>tx.get(ref)));
    const entries=[];
    for(let i=0;i<refs.length;i++){
     const before=snapshots[i],personId=payload.personIds[i];
     const previous=before.exists?before.data():null;
     entries.push({personId,previous,nextOrder:i+1});
    }
    for(let i=0;i<refs.length;i++){
     const {personId,previous}=entries[i],ref=refs[i],displayOrder=i+1;
     tx.set(ref,{...(previous||{}),dept:'politie',personId,
      status:'active',displayOrder,lastReorderBatchId:batchRef.id,
      updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid,displayOnly:true});
     tx.create(ref.collection('audit').doc(),{
      action:'middle_cadre_drag_order',previousOrder:previous?.displayOrder||0,
      nextOrder:displayOrder,series:payload.series,reason:payload.reason,
      batchId:batchRef.id,actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()
     });
    }
    tx.create(batchRef,{status:'active',dept:'politie',series:payload.series,
     entries,actorUid:req.bpd.uid,reason:payload.reason,
     createdAt:FieldValue.serverTimestamp(),displayOnly:true});
   });
   return res.json({saved:true,batchId:batchRef.id,series:payload.series,
    displayOnly:true,accessRightsChanged:false});
  }catch(e){return respond(res,e)}
 });
 // Retrieve the most recent undoable drag operation for a technical manager,
 // including after page refresh. Never expose IDs or history to ordinary staff.
 app.get('/api/organogram/middenkader/last-order',requireUser,manager,async(req,res)=>{
  try{
   const snap=await store().collection(MID_ORDER_COLLECTION).orderBy('createdAt','desc').limit(100).get();
   const entries=snap.docs.filter(d=>d.get('status')==='active'&&
    d.get('actorUid')===req.bpd.uid);
   entries.sort((a,b)=>
    (b.get('createdAt')?.toMillis?.()||0)-(a.get('createdAt')?.toMillis?.()||0));
   const latest=entries[0];
   return res.json({batch:latest?{id:latest.id,series:latest.get('series'),
    count:(latest.get('entries')||[]).length}:null});
  }catch(e){return respond(res,e)}
 });
 app.post('/api/organogram/middenkader/order/:batchId/undo',requireUser,manager,async(req,res)=>{
  const batchId=String(req.params.batchId||'');
  if(!/^[A-Za-z0-9]{15,40}$/.test(batchId))
   return res.status(400).json({error:'Ongeldig herstelnummer'});
  const reason=String(req.body?.reason||'').trim();
  if(reason.length<8||reason.length>300)
   return res.status(400).json({error:'Motivering van 8 tot 300 tekens verplicht'});
  try{
   const db=store(),ref=db.collection(MID_ORDER_COLLECTION).doc(batchId);
   await db.runTransaction(async tx=>{
    const batch=await tx.get(ref);
    if(!batch.exists||batch.get('status')!=='active')
     throw fault(409,'Deze verplaatsing is al hersteld of niet beschikbaar');
    const entries=batch.get('entries')||[];
    if(!entries.length||entries.length>100||entries.some(e=>!idOK(e.personId)))
     throw fault(409,'Herstelgegevens zijn onvolledig');
    const personRefs=entries.map(e=>db.collection(COLLECTION)
     .doc(personKey('politie',e.personId)));
    const current=await Promise.all(personRefs.map(r=>tx.get(r)));
    for(const snap of current){
     if(!snap.exists||snap.get('lastReorderBatchId')!==batchId)
      throw fault(409,'Er zijn intussen nieuwe wijzigingen. Herstel eerst de recentste verplaatsing');
    }
    for(let i=0;i<entries.length;i++){
     const {previous,personId}=entries[i],personRef=personRefs[i];
     if(previous)tx.set(personRef,previous);
     else tx.delete(personRef);
     tx.create(personRef.collection('audit').doc(),{
      action:'middle_cadre_drag_undo',batchId,personId,
      restoredOrder:previous?.displayOrder||0,reason,
      actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()
     });
    }
    tx.update(ref,{status:'undone',undoneAt:FieldValue.serverTimestamp(),
     undoneBy:req.bpd.uid,undoReason:reason});
   });
   return res.json({restored:true,displayOnly:true,accessRightsChanged:false});
  }catch(e){return respond(res,e)}
 });

}
