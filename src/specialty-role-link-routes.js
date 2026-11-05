// Central, service-scoped mapping from verified Discord roles and existing
// visual assets to an audited personnel specialization. This registry is
// presentation metadata: never grant Discord roles or dossier permissions.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {SPECIALTY_LABELS} from './normalize.js';
import {ROLE_CATALOG} from './role-catalog.js';
import {ROLE_ARTWORK_META} from './role-artwork-routes.js';
import {extraSpecialtyLabels,ROSTER_COLUMN_COLLECTION,rosterConfig} from './roster-column-config.js';
import {canEditLibrary} from './uniform-library-routes.js';
import {mayEditTechnicalSettings} from './technical-center-config.js';
import {canReadServiceDossier} from './service-dossier-access.js';
import {canReadPersonnelSubject} from './personnel-editor-policy.js';
import {SPECIALTY_STATES,allSpecialtyLabels} from './specialization-policy.js';
import {defaultSpecialtyRoleLinks,POLICE_PATCH_PRESET_VERSION,
 BW_LOG_SIG_ROLE_ID,BW_LOG_SIG_SPECIALTIES,fireSharedSpecialtyAssetKeys,
 knownDepannageRoleSpecialty,depannageSpecialtyAssetKeys} from './specialty-role-presets.js';
import {suppressSupersededRagoMatches} from './rago-qualification-display.js';
import {verifyLiveSpecialtyRoles} from './specialty-live-discord-sync.js';

export const SPECIALTY_ROLE_LINKS='bpd_specialty_role_links';
export const SPECIALTY_ROLE_LINK_AUDIT='bpd_specialty_role_link_audit';
const DEPTS=Object.freeze(['politie','brandweer','ambulance','depannage']);
const ID=/^\d{15,22}$/;
// All visual sources are allowed; link metadata never awards qualifications.
const VISUAL_SOURCE_KINDS=Object.freeze(['rank','uniform','specialty','patch','helmet','profession','logo','pictogram']);
const ASSET=/^(?:(?:rank|uniform|specialty|patch|helmet|profession|logo|pictogram)_(?:politie|brandweer|ambulance|depannage)_[a-z0-9][a-z0-9_]{0,39}|\d{15,22}_[a-z][a-z0-9_]{0,39})$/;
const fail=(status,message)=>Object.assign(new Error(message),{status});
const respond=(res,e)=>{
 if(e.status)return res.status(e.status).json({error:e.message});
 console.error('Specialisatiekoppelingen:',e.code||'storage_error');
 return res.status(503).json({error:'Specialisatiekoppelingen tijdelijk niet beschikbaar'});
};
function rolesFor(dept){
 return ROLE_CATALOG.filter(x=>(x.dept===dept||
   dept==='politie'&&x.dept==='dispatch'||
   // PITMOTO is shared with AZLS but catalogued under police.
   // Allow mapping its visual patch; this never changes role permissions.
   dept==='ambulance'&&x.id==='1508506242299985980')&&
   (x.kind==='specialisatie'||
     x.dept==='depannage'&&x.kind==='lidmaatschap'||
     dept==='politie'&&x.dept==='dispatch'))
  .map(x=>({id:x.id,name:x.name,kind:x.kind,stage:x.stage}));
}
export function canManageSpecialtyRoleLinks(actor,dept){
 if(!actor||!DEPTS.includes(dept)||actor.uid!=='discord:'+actor.discordId||
    !ID.test(String(actor.discordId||'')))return false;
 // Only the independently verified technical profile can manage metadata
 // across all services without an operational dossier membership.
 if(mayEditTechnicalSettings(actor))return true;
 if(!actor.dossierNativeDepartments?.includes(dept)||
    !actor.dossierAllowedDepartments?.includes(dept))return false;
 return canEditLibrary(actor,dept)||
   dept==='brandweer'&&actor.fireZoneChief===true||
   dept==='ambulance'&&actor.reportServiceRoles?.ambulanceAzls===true||
   dept==='depannage'&&actor.reportServiceRoles?.depannageAwv===true;
}
// A role ID is OPTIONAL: some qualifications are awarded manually to
// Agentenkader/Basiskader without any separate Discord role.
const cleanLinks=list=>Array.isArray(list)?list.filter(x=>x&&typeof x.label==='string'&&
  (x.roleId===''||ID.test(x.roleId))&&typeof x.level==='string'&&x.level.length<=45&&
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
  // A generic library badge may be linked without a Discord role; an older
  // role-specific image must match the EXACT selected role ID.
  const assetBelongs=!assetKey||(ASSET.test(assetKey)&&(
    assetKey.includes('_'+dept+'_')||
    roleId!==''&&assetKey.startsWith(roleId+'_')));
  if(!allowedLabels.has(label)||(roleId!==''&&!allowedRoles.has(roleId))||
     level.length>45||/[<>\x00-\x1f]/.test(level)||
     !SPECIALTY_STATES.includes(value)||!assetBelongs)
    throw fail(400,'Kies een bestaande specialisatie, optionele Discord-rol, status en afbeelding van dezelfde dienst');
  const shared=dept==='brandweer'&&roleId===BW_LOG_SIG_ROLE_ID;
  if(shared&&!BW_LOG_SIG_SPECIALTIES.includes(label))
   throw fail(400,'BW log/signa kan alleen Logistiek en Signalisatie koppelen');
  const unique=shared?roleId+':'+label:roleId||'manual:'+label;
  if(seen.has(unique))throw fail(400,roleId?
    shared?'Deze Brandweer-specialisatie is al aan BW log/signa gekoppeld':
    'Een Discord-rol kan binnen een dienst maar één specialisatiekoppeling krijgen':
    'Deze specialisatie heeft al een koppeling zonder Discord-rol');
  seen.add(unique);
  return {label,roleId,level,value,assetKey};
 });
 return {expectedRevision:body.expectedRevision,reason,links};
}
/** Register a service-scoped label in the existing roster catalog only.
 * This does NOT register a qualification on a person's dossier. */
