import {getApps,initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {roleSummary} from './role-catalog.js';
import {roleForDepartment} from './leave-policy.js';
import {USER_COLLECTION,USER_DEPTS,verifiedDiscordIdentity,validUserGrant,
  isUserManager,canSeeUser,canChangeUser,canBlockUser} from './user-access.js';

const validId=id=>/^\d{15,22}$/.test(String(id||''));
function ready(){
  if(!getApps().length)initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});
  return getFirestore();
}
const denial=(res,status,error)=>res.status(status).json({error});
const fail=(res,e)=>{
  if(e?.publicStatus)return denial(res,e.publicStatus,e.message);
  console.error('Gebruikersbeheer:',e?.code||e?.message||'onbekend');
  return denial(res,503,'Gebruikersbeheer tijdelijk niet beschikbaar');
};
const publicError=(message,publicStatus=403)=>Object.assign(new Error(message),{publicStatus});
const serialize=(id,d)=>({discordId:id,username:String(d.username||'').slice(0,80),
  status:d.status||'pending',candidateDepartments:Array.isArray(d.candidateDepartments)?d.candidateDepartments:[],
  departments:Array.isArray(d.departments)?d.departments:[],
  role:d.status==='approved'?d.role:null});
export function installUserRoutes(app,{requireUser,accessList}){
  const db=()=>ready();
  const collection=()=>db().collection(USER_COLLECTION);
  async function discordSubject(req){
    const m=/^Bearer (\S+)$/.exec(req.get('Authorization')||'');
    if(!m)throw publicError('Aanmelding vereist',401);
    const decoded=await getAuth().verifyIdToken(m[1]);
    if(decoded.firebase?.sign_in_provider!=='custom'||decoded.bpdDiscord!==true)
      throw publicError('Meld je aan met Discord om toegang aan te vragen');
    const id=String(decoded.uid||'').replace(/^discord:/,'');
    if(!validId(id))throw publicError('Discord-account ongeldig');
    const member=(await db().collection('bpd_discord_auth').doc(id).get()).data();
    const verified=verifiedDiscordIdentity(decoded,member,process.env.DISCORD_GUILD_ID,Date.now(),15*60*1000);
    if(!verified)throw publicError('Vernieuw eerst je Discord-verificatie en probeer opnieuw');
    return {id,member};
  }
  // This endpoint cannot grant roles. It only creates one pending request tied
  // to an independently verified Discord ID belonging to our own guild.
  app.post('/api/users/request',async(req,res)=>{
    try{
      ready();
      const {id,member}=await discordSubject(req);
      if(Object.values(accessList()).some(entry=>entry?.discordId===id))
        return res.json({status:'legacy',message:'Je account heeft al een bestaande toewijzing.'});
      const ref=collection().doc(id);
      const candidates=roleSummary(member.roleIds).departments.filter(d=>USER_DEPTS.includes(d));
      try{
        await ref.create({discordId:id,guildId:process.env.DISCORD_GUILD_ID,status:'pending',
          username:String(member.username||'Discord-lid').slice(0,80),
          candidateDepartments:candidates,requestedAt:FieldValue.serverTimestamp(),
          createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      }catch(e){if(e.code!==6&&e.code!=='already-exists')throw e;}
      const saved=await ref.get();
      return res.json({status:saved.get('status')||'pending'});
    }catch(e){return fail(res,e)}
  });
  app.get('/api/users/me',async(req,res)=>{
    try{
      ready();
      const {id,member}=await discordSubject(req);
      const snap=await collection().doc(id).get();
      const d=snap.exists?snap.data():null;
      const legacy=!d && Object.values(accessList()).some(entry=>entry?.discordId===id);
      return res.json({discordId:id,username:member.username||'',status:d?.status||(legacy?'legacy':'not_requested'),
        role:d?.status==='approved'?d.role:null});
    }catch(e){return fail(res,e)}
  });
  // Only returns the authenticated member's OWN authorisation context.
  // Useful when a valid Discord identity lacks scoped management rights.
  app.get('/api/users/context',requireUser,(req,res)=>{
    const depts=req.bpd.departments||[];
    res.json({role:req.bpd.role,departments:depts,
      departmentRoles:Object.fromEntries(depts.map(dept=>[dept,roleForDepartment(req.bpd,dept)||'geen'])),
      canManageUsers:isUserManager(req.bpd)});
  });
  const admin=(req,res,next)=>isUserManager(req.bpd)?next():denial(res,403,'Alleen officierenkader, korpsleiding en beheer kunnen gebruikers beheren');
  app.get('/api/users/overview',requireUser,admin,async(req,res)=>{
    try{
      const snap=await collection().limit(250).get();
      return res.json({role:req.bpd.role,departments:req.bpd.departments,
        users:snap.docs.filter(d=>canSeeUser(req.bpd,d.data())).map(d=>serialize(d.id,d.data())),
        limited:snap.size===250});
    }catch(e){return fail(res,e)}
  });
  app.post('/api/users/:discordId/approve',requireUser,admin,async(req,res)=>{
    if(!validId(req.params.discordId))return denial(res,400,'Ongeldige Discord ID');
    let grant;
    try{grant=validUserGrant(req.body)}catch(e){return denial(res,400,e.message)}
    const ref=collection().doc(req.params.discordId);
    try{
      await db().runTransaction(async tx=>{
        const doc=await tx.get(ref);
        if(!doc.exists)throw publicError('Geen toegangsaanvraag gevonden',404);
        const data=doc.data();
        if(!canChangeUser(req.bpd,req.params.discordId,data,grant))
          throw publicError('Je mag deze medewerker, functie of hulpdienst niet wijzigen');
        const audit=ref.collection('audit').doc();
        tx.update(ref,{status:'approved',role:grant.role,departments:grant.departments,
          departmentRoles:grant.departmentRoles,updatedAt:FieldValue.serverTimestamp(),
          approvedAt:FieldValue.serverTimestamp(),approvedBy:req.bpd.uid});
        tx.create(audit,{action:'approve',actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||'',
          reason:grant.reason,role:grant.role,departments:grant.departments,
          at:FieldValue.serverTimestamp()});
      });
      return res.json({ok:true,status:'approved'});
    }catch(e){return fail(res,e)}
  });
  app.post('/api/users/:discordId/block',requireUser,admin,async(req,res)=>{
    if(!validId(req.params.discordId))return denial(res,400,'Ongeldige Discord ID');
    const reason=typeof req.body?.reason==='string'?req.body.reason.trim():'';
    if(reason.length<8||reason.length>300)return denial(res,400,'Reden moet 8 tot 300 tekens bevatten');
    const ref=collection().doc(req.params.discordId);
    try{
      await db().runTransaction(async tx=>{
        const doc=await tx.get(ref);
        if(!doc.exists)throw publicError('Gebruiker niet gevonden',404);
        const data=doc.data();
        if(!canBlockUser(req.bpd,req.params.discordId,data))
          throw publicError('Je mag deze gebruiker niet blokkeren');
        const audit=ref.collection('audit').doc();
        tx.update(ref,{status:'blocked',blockedAt:FieldValue.serverTimestamp(),
          blockedBy:req.bpd.uid,updatedAt:FieldValue.serverTimestamp()});
        tx.create(audit,{action:'block',actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||'',
          reason,at:FieldValue.serverTimestamp()});
      });
      return res.json({ok:true,status:'blocked'});
    }catch(e){return fail(res,e)}
  });
}
