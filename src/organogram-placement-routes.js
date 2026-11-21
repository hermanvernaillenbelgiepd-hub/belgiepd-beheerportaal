import {retainPoliceFunctionOverrides} from './specialty-function-overrides.js';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {USER_COLLECTION} from './user-access.js';
import {activeManualCitizenCouncil} from './citizen-dossier-policy.js';
import {SPECIALTY_ROLE_LINKS} from './specialty-role-link-routes.js';
import {ROLE_ARTWORK_META} from './role-artwork-routes.js';
import {PERSON_SPECIALTY_PATCH_COLLECTION,overlayPersonalSpecialtyArtwork,personPatchKey}
 from './person-specialty-artwork-policy.js';
import {MID_ORDER_COLLECTION,callMiddleSeries,validMidOrder}
 from './organogram-mid-order-policy.js';
import {COLLECTION,DEPTS,DISPLAY_DEPTS,SPECIALTIES,LEADERSHIP_LEVELS,personKey,
 validatePlacement,validatePoliceSpecialtyEdit,manualDisplay,verifiedSyncRoles,registeredFireBasicTraining,
 AE_DISCORD_ROLES,mergePlacement,verifiedDepannageOrganogramGroups,canManagePlacements
} from './organogram-placement-policy.js';
import {organogramReekshoofdTitle,policeOrganogramDossierUrl} from './organogram-profile-display.js';
import {K9_ROLE_COLLECTION,K9_ROLE_IDS,canEditK9Display,verifiedK9DisplayRole,
 validManualK9Role,effectiveK9DisplayRole} from './k9-display-role.js';
import {refreshK9DisplayRoles,knownK9Candidate,verifyK9DisplayRoleNow} from './k9-live-discord-sync.js';
import {MOTARD_DISPLAY_COLLECTION,verifiedMotardDisplayRole,effectiveMotardDisplayRole} from './motard-display-role.js';
import {DISP_DISPLAY_COLLECTION,verifiedDispDisplayRole,effectiveDispDisplayRole} from './disp-display-role.js';
import {verifyLiveSpecialtyRoles} from './specialty-live-discord-sync.js';
import {defaultSpecialtyRoleLinks,POLICE_PATCH_PRESET_VERSION,
 BW_LOG_SIG_ROLE_ID,BW_LOG_SIG_SPECIALTIES,fireSpecialtyAssetKeys,
 knownFireRoleSpecialty,normalizedSpecialtyLinkLabel,knownDepannageRoleSpecialty,
 depannageSpecialtyAssetKeys,AMBULANCE_ROLE_PATCH_PRESETS,ambulanceSpecialtyAssetKeys,
 knownAmbulanceRoleSpecialty,verifiedAzlsFunctions} from './specialty-role-presets.js';
import {getBelgiumPdDisplayRoles,organogramDisplayIdentityMap,diagnoseOrganogramRoleLinks,exactApiDisplayRoles} from './bpd-discord-users-display.js';
import {projectCitizenOrganogram,projectVerifiedCouncilAccounts,councilRoleIds,citizenOrganogramGroups} from './burger-organogram-projection.js';
import {roleArtworkCandidateKeys,resolveSpecialtyArtworkKey,registeredAzlsPatchEligible}
 from './specialty-artwork-resolver.js';
import {ROSTER_COLUMN_COLLECTION,rosterConfig} from './roster-column-config.js';
import {PERSONNEL_DECORATIONS_COLLECTION,PERSONNEL_DECORATION_CATALOG_COLLECTION,
 awardKey,publicDecorations,decorationCatalogExtras} from './personnel-decoration-policy.js';

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
 instructorSpecialties:[],teacherSpecialties:[],functionOverrides:{}});