export function validateCustomSpecialty(body,dept,existing=[]){
 if(!DEPTS.includes(dept)||!body||Array.isArray(body)||typeof body!=='object'||
   Object.keys(body).some(k=>!['label','reason'].includes(k)))
  throw fail(400,'Ongeldige nieuwe specialisatie');
 const label=typeof body.label==='string'?body.label.trim():'';
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(label.length<2||label.length>64||/[<>\\x00-\\x1f\\x7f]/.test(label)||
   reason.length<8||reason.length>300||/[<>\\x00-\\x1f\\x7f]/.test(reason))
  throw fail(400,'Vul een naam van 2–64 tekens en een motivering van 8–300 tekens in');
 const fold=x=>String(x||'').toLocaleLowerCase('nl-BE');
 if(['andere','anders'].includes(fold(label))||
   dept==='ambulance'&&fold(label)==='motor')
  throw fail(400,'Deze naam kan niet als aparte specialisatie worden toegevoegd');
 const accepted=[...allSpecialtyLabels(dept),...existing.map(x=>x.label)];
 if(accepted.some(x=>fold(x)===fold(label)))
  throw fail(409,'Deze specialisatie bestaat al voor de hulpdienst');
 const code=label.toLowerCase().normalize('NFD')
  .replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'_')
  .replace(/^_+|_+$/g,'').slice(0,40).replace(/_+$/g,'');
 if(!/^[a-z0-9][a-z0-9_]{0,39}$/.test(code)||
  existing.some(x=>x.code===code))
  throw fail(400,'Deze naam kan niet naar een unieke afbeeldingscode worden omgezet');
 return {label,code,reason};
}

