import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {USER_COLLECTION} from './user-access.js';
import {
  BOARD_COLLECTION,boardEnabled,boardWritesEnabled,validBoardId,isTechnicalBoardApprover,
  mayNominateForBoard,mayDecideBoard,hasBoardPermission,validateBoardNomination,
  validateBoardDecision,validateBoardRevocation,serializeBoardAppointment
} from './board-appointment-policy.js';

const denied=(res,code,message)=>res.status(code).json({error:message});
const fault=(status,message)=>Object.assign(new Error(message),{publicStatus:status});
function fail(res,e){
  if(e.publicStatus)return denied(res,e.publicStatus,e.message);
  console.error('Bestuursbeheer:',e.code||e.message||'onbekend');
  return denied(res,503,'Bestuursregister tijdelijk niet beschikbaar');
}
const collection=()=>getFirestore().collection(BOARD_COLLECTION);
function guard(req,res,next){
  return boardEnabled(process.env)?next():denied(res,503,'Bestuursbeheer is nog niet geactiveerd');
}
function requireBoardWrites(req,res,next){
  return boardWritesEnabled(process.env)?next():denied(res,503,'Bestuursbesluiten zijn nog niet geactiveerd');
}
export function installBoardAppointmentRoutes(app,{requireUser}){
  app.get('/api/board/status',(_req,res)=>
    res.json({enabled:boardEnabled(process.env),writesEnabled:boardWritesEnabled(process.env),separateFromOperationalRank:true}));

  app.get('/api/board/me',requireUser,guard,async(req,res)=>{
    try{
      if(!validBoardId(req.bpd.discordId))return res.json({appointment:null});
      const snap=await collection().doc(req.bpd.discordId).get();
      const entry=snap.exists?serializeBoardAppointment(snap.id,snap.data()):null;
      return res.json({appointment:entry?.status==='approved'?entry:null});
    }catch(e){return fail(res,e)}
  });

  app.get('/api/board/overview',requireUser,guard,async(req,res)=>{
    try{
      const own=req.bpd.discordId&&validBoardId(req.bpd.discordId)
        ?(await collection().doc(req.bpd.discordId).get()).data():null;
      const manager=mayNominateForBoard(req.bpd,own);
      const reader=hasBoardPermission(own,'board_registry_read');
      if(!manager&&!reader)return denied(res,403,'Geen bevoegdheid voor het bestuursregister');
      const snap=await collection().limit(101).get();
      if(snap.size>100)return denied(res,503,'Te veel bestuursregistraties voor dit overzicht');
      const records=snap.docs.map(doc=>serializeBoardAppointment(doc.id,doc.data()))
        .filter(Boolean)
        .filter(x=>manager||x.status==='approved');
      return res.json({appointments:records,canNominate:manager,
        canDecide:isTechnicalBoardApprover(req.bpd)});
    }catch(e){return fail(res,e)}
  });

  // Nominations can be submitted by corps leaders or specifically delegated
  // board members. They have zero effect until independent admin approval.
  app.post('/api/board/nominations',requireUser,guard,requireBoardWrites,async(req,res)=>{
    let payload;
    try{payload=validateBoardNomination(req.body)}catch(e){return denied(res,400,e.message)}
    try{
      const db=getFirestore(),ref=collection().doc(payload.discordId);
      const own=req.bpd.discordId&&validBoardId(req.bpd.discordId)
        ?(await collection().doc(req.bpd.discordId).get()).data():null;
      if(!mayNominateForBoard(req.bpd,own))
        return denied(res,403,'Bestuursvoordrachten vereisen korpsleiding of afzonderlijke voordrachtmachtiging');
      if(req.bpd.discordId===payload.discordId||
         req.bpd.uid==='discord:'+payload.discordId)
        return denied(res,403,'Je kunt jezelf niet voordragen');
      await db.runTransaction(async tx=>{
        const [candidate,previous]=await Promise.all([
          tx.get(db.collection(USER_COLLECTION).doc(payload.discordId)),tx.get(ref)]);
        if(!candidate.exists||candidate.get('status')!=='approved')
          throw fault(409,'De kandidaat moet eerst een goedgekeurd portaalaccount hebben');
        if(previous.exists&&['pending','approved'].includes(previous.get('status')))
          throw fault(409,'Voor dit account bestaat al een open of actieve bestuursaanstelling');
        const data={discordId:payload.discordId,username:String(candidate.get('username')||'').slice(0,80),
          status:'pending',title:'Bestuur',requestedPermissions:payload.permissions,
          permissions:[],nominationReason:payload.reason,proposedAt:FieldValue.serverTimestamp(),
          requestedByUid:req.bpd.uid,requestedByDiscordId:req.bpd.discordId||null,
          decidedAt:null,revokedAt:null};
        tx.set(ref,data);
        tx.create(ref.collection('audit').doc(),{action:'nominated',
          requestedPermissions:payload.permissions,reason:payload.reason,
          actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||null,
          at:FieldValue.serverTimestamp()});
      });
      return res.status(201).json({submitted:true,status:'pending',operationalRoleChanged:false});
    }catch(e){return fail(res,e)}
  });

  app.post('/api/board/:discordId/decision',requireUser,guard,requireBoardWrites,async(req,res)=>{
    if(!validBoardId(req.params.discordId))return denied(res,400,'Ongeldige bestuurskandidaat');
    let payload;
    try{payload=validateBoardDecision(req.body)}catch(e){return denied(res,400,e.message)}
    try{
      if(!isTechnicalBoardApprover(req.bpd))return denied(res,403,'Alleen technisch beheer kan bestuursaanstellingen goedkeuren');
      const ref=collection().doc(req.params.discordId);
      await getFirestore().runTransaction(async tx=>{
        const snap=await tx.get(ref),data=snap.data();
        if(!mayDecideBoard(req.bpd,req.params.discordId,data))
          throw fault(403,'Deze aanvraag mag niet door jezelf of voor dit account beslist worden');
        tx.update(ref,{status:payload.decision,
          permissions:payload.decision==='approved'?[...data.requestedPermissions]:[],
          decisionReason:payload.reason,
          approvedByUid:req.bpd.uid,approvedByDiscordId:req.bpd.discordId||null,
          decidedAt:FieldValue.serverTimestamp()});
        tx.create(ref.collection('audit').doc(),{action:payload.decision,
          actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||null,
          reason:payload.reason,
          permissions:payload.decision==='approved'?[...data.requestedPermissions]:[],
          at:FieldValue.serverTimestamp()});
      });
      return res.json({saved:true,status:payload.decision,operationalRoleChanged:false});
    }catch(e){return fail(res,e)}
  });

  app.post('/api/board/:discordId/revoke',requireUser,guard,requireBoardWrites,async(req,res)=>{
    if(!validBoardId(req.params.discordId))return denied(res,400,'Ongeldige Discord-ID');
    let payload;
    try{payload=validateBoardRevocation(req.body)}catch(e){return denied(res,400,e.message)}
    if(!isTechnicalBoardApprover(req.bpd)||req.bpd.discordId===req.params.discordId||
      req.bpd.uid==='discord:'+req.params.discordId)
      return denied(res,403,'Alleen technisch beheer kan andermans bestuursaanstelling intrekken');
    try{
      const ref=collection().doc(req.params.discordId);
      await getFirestore().runTransaction(async tx=>{
        const current=await tx.get(ref);
        if(current.get('status')!=='approved')
          throw fault(409,'Er is geen actieve bestuursaanstelling');
        tx.update(ref,{status:'revoked',permissions:[],revocationReason:payload.reason,
          revokedAt:FieldValue.serverTimestamp(),revokedByUid:req.bpd.uid});
        tx.create(ref.collection('audit').doc(),{action:'revoked',reason:payload.reason,
          actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId||null,
          at:FieldValue.serverTimestamp()});
      });
      return res.json({revoked:true,operationalRoleChanged:false});
    }catch(e){return fail(res,e)}
  });
}
