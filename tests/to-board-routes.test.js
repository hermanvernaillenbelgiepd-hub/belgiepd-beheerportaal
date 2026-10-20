import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {emptyBoard} from '../src/to-board-policy.js';
import {createFirestoreTOStore,installTOBoardRoutes,TO_BOARD_COLLECTION,TO_ARCHIVE_COLLECTION,TO_SHORTCUT_COLLECTION} from '../src/to-board-routes.js';

const actors={
  owner:{uid:'discord:111111111111111111',discordId:'111111111111111111',role:'middenkader',departments:['politie'],departmentRoles:{politie:'middenkader'}},
  colleague:{uid:'discord:222222222222222222',discordId:'222222222222222222',role:'officierenkader',departments:['politie'],departmentRoles:{politie:'officierenkader'}},
  reader:{uid:'discord:333333333333333333',role:'basiskader',departments:['politie'],departmentRoles:{politie:'basiskader'}},
  foreign:{uid:'discord:444444444444444444',role:'beheerder',departments:['ambulance'],departmentRoles:{ambulance:'beheerder'}},
  mixed:{uid:'discord:555555555555555555',role:'beheerder',departments:['politie','ambulance'],departmentRoles:{politie:'basiskader',ambulance:'beheerder'}}
};
const currentPath=TO_BOARD_COLLECTION+'/politie';

// The adapter, policy and real Express requests run together. This fake only
// provides Firestore's atomic commit/retry boundary, without external services.
function databaseFixture(){
  let documents=new Map(),queue=Promise.resolve(),reads=0,failCommit=false;
  const snapshot=(path,values=documents)=>({exists:values.has(path),data:()=>structuredClone(values.get(path))});
  const reference=path=>({path,get:async()=>{reads++;return snapshot(path);}});
  const database={
    collection(name){
      return {
        doc:id=>reference(name+'/'+id),
        orderBy(){
          return {limit(count){
            return {get:async()=>{
              reads++;
              const docs=[...documents].filter(([path])=>path.startsWith(name+'/')).sort((a,b)=>(b[1].closedAt||0)-(a[1].closedAt||0)).slice(0,count)
                .map(([path,data])=>({id:path.slice(name.length+1),data:()=>structuredClone(data)}));
              return {docs};
            }};
          }};
        }
      };
    },
    runTransaction(fn){
      const execution=queue.then(async()=>{
        const staged=structuredClone(documents);
        const transaction={
          get:async ref=>{reads++;return snapshot(ref.path,staged);},
          create(ref,value){if(staged.has(ref.path))throw Error('Duplicate document');staged.set(ref.path,structuredClone(value));},
          set(ref,value){staged.set(ref.path,structuredClone(value));}
        };
        const result=await fn(transaction);
        if(failCommit)throw Error('Private upstream database credential diagnostic');
        documents=staged;
        return result;
      });
      queue=execution.catch(()=>{});
      return execution;
    }
  };
  return {database,get reads(){return reads;},set failCommit(value){failCommit=value;},
    data:path=>structuredClone(documents.get(path)),
    put:(path,value)=>documents.set(path,structuredClone(value)),
    keys:()=>[...documents.keys()]};
}

