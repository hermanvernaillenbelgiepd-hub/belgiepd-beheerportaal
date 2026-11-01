// Central, service-scoped mapping from verified Discord roles and existing
// visual assets to an audited personnel specialization. This registry is
// presentation metadata: never grant Discord roles or dossier permissions.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {SPECIALTY_LABELS} from './normalize.js';
import {ROLE_CATALOG} from './role-catalog.js';
import {ROLE_ARTWORK_META} from './role-artwork-routes.js';
import {extraSpecialtyLabels} from './roster-column-config.js';
import {canEditLibrary} from './uniform-library-routes.js';
import {canReadServiceDossier} from './service-dossier-access.js';
import {canReadPersonnelSubject} from './personnel-editor-policy.js';
import {SPECIALTY_STATES} from './specialization-policy.js';

export const SPECIALTY_ROLE_LINKS='bpd_specialty_role_links';
export const SPECIALTY_ROLE_LINK_AUDIT='bpd_specialty_role_link_audit';
const DEPTS=Object.freeze(['politie','brandweer','ambulance','depannage']);
const ID=/^\d{15,22}$/;
const ASSET=/^(?:specialty|patch)_(politie|brandweer|ambulance|depannage)_[a-z0-9][a-z0-9_]{0,39}$/;
const fail=(status,message)=>Object.assign(new Error(message),{status});
const respond=(res,e)=>{
 if(e.status)return res.status(e.status).json({error:e.message});
 console.error('Specialisatiekoppelingen:',e.code||'storage_error');
 return res.status(503).json({error:'Specialisatiekoppelingen tijdelijk niet beschikbaar'});
};
function rolesFor(dept){
 return ROLE_CATALOG.filter(x=>(x.dept===dept||
   dept==='politie'&&x.dept==='dispatch')&&
   (x.kind==='specialisatie'||
     x.dept==='depannage'&&x.kind==='lidmaatschap'||
     dept==='politie'&&x.dept==='dispatch'))
  .map(x=>({id:x.id,name:x.name,kind:x.kind,stage:x.stage}));
}
function canManage(actor,dept){
 if(!actor||!DEPTS.includes(dept)||actor.uid!=='discord:'+actor.discordId||
    !ID.test(String(actor.discordId||''))||
    !actor.dossierNativeDepartments?.includes(dept)||
    !actor.dossierAllowedDepartments?.includes(dept))return false;
 return canEditLibrary(actor,dept)||
   dept==='brandweer'&&actor.fireZoneChief===true||
   dept==='ambulance'&&actor.reportServiceRoles?.ambulanceAzls===true||
   dept==='depannage'&&actor.reportServiceRoles?.depannageAwv===true;
}
const cleanLinks=list=>Array.isArray(list)?list.filter(x=>x&&typeof x.label==='string'&&
  ID.test(x.roleId)&&typeof x.level==='string'&&x.level.length<=45&&
  SPECIALTY_STATES.includes(x.value)&&(!x.assetKey||ASSET.test(x.assetKey)))
  .slice(0,120).map(x=>({label:x.label,roleId:x.roleId,
   level:x.level,value:x.value,assetKey:x.assetKey||''})):[];
