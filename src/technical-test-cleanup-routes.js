import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {
  TEST_CLEANUP_SERVICES,TEST_CLEANUP_AUDIT,TEST_CLEANUP_MARKER,
  mayUseTestCleanup,validCleanupScope,canCleanupRecord,
  cleanupRecordState,validateCleanupCommand
} from './technical-test-cleanup-policy.js';

const fail=(code,msg)=>Object.assign(Error(msg),{status:code});
const safe=(res,error)=>{
  if(error?.status)return res.status(error.status).json({error:error.message});
  console.error('Technisch testgegevensbeheer:',error?.code||'onbekend');
  return res.status(503).json({error:'Testgegevens konden niet veilig worden verwerkt'});
};
const iso=value=>value?.toDate?.()?.toISOString?.()||null;
const str=(value,n)=>typeof value==='string'?value.slice(0,n):'';
const sources=dept=>dept==='burger'?['citizen']:['cases','staff'];
const parentKey=(dept,id)=>dept==='burger'?id:dept+'_'+id;
const collectionFor=source=>source==='citizen'?'bpd_citizen_staff_dossiers':
  source==='staff'?'bpd_staff_dossiers':'bpd_cases';
const refFor=(db,dept,id,source)=>db.collection(collectionFor(source))
  .doc(parentKey(dept,id)).collection('entries');
const rowFor=(source,doc)=>{
  const data=doc.data(),state=cleanupRecordState(source,data);
  if(state!=='withdrawn'&&!canCleanupRecord(source,data))return null;
  return {
    entryId:doc.id,source,
    kind:str(source==='citizen'?data.kind:source==='staff'?data.kind:data.type,40),
    title:str(data.title,120),details:str(data.details,600),
    eventDate:str(data.eventDate,10),createdAt:iso(data.createdAt),
    state,reason:state==='withdrawn'?str(data.cleanup?.reason,500):null,
    testMarker:canCleanupRecord(source,data),
    canWithdraw:state==='active'&&canCleanupRecord(source,data),
    canRestore:state==='withdrawn'
  };
};

