import {getApps,initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {approvedManagedEntry,verifiedDiscordIdentity,USER_COLLECTION} from './user-access.js';

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
// Personnel-list access and individual dossier access are separate.
// Export ONLY roster columns, never Discord IDs, activity, dossiers,
// source row, sanctions, notes, contact information or audit history.
export function publicPoliceRoster(rows){
  const seen=new Set();
  const visible=[];
  for(const p of rows||[]){
    if(p?.dept!=='politie'||!discordId.test(strip(p.personId))||!strip(p.name))continue;
    if(seen.has(p.personId))continue;
    seen.add(p.personId);
    // Only explicitly whitelisted public POLICE specialization statuses;
    // never include identities, role IDs, or protected dossier attributes.
    const labels=['Radio BM','SIV/WPR','Signalisatie','Motor','Semi-ano.',
      'K9','RAGO','Dispatch','TO','AE'];
    const safeStatuses=Object.fromEntries(labels.map(label=>{
      const value=Array.isArray(p.specialties)?
        p.specialties.find(x=>x?.label===label)?.value:undefined;
      return [label,typeof value==='string'?value.trim().slice(0,40)||'Niet ingevuld':
        'Niet ingevuld'];
    }));
    visible.push({
      call:strip(p.call).slice(0,18),name:strip(p.name).slice(0,90),
      rank:strip(p.rank).slice(0,95),series:strip(p.series).slice(0,85),
      status:strip(p.status).slice(0,30),
      specialties:labels.map(label=>({label,value:safeStatuses[label]}))
    });
  }
  const special=call=>strip(call)==='008';
  visible.sort((a,b)=>{
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
  return visible.slice(0,400);
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
      req.memberPortal={id,managed:managed.exists?managed.data():null};
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
        personnelListAvailable:true,profileAvailable:true,
        callsignRequestAvailable:!hasFixedCallsign,
        hasFixedCallsign,canUseSelfService
      });
    }catch(error){
      console.error('Dashboard voor nieuwe leden:',error?.code||'bron tijdelijk niet beschikbaar');
      res.status(503).json({error:'Het dashboard kan momenteel niet worden geladen'});
    }
  });
  app.get('/api/member/personnel-list',memberIdentity,async(_req,res)=>{
    try{
      const snapshot=await getSnapshot();
      return res.json({records:publicPoliceRoster(snapshot.data),stale:snapshot.stale,
        readOnly:true});
    }catch(error){
      console.error('Leesbare personeelslijst:',error?.code||'bron niet beschikbaar');
      return res.status(503).json({error:'Personeelslijst momenteel niet beschikbaar'});
    }
  });
}
