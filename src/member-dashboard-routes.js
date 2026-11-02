import {getApps,initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {ROSTER_COLUMN_COLLECTION,rosterConfig} from './roster-column-config.js';
import {AE_DISCORD_ROLES,verifiedSyncRoles} from './organogram-placement-policy.js';
import {approvedManagedEntry,verifiedDiscordIdentity,USER_COLLECTION} from './user-access.js';
import {verifiedOfficerCadre} from './verified-police-cadre.js';
import {PERSONNEL_ROSTER_DEFAULT,validatePersonnelRosterLayout,
 savedPersonnelRosterLayout} from './personnel-roster-layout-policy.js';

import {PERSONNEL_DECORATIONS_COLLECTION,PERSONNEL_DECORATION_CATALOG_COLLECTION,
  awardKey,publicDecorations,customCatalogItem} from './personnel-decoration-policy.js';

const discordId=/^\d{15,22}$/;
const staffRoles=new Set(['basiskader','middenkader','officierenkader','korpsleiding','beheerder']);
const strip=v=>String(v??'').trim();
const callNumber=call=>{
  const match=strip(call).match(/^(?:[a-z]{1,12}[- ]?)?(\d{3})$/i);
  return match?Number(match[1]):null;
};
export function newcomerPortalMode(id,managed,roster,legacyApproved=false){
  if(managed?.status==='blocked')return 'blocked';
  const approved=approvedManagedEntry(managed,id);
  if(!approved && !legacyApproved)return 'member';
  // Approved Basiskader is an ordinary member, not a management dashboard.
  // A higher verified appointment always remains staff, regardless of call.
  if(approved?.role==='basiskader')return 'member';
  const police=roster.filter(p=>p.dept==='politie'&&p.personId===id);
  if(police.length===1){
    const n=callNumber(police[0].call);
    if(n>=101&&n<=299 && (!approved || approved.role==='basiskader'))
      return 'member';
  }
  return 'staff';
}
// Presentation-only classification of an approved Ambulance account.
// Discord membership, a radio label, or a single spreadsheet row must
// NEVER authorize protected medical dossiers or report access.
export function ambulanceMemberWorkspaceStatus(id,grant,roster,stale=false){
  const approved=discordId.test(String(id||''))&&
    Array.isArray(grant?.departments)&&grant.departments.includes('ambulance');
  const matches=Array.isArray(roster)?roster.filter(p=>
    p?.dept==='ambulance'&&p?.personId===id):[];
  const available=approved&&matches.length===1&&stale!==true;
  return {available,needsReview:approved&&!available};
}
// A complete Discord ID may be used as a private search key, but must never
// be added to the public directory payload. Partial identifiers do not match.
export function directoryRowsForDiscordId(rows,id=null){
  if(id===null)return rows;
  if(typeof id!=='string'||!discordId.test(id))return [];
  return (Array.isArray(rows)?rows:[]).filter(p=>strip(p?.personId)===id);
}
// Personnel-list access and individual dossier access are separate.
// Export ONLY roster columns, never Discord IDs, activity, dossiers,
// source row, sanctions, notes, contact information or audit history.
// One read-only directory entry per Discord identity, with Police as its
// primary registration if present. Other service enrollments never create a
// fictional police callsign, rank, dossier, or permission.
export function publicPoliceRoster(rows,extraPublicLabels=[],verifiedAeMembers=new Set()){
 const byIdentity=new Map();
 const whitelist=['Radio BM','SIV/WPR','Signalisatie','Motor','Semi-ano.',
   'K9','RAGO','Dispatch','TO','AE',...extraPublicLabels.filter(label=>
    !/^ae(?:[-_ ]?(?:i|t|teamleader|instructeur))$/i.test(label))];
 const serviceNames={politie:'Politie',brandweer:'Brandweer',
   ambulance:'Ambulance',depannage:'Depannage'};
 for(const person of rows||[]){
   if(!person||!serviceNames[person.dept]||
      !discordId.test(strip(person.personId))||!strip(person.name))continue;
   const id=strip(person.personId);
   let combined=byIdentity.get(id);
   if(!combined){
     combined={police:null,others:[],services:new Set()};
     byIdentity.set(id,combined);
   }
   combined.services.add(person.dept);
   if(person.dept==='politie'){
     if(!combined.police)combined.police=person;
   }else if(!combined.others.some(p=>p.dept===person.dept))
     combined.others.push(person);
 }
 const visible=[];
 for(const combined of byIdentity.values()){
   const primary=combined.police||combined.others[0];
   if(!primary)continue;
   const hasPoliceEntry=Boolean(combined.police);
   const statuses=Object.fromEntries(whitelist.map(label=>{
     const value=hasPoliceEntry&&Array.isArray(primary.specialties)?
       primary.specialties.find(x=>x?.label===label)?.value:undefined;
     return [label,typeof value==='string'?value.trim().slice(0,40)||'Niet ingevuld':
       'Niet ingevuld'];
   }));
   // Public overview has exactly one AE column; levels belong inside the
   // AE-specialization detail. No role IDs or leadership status are exposed.
   const rawAe=String(statuses.AE||'Niet ingevuld');
   if(hasPoliceEntry){
    if(verifiedAeMembers.has(strip(primary.personId))||
       /^(ja|instructeur|leiding|teamleader|ae[-_ ]?(?:i|t|teamleader|instructeur)|ae-f|stage|aangemeld)$/i.test(rawAe))
      statuses.AE='Ja';
   }
   visible.push({
     call:hasPoliceEntry?strip(primary.call).slice(0,18):'—',
     name:strip(primary.name).slice(0,90),
     rank:hasPoliceEntry?strip(primary.rank).slice(0,95):'—',
     series:hasPoliceEntry?strip(primary.series).slice(0,85):'—',
     status:hasPoliceEntry?strip(primary.status).slice(0,30):'Nog geen politie-inschrijving',
     hasPoliceEntry,
     services:Object.keys(serviceNames).filter(dept=>combined.services.has(dept))
       .map(dept=>serviceNames[dept]),
     specialties:whitelist.map(label=>({label,value:statuses[label]}))
   });
 }
 const special=call=>strip(call)==='008';
 visible.sort((a,b)=>{
   if(a.hasPoliceEntry!==b.hasPoliceEntry)return a.hasPoliceEntry?-1:1;
   if(special(a.call)!==special(b.call))return special(a.call)?1:-1;
   const x=callNumber(a.call),y=callNumber(b.call);
   if((x===null)!==(y===null))return x===null?1:-1;
   if(x!==null&&y!==null){
     const groupDiff=Math.floor(y/100)-Math.floor(x/100);
     if(groupDiff)return groupDiff;
     if(x!==y)return x-y;
   }
   return a.call.localeCompare(b.call,'nl',{numeric:true})||
     a.name.localeCompare(b.name,'nl');
 });
 return visible.slice(0,1200);
}
// Directory for authenticated and guild-verified members; display fields only.
// A directory entry never authorizes service dossier access or modifications.
const ORGANOGRAM_DEPARTMENTS=new Set(['politie','brandweer','ambulance','depannage']);
const ORGANOGRAM_BADGES=Object.freeze({
  politie:['Radio BM','SIV/WPR','Signalisatie','Motor','Semi-ano.','K9','RAGO','Dispatch','TO','AE'],
  brandweer:['Basis TR','Logistiek','Ladderwagen','Duiker','Signalisatie','RED team','Gevaarlijke stoffen','Grote Boot'],
  ambulance:['Basis TR','Medicatie','HELI','Motor','MIP'],
  depannage:['Opleiding DEP2K','Opleiding FAST']
});
export function publicOrganogramRoster(rows,decorations=new Map(),customCatalog=new Map()){
  const seen=new Set(),visible=[];
  for(const p of rows||[]){
    if(!p||!ORGANOGRAM_DEPARTMENTS.has(p.dept)||
       !discordId.test(strip(p.personId))||!strip(p.name))continue;
    const key=p.dept+':'+p.personId;
    if(seen.has(key))continue;
    seen.add(key);
    const allowed=ORGANOGRAM_BADGES[p.dept]||[];
    const specialties=(Array.isArray(p.specialties)?p.specialties:[])
      .filter(x=>x&&allowed.includes(x.label)&&
        /^(ja|behaald|voltooid|geslaagd|true|yes)$/i.test(strip(x.value)))
      .slice(0,12).map(x=>({label:x.label,value:'Ja'}));
    const publicAwards=p.dept==='politie'?
      publicDecorations(decorations.get(awardKey(p.dept,p.personId))||[],undefined,customCatalog):[];
    visible.push({dept:p.dept,name:strip(p.name).slice(0,90),
      call:strip(p.call).slice(0,24),rank:strip(p.rank).slice(0,95),
      // Align the older public personnel card with the hierarchy profile:
      // only the already-public police personnel status may be shown.
      status:p.dept==='politie'?strip(p.status).slice(0,30):'',
      specialties,awards:publicAwards});
  }
  visible.sort((a,b)=>a.dept.localeCompare(b.dept,'nl')||
    a.call.localeCompare(b.call,'nl',{numeric:true})||a.name.localeCompare(b.name,'nl'));
  return visible.slice(0,1200);
}

export function installMemberDashboardRoutes(app,{getSnapshot,accessList}){
  async function memberIdentity(req,res,next){
    res.set('Cache-Control','private, no-store');
    const token=/^Bearer (\S+)$/.exec(req.get('Authorization')||'')?.[1];
    if(!token)return res.status(401).json({error:'Log in met je eigen Discord-account'});
    try{
      if(!getApps().length)initializeApp({
        credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID
      });
      const decoded=await getAuth().verifyIdToken(token);
      const id=typeof decoded.uid==='string'&&decoded.uid.startsWith('discord:')?
        decoded.uid.slice(8):'';
      if(!discordId.test(id))return res.status(403).json({error:'Een Discord-login is vereist'});
      const db=getFirestore();
      const [identity,managed]=await Promise.all([
        db.collection('bpd_discord_auth').doc(id).get(),
        db.collection(USER_COLLECTION).doc(id).get()
      ]);
      if(!verifiedDiscordIdentity(decoded,identity.data(),
        process.env.DISCORD_GUILD_ID))
        return res.status(403).json({error:'Vernieuw eerst je Discord-verificatie'});
      if(managed.get('status')==='blocked')
        return res.status(403).json({error:'Je portaaltoegang is geblokkeerd'});
      // Only the authenticated user's own, guild-verified Discord roles
      // inform this explanatory status; they never approve portal access.
      const roles=identity.data()?.roleIds;
      const ambulanceIds=['1309532438053130323','1309532437977497697',
        '1309532438053130325'];
      req.memberPortal={id,managed:managed.exists?managed.data():null,
        // Verified official Discord roles only; this authorizes layout
        // preferences, NEVER dossiers or personnel record mutations.
        canEditRosterLayout:!!verifiedOfficerCadre(identity.data(),
          process.env.DISCORD_GUILD_ID),
        ambulanceDiscordRoleSeen:Array.isArray(roles)&&
          ambulanceIds.some(role=>roles.includes(role))};
      next();
    }catch(error){
      console.error('Nieuwe-leden-aanmelding:',error?.code||'controle mislukt');
      return res.status(503).json({error:'De Discord-aanmelding kan nu niet gecontroleerd worden'});
    }
  }
  app.get('/api/member/dashboard',memberIdentity,async(req,res)=>{
    try{
      const snapshot=await getSnapshot();
      const id=req.memberPortal.id;
      const legacy=Object.values(accessList()||{}).filter(e=>
        e?.discordId===id&&Array.isArray(e.departments)&&staffRoles.has(e.role));
      const mode=newcomerPortalMode(id,req.memberPortal.managed,
        snapshot.data,legacy.length===1&&req.memberPortal.managed===null);
      const police=snapshot.data.filter(p=>p.personId===id&&p.dept==='politie');
      // Callsign 100-199 is temporary; 200+ is fixed, including promoted calls.
      // A verified assigned number also closes the application shortcut.
      const call=police.length===1?callNumber(police[0].call):null;
      const hasFixedCallsign=call!==null&&call>=200;
      const approved=approvedManagedEntry(req.memberPortal.managed,id);
      const canUseSelfService=Boolean(approved||legacy.length===1&&
        req.memberPortal.managed===null);
      const grant=approved||(
        legacy.length===1&&req.memberPortal.managed===null?legacy[0]:null);
      // A basic Ambulance employee may have an ordinary 'member' portal
      // account. Show their service workspace only after an APPROVED
      // Ambulance grant and exactly one linked official personnel record.
      // This is presentation only: it never grants dossier or report access.
      const ambulance=ambulanceMemberWorkspaceStatus(
        id,grant,snapshot.data,snapshot.stale);
      res.json({
        mode,hasPersonnelRecord:police.length===1,
        ambulanceWorkspaceAvailable:ambulance.available,
        ambulanceLinkNeedsReview:ambulance.needsReview,
        ambulanceApprovalNeedsReview:req.memberPortal.ambulanceDiscordRoleSeen===true&&
          !grant?.departments?.includes('ambulance'),
        personnelListAvailable:true,profileAvailable:true,
        callsignRequestAvailable:!hasFixedCallsign,
        hasFixedCallsign,canUseSelfService
      });
    }catch(error){
      console.error('Dashboard voor nieuwe leden:',error?.code||'bron tijdelijk niet beschikbaar');
      res.status(503).json({error:'Het dashboard kan momenteel niet worden geladen'});
    }
  });
  // All four services are visible as an organizational directory, not as dossiers.
  // memberIdentity requires a verified Discord guild identity on EACH request.
  app.get('/api/member/organogram-roster',memberIdentity,async(_req,res)=>{
    try{
      const [snapshot,decorations,customSnap]=await Promise.all([
        getSnapshot(),
        getFirestore().collection(PERSONNEL_DECORATIONS_COLLECTION).where('dept','==','politie').limit(500).get(),
        getFirestore().collection(PERSONNEL_DECORATION_CATALOG_COLLECTION).limit(100).get()
      ]);
      const byPerson=new Map(decorations.docs.map(d=>[d.id,d.get('entries')||[]]));
      const customCatalog=new Map(customSnap.docs.map(d=>[d.id,customCatalogItem(d)])
       .filter(([id,item])=>item));
      return res.json({records:publicOrganogramRoster(snapshot.data,byPerson,customCatalog),
        stale:snapshot.stale,readOnly:true});
    }catch(error){
      console.error('Organogramoverzicht:',error?.code||'bron niet beschikbaar');
      return res.status(503).json({error:'Organogram momenteel niet beschikbaar'});
    }
  });
  // Shared roster presentation only. Reading is allowed to all verified
  // Discord members; writing is restricted on the server to actual verified
  // Officierenkader / Korpsleiding (not the editable roster or callsign).
  const layoutDoc=()=>getFirestore().collection('bpd_portal_visual_settings')
   .doc('police_personnel_roster');
  app.get('/api/member/personnel-layout',memberIdentity,async(req,res)=>{
    try{
      const snap=await layoutDoc().get();
      return res.json({
        layout:snap.exists?savedPersonnelRosterLayout(snap.get('layout')):
          {...PERSONNEL_ROSTER_DEFAULT},
        canEdit:req.memberPortal.canEditRosterLayout===true
      });
    }catch(error){
      console.error('Personeelslijstafmetingen lezen:',error?.code||'niet beschikbaar');
      return res.status(503).json({error:'De personeelslijstinstellingen zijn niet beschikbaar'});
    }
  });
  app.put('/api/member/personnel-layout',memberIdentity,async(req,res)=>{
    if(req.memberPortal.canEditRosterLayout!==true)
      return res.status(403).json({error:'Alleen Officierenkader en Korpsleiding kunnen afmetingen wijzigen'});
    let layout;
    try{layout=validatePersonnelRosterLayout(req.body?.layout);}
    catch(error){return res.status(400).json({error:error.message});}
    try{
      await layoutDoc().set({
        layout,
        modifiedBy:req.memberPortal.id,
        updatedAt:new Date().toISOString()
      });
      return res.json({saved:true,layout});
    }catch(error){
      console.error('Personeelslijstafmetingen opslaan:',error?.code||'niet beschikbaar');
      return res.status(503).json({error:'De afmetingen konden niet worden opgeslagen'});
    }
  });
  app.get('/api/member/personnel-list',memberIdentity,async(req,res)=>{
    // Full ID only: never expose Discord IDs in the directory JSON or allow
    // unverified users to search the staff source.
    const requestedId=req.query.discordId===undefined?null:req.query.discordId;
    if(requestedId!==null&&(typeof requestedId!=='string'||!discordId.test(requestedId)))
      return res.status(400).json({error:'Geef een volledig Discord-ID van 15–22 cijfers op'});
    try{
      const [snapshot,settings]=await Promise.all([
        getSnapshot(),
        getFirestore().collection(ROSTER_COLUMN_COLLECTION).doc('politie').get()
      ]);
      const customSpecialties=rosterConfig(settings.data()).customSpecialties
        .filter(x=>x.public===true&&
         !/^ae(?:[-_ ]?(?:i|t|teamleader|instructeur))$/i.test(x.label));
      // Guild-verifiable AE membership is a display signal only; never use
      // these role IDs to grant permissions or rewrite dossier records.
      let verifiedAeMembers=new Set();
      try{
       const result=await getFirestore().collection('bpd_discord_auth')
        .where('roleIds','array-contains-any',Object.values(AE_DISCORD_ROLES))
        .limit(500).get();
       if(result.size<500){
        verifiedAeMembers=new Set(result.docs
         .filter(doc=>verifiedSyncRoles(doc.data(),'politie',
          process.env.DISCORD_GUILD_ID).aeRole!=='')
         .map(doc=>doc.id));
       }else console.warn('AE-personeelslijst: Discord-selectie limiet bereikt; alleen geregistreerde dossierstatus wordt getoond');
      }catch(error){
       console.warn('AE-personeelslijst: Discord-verificatie tijdelijk niet beschikbaar',
        error?.code||'sync_error');
      }
      return res.json({
        records:publicPoliceRoster(directoryRowsForDiscordId(snapshot.data,requestedId),
          customSpecialties.map(x=>x.label),verifiedAeMembers),
        customSpecialties,stale:snapshot.stale,readOnly:true
      });
    }catch(error){
      console.error('Leesbare personeelslijst:',error?.code||'bron niet beschikbaar');
      return res.status(503).json({error:'Personeelslijst momenteel niet beschikbaar'});
    }
  });
}
