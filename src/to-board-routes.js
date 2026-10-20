import {randomUUID} from 'node:crypto';
import {applicationDefault,getApps,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {TO_CATEGORIES,applyBoardCommand,canReadBoard,canOperateBoard,emptyBoard,validBoardId,boardError} from './to-board-policy.js';

export const TO_BOARD_COLLECTION='bpd_to_boards';
export const TO_ARCHIVE_COLLECTION='bpd_to_archives';
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
function envelope(board,actor){
  const canOperate=canOperateBoard(actor);
  return {board,categories:TO_CATEGORIES,permissions:{canRead:true,canOperate,canEdit:canOperate&&board.session?.ownerUid===actor.uid},viewer:{uid:actor.uid},writesEnabled:true};
}
function failed(res,error){
  if(Number.isInteger(error?.publicStatus)&&[400,403,404,409,413].includes(error.publicStatus))return res.status(error.publicStatus).json({error:error.message});
  // Do not expose service-account, session, or upstream response details.
  console.error('TO-dienstbord: opslagbewerking mislukt');
  return res.status(503).json({error:'Het dienstbord is tijdelijk niet beschikbaar. Controleer de Firebase-configuratie.'});
}
export function installTOBoardRoutes(app,{requireUser,store=createFirestoreTOStore()}={}){
  const requirePolice=(req,res,next)=>{
    if(!canReadBoard(req.bpd)||typeof req.bpd?.uid!=='string'||!req.bpd.uid)return res.status(403).json({error:'Geen toegang tot het politiedienstbord'});
    next();
  };
  app.get('/api/to/board',requireUser,requirePolice,async(req,res)=>{
    try{return res.json(envelope(await store.readBoard(),req.bpd));}catch(error){return failed(res,error);}
  });
  app.post('/api/to/commands',requireUser,requirePolice,async(req,res)=>{
    if(!canOperateBoard(req.bpd))return res.status(403).json({error:'Geen bevoegdheid om het politiedienstbord te bedienen'});
    try{
      const result=await store.execute(req.body,{actor:req.bpd,now:Date.now(),id:randomUUID()});
      return res.json(envelope(result.board,req.bpd));
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
