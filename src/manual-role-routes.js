// Manuele rolherstelprocedure bij ontbrekende Discord-rolsynchronisatie.
// Onafhankelijke goedkeuring blijft standaard. Alleen de apart geverifieerde,
// ondertekende technische beheersessie mag een eigen aanvraag besluiten.
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {roleForDepartment} from './leave-policy.js';
import {USER_COLLECTION,USER_DEPTS,approvedManagedEntry,canChangeUser,isUserManager} from './user-access.js';
import {BOARD_COLLECTION,activeBoardAppointment} from './board-appointment-policy.js';
import {verifyBoardDiscordRole} from './dossier-grants.js';
import {isVerifiedTechnicalRoleApprover,manualRoleDecisionScope} from './manual-role-decision-policy.js';
import {MANUAL_ROLE_CATALOG,manualRoleChoice,manualRoleLabel} from './manual-role-catalog.js';
import {verifiedCitizenCorpsReader,activeManualCitizenCouncil} from './citizen-dossier-policy.js';

const STORE='bpd_manual_role_requests';
const VALID_ID=/^\d{15,22}$/;
const RANK={basiskader:1,middenkader:2,officierenkader:3,korpsleiding:4};
const error=(status,message)=>Object.assign(new Error(message),{publicStatus:status});
const respond=(res,e)=>{
  if(e.publicStatus)return res.status(e.publicStatus).json({error:e.message});
  console.error('Handmatig rolherstel:',e.code||'onbekend');
  return res.status(503).json({error:'Rolherstel tijdelijk niet beschikbaar'});
};
const safeReason=value=>{
  const reason=typeof value==='string'?value.trim():'';
  if(reason.length<15||reason.length>500||/[<>\x00-\x1f]/.test(reason))
    throw error(400,'Geef een motivering van 15 tot 500 tekens');
  return reason;
};
function payload(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['discordId','dept','role','reason'].includes(k)))
    throw error(400,'Ongeldige aanvraag');
  const discordId=String(body.discordId||'');
  if(!VALID_ID.test(discordId)||!USER_DEPTS.includes(body.dept)||!manualRoleChoice(body.dept,body.role))
    throw error(400,'Gebruik een geldige Discord-ID, hulpdienst en kaderrol');
  return {discordId,dept:body.dept,role:body.role,reason:safeReason(body.reason)};
}
const safeIdentity=actor=>VALID_ID.test(String(actor?.discordId||''))&&
  actor?.uid==='discord:'+actor.discordId;
const isCitizenCouncilRequest=request=>
  request?.dept==='burger'&&request?.role==='basiskader';
const canConfirmCitizenCouncil=actor=>
  isVerifiedTechnicalRoleApprover(actor)||verifiedCitizenCorpsReader(actor);
const freshGuildMember=(member,guildId,now=Date.now())=>
  VALID_ID.test(String(guildId||''))&&member?.guildId===guildId&&
  Number.isSafeInteger(member.verifiedAt)&&member.verifiedAt<=now+60000&&
  now-member.verifiedAt<=7*86400000;
async function rights(actor,db){
  if(!safeIdentity(actor))return {propose:false,board:false,manager:false};
  const [guild,board]=await Promise.all([
    db.collection('bpd_discord_auth').doc(actor.discordId).get(),
    db.collection(BOARD_COLLECTION).doc(actor.discordId).get()
  ]);
  const boardAccess=verifyBoardDiscordRole(guild.data(),process.env.DISCORD_GUILD_ID)||
    activeBoardAppointment(board.data());
  const manager=isUserManager(actor);
  return {propose:boardAccess||manager,board:boardAccess,manager};
}
const brief=d=>({discordId:d.discordId,dept:d.dept,role:d.role,
  roleLabel:manualRoleLabel(d.dept,d.role),status:d.status,
  reason:d.reason,requestedBy:d.requestedBy,decidedBy:d.decidedBy||null});