async function appFixture(run,{getSnapshot=null,getTemporaryRequest=null}={}){
  const db=databaseFixture(),store=createFirestoreTOStore({getDatabase:()=>db.database});
  const app=express();
  app.use('/api/to',express.json({limit:'24kb',strict:true}));
  installTOBoardRoutes(app,{store,getSnapshot,getTemporaryRequest,requireUser:(req,res,next)=>{
    const actor=actors[req.get('X-Test-Actor')];
    if(!actor)return res.status(401).json({error:'Aanmelding vereist'});
    req.bpd=actor;next();
  }});
  const server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{if(server.listening)return resolve();server.once('listening',resolve);server.once('error',reject);});
  const base='http://127.0.0.1:'+server.address().port;
  async function request(path,{actor='owner',method='GET',body}={}){
    const response=await fetch(base+path,{method,headers:{...(actor?{'X-Test-Actor':actor}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
  }
  const command=(body,actor='owner')=>request('/api/to/commands',{method:'POST',body,actor});
  try{await run({request,command,db,store});}finally{await new Promise(resolve=>server.close(resolve));}
}

test('TO board GET and commands bind a verified staff callsign to the actor UID',async()=>{
  const personnel=[{dept:'politie',personId:actors.owner.discordId,name:'TO A',call:'930'}];
  await appFixture(async({request,command,db})=>{
    const profile=await request('/api/to/board');
    assert.equal(profile.status,200);
    assert.equal(profile.body.viewer.callsign,'930');
    assert.equal(profile.body.viewer.callsignSource,'personeelslijst');
    const result=await command({type:'start',expectedRevision:0,displayName:'Wrong user-supplied name'});
    assert.equal(result.status,200);
    assert.equal(result.body.board.session.to,'930');
    assert.equal(result.body.board.session.ownerUid,actors.owner.uid);
    assert.equal(db.data(currentPath).session.to,'930');
  },{getSnapshot:async()=>({data:personnel})});
});

test('TO temporary callsign comes from a verified request only, not a username',async()=>{
  await appFixture(async({request,command})=>{
    const profile=await request('/api/to/board',{actor:'colleague'});
    assert.equal(profile.body.viewer.callsign,'130');
    assert.equal(profile.body.viewer.callsignSource,'geverifieerd_tijdelijk');
    const began=await command({type:'start',expectedRevision:0,displayName:'Impersonator'},'colleague');
    assert.equal(began.status,200);
    assert.equal(began.body.board.session.to,'130');
  },{getSnapshot:async()=>({data:[]}),getTemporaryRequest:async discordId=>
    discordId===actors.colleague.discordId?{discordId,temporaryCall:'130',status:'verified'}:null});
});

test('TO HTTP routes require authentication and police scope before touching storage',async()=>{
  await appFixture(async({request,db})=>{
    for(const actor of [null,'foreign']){
      for(const path of ['/api/to/board','/api/to/archives','/api/to/archives/'+randomUUID()]){
        const response=await request(path,{actor});
        assert.equal(response.status,actor?403:401,path);
      }
      const response=await request('/api/to/commands',{actor,method:'POST',body:{type:'start',expectedRevision:0,displayName:'Test TO'}});
      assert.equal(response.status,actor?403:401);
    }
    assert.equal(db.reads,0);
    assert.deepEqual(db.keys(),[]);
  });
});

test('Police readers can inspect the board but cannot inherit write rights from another department',async()=>{
  await appFixture(async({request,command,db})=>{
    for(const actor of ['reader','mixed']){
      const {status,body}=await request('/api/to/board',{actor});
      assert.equal(status,200);
      assert.deepEqual(body.board,emptyBoard());
      assert.equal(body.permissions.canRead,true);
      assert.equal(body.permissions.canOperate,false);
      assert.equal(body.permissions.canEdit,false);
      assert.equal(body.viewer.uid,actors[actor].uid);
      const denied=await command({type:'start',expectedRevision:0,displayName:'Test TO'},actor);
      assert.equal(denied.status,403);
    }
    assert.deepEqual(db.keys(),[]);
  });
});

test('Concurrent HTTP starts commit one owner and return a stale-write conflict to the other caller',async()=>{
  await appFixture(async({command,db,request})=>{
    const results=await Promise.all([
      command({type:'start',expectedRevision:0,displayName:'TO A'}),
      command({type:'start',expectedRevision:0,displayName:'TO B'},'colleague')
    ]);
    assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
    const saved=db.data(currentPath);
    assert.equal(saved.revision,1);
    assert.ok([actors.owner.uid,actors.colleague.uid].includes(saved.session.ownerUid));
    const {body}=await request('/api/to/board',{actor:'reader'});
    assert.equal(body.board.session.ownerUid,saved.session.ownerUid);
    assert.equal(body.permissions.canEdit,false);
  });
});

test('HTTP ownership is tied to verified UID and malformed command fields never enter the transaction',async()=>{
  await appFixture(async({command,db})=>{
    const start=await command({type:'start',expectedRevision:0,displayName:'Shared label'});
    assert.equal(start.status,200);
    assert.equal(start.body.permissions.canEdit,true);
    const spoof=await command({type:'add-team',expectedRevision:1,dienst:'SANTO',leden:[{naam:'Shared label',roep:'620'}]},'colleague');
    assert.equal(spoof.status,403);
    const injected=await command({type:'takeover',expectedRevision:1,displayName:'Shared label',reason:'Geldige reden voor overname.',ownerUid:actors.owner.uid},'colleague');
    assert.equal(injected.status,400);
    assert.equal(db.data(currentPath).revision,1);
    const takeover=await command({type:'takeover',expectedRevision:1,displayName:'Shared label',reason:'De dienst wordt door een collega overgenomen.'},'colleague');
    assert.equal(takeover.status,200);
    assert.equal(takeover.body.board.session.ownerUid,actors.colleague.uid);
    assert.equal(takeover.body.permissions.canEdit,true);
    assert.equal((await command({type:'close-session',expectedRevision:2})).status,403);
  });
});

test('Close writes an immutable complete archive and resets live state in one atomic commit',async()=>{
  await appFixture(async({command,request,db})=>{
    let response=await command({type:'start',expectedRevision:0,displayName:'TO Archief'});
    const sessionId=response.body.board.session.id;
    response=await command({type:'add-team',expectedRevision:1,dienst:'SANTO',leden:[{naam:'Agent Test',roep:'620'}]});
    const team=Object.values(response.body.board.ploegen)[0];
    response=await command({type:'create-incident',expectedRevision:2,postcode:'7042',titel:'Testmelding',omschrijving:'Alleen fictieve testdata.'});
    const incident=Object.values(response.body.board.meldingen)[0];
    response=await command({type:'attach-team',expectedRevision:3,id:incident.id,teamId:team.id});
    assert.equal(response.status,200);
    assert.equal((await command({type:'close-session',expectedRevision:4})).status,409);
    assert.equal(db.keys().filter(path=>path.startsWith(TO_ARCHIVE_COLLECTION+'/')).length,0);
    response=await command({type:'incident-status',expectedRevision:4,id:incident.id,status:'niet-actief'});
    assert.equal(response.status,200);
    response=await command({type:'close-session',expectedRevision:5});
    assert.equal(response.status,200);
    assert.equal(response.body.board.session,null);
    assert.deepEqual(response.body.board.meldingen,{});
    const archive=db.data(TO_ARCHIVE_COLLECTION+'/'+sessionId);
    assert.equal(archive.session.ownerUid,actors.owner.uid);
    assert.equal(archive.meldingen[incident.id].ploegen[0].id,team.id);
    const list=await request('/api/to/archives',{actor:'reader'});
    assert.equal(list.status,200);assert.equal(list.body.archives.length,1);
    assert.equal(list.body.archives[0].teamCount,1);assert.equal(list.body.archives[0].incidentCount,1);
    const detail=await request('/api/to/archives/'+sessionId,{actor:'reader'});
    assert.equal(detail.status,200);assert.deepEqual(detail.body.archive,archive);
  });
});

test('A failed atomic close leaves the live service intact and discloses no upstream credentials',async()=>{
  await appFixture(async({command,db})=>{
    const started=await command({type:'start',expectedRevision:0,displayName:'TO Test'});
    const before=db.data(currentPath),archivePath=TO_ARCHIVE_COLLECTION+'/'+started.body.board.session.id;
    db.failCommit=true;
    const failed=await command({type:'close-session',expectedRevision:1});
    assert.equal(failed.status,503);
    assert.equal(JSON.stringify(failed.body).includes('Private upstream'),false);
    assert.deepEqual(db.data(currentPath),before);
    assert.equal(db.data(archivePath),undefined);
    db.failCommit=false;
    assert.equal((await command({type:'close-session',expectedRevision:1})).status,200);
    assert.ok(db.data(archivePath));
  });
});

test('Archive lookups reject invalid IDs and withhold records from another department',async()=>{
  await appFixture(async({request,db})=>{
    const foreignId=randomUUID();
    db.put(TO_ARCHIVE_COLLECTION+'/'+foreignId,{id:foreignId,dept:'ambulance',session:{to:'Private foreign TO'},closedAt:1,ploegen:{},meldingen:{}});
    assert.equal((await request('/api/to/archives/not-a-valid-id')).status,400);
    assert.equal((await request('/api/to/archives/'+randomUUID())).status,404);
    assert.equal((await request('/api/to/archives/'+foreignId)).status,404);
    const {body}=await request('/api/to/archives');
    assert.deepEqual(body.archives,[]);
  });
});

test('Shared incident shortcuts are visible after shift close and writable only by current TO',async()=>{
  await appFixture(async({command,request,db})=>{
    const url='/api/to/incident-shortcuts';
    const empty=await request(url,{actor:'reader'});
    assert.equal(empty.status,200);
    assert.deepEqual(empty.body,{revision:0,items:{}});
    assert.equal((await request(url,{actor:'foreign'})).status,403);
    assert.equal((await request(url,{actor:null})).status,401);
    assert.equal((await request(url,{method:'POST',body:{action:'add',expectedRevision:0,title:'ANPR'}})).status,403);
    const started=await command({type:'start',displayName:'Hubert',expectedRevision:0});
    assert.equal(started.status,200);
    const body={action:'add',expectedRevision:0,title:'Verkeershinder',description:''};
    assert.equal((await request(url,{actor:'reader',method:'POST',body})).status,403);
    assert.equal((await request(url,{actor:'colleague',method:'POST',body})).status,403);
    const saved=await request(url,{method:'POST',body});
    assert.equal(saved.status,200);
    assert.equal(saved.body.revision,1);
    const shortcut=Object.values(saved.body.items)[0];
    assert.equal(shortcut.title,'Verkeershinder');
    assert.equal(Object.hasOwn(shortcut,'postcode'),false);
    assert.equal(db.data(TO_BOARD_COLLECTION+'/politie').revision,1,'Saving a shortcut does not mutate the live board');
    assert.equal(db.data(TO_SHORTCUT_COLLECTION+'/politie').revision,1);
    assert.equal((await request(url,{method:'POST',body})).status,409,'Stale shortcut writes are refused');
    assert.equal((await command({type:'close-session',expectedRevision:1})).status,200);
    const after=await request(url,{actor:'reader'});
    assert.equal(after.status,200);
    assert.equal(after.body.items[shortcut.id].title,'Verkeershinder','Saved templates survive service close');
    assert.equal((await request(url,{method:'POST',body:{action:'remove',expectedRevision:1,id:shortcut.id}})).status,403);
    assert.equal((await command({type:'start',expectedRevision:2,displayName:'Next TO'})).status,200);
    const removed=await request(url,{method:'POST',body:{action:'remove',expectedRevision:1,id:shortcut.id}});
    assert.equal(removed.status,200);
    assert.deepEqual(removed.body.items,{});
  });
});