const rawDisplay=snap=>snap?.exists?{
 boardRole:snap.get('boardRole')||'none',
 leadershipTier:snap.get('leadershipTier')||'none',
 displayOrder:snap.get('displayOrder')||0,
 teachingRoles:snap.get('teachingRoles')||[],
 displayLabels:snap.get('displayLabels')||[],
 specialties:snap.get('specialties')||[],
 instructorSpecialties:snap.get('instructorSpecialties')||[],
 teacherSpecialties:snap.get('teacherSpecialties')||[],
 functionOverrides:snap.get('functionOverrides')||{}
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
 teacherSpecialties:p.teacherSpecialties,groupLeaderSpecialties:p.groupLeaderSpecialties||[],
 functionOverrides:p.functionOverrides||{},k9Role:p.k9Role||'',motardRole:p.motardRole||'',dispRole:p.dispRole||'',
 aeRole:p.aeRole||'',aeManual:p.aeManual||'',aeRoles:Array.isArray(p.aeRoles)?p.aeRoles:[],
 aeTeamleader:p.aeTeamleader===true,boardRole:p.boardRole,leadershipTier:p.leadershipTier,displayOrder:p.displayOrder,source:p.source
});
export function installOrganogramPlacementRoutes(app,{requireUser,getSnapshot}){
 const store=()=>getFirestore();
 const k9VerificationCooldown=new Map();
  const aeProofCache=new Map();
  let lastApiMatchReport=0;
 // Admin-only reconciliation: never expose unmatched IDs on public pages.
 app.get('/api/organogram/discord-links/admin',requireUser,manager,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  res.set('X-Content-Type-Options','nosniff');
  try{
   const snapshot=await getSnapshot();
   const people=snapshot.data.filter(p=>validRow(p)).slice(0,1200);
   const upstream=await getBelgiumPdDisplayRoles();
   return res.json({...diagnoseOrganogramRoleLinks(people,upstream),
    stale:snapshot.stale===true});
  }catch(error){return respond(res,error);}
 });
 // All returned attributes are display-only. Public output NEVER includes
 // Discord identifiers, access grants, source documents or audit history.
 app.get('/api/organogram/hierarchie',requireUser,async(_req,res)=>{
  try{
   const db=store(),snapshot=await getSnapshot();
   let roster=snapshot.data.filter(p=>validRow(p)).slice(0,1200);
   // Audited and still-approved Burgerraad: a display-only council group,
   // never a rank or operational authority from the diagram itself.
   const citizenIds=[...new Set(roster.filter(p=>p.dept==='burger')
      .map(p=>p.personId).filter(idOK))].slice(0,200);
   const citizenDocs=citizenIds.length?
     await db.getAll(...citizenIds.map(id=>db.collection(USER_COLLECTION).doc(id))):[];
   const manualCouncilIds=new Set(citizenDocs.filter(doc=>
     activeManualCitizenCouncil(doc.data(),doc.id)).map(doc=>doc.id));
   const [manualSnap,k9Snap,motardSnap,dispSnap,aeSnap,decorationSnap,catalogSnap,personPatchSnap]=await Promise.all([
    db.collection(COLLECTION).limit(1500).get(),
    db.collection(K9_ROLE_COLLECTION).limit(1500).get(),
    db.collection(MOTARD_DISPLAY_COLLECTION).limit(1500).get(),
    db.collection(DISP_DISPLAY_COLLECTION).limit(1500).get(),
    db.collection(AE_MANUAL_DISPLAY_COLLECTION).limit(1500).get(),
    db.collection(PERSONNEL_DECORATIONS_COLLECTION).where('dept','==','politie').limit(500).get(),
    db.collection(PERSONNEL_DECORATION_CATALOG_COLLECTION).limit(120).get(),
    db.collection(PERSON_SPECIALTY_PATCH_COLLECTION).limit(1200).get()
   ]);
   if(personPatchSnap.size>=1200)
    return res.status(503).json({error:'Limiet persoonlijke patchkoppelingen bereikt'});
   const personalBySubject=new Map();
   for(const doc of personPatchSnap.docs){
    const item=doc.data();
    if(item.active!==true||!idOK(item.personId)||!DEPTS.includes(item.department)||
       typeof item.specialty!=='string'||typeof item.sourceArtworkKey!=='string')continue;
    const key=item.department+':'+item.personId,group=personalBySubject.get(key)||[];
    group.push(item);personalBySubject.set(key,group);
   }
   if(manualSnap.size>=1500)return res.status(503).json({error:'Organogramregisterlimiet bereikt'});
   // The per-service mapping is visual-only. It can select a library patch
   // for a recently verified Discord role without changing personnel rights.
   const registries=['politie','brandweer','ambulance','depannage'];
   const [linkDocs,customDocs]=await Promise.all([
    db.getAll(...registries.map(dept=>db.collection(SPECIALTY_ROLE_LINKS).doc(dept))),
    db.getAll(...registries.map(dept=>db.collection(ROSTER_COLUMN_COLLECTION).doc(dept)))
   ]);
   // Reuse the one existing custom-specialty catalog; no duplicated registry.
   const approvedAdditions=Object.fromEntries(customDocs.map(d=>[
    d.id,rosterConfig(d.data()).customSpecialties.map(x=>x.label)
   ]));
   const mapped=new Map(linkDocs.map(d=>[d.id,
    defaultSpecialtyRoleLinks(d.id,
      (Array.isArray(d.get('links'))?d.get('links'):[]).filter(x=>
       x&&(x.roleId===''||idOK(x.roleId))&&typeof x.label==='string'&&x.label.length<=90),
      d.get('presetVersion')===POLICE_PATCH_PRESET_VERSION)]));
   const assetKeys=[...new Set([
    ...[...mapped.values()].flat().flatMap(x=>[
     String(x.assetKey||''),...roleArtworkCandidateKeys(x)]),
    ...['Logistiek','Signalisatie','Ladderwagen','Bosbestrijding','Duiker',
      'RED team','Gevaarlijke stoffen'].flatMap(fireSpecialtyAssetKeys),
    ...AMBULANCE_ROLE_PATCH_PRESETS.flatMap(x=>ambulanceSpecialtyAssetKeys(x.label)),
    ...['F.A.S.T','LSRA','CRANE'].flatMap(depannageSpecialtyAssetKeys),
    ...[...personalBySubject.values()].flat().map(x=>x.sourceArtworkKey)
   ].filter(x=>/^(?:(?:rank|uniform|specialty|patch|helmet|profession|logo|pictogram)_(?:politie|brandweer|ambulance|depannage)_[a-z0-9_]{1,40}|\d{15,22}_[a-z][a-z0-9_]{0,39})$/.test(x)))].slice(0,450);
   const assetUrls=new Map();
   for(const group of chunks(assetKeys,100)){
    const docs=await db.getAll(...group.map(key=>db.collection(ROLE_ARTWORK_META).doc(key)));
    for(const asset of docs){
     if(!asset.exists||asset.get('active')!==true||!asset.get('version'))continue;
     const key=asset.id,dept=asset.get('department');
     const isSpecialtyAsset=key.includes('_'+dept+'_')&&
      ['rank','uniform','specialty','patch','helmet','profession','logo','pictogram']
       .includes(asset.get('kind'));
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
   const customCatalog=decorationCatalogExtras(catalogSnap.docs);
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
   const [cachedOAuthRoles,upstream]=await Promise.all([
    identityMap(db,peopleIds,process.env.DISCORD_GUILD_ID),
    getBelgiumPdDisplayRoles()
   ]);
   // Project verified Burger/Burger IO/Burgerraad memberships onto an existing
   // service identity, even when BURGERS has no separate personnel record.
   // This only extends the public organogram response; it cannot create a
   // Burger dossier, authorization grant or persisted personnel entry.
   roster=projectCitizenOrganogram(roster,upstream,cachedOAuthRoles,
    process.env.DISCORD_GUILD_ID);
   // A verified Burgerraad role may belong to an approved portal account
   // with no legacy personnel fiche. Look up only those exact council IDs.
   // Do not persist anything or assign dossier/leadership permissions.
   const councilIds=councilRoleIds(upstream);
   const councilAccounts=new Map();
   for(const batch of chunks(councilIds,100)){
    const docs=await db.getAll(...batch.map(id=>db.collection(USER_COLLECTION).doc(id)));
    for(const doc of docs)if(doc.exists&&doc.get('status')==='approved')
     councilAccounts.set(doc.id,doc.data());
   }
   roster=projectVerifiedCouncilAccounts(roster,upstream,councilAccounts);
   if(upstream.status==='ok')
    console.info('Burgerraad rolcontrole (alleen aantallen):',
     'discord='+councilIds.length,
     'met_gekoppeld_profiel='+roster.filter(p=>p.dept==='burger'&&
      councilIds.includes(p.personId)).length);
   // ONLY the public organogram presentation uses the upstream API.
   // Login, dossier permissions and persisted Firebase role evidence remain
   // independent of this role overlay.
   const match=organogramDisplayIdentityMap(cachedOAuthRoles,upstream,roster,
    process.env.DISCORD_GUILD_ID);
   const roles={...cachedOAuthRoles,entries:match.entries};
   // Aggregate-only diagnostic for an authenticated organogram request.
   // Never log Discord IDs, names, role IDs, or individual matches.
   if(upstream.status==='ok'&&Date.now()-lastApiMatchReport>300000){
    lastApiMatchReport=Date.now();
    console.info('BelgiumPD organogram-rolkoppeling:',
     'personeelsfiches='+roster.length,'gematcht='+match.matches);
   }
   const prepared=roster.map(p=>{
    const key=personKey(p.dept,p.personId);
    const override=manualDisplay(manual.get(key),p.dept);
    const synced=verifiedSyncRoles(roles.entries.get(p.personId),p.dept,process.env.DISCORD_GUILD_ID);
    // A roster display source may confirm a specialization but may NEVER
    // independently create a bestuur appointment; retain existing evidence.
    if(roles.entries.get(p.personId)?.displaySource==='bpd-users-api'){
     const original=verifiedSyncRoles(cachedOAuthRoles.entries.get(p.personId),
      p.dept,process.env.DISCORD_GUILD_ID);
     synced.boardRole=original.boardRole;
    }
    return {p,merged:mergePlacement(p,override,synced,approvedAdditions[p.dept]||[])};
   });
   // A qualification can have a shared patch WITHOUT a Discord role.
   // Shared patches are only shown for a qualification already present in the
   // Sheets/manual personnel register or the controlled organogram.
   // Role-specific versions require a recent guild-verified role snapshot.
   // Previously authenticated Discord snapshots can miss a newly promoted
    // AE Teamleader. Verify known AE members directly with the guild bot
    // for organogram presentation only; never persist or grant access.
    const knownAERoles=new Set(Object.values(AE_DISCORD_ROLES));
    const aeCandidates=prepared.filter(({p,merged})=>p.dept==='politie'&&(
      merged.specialties.includes('AE')||
      AE_MANUAL_LEVELS.has(aeManual.get(p.personId)?.role)||
      (Array.isArray(roles.entries.get(p.personId)?.roleIds)&&
       roles.entries.get(p.personId).roleIds.some(id=>knownAERoles.has(id)))
    )).map(({p})=>p.personId).slice(0,48);
    const liveAE=new Map();
    let aeIndex=0;
    await Promise.all(Array.from({length:Math.min(8,aeCandidates.length)},async()=>{
     while(aeIndex<aeCandidates.length){
      const memberId=aeCandidates[aeIndex++],cacheKey=process.env.DISCORD_GUILD_ID+':'+memberId;
      const cached=aeProofCache.get(cacheKey),now=Date.now();
      let proof=cached&&cached.until>now?cached.proof:null;
      if(!proof){
       proof=await verifyLiveSpecialtyRoles(memberId);
       aeProofCache.set(cacheKey,{proof,until:Date.now()+(proof.verified?120000:20000)});
      }
      // A verified absent role also clears a stale automatic Teamleader.
      if(proof.verified)liveAE.set(memberId,proof.roleIds);
     }
    }));
    if(aeProofCache.size>500){
     for(const [key,entry] of aeProofCache)if(entry.until<Date.now())aeProofCache.delete(key);
    }
    const mappedPatches=(p,merged)=>{
    const identity=roles.entries.get(p.personId),now=Date.now();
    const trustworthy=identity&&identity.guildId===process.env.DISCORD_GUILD_ID&&
      Number.isSafeInteger(identity.verifiedAt)&&
      identity.verifiedAt<=now+60000&&now-identity.verifiedAt<=7*86400000&&
      Array.isArray(identity.roleIds)&&identity.roleIds.every(idOK);
    const verified=new Set(liveAE.has(p.personId)?liveAE.get(p.personId):(trustworthy?identity.roleIds:[]));
    const active=new Set(merged.specialties||[]);
    const normalizedLabel=label=>normalizedSpecialtyLinkLabel(p.dept,label);
    const all=mapped.get(p.dept)||[];
    const activeRole=x=>!['Nee','Niet ingevuld','ONTSLAG','GESCHORST','BLACKLISTED'].includes(x.value);
    const curatedFire=x=>p.dept==='brandweer'&&
      knownFireRoleSpecialty(x.roleId,x.label);
    const curatedAmbulance=x=>p.dept==='ambulance'&&
      knownAmbulanceRoleSpecialty(x.roleId,x.label);
    const curatedDepannage=x=>p.dept==='depannage'&&
      knownDepannageRoleSpecialty(x.roleId,x.label);
    // Explicit library choices win. When a saved link lacks an assetKey,
    // also try the exact Discord-role artwork slot before generic icons.
    // The one shared BW LOG/SIG role must NOT reuse one role patch for both.
    const assetFor=x=>resolveSpecialtyArtworkKey(x,assetUrls,
      curatedFire(x)?fireSpecialtyAssetKeys(x.label):
      curatedAmbulance(x)?ambulanceSpecialtyAssetKeys(x.label):
      curatedDepannage(x)?depannageSpecialtyAssetKeys(x.label):[],
      {allowRoleFallback:!(p.dept==='brandweer'&&
       x.roleId===BW_LOG_SIG_ROLE_ID&&BW_LOG_SIG_SPECIALTIES.includes(x.label))});
    const valid=x=>assetUrls.has(assetFor(x))&&activeRole(x);
    // A verified role shows its qualification even before artwork is
    // uploaded. Never infer a medical qualification from leadership alone.
    // Verified specialization roles must be displayed even without artwork.
    // Keep the highest verified level if trainee and full roles coexist.
    const levelRank=x=>x.roleId===AE_DISCORD_ROLES.teamleader?5:
     ({'Stage':1,'AANGEMELD':1,'Ja':2,'LEIDING':4,'INSTRUCTEUR':3}[x.value]||2);
    const roleChoices=new Map();
    for(const link of all){
     if(!link.roleId||!verified.has(link.roleId)||!activeRole(link))continue;
     const label=normalizedLabel(link.label);
     if(!SPECIALTIES[p.dept]?.includes(label)&&
       !approvedAdditions[p.dept]?.includes(label))continue;
     const old=roleChoices.get(label);
     if(!old||levelRank(link)>levelRank(old))roleChoices.set(label,link);
    }
    const rolespecific=[...roleChoices.values()];
    // An explicitly recorded AE display level must also select the matching
    // library artwork. Registering a mapping is not the same as giving a role.
    const aeRoleIds={ae_i:'1309542190409580594',ae_t:'1310674604821581894',
     teamleader:'1337775768083632158',instructeur:'1337156006597103746'};
    const displayAE=merged.aeRole||'';
    const aePatch=aeRoleIds[displayAE]?all.find(x=>
     x.roleId===aeRoleIds[displayAE]&&normalizedLabel(x.label)==='AE'&&
     activeRole(x)&&(merged.aeManual===displayAE||verified.has(x.roleId))):null;
    const manual=all.filter(x=>!x.roleId&&valid(x)&&
      active.has(normalizedLabel(x.label))&&
      !(displayAE&&normalizedLabel(x.label)==='AE')&&
      !rolespecific.some(y=>normalizedLabel(y.label)===normalizedLabel(x.label)));
    // A registered Brandweer qualification can show its linked generic
    // artwork when Discord verification is temporarily unavailable.
    // This does NOT imply the mapped role or create a qualification.
    const existingFireArtwork=[];
    if(p.dept==='brandweer'){
     const handled=new Set([...rolespecific,...manual].map(x=>normalizedLabel(x.label)));
     for(const link of all){
      const label=normalizedLabel(link.label),key=assetFor(link);
      if(!link.roleId||!active.has(label)||handled.has(label)||!activeRole(link)||
         !/^(?:specialty|patch)_brandweer_[a-z0-9][a-z0-9_]{0,39}$/.test(key)||
         !assetUrls.has(key))continue;
      existingFireArtwork.push({label,level:'',roleId:'',
       imageUrl:assetUrls.get(key),source:'registered'});
      handled.add(label);
     }
    }
    // Already recorded AZLS qualifications may reuse their explicitly chosen
    // general library image even when the corresponding Discord role was not
    // verified. This never asserts the role or any instructor qualification.
    const existingAzlsArtwork=[];
    if(p.dept==='ambulance'){
     const handled=new Set([...rolespecific,...manual]
      .map(x=>normalizedLabel(x.label)));
     for(const link of all){
      const label=normalizedLabel(link.label),key=assetFor(link);
      if(handled.has(label)||!activeRole(link)||
       !registeredAzlsPatchEligible(label,active,link,key,assetUrls))continue;
      existingAzlsArtwork.push({label,level:'',roleId:'',
       imageUrl:assetUrls.get(key),source:'registered'});
      handled.add(label);
     }
    }
    // When an AE level is known, never show an unrelated generic or trainee
    // patch as the teamleader insignia. The UI can use an exact variant,
    // otherwise it shows a clearly labelled placeholder.
    return [...(aePatch?[aePatch]:[]),
      ...rolespecific.filter(x=>!(displayAE&&normalizedLabel(x.label)==='AE')),
      ...manual].map(x=>({
      label:normalizedLabel(x.label),level:String(x.level||x.value||'').slice(0,45),
      roleId:x.roleId||'',imageUrl:assetUrls.get(assetFor(x))||'',
      source:x===aePatch&&merged.aeManual===displayAE?'registered':
       x.roleId?'discord':'registered'
    })).concat(existingFireArtwork,existingAzlsArtwork).slice(0,20);
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
     // Verified live AE functions replace stale automatic OAuth snapshots.
      // Handmatige AE-registraties still apply in the next block.
      if(liveAE.has(p.personId)){
       const currentAE=verifiedSyncRoles({guildId:process.env.DISCORD_GUILD_ID,
        verifiedAt:Date.now(),roleIds:liveAE.get(p.personId)},
        'politie',process.env.DISCORD_GUILD_ID);
       merged.aeRoles=currentAE.aeRoles;
       merged.aeRole=currentAE.aeRole;
       merged.aeTeamleader=currentAE.aeTeamleader;
       if(merged.aeRole&&!merged.specialties.includes('AE'))merged.specialties.push('AE');
      }
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
    const specialtyPatches=overlayPersonalSpecialtyArtwork(
     mappedPatches(p,merged),p,merged,
     personalBySubject.get(p.dept+':'+p.personId)||[],assetUrls,
     normalizedSpecialtyLinkLabel);
    for(const link of specialtyPatches){
     if(!merged.specialties.includes(link.label))merged.specialties.push(link.label);
    }
    // Reuse only the public police status already visible in the member
    // personnel list. No leave history, dossier fields or sensitive data.
    const display={...safePublic(merged),
     // Reeksen come from the actual personnel source; mergePlacement is
     // presentation-only and does not copy source series information.
     series:p.dept==='politie'?String(p.series||'').slice(0,36):'',
     ...(p.dept==='burger'?{burgerGroups:citizenOrganogramGroups(p,(()=>{const identity=roles.entries.get(p.personId),now=Date.now();if(!identity||identity.guildId!==process.env.DISCORD_GUILD_ID||!Number.isSafeInteger(identity.verifiedAt)||identity.verifiedAt>now+60000||now-identity.verifiedAt>7*86400000||!Array.isArray(identity.roleIds))return [];const roleIds=new Set(identity.roleIds);return [['1492485336197234728','Burgerraad'],['1309532438019706966','Burger'],['1398985105254650007','Burger IO']].filter(([id])=>roleIds.has(id)).map(([,label])=>label);})(),manualCouncilIds.has(p.personId))}:{}),
     ...(p.dept==='depannage'?{depannageGroups:verifiedDepannageOrganogramGroups(
      roles.entries.get(p.personId),process.env.DISCORD_GUILD_ID)}:{}),
     specialtyPatches,
     completedFireBasicTraining:registeredFireBasicTraining(p),
     azlsFunctions:p.dept==='ambulance'?
      verifiedAzlsFunctions(roles.entries.get(p.personId),process.env.DISCORD_GUILD_ID):[],
     awards:p.dept==='politie'?publicDecorations(
      decorationEntries.get(awardKey(p.dept,p.personId))||[],undefined,customCatalog):[],
     status:String(p.status||'').trim().slice(0,30),
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
    canManageAE:canEditK9Display(_req.bpd),
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
    // Read-only fallback from the authorized BelgiumPD API, scoped to this
    // unique personnel Discord ID. Never affects access or writes to Firebase.
    // A confirmed Discord 404 is authoritative and does not use this fallback.
    let proof=live;
    if(!live.verified&&live.status!=='not_in_guild'){
     const upstream=await getBelgiumPdDisplayRoles();
     const roles=exactApiDisplayRoles(upstream,staff.personId);
     if(Array.isArray(roles))
      proof={verified:true,status:'ok',roleIds:[...roles],source:'bpd-users-api'};
    }
    cached={live:proof,until:now+(proof.verified?60000:15000)};
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
    // AE-Teamleader outranks AE-Instructeur for the single function patch.
    const linkPriority=link=>link.roleId===AE_DISCORD_ROLES.teamleader&&
     normalizeLabel(link.label)==='AE'?5:(priority[link.value]||0);
   for(const link of links){
    if(!link||!roleIds.has(link.roleId)||!Object.hasOwn(priority,link.value))continue;
    const label=normalizeLabel(link.label);
    if(label==='RAGO'&&link.value==='AANGEMELD'&&hasFullRago)continue;
    const chosen=selected.get(label);
    if(!chosen||linkPriority(link)>linkPriority(chosen))selected.set(label,link);
   }
   const patches=[];
   for(const [label,link] of selected){
    const key=String(link.assetKey||'');
    if(!/^(?:(?:rank|uniform|specialty|patch|helmet|profession|logo|pictogram)_politie_[a-z0-9_]{1,40}|\d{15,22}_[a-z][a-z0-9_]{0,39})$/.test(key))continue;
    const asset=await db.collection(ROLE_ARTWORK_META).doc(key).get();
    const imageLabel=String(asset.get('label')||'');
    const isRoleImage=/^\d{15,22}_/.test(key);
    if(!asset.exists||asset.get('active')!==true||
      asset.get('department')!=='politie'||!asset.get('version')||
      !(['rank','uniform','patch','specialty','helmet','profession','logo','pictogram'].includes(asset.get('kind'))||
        isRoleImage&&key.startsWith(link.roleId+'_')&&
        (asset.get('kind')||'role')==='role')||
      label==='RADIO/BM'&&/burgermelding/i.test(imageLabel))
     continue;
    patches.push({label,level:String(link.level||link.value||'').slice(0,45),
      roleId:link.roleId,
     imageUrl:'/api/role-artwork/file/'+key+'?v='+encodeURIComponent(asset.get('version')),
     source:'discord'});
   }
   const specialties=[...new Set([
    ...synced.specialties,
    ...[...selected.entries()].map(([label,link])=>
     label==='RAGO'&&link.value==='AANGEMELD'?'RAGO-IO':label)
   ])].filter(x=>x!=='RAGO-IO'||!hasFullRago).slice(0,20);
   // The profile's separate live Discord verification MUST reuse the audited
   // visual per-person override. Otherwise it replaces the correct patch with
   // a role image as soon as the profile finishes refreshing.
   // Only existing, independently verified specializations may be displayed.
   const eligible=specialties.filter(label=>SPECIALTIES.politie.includes(label)).slice(0,20);
   const personalDocs=eligible.length?await db.getAll(...eligible.map(label=>
     db.collection(PERSON_SPECIALTY_PATCH_COLLECTION).doc(
      personPatchKey('politie',staff.personId,label)))):[];
   const personalLinks=personalDocs.map(doc=>doc.data()).filter(link=>
     link?.active===true&&link.department==='politie'&&
     link.personId===staff.personId&&eligible.includes(link.specialty)&&
     /^(?:rank|uniform|specialty|patch|helmet|profession|logo|pictogram)_politie_[a-z0-9_]{1,40}$/.test(link.sourceArtworkKey));
   const personalKeys=[...new Set(personalLinks.map(link=>link.sourceArtworkKey))];
   const imageDocs=personalKeys.length?await db.getAll(...personalKeys.map(artKey=>
     db.collection(ROLE_ARTWORK_META).doc(artKey))):[];
   const personalUrls=new Map();
   for(const image of imageDocs){
    const key=image.id;
    if(!image.exists||image.get('active')!==true||
       image.get('department')!=='politie'||!image.get('version')||
       image.get('sourceArtworkKey')||
       !(image.get('storagePath')||image.get('assetId')))continue;
    personalUrls.set(key,'/api/role-artwork/file/'+key+'?v='+
      encodeURIComponent(image.get('version')));
   }
   const profilePatches=overlayPersonalSpecialtyArtwork(
    patches,{dept:'politie',personId:staff.personId},{specialties},
    personalLinks,personalUrls,normalizedSpecialtyLinkLabel);
   res.set('Cache-Control','private, no-store');
   return res.json({verified:true,status:'ok',displayOnly:true,
     verificationSource:cached.live.source||'discord-bot',
    aeRole:synced.aeRole,aeRoles:synced.aeRoles,
    motardRole:motardRole||'',dispRole:dispRole||'',
    specialties,patches:profilePatches});
  }catch(e){return respond(res,e)}
 });
 // Targeted, audited AE presentation correction from an authorized police
 // personnel card. Does not alter Discord, Firebase access grants or the roster.
 app.put('/api/organogram/ae-display/:call',requireUser,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!canEditK9Display(req.bpd))
   return res.status(403).json({error:'Alleen Officierenkader en Korpsleiding'});
  const call=String(req.params.call||''),role=String(req.body?.role??'');
  const reason=String(req.body?.reason??'').trim();
  if(!/^(?:[a-z]{1,6}[- ]?)?\d{3}$/i.test(call)||!['',...AE_MANUAL_LEVELS].includes(role)||
    reason.length<8||reason.length>300)
   return res.status(400).json({error:'Kies een geldige AE-functie en motivering (8-300 tekens)'});
  try{
   const snapshot=await getSnapshot();
   const candidates=snapshot.data.filter(p=>validRow(p)&&
    p.dept==='politie'&&p.call===call);
   if(candidates.length!==1)throw fault(409,'Geen uniek personeelslid met dit roepnummer');
   const staff=candidates[0],db=store();
   const ref=db.collection(AE_MANUAL_DISPLAY_COLLECTION).doc(staff.personId);
   await db.runTransaction(async tx=>{
    const previous=await tx.get(ref),old=String(previous.get('role')||'');
    if(old===role)return;
    tx.set(ref,{dept:'politie',personId:staff.personId,role,
      updatedBy:req.bpd.uid,updatedAt:FieldValue.serverTimestamp(),
      displayOnly:true});
    tx.create(ref.collection('audit').doc(),{
      action:'ae_display_role',previous:old,next:role,reason,
      actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
   });
   return res.json({saved:true,displayOnly:true,accessRightsChanged:false});
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
      functionOverrides:v?.functionOverrides||{},
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
    // Legacy Rollenbeheer omits this field; resolve against CURRENT Firestore
    // data inside the same transaction, not against a potentially stale UI.
    const resolvedOverrides=retainPoliceFunctionOverrides(req.body,preserve.functionOverrides,values.specialties);
    const next=validatePlacement({...preserve,
     specialties:values.specialties,instructorSpecialties:values.instructorSpecialties,
     teacherSpecialties:values.teacherSpecialties,functionOverrides:resolvedOverrides,
     reason:values.reason},'politie');
    tx.set(ref,{...(old.data()||{}),dept:'politie',personId,status:'active',
     boardRole:next.boardRole,leadershipTier:next.leadershipTier,
     displayOrder:next.displayOrder,teachingRoles:next.teachingRoles,
     displayLabels:next.displayLabels,specialties:next.specialties,
     instructorSpecialties:next.instructorSpecialties,
     teacherSpecialties:next.teacherSpecialties,functionOverrides:next.functionOverrides,undo:previous,
     updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid,displayOnly:true});
    tx.create(ref.collection('audit').doc(),{action:'police_specialty_display',
     previous:{specialties:previous.specialties,
      instructorSpecialties:previous.instructorSpecialties,
      teacherSpecialties:previous.teacherSpecialties,functionOverrides:previous.functionOverrides},
     next:{specialties:values.specialties,
      instructorSpecialties:values.instructorSpecialties,
      teacherSpecialties:next.teacherSpecialties,functionOverrides:next.functionOverrides},
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
     functionOverrides:values.functionOverrides,
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
      teacherSpecialties:before.get('teacherSpecialties')||[],
      functionOverrides:before.get('functionOverrides')||{}
     }:null,next:{boardRole:values.boardRole,teachingRoles:values.teachingRoles,
      displayLabels:values.displayLabels,specialties:values.specialties,instructorSpecialties:values.instructorSpecialties,
      teacherSpecialties:values.teacherSpecialties,functionOverrides:values.functionOverrides,
      leadershipTier:values.leadershipTier,
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
     functionOverrides:restored.functionOverrides,
     undo:current,updatedAt:FieldValue.serverTimestamp(),
     updatedBy:req.bpd.uid,displayOnly:true
    });
    tx.create(ref.collection('audit').doc(),{
     action:'manual_display_undo',previous:current,
     next:{boardRole:restored.boardRole,leadershipTier:restored.leadershipTier,
      displayOrder:restored.displayOrder,teachingRoles:restored.teachingRoles,
      displayLabels:restored.displayLabels,specialties:restored.specialties,instructorSpecialties:restored.instructorSpecialties,
      teacherSpecialties:restored.teacherSpecialties,functionOverrides:restored.functionOverrides},reason,actorUid:req.bpd.uid,
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
