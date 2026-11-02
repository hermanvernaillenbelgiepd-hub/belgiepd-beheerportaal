import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {USER_COLLECTION} from './user-access.js';
import {SPECIALTY_ROLE_LINKS} from './specialty-role-link-routes.js';
import {ROLE_ARTWORK_META} from './role-artwork-routes.js';
import {MID_ORDER_COLLECTION,callMiddleSeries,validMidOrder}
 from './organogram-mid-order-policy.js';
import {COLLECTION,DEPTS,DISPLAY_DEPTS,SPECIALTIES,LEADERSHIP_LEVELS,personKey,
 validatePlacement,validatePoliceSpecialtyEdit,manualDisplay,verifiedSyncRoles,mergePlacement,canManagePlacements
} from './organogram-placement-policy.js';
import {organogramReekshoofdTitle,policeOrganogramDossierUrl} from './organogram-profile-display.js';
import {K9_ROLE_COLLECTION,K9_ROLE_IDS,canEditK9Display,verifiedK9DisplayRole,
 validManualK9Role,effectiveK9DisplayRole} from './k9-display-role.js';
import {refreshK9DisplayRoles,knownK9Candidate,verifyK9DisplayRoleNow} from './k9-live-discord-sync.js';
import {MOTARD_DISPLAY_COLLECTION,verifiedMotardDisplayRole,effectiveMotardDisplayRole} from './motard-display-role.js';
import {DISP_DISPLAY_COLLECTION,verifiedDispDisplayRole,effectiveDispDisplayRole} from './disp-display-role.js';
import {verifyLiveSpecialtyRoles} from './specialty-live-discord-sync.js';
import {defaultSpecialtyRoleLinks,POLICE_PATCH_PRESET_VERSION} from './specialty-role-presets.js';
import {PERSONNEL_DECORATIONS_COLLECTION,PERSONNEL_DECORATION_CATALOG_COLLECTION,
 awardKey,publicDecorations,customCatalogItem} from './personnel-decoration-policy.js';