export function installSpecialtyRoleLinkRoutes(app,{requireUser,getSnapshot}){
 // Append to the already established per-service customSpecialties registry.
 // No duplicate specialist records and no changes to permissions or roles.
 app.post('/api/specialty-links/:dept/custom-label',requireUser,async(req,res)=>{
  const dept=req.params.dept;
  if(!canManageSpecialtyRoleLinks(req.bpd,dept))
   return res.status(403).json({error:'Geen beheerrechten voor deze hulpdienst'});
  try{
   const db=getFirestore(),ref=db.collection(ROSTER_COLUMN_COLLECTION).doc(dept);
   const result=await db.runTransaction(async tx=>{
    const old=await tx.get(ref),before=rosterConfig(old.data());
    const next=validateCustomSpecialty(req.body,dept,before.customSpecialties);
    if(before.customSpecialties.length>=20)
     throw fail(409,'Maximaal 20 extra specialisaties per hulpdienst');
    const customSpecialties=[...before.customSpecialties,
     {label:next.label,code:next.code,icon:'',public:false}];
    const after={...before,customSpecialties,revision:before.revision+1};
    tx.set(ref,{customSpecialties,revision:after.revision,
     updatedBy:req.bpd.discordId,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    tx.create(db.collection('bpd_roster_column_audit').doc(),{
     dept,actorDiscordId:req.bpd.discordId,action:'custom_specialty_added',
     before,after,reason:next.reason,at:FieldValue.serverTimestamp()
    });
    return {label:next.label,code:next.code,revision:after.revision};
   });
   res.set('Cache-Control','no-store');
   return res.status(201).json({saved:true,...result,
    qualificationGranted:false,discordRolesChanged:false});
  }catch(e){return respond(res,e);}
 });
 app.get('/api/specialty-links/:dept',requireUser,async(req,res)=>{
  const dept=req.params.dept;
  if(!DEPTS.includes(dept))return res.status(400).json({error:'Onbekende hulpdienst'});
  if(!canReadServiceDossier(req.bpd,dept)&&
     !mayEditTechnicalSettings(req.bpd))
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
   const labels=allSpecialtyLabels(dept,extra);
   const allowedLabels=new Set(labels);
   const allAssets=assets.docs.filter(d=>d.get('active')===true&&
     (VISUAL_SOURCE_KINDS.includes(d.get('kind'))||
       (d.get('kind')||'role')==='role'&&d.get('roleId')&&
        d.id.startsWith(d.get('roleId')+'_'))&&ASSET.test(d.id))
    .map(d=>({key:d.id,label:String(d.get('label')||d.get('code')||'').slice(0,75),
      imageUrl:'/api/role-artwork/file/'+d.id+'?v='+encodeURIComponent(d.get('version')||'1')}));
   const defaults=defaultSpecialtyRoleLinks(dept,cleanLinks(doc.get('links')),
     doc.get('presetVersion')===POLICE_PATCH_PRESET_VERSION);
   const links=cleanLinks(defaults).filter(x=>
     (x.roleId===''||allowedIds.has(x.roleId))&&allowedLabels.has(x.label))
     .map(x=>{
       // A role artwork's visual slot is tied to its exact Discord ID.
       // Never guess a badge from another role or specialisation.
       if(x.assetKey||!x.roleId)return x;
       // A shared BW role must NEVER reuse the same role-standard
       // picture for both qualifications. Find their distinct library images.
       if(dept==='brandweer'&&x.roleId===BW_LOG_SIG_ROLE_ID&&
          BW_LOG_SIG_SPECIALTIES.includes(x.label)){
        const found=fireSharedSpecialtyAssetKeys(x.label)
         .map(key=>allAssets.find(a=>a.key===key)).find(Boolean);
        return found?{...x,assetKey:found.key}:x;
       }
       // Generic Depannage specialty patches take precedence over an
       // unmapped Discord role-photo slot; saved explicit choices win.
       if(dept==='depannage'&&knownDepannageRoleSpecialty(x.roleId,x.label)){
        const found=depannageSpecialtyAssetKeys(x.label)
         .map(key=>allAssets.find(a=>a.key===key)).find(Boolean);
        if(found)return {...x,assetKey:found.key};
       }
       const matching=allAssets.find(a=>a.key===x.roleId+'_standard');
       return matching?{...x,assetKey:matching.key}:x;
     });
   res.set('Cache-Control','private, no-store');
   return res.json({dept,labels,roles,assets:allAssets,links,
    revision:Number.isSafeInteger(doc.get('revision'))?doc.get('revision'):0,
    canEdit:canManageSpecialtyRoleLinks(req.bpd,dept),verifiedRolesOnly:true,
    noDiscordRoleMutations:true});
  }catch(e){return respond(res,e)}
 });
 app.put('/api/specialty-links/:dept',requireUser,async(req,res)=>{
  const dept=req.params.dept;
  if(!canManageSpecialtyRoleLinks(req.bpd,dept))
   return res.status(403).json({error:'Alleen bevoegde dienstleiding kan koppelingen aanpassen'});
  try{
   const [extras,db]=await Promise.all([extraSpecialtyLabels(dept),Promise.resolve(getFirestore())]);
   const labels=allSpecialtyLabels(dept,extras);
   const input=validateSpecialtyRoleLinks(req.body,dept,labels,rolesFor(dept));
   const assets=[...new Set(input.links.map(l=>l.assetKey).filter(Boolean))];
   if(assets.length){
    const docs=await db.getAll(...assets.map(k=>db.collection(ROLE_ARTWORK_META).doc(k)));
    for(let i=0;i<docs.length;i++){
     if(!docs[i].exists||docs[i].get('active')!==true||
        docs[i].get('department')!==dept||
        !(VISUAL_SOURCE_KINDS.includes(docs[i].get('kind'))||
          (docs[i].get('kind')||'role')==='role'&&
          docs[i].id.startsWith(String(docs[i].get('roleId')||'')+'_')))
      throw fail(400,'Kies een actieve specialisatiepatch uit de bibliotheek van deze dienst');
    }
   }
   // Legacy role-linked artwork can only be used with its own Discord role.
   // A generic patch is service-wide and can be used without a role.
   for(const link of input.links){
    if(/^\d{15,22}_/.test(link.assetKey)&&
       (!link.roleId||!link.assetKey.startsWith(link.roleId+'_')))
      throw fail(400,'Een Discord-rolgebonden patch mag enkel bij diezelfde Discord-rol gebruikt worden');
   }
   const ref=db.collection(SPECIALTY_ROLE_LINKS).doc(dept);
   const result=await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    const revision=old.exists&&Number.isSafeInteger(old.get('revision'))?old.get('revision'):0;
    if(revision!==input.expectedRevision)
      throw fail(409,'De koppelingen zijn intussen aangepast. Vernieuw eerst de lijst.');
    tx.set(ref,{department:dept,links:input.links,
      presetVersion:dept==='politie'?POLICE_PATCH_PRESET_VERSION:0,
      revision:revision+1,
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
   const cachedVerified=data.guildId===process.env.DISCORD_GUILD_ID&&
     Number.isSafeInteger(data.verifiedAt)&&data.verifiedAt<=at+60000&&
     at-data.verifiedAt<=7*86400000&&
     Array.isArray(data.roleIds)&&data.roleIds.every(x=>ID.test(x));
   // Read-only bot proof takes precedence. If Discord is temporarily unreachable,
   // a still-recent OAuth proof remains a valid display-only fallback.
   const live=await verifyLiveSpecialtyRoles(discordId);
   const liveVerified=live.verified&&live.status==='ok';
   const verified=liveVerified||(!live.verified&&cachedVerified);
   const have=new Set(verified?(liveVerified?live.roleIds:data.roleIds):[]);
   const matches=cleanLinks(defaultSpecialtyRoleLinks(dept,
     cleanLinks(doc.get('links')),
     doc.get('presetVersion')===POLICE_PATCH_PRESET_VERSION))
     .filter(x=>x.roleId&&have.has(x.roleId));
   // Visual-only role badges use an exact verified role ID and never imply
   // an authorization. Do not reuse somebody else's image by role title.
   const candidates=matches.filter(x=>!x.assetKey);
   const images=candidates.length?await db.getAll(...candidates.map(x=>
     db.collection(ROLE_ARTWORK_META).doc(x.roleId+'_standard'))):[];
   const linked=matches.map(x=>{
     if(x.assetKey)return x;
     const index=candidates.indexOf(x),asset=images[index];
     return asset?.exists&&asset.get('active')===true&&
       asset.get('department')===dept?
       {...x,assetKey:x.roleId+'_standard'}:x;
   });
   res.set('Cache-Control','private, no-store');
   return res.json({verified,verifiedAt:verified?
     new Date(liveVerified?at:data.verifiedAt).toISOString():null,
     verificationSource:liveVerified?'discord-bot':verified?'oauth-cache':'unavailable',
     matches:suppressSupersededRagoMatches(linked),displayOnly:true,discordRolesChanged:false});
  }catch(e){return respond(res,e)}
 });
}