export function installTechnicalTestCleanupRoutes(app,{requireUser,getSnapshot,dbFactory=getFirestore}){
  const authorize=(req,res,next)=>{
    res.set('Cache-Control','private, no-store');
    if(!mayUseTestCleanup(req.bpd))return res.status(403).json({
      error:'Alleen het geverifieerde technische beheerprofiel mag testgegevens opschonen'
    });
    next();
  };
  const guarded=[requireUser,authorize];
  async function currentRoster(){
    const snapshot=await getSnapshot();
    if(snapshot?.stale||!Array.isArray(snapshot?.data))
      throw fail(503,'De personeelsbron is niet actueel; opschonen tijdelijk geblokkeerd');
    return snapshot.data;
  }
  async function subject(dept,id){
    if(!validCleanupScope(dept,id))throw fail(400,'Ongeldige dienst of Discord-ID');
    const roster=await currentRoster();
    const matching=roster.filter(p=>p?.dept===dept&&p.personId===id);
    if(matching.length!==1)throw fail(409,
      matching.length?'Dubbel personeelsrecord: eerst bron herstellen':
        'Personeelslid niet gevonden in actuele personeelslijst');
    return matching[0];
  }
  app.get('/api/technical-cleanup/access',...guarded,(_req,res)=>
    res.json({canManage:true,services:TEST_CLEANUP_SERVICES,
      onlyExplicitTests:true,physicalDeletion:false}));

  app.get('/api/technical-cleanup/subjects',...guarded,async(req,res)=>{
    try{
      const dept=String(req.query.dept||'');
      if(!TEST_CLEANUP_SERVICES.includes(dept))throw fail(400,'Kies een hulpdienst');
      const all=(await currentRoster()).filter(p=>p?.dept===dept&&
        validCleanupScope(dept,p.personId));
      const counts=new Map();
      for(const p of all)counts.set(p.personId,(counts.get(p.personId)||0)+1);
      const unique=all.filter(p=>counts.get(p.personId)===1)
        .map(p=>({discordId:p.personId,name:str(p.name,120),
          call:str(p.call,30),rank:str(p.rank,80)}))
        .sort((a,b)=>a.name.localeCompare(b.name,'nl-BE'));
      return res.json({persons:unique.slice(0,600),limited:unique.length>600,
        excludedDuplicates:[...counts.values()].filter(n=>n>1).length});
    }catch(error){return safe(res,error)}
  });

  app.get('/api/technical-cleanup/entries',...guarded,async(req,res)=>{
    try{
      const dept=String(req.query.dept||''),id=String(req.query.discordId||'');
      const who=await subject(dept,id),db=dbFactory();
      const jobs=sources(dept).map(source=>refFor(db,dept,id,source)
        .orderBy('createdAt','desc').limit(120).get());
      const snapshots=await Promise.all(jobs);
      const entries=[],bySource={};
      snapshots.forEach((snap,index)=>{
        const source=sources(dept)[index];
        let excluded=0;
        for(const doc of snap.docs){
          const row=rowFor(source,doc);
          if(row)entries.push(row);else excluded++;
        }
        bySource[source]={scanned:snap.size,limited:snap.size===120,
          protectedCount:excluded};
      });
      entries.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
      return res.json({person:{discordId:id,dept,
        name:str(who.name,120),call:str(who.call,30)},
        entries,bySource,onlyExplicitTests:true,physicalDeletion:false});
    }catch(error){return safe(res,error)}
  });
  app.get('/api/technical-cleanup/audit',...guarded,async(req,res)=>{
    try{
      const dept=String(req.query.dept||''),id=String(req.query.discordId||'');
      await subject(dept,id);
      const snap=await dbFactory().collection(TEST_CLEANUP_AUDIT)
        .doc(dept+'_'+id).collection('events')
        .orderBy('at','desc').limit(50).get();
      const rows=snap.docs.map(doc=>{
        const data=doc.data();
        return {id:doc.id,action:data.action==='restore'?'restore':'withdraw',
          source:str(data.source,20),kind:str(data.kind,40),
          entryId:str(data.entryId,120),
          actorDiscordId:str(data.actorDiscordId,22),
          reason:str(data.reason,500),at:iso(data.at)};
      });
      return res.json({events:rows,limited:snap.size===50});
    }catch(error){return safe(res,error)}
  });

  for(const action of ['withdraw','restore']){
    app.post('/api/technical-cleanup/'+action,...guarded,async(req,res)=>{
      let input;
      try{input=validateCleanupCommand(req.body,action)}
      catch(e){return res.status(400).json({error:e.message})}
      try{
        const {dept,discordId:id,source,entryId,reason}=input;
        await subject(dept,id);
        if(req.bpd.discordId===id)throw fail(403,
          'Opschonen van registraties in je eigen dossier is niet toegestaan');
        const db=dbFactory(),entryRef=refFor(db,dept,id,source).doc(entryId);
        const auditRef=db.collection(TEST_CLEANUP_AUDIT).doc(dept+'_'+id)
          .collection('events').doc();
        await db.runTransaction(async tx=>{
          const snap=await tx.get(entryRef);
          if(!snap.exists)throw fail(404,'Registratie niet gevonden');
          const existing=snap.data(),state=cleanupRecordState(source,existing);
          const at=FieldValue.serverTimestamp();
          if(action==='withdraw'){
            if(state!=='active')throw fail(409,'Registratie is al ingetrokken of beschermd');
            if(!canCleanupRecord(source,existing))
              throw fail(403,'Geen expliciete testmarkering: officiële registratie blijft beschermd');
            const cleanup={marker:TEST_CLEANUP_MARKER,state:'withdrawn',
              at,actorDiscordId:req.bpd.discordId,actorUid:req.bpd.uid,
              reason,previousStatus:typeof existing.status==='string'?
                existing.status:null};
            if(source==='citizen')tx.update(entryRef,{cleanup,deletedAt:at,
              deletedByDiscordId:req.bpd.discordId,deleteReason:reason});
            else tx.update(entryRef,{cleanup,status:'verwijderd',
              retired:{at,reason,actorDiscordId:req.bpd.discordId,
                actorUid:req.bpd.uid},modifiedAt:at});
          }else{
            if(state!=='withdrawn'||existing.cleanup?.marker!==TEST_CLEANUP_MARKER)
              throw fail(409,'Alleen eerder via dit beheer ingetrokken testdata kan worden hersteld');
            if(source==='citizen')tx.update(entryRef,{cleanup:FieldValue.delete(),
              deletedAt:FieldValue.delete(),deletedByDiscordId:FieldValue.delete(),
              deleteReason:FieldValue.delete()});
            else tx.update(entryRef,{cleanup:FieldValue.delete(),retired:FieldValue.delete(),
              status:existing.cleanup.previousStatus??FieldValue.delete(),modifiedAt:at});
          }
          tx.create(auditRef,{action,dept,discordId:id,source,entryId,
            kind:str(source==='cases'?existing.type:existing.kind,40),
            reason,actorUid:req.bpd.uid,actorDiscordId:req.bpd.discordId,
            testMarkerAtCreation:canCleanupRecord(source,existing),
            at});
        });
        return res.json({saved:true,action,entryId,auditId:auditRef.id,
          hardDeleted:false,historyPreserved:true});
      }catch(error){return safe(res,error)}
    });
  }
}