export function installManualRoleRoutes(app,{requireUser,getSnapshot}){
  async function confirmCitizenPersonnel(request){
    if(!isCitizenCouncilRequest(request))return;
    const snapshot=await getSnapshot();
    if(snapshot?.stale||!Array.isArray(snapshot?.data))
      throw error(503,'De Burger-personeelsbron is tijdelijk niet actueel');
    const people=snapshot.data.filter(p=>p.dept==='burger'&&p.personId===request.discordId);
    if(people.length!==1)
      throw error(409,'De Burgerraad-medewerker moet een unieke Burger-personeelsfiche hebben');
  }
  app.get('/api/users/manual-role-requests',requireUser,async(req,res)=>{
    try{
      const db=getFirestore(),access=await rights(req.bpd,db);
      if(!access.propose)return res.status(403).json({error:'Geen toegang tot rolherstel'});
      const snap=await db.collection(STORE).limit(200).get();
      if(snap.size===200)throw error(503,'Het rolhersteloverzicht heeft de limiet bereikt');
      const records=snap.docs.map(d=>d.data()).filter(d=>access.board||
        req.bpd.role==='beheerder'||req.bpd.departments?.includes(d.dept))
        .filter(d=>VALID_ID.test(d.discordId)).map(brief);
      return res.json({requests:records,roleCatalog:MANUAL_ROLE_CATALOG,canPropose:true,
        canApprove:access.manager,canApproveCitizenCouncil:access.manager&&canConfirmCitizenCouncil(req.bpd),
        board:access.board,
        canSoloApprove:access.manager&&isVerifiedTechnicalRoleApprover(req.bpd),
        actorUid:req.bpd.uid});
    }catch(e){return respond(res,e)}
  });
  app.post('/api/users/manual-role-requests',requireUser,async(req,res)=>{
    let data;try{data=payload(req.body)}catch(e){return respond(res,e)}
    try{
      const db=getFirestore(),access=await rights(req.bpd,db);
      if(!access.propose)return res.status(403).json({error:'Geen bevoegdheid om rolherstel aan te vragen'});
      if(isCitizenCouncilRequest(data)&&!access.board&&!canConfirmCitizenCouncil(req.bpd))
        throw error(403,'Burgerraad moet door Bestuur, geverifieerde Korpsleiding of technisch beheer worden voorgedragen');
      await confirmCitizenPersonnel(data);
      if(data.discordId===req.bpd.discordId)
        return res.status(403).json({error:'Eigen rolherstel aanvragen of goedkeuren is niet mogelijk'});
      const subjectRef=db.collection(USER_COLLECTION).doc(data.discordId);
      const [subject,member]=await Promise.all([
        subjectRef.get(),db.collection('bpd_discord_auth').doc(data.discordId).get()
      ]);
      if(!freshGuildMember(member.data(),process.env.DISCORD_GUILD_ID))
        throw error(409,'De medewerker moet eerst zelf zijn Discord-lidmaatschap in het portaal verifiëren');
      if(subject.exists&&subject.get('status')==='blocked')
        throw error(409,'Een geblokkeerd account kan niet via rolherstel geactiveerd worden');
      const record=subject.exists?subject.data():{status:'pending',candidateDepartments:[data.dept]};
      const candidate={...record,candidateDepartments:[...new Set([...(record.candidateDepartments||[]),data.dept])]};
      if(!access.board&&!isCitizenCouncilRequest(data)&&
         !canChangeUser(req.bpd,data.discordId,candidate,{role:data.role,departments:[data.dept]}))
        throw error(403,'Je mag voor deze medewerker of kaderrol geen verzoek indienen');
      const ref=db.collection(STORE).doc(data.dept+'_'+data.discordId);
      await db.runTransaction(async tx=>{
        const current=await tx.get(ref);
        if(current.get('status')==='pending')throw error(409,'Voor deze medewerker en dienst loopt al een verzoek');
        tx.set(ref,{...data,roleLabel:manualRoleLabel(data.dept,data.role),status:'pending',
          requestedBy:req.bpd.uid,requestedAt:FieldValue.serverTimestamp(),
          expiresAt:new Date(Date.now()+30*86400000)});
        tx.create(ref.collection('audit').doc(),{action:'requested',
          actorUid:req.bpd.uid,reason:data.reason,role:data.role,
          roleLabel:manualRoleLabel(data.dept,data.role),
          at:FieldValue.serverTimestamp()});
      });
      return res.status(201).json({status:'pending',roleGranted:false});
    }catch(e){return respond(res,e)}
  });
  app.post('/api/users/manual-role-requests/:dept/:discordId/decision',
    requireUser,async(req,res)=>{
      const {dept,discordId}=req.params;
      if(!USER_DEPTS.includes(dept)||!VALID_ID.test(discordId))
        return res.status(400).json({error:'Ongeldige personeelsreferentie'});
      const decision=req.body?.decision;
      if(!['approved','rejected'].includes(decision)||
        !req.body||Object.keys(req.body).some(k=>!['decision','reason'].includes(k)))
        return res.status(400).json({error:'Kies goedkeuren of weigeren'});
      let reason;try{reason=safeReason(req.body.reason)}catch(e){return respond(res,e)}
      try{
        const db=getFirestore(),access=await rights(req.bpd,db);
        if(!access.manager)throw error(403,'Een bevoegde kadergoedkeurder is vereist');
        const ref=db.collection(STORE).doc(dept+'_'+discordId);
        const user=db.collection(USER_COLLECTION).doc(discordId);
        const member=db.collection('bpd_discord_auth').doc(discordId);
        if(dept==='burger')await confirmCitizenPersonnel({dept,role:'basiskader',discordId});
        await db.runTransaction(async tx=>{
          const [pending,subject,verified]=await Promise.all([
            tx.get(ref),tx.get(user),tx.get(member)
          ]);
          const request=pending.data();
          if(!request||request.status!=='pending')throw error(409,'Geen openstaand verzoek');
          if(isCitizenCouncilRequest(request)&&!canConfirmCitizenCouncil(req.bpd))
            throw error(403,'Burgerraad vereist geverifieerde Korpsleiding of technisch beheer als goedkeurder');
          const scope=manualRoleDecisionScope(req.bpd,request,discordId);
          if(!scope.allowed)
            throw error(403,'Voor deze goedkeuring is een tweede persoon vereist, behalve in geverifieerde technische beheermodus. Eigen rollen wijzigen blijft verboden.');
          if(!request.expiresAt?.toDate||request.expiresAt.toDate().getTime()<Date.now())
            throw error(409,'Dit verzoek is verlopen; maak een nieuw verzoek');
          const current=subject.data();
          if(subject.exists&&current.status==='blocked')
            throw error(409,'Geblokkeerde accounts kunnen niet worden goedgekeurd');
          if(!freshGuildMember(verified.data(),process.env.DISCORD_GUILD_ID))
            throw error(409,'Discord-lidmaatschap moet opnieuw geverifieerd worden');
          const base=subject.exists?current:
            {status:'pending',candidateDepartments:[dept],discordId};
          const candidate={...base,candidateDepartments:[
            ...new Set([...(base.candidateDepartments||[]),dept])
          ]};
          if(!isCitizenCouncilRequest(request)&&
             !canChangeUser(req.bpd,discordId,candidate,{role:request.role,departments:[dept]}))
            throw error(403,'Je kaderrol mag deze toegang niet goedkeuren');
          if(dept==='burger'&&!isCitizenCouncilRequest(request))
            throw error(400,'De aangevraagde Burgerfunctie is ongeldig');
          if(decision==='approved'){
            const approved=subject.exists&&current.status==='approved'
              ?approvedManagedEntry(current,discordId):null;
            if(subject.exists&&current.status==='approved'&&!approved)
              throw error(409,'De bestaande accountrechten zijn ongeldig; herstel ze eerst');
            const departments=approved?[...new Set([...approved.departments,dept])]:[dept];
            const departmentRoles=approved?{...approved.departmentRoles} : {};
            departmentRoles[dept]=request.role;
            const top=Object.values(departmentRoles).reduce((role,next)=>
              RANK[next]>RANK[role]?next:role,'basiskader');
            tx.set(user,{discordId,status:'approved',role:top,
              departments,departmentRoles,
              username:String(current?.username||verified.get('username')||'Discord-lid').slice(0,80),
              approvedBy:req.bpd.uid,approvedAt:FieldValue.serverTimestamp(),
              ...(isCitizenCouncilRequest(request)?{
                citizenCouncilRecovery:{dept:'burger',role:'basiskader',
                  roleLabel:manualRoleLabel(dept,request.role),
                  approvedBy:req.bpd.uid,requestedBy:request.requestedBy,
                  approvalMethod:scope.technicalOverride?'verified_technical_single_approver':'independent'}
              }:{
                manualRoleRecovery:{dept,role:request.role,
                  roleLabel:manualRoleLabel(dept,request.role),approvedBy:req.bpd.uid,
                  requestedBy:request.requestedBy,
                  approvalMethod:scope.technicalOverride?'verified_technical_single_approver':'independent'}
              }),
              approvalSource:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp()
            },{merge:true});
            tx.create(user.collection('audit').doc(),{
              action:'manual_role_recovery',dept,role:request.role,
              roleLabel:manualRoleLabel(dept,request.role),
              actorUid:req.bpd.uid,requestedBy:request.requestedBy,reason,
              approvalMethod:scope.technicalOverride?'verified_technical_single_approver':'independent',
              at:FieldValue.serverTimestamp()});
          }
          tx.update(ref,{status:decision,decidedBy:req.bpd.uid,
            roleLabel:manualRoleLabel(dept,request.role),
            decisionReason:reason,approvalMethod:scope.technicalOverride?
              'verified_technical_single_approver':'independent',
            decidedAt:FieldValue.serverTimestamp()});
          tx.create(ref.collection('audit').doc(),{action:decision,
            actorUid:req.bpd.uid,requestedBy:request.requestedBy,reason,
            approvalMethod:scope.technicalOverride?'verified_technical_single_approver':'independent',
            at:FieldValue.serverTimestamp()});
        });
        return res.json({status:decision,roleGranted:decision==='approved',
          discordRoleChanged:false});
      }catch(e){return respond(res,e)}
    });
  // Revokes only the exceptional Burgerraad portal scope. Other departments
  // and the individual's recorded notes or historical evaluations remain.
  app.post('/api/users/manual-role-requests/burger/:discordId/revoke',
    requireUser,async(req,res)=>{
      const target=String(req.params.discordId||'');
      if(!VALID_ID.test(target)||target===req.bpd?.discordId)
        return res.status(403).json({error:'Ongeldige of eigen Burgerraad-intrekking'});
      let reason;
      try{
        if(!req.body||Object.keys(req.body).some(x=>x!=='reason'))
          throw error(400,'Een motivering is verplicht');
        reason=safeReason(req.body.reason);
        const db=getFirestore(),access=await rights(req.bpd,db);
        if(!access.manager||!canConfirmCitizenCouncil(req.bpd))
          throw error(403,'Alleen geverifieerde Korpsleiding of technisch beheer mag Burgerraad intrekken');
        const user=db.collection(USER_COLLECTION).doc(target),
         request=db.collection(STORE).doc('burger_'+target);
        await db.runTransaction(async tx=>{
          const [current,original]=await Promise.all([tx.get(user),tx.get(request)]);
          if(!activeManualCitizenCouncil(current.data(),target)||
            original.get('status')!=='approved'||
            !isCitizenCouncilRequest(original.data()))
            throw error(409,'Geen actieve handmatige Burgerraad-machtiging');
          const approved=approvedManagedEntry(current.data(),target);
          const departments=approved.departments.filter(d=>d!=='burger');
          const departmentRoles={...approved.departmentRoles};
          delete departmentRoles.burger;
          const top=Object.values(departmentRoles).reduce((role,next)=>
            RANK[next]>RANK[role]?next:role,'basiskader');
          tx.update(user,{departments,departmentRoles,role:top,
            ...(departments.length?{}:{status:'blocked'}),
            citizenCouncilRecovery:FieldValue.delete(),
            updatedAt:FieldValue.serverTimestamp()});
          tx.update(request,{status:'revoked',decidedBy:req.bpd.uid,
            decisionReason:reason,decidedAt:FieldValue.serverTimestamp()});
          tx.create(user.collection('audit').doc(),{
            action:'manual_citizen_council_revoked',dept:'burger',
            actorUid:req.bpd.uid,reason,at:FieldValue.serverTimestamp()});
          tx.create(request.collection('audit').doc(),{
            action:'revoked',actorUid:req.bpd.uid,reason,
            at:FieldValue.serverTimestamp()});
        });
        return res.json({revoked:true,discordRoleChanged:false,
          otherDepartmentsPreserved:true});
      }catch(e){return respond(res,e)}
    });
}
