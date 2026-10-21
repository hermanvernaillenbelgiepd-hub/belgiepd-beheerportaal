import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {USER_COLLECTION,approvedManagedEntry} from './user-access.js';
import {activeBoardAppointment} from './board-appointment-policy.js';
import {
  DOSSIER_GRANT_COLLECTION,DOSSIER_GRANT_AUDIT,DOSSIER_DEPTS,
  dossierGrantScope,dossierGrantIsAdmin,dossierGrantPayload,
  dossierGrantReason,dossierGrantKey,verifyBoardDiscordRole
} from './dossier-grants.js';

const idOk=id=>/^\d{15,22}$/.test(String(id||''));
const err=(status,message)=>Object.assign(new Error(message),{status});
const respond=(res,e)=>{
  if(e.status)return res.status(e.status).json({error:e.message});
  console.error('Dossiermachtigingen:',e.code||e.message||'onbekend');
  return res.status(503).json({error:'Dossiermachtigingen zijn tijdelijk niet beschikbaar'});
};
export function installDossierGrantRoutes(app,{requireUser,accessList,db=()=>getFirestore()}){
  async function context(actor){
    if(!idOk(actor?.discordId))return {canManage:[],board:false,technical:actor?.role==='beheerder'};
    const id=actor.discordId,store=db();
    const [member,board]=await Promise.all([
      store.collection('bpd_discord_auth').doc(id).get(),
      store.collection('bpd_board_appointments').doc(id).get()
    ]);
    const isBoard=verifyBoardDiscordRole(member.data(),process.env.DISCORD_GUILD_ID);
    const boardData=board.exists?board.data():null;
    return {canManage:DOSSIER_DEPTS.filter(dept=>dossierGrantScope(actor,isBoard,boardData,dept)),
      board:isBoard||activeBoardAppointment(boardData),technical:actor.role==='beheerder'};
  }
  const permitted=(context,dept)=>context.canManage.includes(dept);
  async function requireManager(req,res,next){
    try{
      req.dossierGrantContext=await context(req.bpd);
      if(!req.dossierGrantContext.canManage.length)return res.status(403).json({error:'Geen bevoegdheid voor beheertoegang hulpdiensten'});
      next();
    }catch(e){return respond(res,e)}
  }
  app.get('/api/dossier-grants/context',requireUser,async(req,res)=>{
    try{
      const ctx=await context(req.bpd);
      return res.json({canManageDepartments:ctx.canManage,canManage:ctx.canManage.length>0,
        canAssignTester:ctx.technical||ctx.board,testEnvironment:process.env.FIREBASE_PROJECT_ID==='belgiepd-test'});
    }catch(e){return respond(res,e)}
  });
  app.get('/api/dossier-grants',requireUser,requireManager,async(req,res)=>{
    try{
      const snap=await db().collection(DOSSIER_GRANT_COLLECTION).limit(201).get();
      if(snap.size>200)return res.status(503).json({error:'Meer dan 200 machtigingen: beheeroverzicht vereist paginering'});
      const visible=snap.docs.map(d=>d.data()).filter(g=>permitted(req.dossierGrantContext,g.dept))
        .filter(g=>idOk(g.discordId)&&DOSSIER_DEPTS.includes(g.dept))
        .map(g=>({discordId:g.discordId,dept:g.dept,level:g.level,status:g.status,
          username:String(g.username||'').slice(0,80)}));
      const testerCanManage=req.dossierGrantContext.technical||req.dossierGrantContext.board;
      if(testerCanManage&&process.env.FIREBASE_PROJECT_ID==='belgiepd-test'){
        const t=await db().collection('bpd_dossier_testers').limit(101).get();
        if(t.size>100)return res.status(503).json({error:'Te veel TESTER-machtigingen'});
        for(const doc of t.docs)if(idOk(doc.id))visible.push({
          discordId:doc.id,dept:'alle',level:'all-read',
          status:doc.data().status,username:String(doc.data().username||'').slice(0,80)});
      }
      return res.json({grants:visible});
    }catch(e){return respond(res,e)}
  });
  app.post('/api/dossier-grants',requireUser,requireManager,async(req,res)=>{
    let payload;
    try{payload=dossierGrantPayload(req.body)}catch(e){return res.status(400).json({error:e.message})}
    const {dept,discordId,level,reason}=payload;
    if(!permitted(req.dossierGrantContext,dept))return res.status(403).json({error:'Je mag deze hulpdienst niet beheren'});
    if(discordId===req.bpd.discordId)return res.status(403).json({error:'Eigen reguliere beheerrechten kunnen niet worden toegekend'});
    try{
      const store=db(),ref=store.collection(DOSSIER_GRANT_COLLECTION).doc(dossierGrantKey(dept,discordId));
      const user=store.collection(USER_COLLECTION).doc(discordId);
      await store.runTransaction(async tx=>{
        const [subject,previous]=await Promise.all([tx.get(user),tx.get(ref)]);
        let username='';
        if(subject.exists){
          const approved=approvedManagedEntry(subject.data(),discordId);
          if(!approved)throw err(409,'De gebruiker heeft geen goedgekeurd portaalaccount');
          if(level==='manage'&&!approved.departments.includes(dept))throw err(409,'Voor beperkt dossierbeheer moet de medewerker tot de hulpdienst behoren');
          username=String(subject.get('username')||'').slice(0,80);
        }else{
          const legacy=Object.values(accessList()).filter(x=>x?.discordId===discordId);
          if(legacy.length!==1||!['basiskader','middenkader','officierenkader','korpsleiding','beheerder'].includes(legacy[0].role)||
             !Array.isArray(legacy[0].departments)||!legacy[0].departments.length||
             (level==='manage'&&!legacy[0].departments.includes(dept)))
            throw err(409,'Keur het Discord-portaalaccount eerst goed');
          username='Bestaand portaalaccount';
        }
        tx.set(ref,{dept,discordId,level,status:'active',username,
          grantedBy:req.bpd.uid,updatedAt:FieldValue.serverTimestamp()});
        tx.create(store.collection(DOSSIER_GRANT_AUDIT).doc(),{action:previous.exists?'update':'grant',
          dept,discordId,level,reason,actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
      });
      return res.json({saved:true,dept,discordId,level});
    }catch(e){return respond(res,e)}
  });
  app.post('/api/dossier-grants/:dept/:discordId/revoke',requireUser,requireManager,async(req,res)=>{
    const {dept,discordId}=req.params;
    if(!DOSSIER_DEPTS.includes(dept)||!idOk(discordId))return res.status(400).json({error:'Ongeldige machtiging'});
    if(!permitted(req.dossierGrantContext,dept))return res.status(403).json({error:'Geen toegang tot deze hulpdienst'});
    if(discordId===req.bpd.discordId)return res.status(403).json({error:'Eigen beheerrechten kunnen niet worden gewijzigd'});
    let reason;try{reason=dossierGrantReason(req.body)}catch(e){return res.status(400).json({error:e.message})}
    try{
      const store=db(),ref=store.collection(DOSSIER_GRANT_COLLECTION).doc(dossierGrantKey(dept,discordId));
      await store.runTransaction(async tx=>{
        const previous=await tx.get(ref);
        if(!previous.exists||previous.get('status')!=='active')throw err(409,'Geen actieve machtiging');
        tx.update(ref,{status:'revoked',updatedAt:FieldValue.serverTimestamp(),updatedBy:req.bpd.uid});
        tx.create(store.collection(DOSSIER_GRANT_AUDIT).doc(),{
          action:'revoke',dept,discordId,reason,actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
      });
      return res.json({revoked:true});
    }catch(e){return respond(res,e)}
  });
  // Read-only tester is deliberately confined to TEST and technical administrators/Bestuur.
  // This endpoint can grant the requester's own testing scope, never manage/edit rights.
  app.post('/api/dossier-grants/tester',requireUser,async(req,res)=>{
    if(process.env.FIREBASE_PROJECT_ID!=='belgiepd-test')return res.status(403).json({error:'TESTER is uitsluitend voor TEST'});
    let ctx;try{ctx=await context(req.bpd)}catch(e){return respond(res,e)}
    if(!ctx.technical&&!ctx.board)return res.status(403).json({error:'Alleen Bestuur of technisch beheer mag TESTER-toegang activeren'});
    if(typeof req.body?.enabled!=='boolean')return res.status(400).json({error:'Kies activeren of intrekken'});
    let reason;try{reason=dossierGrantReason(req.body)}catch(e){return res.status(400).json({error:e.message})}
    const discordId=req.bpd.discordId;
    if(!idOk(discordId))return res.status(403).json({error:'Koppel eerst je eigen Discord-ID aan het portaal'});
    try{
      const store=db(),ref=store.collection('bpd_dossier_testers').doc(discordId);
      await store.runTransaction(async tx=>{
        const existing=await tx.get(ref);
        tx.set(ref,{discordId,level:'all-read',status:req.body.enabled?'active':'revoked',
          username:existing.exists?String(existing.get('username')||''):'TESTER',
          updatedBy:req.bpd.uid,updatedAt:FieldValue.serverTimestamp()});
        tx.create(store.collection(DOSSIER_GRANT_AUDIT).doc(),{
          action:req.body.enabled?'tester_enabled':'tester_revoked',discordId,
          reason,actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()});
      });
      return res.json({saved:true,enabled:req.body.enabled,readOnly:true});
    }catch(e){return respond(res,e)}
  });
}
