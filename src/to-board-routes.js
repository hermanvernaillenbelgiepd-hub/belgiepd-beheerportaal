import {randomUUID} from 'node:crypto';
import {applicationDefault,getApps,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {TO_CATEGORIES,applyBoardCommand,canReadBoard,canOperateBoard,emptyBoard,validBoardId,boardError} from './to-board-policy.js';
import {callsignForTO} from './to-operator-identity.js';
import {applyTOShortcutCommand,emptyTOShortcuts} from './to-incident-shortcuts.js';
import {radioMatchesSavedTeam} from './to-radio-auto-end.js';

export const TO_BOARD_COLLECTION='bpd_to_boards';
export const TO_ARCHIVE_COLLECTION='bpd_to_archives';
export const TO_SHORTCUT_COLLECTION='bpd_to_incident_shortcuts';
function defaultDatabase(){
  if(!getApps().length)initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});
  return getFirestore();
}
export function createFirestoreTOStore({getDatabase=defaultDatabase}={}){
  return {
    async readBoard(){
      const snapshot=await getDatabase().collection(TO_BOARD_COLLECTION).doc('politie').get();
      return snapshot.exists?snapshot.data():emptyBoard();
    },
    async execute(command,context){
      const database=getDatabase(),reference=database.collection(TO_BOARD_COLLECTION).doc('politie');
      return database.runTransaction(async transaction=>{
        const snapshot=await transaction.get(reference);
        const result=applyBoardCommand(snapshot.exists?snapshot.data():emptyBoard(),command,context);
        if(result.archive)transaction.create(database.collection(TO_ARCHIVE_COLLECTION).doc(result.archive.id),result.archive);
        transaction.set(reference,result.board);
        return result;
      });
    },
    async readShortcuts(){
      const snapshot=await getDatabase().collection(TO_SHORTCUT_COLLECTION).doc('politie').get();
      return snapshot.exists?snapshot.data():emptyTOShortcuts();
    },
    async updateShortcuts(command,context){
      const database=getDatabase(),reference=database.collection(TO_SHORTCUT_COLLECTION).doc('politie');
      // Keep template changes atomically revisioned and independent of the
      // shift board so they survive closing/archiving the current session.
      return database.runTransaction(async transaction=>{
        const boardRef=database.collection(TO_BOARD_COLLECTION).doc('politie');
        const [boardSnapshot,shortcutSnapshot]=await Promise.all([transaction.get(boardRef),transaction.get(reference)]);
        const board=boardSnapshot.exists?boardSnapshot.data():emptyBoard();
        if(!board.session||board.session.ownerUid!==context.actor.uid)
          throw boardError(403,'Alleen de huidige TO kan meldingssneltoetsen beheren.');
        const result=applyTOShortcutCommand(shortcutSnapshot.exists?shortcutSnapshot.data():emptyTOShortcuts(),command,context);
        transaction.set(reference,result);
        return result;
      });
    },
    async autoEndAbsentRadioTeams(teamIds,snapshot,{now,sessionId}={}){
      if(!Array.isArray(teamIds)||teamIds.length<1||teamIds.length>100||
        !snapshot?.configured||!snapshot?.connected||snapshot.stale||
        !Array.isArray(snapshot.users)||!Array.isArray(snapshot.uncertainUnits)||
        !Number.isSafeInteger(now)||typeof sessionId!=='string')return [];
      const fetched=Date.parse(snapshot.fetchedAt||'');
      if(!Number.isFinite(fetched)||fetched>now+1000||now-fetched>45000)return [];
      const database=getDatabase(),reference=database.collection(TO_BOARD_COLLECTION).doc('politie');
      return database.runTransaction(async transaction=>{
        const current=await transaction.get(reference);
        if(!current.exists)return [];
        const board=current.data();
        if(board.session?.id!==sessionId)return [];
        const ended=[];
        for(const id of teamIds){
          const crew=board.ploegen?.[id];
          if(!validBoardId(id)||!crew||crew.endedAt||
             radioMatchesSavedTeam(crew,snapshot.users)||
             radioMatchesSavedTeam(crew,snapshot.uncertainUnits))continue;
          // Sluit een uit de radio verdwenen ploeg atomair af. Meldingen
          // blijven actief, maar krijgen een controleerbare logregel.
          const linked=Object.values(board.meldingen||{}).filter(incident=>
            incident?.status==='actief'&&Array.isArray(incident.ploegen)&&
            incident.ploegen.some(member=>member.id===id));
          if(linked.some(incident=>!Array.isArray(incident.log)||
             incident.log.length>=TO_BOARD_LIMITS.incidentLog))continue;
          for(const incident of linked){
            incident.log.push({t:now,by:'system:sonoran-radio',
              actorUid:'system:sonoran-radio',
              txt:crew.dienst+'-'+crew.roepnaam+
                ' automatisch uit dienst: niet meer in Sonoran Radio; ploeg losgekoppeld'});
            incident.ploegen=incident.ploegen.filter(member=>member.id!==id);
          }
          crew.endedAt=now;
          crew.endedBy='system:sonoran-radio';
          crew.endedReason='radiokanaal-verlaten';
          crew.available=false;
          crew.responsePhase=null;
          ended.push(id);
        }
        if(ended.length){
          board.revision++;
          transaction.set(reference,board);
        }
        return ended;
      });
    },
    async listArchives(){
      // This dedicated collection currently contains police archives only.
      // A single-field ordering needs no separately provisioned composite index;
      // still reject another department defensively before projecting any data.
      const snapshot=await getDatabase().collection(TO_ARCHIVE_COLLECTION).orderBy('closedAt','desc').limit(51).get();
      return {archives:snapshot.docs.filter(document=>document.data().dept==='politie').slice(0,50).map(document=>{
        const archive=document.data();
        return {id:document.id,to:archive.session?.to||'',startedAt:archive.session?.startedAt||null,closedAt:archive.closedAt||null,
          teamCount:Object.keys(archive.ploegen||{}).length,incidentCount:Object.keys(archive.meldingen||{}).length};
      }),limited:snapshot.docs.length>50};
    },
    async readArchive(id){
      if(!validBoardId(id))throw boardError(400,'Ongeldige archiefverwijzing');
      const snapshot=await getDatabase().collection(TO_ARCHIVE_COLLECTION).doc(id).get();
      if(!snapshot.exists||snapshot.data().dept!=='politie')throw boardError(404,'Dienstarchief niet gevonden');
      return snapshot.data();
    }
  };
}
function envelope(board,actor,identity=null){
  const canOperate=canOperateBoard(actor);
  return {board,categories:TO_CATEGORIES,permissions:{canRead:true,canOperate,canEdit:canOperate&&board.session?.ownerUid===actor.uid},viewer:{uid:actor.uid,callsign:identity?.call||null,callsignSource:identity?.source||null},writesEnabled:true};
}
function failed(res,error){
  if(Number.isInteger(error?.publicStatus)&&[400,403,404,409,413].includes(error.publicStatus))return res.status(error.publicStatus).json({error:error.message});
  // Do not expose service-account, session, or upstream response details.
  console.error('TO-dienstbord: opslagbewerking mislukt');
  return res.status(503).json({error:'Het dienstbord is tijdelijk niet beschikbaar. Controleer de Firebase-configuratie.'});
}
export function installTOBoardRoutes(app,{
  requireUser,store=createFirestoreTOStore(),getSnapshot=null,getTemporaryRequest=null
}={}){
  const identityCache=new Map();
  const identityFor=async actor=>{
    const discordId=String(actor?.discordId||'');
    if(!/^\d{15,22}$/.test(discordId)||!canOperateBoard(actor))return null;
    const old=identityCache.get(discordId);
    if(old&&Date.now()<old.expires)return old.identity;
    // A missing roster or an upstream error must not block the TO board itself.
    // Identity never comes from unverified client fields.
    let personnel=[],temporary=null;
    try{if(getSnapshot)personnel=(await getSnapshot()).data||[];}catch{}
    try{if(getTemporaryRequest)temporary=await getTemporaryRequest(discordId);}catch{}
    const identity=callsignForTO(actor,personnel,temporary);
    if(identityCache.size>=250)identityCache.clear();
    identityCache.set(discordId,{identity,expires:Date.now()+60000});
    return identity;
  };
  const requirePolice=(req,res,next)=>{
    if(!canReadBoard(req.bpd)||typeof req.bpd?.uid!=='string'||!req.bpd.uid)return res.status(403).json({error:'Geen toegang tot het politiedienstbord'});
    next();
  };
  app.get('/api/to/board',requireUser,requirePolice,async(req,res)=>{
    try{const [board,identity]=await Promise.all([store.readBoard(),identityFor(req.bpd)]);
      return res.json(envelope(board,req.bpd,identity));}catch(error){return failed(res,error);}
  });
  app.post('/api/to/commands',requireUser,requirePolice,async(req,res)=>{
    if(!canOperateBoard(req.bpd))return res.status(403).json({error:'Geen bevoegdheid om het politiedienstbord te bedienen'});
    try{
      const identity=await identityFor(req.bpd);
      const actor=identity?{...req.bpd,toCallsign:identity.call}:req.bpd;
      const result=await store.execute(req.body,{actor,now:Date.now(),id:randomUUID()});
      return res.json(envelope(result.board,req.bpd,identity));
    }catch(error){return failed(res,error);}
  });
  app.get('/api/to/incident-shortcuts',requireUser,requirePolice,async(req,res)=>{
    try{return res.json(await store.readShortcuts());}catch(error){return failed(res,error);}
  });
  app.post('/api/to/incident-shortcuts',requireUser,requirePolice,async(req,res)=>{
    if(!canOperateBoard(req.bpd))return res.status(403).json({error:'Geen bevoegdheid om sneltoetsen te beheren'});
    try{
      const result=await store.updateShortcuts(req.body,{actor:req.bpd,now:Date.now(),id:randomUUID()});
      return res.json(result);
    }catch(error){return failed(res,error);}
  });
  app.get('/api/to/archives',requireUser,requirePolice,async(_req,res)=>{
    try{return res.json(await store.listArchives());}catch(error){return failed(res,error);}
  });
  app.get('/api/to/archives/:id',requireUser,requirePolice,async(req,res)=>{
    if(!validBoardId(req.params.id))return res.status(400).json({error:'Ongeldige archiefverwijzing'});
    try{return res.json({archive:await store.readArchive(req.params.id)});}catch(error){return failed(res,error);}
  });
}
