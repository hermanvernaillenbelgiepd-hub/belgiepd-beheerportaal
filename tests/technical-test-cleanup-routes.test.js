import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {installTechnicalTestCleanupRoutes} from '../src/technical-test-cleanup-routes.js';

const id='123456789012345678';
const verified={uid:'discord:'+id,discordId:id,role:'beheerder',
 portalTechnicalMode:true,profileTechnicalAvailable:true};
const unauthorised={...verified,portalTechnicalMode:false,role:'korpsleiding'};

test('technical cleanup API rejects all operational roles, including direct GET/POST',async()=>{
 const app=express();
 app.use('/api/technical-cleanup',express.json({limit:'4kb',strict:true}));
 installTechnicalTestCleanupRoutes(app,{
  requireUser:(req,_res,next)=>{req.bpd=unauthorised;next()},
  getSnapshot:async()=>{throw Error('Untrusted actors must not reach roster')}
 });
 const server=app.listen(0,'127.0.0.1');
 try{
  if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  for(const path of ['/api/technical-cleanup/access',
    '/api/technical-cleanup/subjects?dept=politie',
    '/api/technical-cleanup/entries?dept=burger&discordId='+id,
    '/api/technical-cleanup/audit?dept=burger&discordId='+id]){
    const r=await fetch(origin+path);assert.equal(r.status,403,path);
  }
  for(const action of ['withdraw','restore']){
    const r=await fetch(origin+'/api/technical-cleanup/'+action,{method:'POST',
      headers:{'content-type':'application/json'},body:'{}'});
    assert.equal(r.status,403,'no direct writes as operational cadre');
  }
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('verified technical profile receives access but invalid write is rejected before Firestore',async()=>{
 const app=express();app.use('/api/technical-cleanup',express.json({limit:'4kb',strict:true}));
 installTechnicalTestCleanupRoutes(app,{
  requireUser:(req,_res,next)=>{req.bpd=verified;next()},
  getSnapshot:async()=>{throw Error('Invalid write must not use Firestore')}
 });
 const server=app.listen(0,'127.0.0.1');
 try{
  if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const access=await fetch(origin+'/api/technical-cleanup/access');
  assert.equal(access.status,200);
  const data=await access.json();
  assert.equal(data.canManage,true);
  assert.equal(data.physicalDeletion,false);
  for(const action of ['withdraw','restore']){
    const r=await fetch(origin+'/api/technical-cleanup/'+action,{method:'POST',
      headers:{'content-type':'application/json'},body:'{}'});
    assert.equal(r.status,400);
  }
 }finally{await new Promise(resolve=>server.close(resolve))}
});