export const AE_MANUAL_DISPLAY_COLLECTION='bpd_ae_display_roles';
const AE_MANUAL_LEVELS=new Set(['ae_i','ae_t','teamleader','instructeur']);
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
 teacherSpecialties:p.teacherSpecialties,k9Role:p.k9Role||'',motardRole:p.motardRole||'',dispRole:p.dispRole||'',
 aeRole:p.aeRole||'',aeManual:p.aeManual||'',aeRoles:Array.isArray(p.aeRoles)?p.aeRoles:[],
 aeTeamleader:p.aeTeamleader===true,boardRole:p.boardRole,leadershipTier:p.leadershipTier,displayOrder:p.displayOrder,source:p.source
});
export function installOrganogramPlacementRoutes(app,{requireUser,getSnapshot}){
 const store=()=>getFirestore();
 const k9VerificationCooldown=new Map();
 // All returned attributes are display-only. Public output NEVER includes
 // Discord identifiers, access grants, source documents or audit history.
 app.get('/api/organogram/hierarchie',requireUser,async(_req,res)=>{
  try{
   const db=store(),snapshot=await getSnapshot(),roster=snapshot.data.filter(p=>validRow(p)&&p.dept!=='burger').slice(0,1200);
   const [manualSnap,k9Snap,motardSnap,dispSnap,aeSnap,decorationSnap,catalogSnap]=await Promise.all([
    db.collection(COLLECTION).limit(1500).get(),
    db.collection(K9_ROLE_COLLECTION).limit(1500).get(),
    db.collection(MOTARD_DISPLAY_COLLECTION).limit(1500).get(),
    db.collection(DISP_DISPLAY_COLLECTION).limit(1500).get(),
    db.collection(AE_MANUAL_DISPLAY_COLLECTION).limit(1500).get(),
    db.collection(PERSONNEL_DECORATIONS_COLLECTION).where('dept','==','politie').limit(500).get(),
    db.collection(PERSONNEL_DECORATION_CATALOG_COLLECTION).limit(100).get()
   ]);
   if(manualSnap.size>=1500)return res.status(503).json({error:'Organogramregisterlimiet bereikt'});
   // The per-service mapping is visual-only. It can select a library patch
   // for a recently verified Discord role without changing personnel rights.
   const linkDocs=await db.getAll(...['politie','brandweer','ambulance','depannage']
     .map(dept=>db.collection(SPECIALTY_ROLE_LINKS).doc(dept)));
   const mapped=new Map(linkDocs.filter(d=>d.exists).map(d=>[d.id,
    (Array.isArray(d.get('links'))?d.get('links'):[]).filter(x=>
      x&&idOK(x.roleId)&&typeof x.label==='string'&&x.label.length<=90)]));
   const assetKeys=[...new Set([...mapped.values()].flat()
      .map(x=>String(x.assetKey||'')).filter(x=>
       /^(?:(?:specialty|patch)_(?:politie|brandweer|ambulance|depannage)_[a-z0-9_]{1,40}|\d{15,22}_[a-z][a-z0-9_]{0,39})$/.test(x)))].slice(0,300);
   const assetUrls=new Map();
   for(const group of chunks(assetKeys,100)){
    const docs=await db.getAll(...group.map(key=>db.collection(ROLE_ARTWORK_META).doc(key)));
    for(const asset of docs){
     if(!asset.exists||asset.get('active')!==true||!asset.get('version'))continue;
     const key=asset.id,dept=asset.get('department');
     const isSpecialtyAsset=key.includes('_'+dept+'_')&&
      ['patch','specialty'].includes(asset.get('kind'));
     const isLegacyRoleAsset=(asset.get('kind')||'role')==='role'&&
      key.startsWith(String(asset.get('roleId')||'')+'_')&&
      /^(?:\d{15,22})_[a-z][a-z0-9_]{0,39}$/.test(key);
     if(!['politie','brandweer','ambulance','depannage'].includes(dept)||
       !(isSpecialtyAsset||isLegacyRoleAsset))continue;
     assetUrls.set(key,'/api/role-artwork/file/'+key+'?v='+
      encodeURIComponent(asset.get('version')));
    }
   }
   const manual=manualMap(manualSnap.docs);
   const k9Manual=manualMap(k9Snap.docs);
   const motardManual=manualMap(motardSnap.docs);
   const dispManual=manualMap(dispSnap.docs);
   const aeManual=manualMap(aeSnap.docs);
   // Public award projection: no private history, hidden items or revoked medals.
   const decorationEntries=new Map(decorationSnap.docs.map(d=>[d.id,d.get('entries')||[]]));
   const customCatalog=new Map(catalogSnap.docs.map(d=>[d.id,customCatalogItem(d)])
    .filter(([,item])=>Boolean(item)));
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
   // A qualification can have a shared patch WITHOUT a Discord role.
   // Shared patches are only shown for a qualification already present in the
   // Sheets/manual personnel register or the controlled organogram.
   // Role-specific versions require a recent guild-verified role snapshot.
   const mappedPatches=(p,merged)=>{
    const identity=roles.entries.get(p.personId),now=Date.now();
    const trustworthy=identity&&identity.guildId===process.env.DISCORD_GUILD_ID&&
      Number.isSafeInteger(identity.verifiedAt)&&
      identity.verifiedAt<=now+60000&&now-identity.verifiedAt<=7*86400000&&
      Array.isArray(identity.roleIds)&&identity.roleIds.every(idOK);
    const verified=new Set(trustworthy?identity.roleIds:[]);
    const active=new Set(merged.specialties||[]);
    const normalizedLabel=label=>{
      const aliases={'Motor':'MOTARD','Motard':'MOTARD','Semi-ano.':'SEMI ANONIEM',
       'Semi-anoniem':'SEMI ANONIEM','Dispatch':'DISP','Radio BM':'RADIO/BM',
       'Signalisatie':'SIGNALISATIE','SIV/WPR':'SIGNALISATIE','K-9':'K9'};
      return aliases[label]||label;
    };
    const all=mapped.get(p.dept)||[];
    const valid=x=>assetUrls.has(x.assetKey)&&
      !['Nee','Niet ingevuld','ONTSLAG','GESCHORST','BLACKLISTED'].includes(x.value);
    const rolespecific=all.filter(x=>x.roleId&&verified.has(x.roleId)&&valid(x));
    const manual=all.filter(x=>!x.roleId&&valid(x)&&
      active.has(normalizedLabel(x.label))&&
      !rolespecific.some(y=>normalizedLabel(y.label)===normalizedLabel(x.label)));
    return [...rolespecific,...manual].map(x=>({
      label:x.label,level:String(x.level||x.value||'').slice(0,45),
      imageUrl:assetUrls.get(x.assetKey),
      source:x.roleId?'discord':'registered'
    })).slice(0,20);
   };
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
     const motardAuto=verifiedMotardDisplayRole(roles.entries.get(p.personId),process.env.DISCORD_GUILD_ID);
     merged.motardRole=effectiveMotardDisplayRole(motardManual.get(p.personId)?.role||'',motardAuto);
     // Preserve existing member/instructor displays where no explicit
     // MOTARD role was ever stored. Never infer an IO trainee as full.
     if(!merged.motardRole&&merged.specialties.includes('MOTARD'))
      merged.motardRole=merged.instructorSpecialties.includes('MOTARD')?'instructeur':'volwaardig';
     if(merged.motardRole&&!merged.specialties.includes('MOTARD'))merged.specialties.push('MOTARD');
     // Audited manual AE display level supplements (never impersonates) verified Discord.
     const chosenAE=String(aeManual.get(p.personId)?.role||'');
     if(AE_MANUAL_LEVELS.has(chosenAE)){
      merged.aeManual=chosenAE;
      merged.aeRoles=[...new Set([...(merged.aeRoles||[]),chosenAE])];
      merged.aeTeamleader=merged.aeRoles.includes('teamleader');
      merged.aeRole=merged.aeTeamleader?'teamleader':
       merged.aeRoles.includes('instructeur')?'instructeur':
       merged.aeRoles.includes('ae_t')?'ae_t':'ae_i';
      if(!merged.specialties.includes('AE'))merged.specialties.push('AE');
     }
     const dispAuto=verifiedDispDisplayRole(roles.entries.get(p.personId),process.env.DISCORD_GUILD_ID);
     merged.dispRole=effectiveDispDisplayRole(dispManual.get(p.personId)?.role||'',dispAuto);
     // Existing DISP members without level metadata remain visible, but
     // confirmed Dispatch Selectie roles are never inferred as full members.
     if(!merged.dispRole&&merged.specialties.includes('DISP'))
      merged.dispRole=merged.instructorSpecialties.includes('DISP')?'instructeur':'volwaardig';
     if(merged.dispRole&&!merged.specialties.includes('DISP'))merged.specialties.push('DISP');
    }
    // Verified, approved role mappings can add a *display-only*
    // specialization to the organogram, even when the legacy sheet was
    // not updated yet. The personnel dossier remains unchanged.
    const specialtyPatches=mappedPatches(p,merged);
    for(const link of specialtyPatches){
     if(!merged.specialties.includes(link.label))merged.specialties.push(link.label);
    }
    // Reuse only the public police status already visible in the member
    // personnel list. No leave history, dossier fields or sensitive data.
    const display={...safePublic(merged),
     specialtyPatches,
     awards:p.dept==='politie'?publicDecorations(
      decorationEntries.get(awardKey(p.dept,p.personId))||[],undefined,customCatalog):[],
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
 // A personnel-card-only refresh: check the actual Discord guild member via the bot.
 // No client-supplied Discord ID, guild, role list or authorization is accepted.
 // Only safe, display-specific levels and vetted patch URLs are returned.
 const specialtyCheckCache=new Map();
 app.get('/api/organogram/specialty-check/:dept/:call',requireUser,async(req,res)=>{
  const dept=req.params.dept,call=String(req.params.call||'');
  if(dept!=='politie'||!/^([a-z]{1,6}[- ]?)?\d{3}$/i.test(call))
   return res.status(400).json({error:'Ongeldige personeelsselectie'});
  try{
   const snapshot=await getSnapshot();
   // Read-only display verification may run on a uniquely matched roster row
   // even when the obsolete Sheets refresh is marked stale.
   const targets=snapshot.data.filter(p=>validRow(p)&&p.dept===dept&&p.call===call);
   if(targets.length!==1)return res.status(404).json({error:'Geen uniek personeelslid gevonden'});
   const staff=targets[0],key=String(process.env.DISCORD_GUILD_ID||'')+':'+staff.personId;
   let cached=specialtyCheckCache.get(key),now=Date.now();
   if(!cached||cached.until<=now){
    const live=await verifyLiveSpecialtyRoles(staff.personId);
    cached={live,until:now+(live.verified?60000:15000)};
    specialtyCheckCache.set(key,cached);
    if(specialtyCheckCache.size>500){
     for(const [k,v] of specialtyCheckCache)if(v.until<=now)specialtyCheckCache.delete(k);
     if(specialtyCheckCache.size>500)specialtyCheckCache.delete(specialtyCheckCache.keys().next().value);
    }
   }
   if(!cached.live.verified||cached.live.status==='not_in_guild')
    return res.json({verified:false,status:cached.live.status,displayOnly:true});
   const identity={guildId:process.env.DISCORD_GUILD_ID,verifiedAt:Date.now(),
    roleIds:cached.live.roleIds};
   const synced=verifiedSyncRoles(identity,'politie',process.env.DISCORD_GUILD_ID);
   const motardRole=verifiedMotardDisplayRole(identity,process.env.DISCORD_GUILD_ID);
   const dispRole=verifiedDispDisplayRole(identity,process.env.DISCORD_GUILD_ID);
   const roleIds=new Set(identity.roleIds);
   const db=store();
   const linksDoc=await db.collection(SPECIALTY_ROLE_LINKS).doc('politie').get();
   const links=defaultSpecialtyRoleLinks('politie',
    Array.isArray(linksDoc.get('links'))?linksDoc.get('links'):[],
    linksDoc.get('presetVersion')===POLICE_PATCH_PRESET_VERSION);
   const normalizeLabel=label=>({
    'Motor':'MOTARD','Motard':'MOTARD','Dispatch':'DISP',
    'Terreinondersteuner':'TO','Radio BM':'RADIO/BM',
    'Semi-ano.':'SEMI ANONIEM','Signalisatie':'SIGNALISATIE'
   })[label]||label;
   const hasFullRago=roleIds.has('1309532437977497700')||
    roleIds.has('1393050551188721865');
   const priority={Stage:1,AANGEMELD:1,Ja:2,LEIDING:3,INSTRUCTEUR:4};
   const selected=new Map();
   for(const link of links){
    if(!link||!roleIds.has(link.roleId)||!Object.hasOwn(priority,link.value))continue;
    const label=normalizeLabel(link.label);
    if(label==='RAGO'&&link.value==='AANGEMELD'&&hasFullRago)continue;
    const chosen=selected.get(label);
    if(!chosen||priority[link.value]>priority[chosen.value])selected.set(label,link);
   }
   const patches=[];
   for(const [label,link] of selected){
    const key=String(link.assetKey||'');
    if(!/^(?:(?:specialty|patch)_politie_[a-z0-9_]{1,40}|\d{15,22}_[a-z][a-z0-9_]{0,39})$/.test(key))continue;
    const asset=await db.collection(ROLE_ARTWORK_META).doc(key).get();
    const imageLabel=String(asset.get('label')||'');
    const isRoleImage=/^\d{15,22}_/.test(key);
    if(!asset.exists||asset.get('active')!==true||
      asset.get('department')!=='politie'||!asset.get('version')||
      !(['patch','specialty'].includes(asset.get('kind'))||
        isRoleImage&&key.startsWith(link.roleId+'_')&&
        (asset.get('kind')||'role')==='role')||
      label==='RADIO/BM'&&/burgermelding/i.test(imageLabel))
     continue;
    patches.push({label,level:String(link.level||link.value||'').slice(0,45),
     imageUrl:'/api/role-artwork/file/'+key+'?v='+encodeURIComponent(asset.get('version')),
     source:'discord'});
   }
   const specialties=[...new Set([
    ...synced.specialties,
    ...[...selected.entries()].map(([label,link])=>
     label==='RAGO'&&link.value==='AANGEMELD'?'RAGO-IO':label)
   ])].filter(x=>x!=='RAGO-IO'||!hasFullRago).slice(0,20);
   res.set('Cache-Control','private, no-store');
   return res.json({verified:true,status:'ok',displayOnly:true,
    aeRole:synced.aeRole,aeRoles:synced.aeRoles,
    motardRole:motardRole||'',dispRole:dispRole||'',
    specialties,patches});
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
 // Targeted Discord check for one real police employee. The caller's
 // authenticated OFF/KL role is checked on every request; never trust a
 // posted guild, role list, Discord ID or any other client-supplied data.
 app.post('/api/organogram/k9/:personId/verify',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!canEditK9Display(req.bpd))
   return res.status(403).json({error:'Alleen politie Officierenkader en Korpsleiding'});
  const personId=String(req.params.personId||'');
  if(!idOK(personId))return res.status(400).json({error:'Ongeldig personeelslid'});
  try{
   const snapshot=await getSnapshot();
   if(!snapshot.data.some(p=>validRow(p)&&p.dept==='politie'&&p.personId===personId))
    return res.status(404).json({error:'Geen gekoppeld politielid'});
   const now=Date.now(),key=req.bpd.uid+':'+personId;
   const prev=k9VerificationCooldown.get(key);
   if(prev&&now-prev<45000)
    return res.status(429).json({error:'Deze Discord-controle is net uitgevoerd. Probeer na 45 seconden opnieuw.'});
   k9VerificationCooldown.set(key,now);
   if(k9VerificationCooldown.size>1000){
    for(const [k,t] of k9VerificationCooldown)if(now-t>45000)k9VerificationCooldown.delete(k);
    if(k9VerificationCooldown.size>1000)
     k9VerificationCooldown.delete(k9VerificationCooldown.keys().next().value);
   }
   const result=await verifyK9DisplayRoleNow(personId);
   return res.json({checked:result.verified,status:result.status,
    automatic:result.verified?result.role:'',
    displayOnly:true,permissionsChanged:false});
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

 // This editor is separate from the technical board/cadre placement endpoints.
 // Only genuine Discord-authenticated police OFF/KL may read or change it.
 app.get('/api/organogram/police-specialties/admin',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!canEditK9Display(req.bpd))
   return res.status(403).json({error:'Alleen politie Officierenkader en Korpsleiding'});
  try{
   const db=store(),snapshot=await getSnapshot();
   const people=snapshot.data.filter(p=>validRow(p)&&p.dept==='politie').slice(0,1200);
   const [placements,k9Snap,motardSnap,dispSnap,aeSnap,identities]=await Promise.all([
    db.collection(COLLECTION).limit(1500).get(),
    db.collection(K9_ROLE_COLLECTION).limit(1500).get(),
    db.collection(MOTARD_DISPLAY_COLLECTION).limit(1500).get(),
    db.collection(DISP_DISPLAY_COLLECTION).limit(1500).get(),
    db.collection(AE_MANUAL_DISPLAY_COLLECTION).limit(1500).get(),
    identityMap(db,people.map(p=>p.personId),process.env.DISCORD_GUILD_ID)
   ]);
   if(placements.size>=1500||k9Snap.size>=1500)throw fault(503,'Registerlimiet bereikt');
   const pm=manualMap(placements.docs),km=manualMap(k9Snap.docs),mm=manualMap(motardSnap.docs),dm=manualMap(dispSnap.docs),am=manualMap(aeSnap.docs);
   return res.json({displayOnly:true,canEdit:true,specialties:SPECIALTIES.politie,
    people:people.map(p=>{
     const v=manualDisplay(pm.get(personKey('politie',p.personId)),'politie');
     const verified=verifiedSyncRoles(identities.entries.get(p.personId),'politie',process.env.DISCORD_GUILD_ID);
     return {personId:p.personId,name:safeName(p.name),
      aeRole:verified.aeRole,aeRoles:verified.aeRoles,aeTeamleader:verified.aeTeamleader,
      aeManual:AE_MANUAL_LEVELS.has(am.get(p.personId)?.role)?am.get(p.personId).role:'',
      call:String(p.call||'').slice(0,24),
      specialties:v?.specialties||[],
      instructorSpecialties:v?.instructorSpecialties||[],
      teacherSpecialties:v?.teacherSpecialties||[],
      k9Manual:km.get(p.personId)?.role||'',
      k9Automatic:verifiedK9DisplayRole(identities.entries.get(p.personId),
       process.env.DISCORD_GUILD_ID),
      motardManual:mm.get(p.personId)?.role||'',
      motardAutomatic:verifiedMotardDisplayRole(identities.entries.get(p.personId),
       process.env.DISCORD_GUILD_ID),
      dispManual:dm.get(p.personId)?.role||'',
      dispAutomatic:verifiedDispDisplayRole(identities.entries.get(p.personId),
       process.env.DISCORD_GUILD_ID)};
    })});
  }catch(e){return respond(res,e)}
 });
 app.put('/api/organogram/police-specialties/:personId',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!canEditK9Display(req.bpd))
   return res.status(403).json({error:'Alleen politie Officierenkader en Korpsleiding'});
  const personId=String(req.params.personId||'');
  if(!idOK(personId))return res.status(400).json({error:'Ongeldig personeelslid'});
  let values;
  try{values=validatePoliceSpecialtyEdit(req.body)}
  catch(e){return res.status(400).json({error:e.message})}
  try{
   const snapshot=await getSnapshot();
   if(snapshot.stale)throw fault(409,'Personeelsbron verouderd: niet veilig om te wijzigen');
   if(!snapshot.data.some(p=>validRow(p)&&p.dept==='politie'&&p.personId===personId))
    return res.status(409).json({error:'Geen gekoppeld politielid'});
   const db=store(),ref=db.collection(COLLECTION).doc(personKey('politie',personId));
   const k9Ref=db.collection(K9_ROLE_COLLECTION).doc(personId);
   const motardRef=db.collection(MOTARD_DISPLAY_COLLECTION).doc(personId);
   const dispRef=db.collection(DISP_DISPLAY_COLLECTION).doc(personId);
   const aeRef=db.collection(AE_MANUAL_DISPLAY_COLLECTION).doc(personId);
   await db.runTransaction(async tx=>{
    const [old,oldK9,oldMotard,oldDisp,oldAE]=await Promise.all([tx.get(ref),tx.get(k9Ref),tx.get(motardRef),tx.get(dispRef),tx.get(aeRef)]);
    const previous=rawDisplay(old);
    const preserve=manualDisplay(old.data(),'politie')||DEFAULT_PLACEMENT;
    const next=validatePlacement({...preserve,
     specialties:values.specialties,instructorSpecialties:values.instructorSpecialties,
     teacherSpecialties:values.teacherSpecialties,reason:values.reason},'politie');
    tx.set(ref,{...(old.data()||{}),dept:'politie',personId,status:'active',
     boardRole:next.boardRole,leadershipTier:next.leadershipTier,
     displayOrder:next.displayOrder,teachingRoles:next.teachingRoles,
     displayLabels:next.displayLabels,specialties:next.specialties,
     instructorSpecialties:next.instructorSpecialties,
     teacherSpecialties:next.teacherSpecialties,undo:previous,
     updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid,displayOnly:true});
    tx.create(ref.collection('audit').doc(),{action:'police_specialty_display',
     previous:{specialties:previous.specialties,
      instructorSpecialties:previous.instructorSpecialties,
      teacherSpecialties:previous.teacherSpecialties},
     next:{specialties:values.specialties,
      instructorSpecialties:values.instructorSpecialties,
      teacherSpecialties:values.teacherSpecialties},
     reason:values.reason,actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
    const oldRole=oldK9.exists?oldK9.get('role')||'':'';
    if(oldRole!==values.k9Role){
     tx.set(k9Ref,{dept:'politie',personId,role:values.k9Role,
      updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid,
      displayOnly:true});
     tx.create(k9Ref.collection('audit').doc(),{action:'k9_display_role',
      previous:oldRole,next:values.k9Role,reason:values.reason,
      actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
    }
    const previousMotardRole=oldMotard.exists?oldMotard.get('role')||'':'';
    if(previousMotardRole!==values.motardRole){
     tx.set(motardRef,{dept:'politie',personId,role:values.motardRole,
      updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid,
      displayOnly:true});
     tx.create(motardRef.collection('audit').doc(),{action:'motard_display_role',
      previous:previousMotardRole,next:values.motardRole,reason:values.reason,
      actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
    }
    const previousAERole=oldAE.exists?oldAE.get('role')||'':'';
    if(previousAERole!==values.aeRole){
     tx.set(aeRef,{dept:'politie',personId,role:values.aeRole,
      updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid,displayOnly:true});
     tx.create(aeRef.collection('audit').doc(),{action:'ae_display_role',
      previous:previousAERole,next:values.aeRole,reason:values.reason,
      actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
    }
    const previousDispRole=oldDisp.exists?oldDisp.get('role')||'':'';
    if(previousDispRole!==values.dispRole){
     tx.set(dispRef,{dept:'politie',personId,role:values.dispRole,
      updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid,displayOnly:true});
     tx.create(dispRef.collection('audit').doc(),{action:'disp_display_role',
      previous:previousDispRole,next:values.dispRole,reason:values.reason,
      actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
    }
   });
   syncCache.expires=0;
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
