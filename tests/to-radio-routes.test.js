import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {installTORadioRoutes} from '../src/to-radio-routes.js';

const roles=['basiskader','middenkader','officierenkader','korpsleiding','beheerder'];
const actors=Object.fromEntries(roles.map((role,index)=>[role,{
  uid:'discord:'+String(index+1).repeat(18),role,departments:['politie'],departmentRoles:{politie:role}
}]));
Object.assign(actors,{
  foreign:{uid:'discord:666666666666666666',role:'beheerder',departments:['ambulance'],departmentRoles:{ambulance:'beheerder'}},
  mixed:{uid:'discord:777777777777777777',role:'beheerder',departments:['politie','ambulance'],departmentRoles:{politie:'burger',ambulance:'beheerder'}},
  mixedReader:{uid:'discord:888888888888888888',role:'beheerder',departments:['politie','ambulance'],departmentRoles:{politie:'basiskader',ambulance:'beheerder'}},
  noUid:{role:'basiskader',departments:['politie'],departmentRoles:{politie:'basiskader'}},
  emptyUid:{uid:'',role:'basiskader',departments:['politie'],departmentRoles:{politie:'basiskader'}},
  invalidUid:{uid:123,role:'basiskader',departments:['politie'],departmentRoles:{politie:'basiskader'}}
});

// Run the actual middleware and HTTP response boundary without a radio server.
async function appFixture(run){
  const state={reads:0,arguments:[],payload:{configured:true,online:true,users:[]},error:null};
  const app=express();
  installTORadioRoutes(app,{
    requireUser:(req,res,next)=>{
      const actor=actors[req.get('X-Test-Actor')];
      if(!actor)return res.status(401).json({error:'Aanmelding vereist'});
      req.bpd=actor;
      next();
    },
    service:{async read(...args){
      state.reads++;
      state.arguments.push(args);
      if(state.error)throw state.error;
      return structuredClone(state.payload);
    }}
  });
  const server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{
    if(server.listening)return resolve();
    server.once('listening',resolve);
    server.once('error',reject);
  });
  const base='http://127.0.0.1:'+server.address().port;
  const request=async(actor='basiskader')=>{
    const response=await fetch(base+'/api/to/radio',{headers:actor?{'X-Test-Actor':actor}:{}});
    return {status:response.status,body:await response.json()};
  };
  try{await run({request,state});}finally{
    await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections?.();});
  }
}

test('Radio HTTP access requires authentication, police scope and a verified UID before reading',async()=>{
  await appFixture(async({request,state})=>{
    for(const actor of [null,'foreign','mixed','noUid','emptyUid','invalidUid']){
      const response=await request(actor);
      assert.equal(response.status,actor?403:401,String(actor));
      assert.equal(state.reads,0,String(actor)+' must not reach the radio service');
    }
  });
});

test('Every police reader role can read radio users without board operation privileges',async()=>{
  await appFixture(async({request,state})=>{
    for(const actor of [...roles,'mixedReader']){
      const response=await request(actor);
      assert.equal(response.status,200,actor);
      assert.deepEqual(response.body,state.payload,actor);
    }
    assert.equal(state.reads,roles.length+1);
    assert.ok(state.arguments.every(args=>args.length===0),'service reads do not receive authentication data');
  });
});

test('Radio HTTP responses preserve only the sanitized service payload including offline states',async()=>{
  await appFixture(async({request,state})=>{
    const payloads=[
      {configured:true,online:true,users:[{name:'Agent Test',channel:'Politie'}]},
      {configured:true,online:false,users:[]},
      {configured:false,online:false,users:[]}
    ];
    for(const payload of payloads){
      state.payload=payload;
      const response=await request();
      assert.equal(response.status,200);
      assert.deepEqual(response.body,payload);
      assert.equal('viewer' in response.body,false);
      assert.equal('permissions' in response.body,false);
      assert.equal('uid' in response.body,false);
    }
    assert.equal(state.reads,payloads.length);
  });
});

test('Unexpected radio service failures return a generic 503 without private upstream details',async()=>{
  await appFixture(async({request,state})=>{
    state.error=new Error('Private radio upstream detail: secret-password at private-host:9987');
    state.error.token='private-token';
    const response=await request();
    assert.equal(response.status,503);
    assert.equal(state.reads,1);
    assert.deepEqual(Object.keys(response.body),['error']);
    assert.equal(typeof response.body.error,'string');
    assert.ok(response.body.error.length>0);
    for(const detail of ['Private radio upstream','secret-password','private-host','private-token']){
      assert.equal(JSON.stringify(response.body).includes(detail),false,detail);
    }
  });
});