export function validateSpecialtyRoleLinks(body,dept,labels,roles){
 if(!Number.isSafeInteger(body?.expectedRevision)||body.expectedRevision<0||
   !Array.isArray(body?.links)||body.links.length>120)
   throw fail(400,'Ongeldige versie of lijst. Vernieuw het scherm.');
 const reason=String(body.reason||'').trim();
 if(reason.length<8||reason.length>300||/[<>\x00-\x1f]/.test(reason))
  throw fail(400,'Motivering van 8–300 tekens verplicht');
 const allowedLabels=new Set(labels),allowedRoles=new Set(roles.map(x=>x.id)),seen=new Set();
 const links=body.links.map(x=>{
  if(!x||typeof x!=='object'||Array.isArray(x)||
     Object.keys(x).some(k=>!['label','roleId','level','value','assetKey'].includes(k)))
   throw fail(400,'Ongeldige rolkoppeling');
  const label=String(x.label||''),roleId=String(x.roleId||'');
  const level=String(x.level||'').trim(),value=String(x.value||'');
  const assetKey=String(x.assetKey||'');
  if(!allowedLabels.has(label)||!allowedRoles.has(roleId)||
     level.length>45||/[<>\x00-\x1f]/.test(level)||
     !SPECIALTY_STATES.includes(value)||
     (assetKey&&(!ASSET.test(assetKey)||!assetKey.includes('_'+dept+'_'))))
   throw fail(400,'Kies een bestaande specialisatie, Discord-rol, status en afbeelding van dezelfde dienst');
  if(seen.has(roleId))throw fail(400,'Een Discord-rol kan binnen een dienst maar één specialisatiekoppeling krijgen');
  seen.add(roleId);
  return {label,roleId,level,value,assetKey};
 });
 return {expectedRevision:body.expectedRevision,reason,links};
}
export function installSpecialtyRoleLinkRoutes(app,{requireUser,getSnapshot}){
 app.get('/api/specialty-links/:dept',requireUser,async(req,res)=>{
  const dept=req.params.dept;
  if(!DEPTS.includes(dept))return res.status(400).json({error:'Onbekende hulpdienst'});
  if(!canReadServiceDossier(req.bpd,dept))
   return res.status(403).json({error:'Geen toegang tot de specialisaties van deze dienst'});
  try{
   const db=getFirestore();
   const [doc,assets,extra]=await Promise.all([
    db.collection(SPECIALTY_ROLE_LINKS).doc(dept).get(),
    db.collection(ROLE_ARTWORK_META).where('department','==',dept).limit(400).get(),
    extraSpecialtyLabels(dept)
   ]);
   const roles=rolesFor(dept);
   const allowedIds=new Set(roles.map(r=>r.id));
   const labels=[...new Set([...(SPECIALTY_LABELS[dept]||[]),...extra])];
   const allowedLabels=new Set(labels);
   const allAssets=assets.docs.filter(d=>d.get('active')===true&&
     ['specialty','patch'].includes(d.get('kind'))&&ASSET.test(d.id))
    .map(d=>({key:d.id,label:String(d.get('label')||d.get('code')||'').slice(0,75),
      imageUrl:'/api/role-artwork/file/'+d.id+'?v='+encodeURIComponent(d.get('version')||'1')}));
   const links=cleanLinks(doc.get('links')).filter(x=>
     allowedIds.has(x.roleId)&&allowedLabels.has(x.label));
   res.set('Cache-Control','private, no-store');
   return res.json({dept,labels,roles,assets:allAssets,links,
    revision:Number.isSafeInteger(doc.get('revision'))?doc.get('revision'):0,
    canEdit:canManage(req.bpd,dept),verifiedRolesOnly:true,
    noDiscordRoleMutations:true});
  }catch(e){return respond(res,e)}
 });
 app.put('/api/specialty-links/:dept',requireUser,async(req,res)=>{
  const dept=req.params.dept;
  if(!canManage(req.bpd,dept))
   return res.status(403).json({error:'Alleen bevoegde dienstleiding kan koppelingen aanpassen'});
  try{
   const [extras,db]=await Promise.all([extraSpecialtyLabels(dept),Promise.resolve(getFirestore())]);
   const labels=[...new Set([...(SPECIALTY_LABELS[dept]||[]),...extras])];
   const input=validateSpecialtyRoleLinks(req.body,dept,labels,rolesFor(dept));
   const assets=[...new Set(input.links.map(l=>l.assetKey).filter(Boolean))];
   if(assets.length){
    const docs=await db.getAll(...assets.map(k=>db.collection(ROLE_ARTWORK_META).doc(k)));
    for(let i=0;i<docs.length;i++){
     if(!docs[i].exists||docs[i].get('active')!==true||
        docs[i].get('department')!==dept||
        !['specialty','patch'].includes(docs[i].get('kind')))
      throw fail(400,'Kies een actieve specialisatiepatch uit de bibliotheek van deze dienst');
    }
   }
   const ref=db.collection(SPECIALTY_ROLE_LINKS).doc(dept);
   const result=await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    const revision=old.exists&&Number.isSafeInteger(old.get('revision'))?old.get('revision'):0;
    if(revision!==input.expectedRevision)
      throw fail(409,'De koppelingen zijn intussen aangepast. Vernieuw eerst de lijst.');
    tx.set(ref,{department:dept,links:input.links,revision:revision+1,
      updatedByUid:req.bpd.uid,updatedAt:FieldValue.serverTimestamp()});
    tx.create(db.collection(SPECIALTY_ROLE_LINK_AUDIT).doc(),{
      dept,actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,
      before:cleanLinks(old.get('links')),after:input.links,
      reason:input.reason,revision:revision+1,at:FieldValue.serverTimestamp()});
    return revision+1;
   });
   return res.json({saved:true,revision:result,discordRolesChanged:false});
  }catch(e){return respond(res,e)}
 });
 app.get('/api/specialty-links/:dept/:discordId/verified',requireUser,async(req,res)=>{
  const {dept,discordId}=req.params;
  if(!DEPTS.includes(dept)||!ID.test(discordId)||
     !canReadServiceDossier(req.bpd,dept))
   return res.status(403).json({error:'Geen inzage in de geselecteerde personeelsfiche'});
  try{
   const roster=await getSnapshot();
   if(roster.stale)return res.status(503).json({error:'Personeelsbron tijdelijk niet actueel'});
   const target=roster.data.filter(p=>p.dept===dept&&p.personId===discordId);
   if(target.length!==1||!canReadPersonnelSubject(req.bpd,target[0]))
    return res.status(403).json({error:'Geen inzage in dit personeelsdossier'});
   const db=getFirestore();
   const [doc,identity]=await Promise.all([
    db.collection(SPECIALTY_ROLE_LINKS).doc(dept).get(),
    db.collection('bpd_discord_auth').doc(discordId).get()
   ]);
   const data=identity.data()||{},at=Date.now();
   const verified=data.guildId===process.env.DISCORD_GUILD_ID&&
     Number.isSafeInteger(data.verifiedAt)&&data.verifiedAt<=at+60000&&
     at-data.verifiedAt<=7*86400000&&
     Array.isArray(data.roleIds)&&data.roleIds.every(x=>ID.test(x));
   const have=new Set(verified?data.roleIds:[]);
   const matches=cleanLinks(doc.get('links')).filter(x=>have.has(x.roleId));
   res.set('Cache-Control','private, no-store');
   return res.json({verified,verifiedAt:verified?new Date(data.verifiedAt).toISOString():null,
     matches,displayOnly:true,discordRolesChanged:false});
  }catch(e){return respond(res,e)}
 });
}
