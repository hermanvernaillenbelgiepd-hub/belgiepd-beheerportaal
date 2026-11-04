import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import express from 'express';
import {basicObservationJsonParser} from '../src/basic-observation-json.js';
import {installBasicObservationRoutes} from '../src/basic-observation-routes.js';

const main=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');

test('MAIN registers an observation JSON parser before the secure POST route',()=>{
 const mounted=main.indexOf("app.use('/api/basic-observations',basicObservationJsonParser);");
 const installed=main.indexOf('installBasicObservationRoutes(app,{requireUser:requireDossierUser');
 assert.ok(mounted>0,'Observation requests must have JSON parsing middleware');
 assert.ok(installed>mounted,'Parsing must occur before the observation handler');
 assert.match(main,/import \{basicObservationJsonParser\} from '\.\/basic-observation-json\.js'/);
});

test('Integration: selected 18-digit Discord target reaches POST route as JSON, not empty body',async()=>{
 const app=express();
 app.use('/api/basic-observations',basicObservationJsonParser);
 installBasicObservationRoutes(app,{
   requireUser:(req,_res,next)=>{
     req.bpd={discordId:'432432432432432432',uid:'discord:432432432432432432',
       departments:['politie'],departmentRoles:{politie:'basiskader'},
       role:'basiskader'};
     next();
   },
   getSnapshot:async()=>({stale:false,data:[]})
 });
 const server=app.listen(0,'127.0.0.1');
 await once(server,'listening');
 const endpoint='http://127.0.0.1:'+server.address().port+'/api/basic-observations';
 async function send(payload){
   const response=await fetch(endpoint,{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify(payload)
   });
   return {status:response.status,data:await response.json()};
 }
 try{
   const valid=await send({type:'observatie',discordId:'208208208208208208',
     eventDate:'2026-11-04',eventTime:'15:39',details:'Beveiligde observatietest.'});
   // The parsed ID passes early validation and reaches the author/rank guard.
   // No roster match is supplied, so this cannot write any database record.
   assert.equal(valid.status,403);
   assert.match(valid.data.error,/enkel politieleden van een lagere rang/);
   const noTarget=await send({type:'observatie',discordId:'',
     eventDate:'2026-11-04',eventTime:'15:39',details:'Test'});
   assert.equal(noTarget.status,400);
   assert.match(noTarget.data.error,/Kies eerst een betrokken personeelslid/);
   const callsign=await send({type:'observatie',discordId:'208',
     eventDate:'2026-11-04',eventTime:'15:39',details:'Test'});
   assert.equal(callsign.status,400);
   assert.match(callsign.data.error,/geen geldig Discord-ID/);
 }finally{
   await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
