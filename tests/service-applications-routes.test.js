import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {installServiceApplicationRoutes} from '../src/service-applications-routes.js';
const id='298799630458552323',other='298799630458552324',guild='298799630458552325';
const now=new Date('2026-11-24T14:15:00.000Z'),secret='r'.repeat(44);
const env={DISCORD_GUILD_ID:guild,BPD_ENABLE_SERVICE_APPLICATIONS:'true',
 BPD_ENABLE_FIVEM_EVIDENCE_INGEST:'true',BPD_FIVEM_EVIDENCE_SECRET:secret};
const officer='298799630458552326';
const roster=[{dept:'depannage',personId:officer,call:'AWV21',rank:'AWV Leiding'}];
const leader={uid:'discord:'+officer,discordId:officer,role:'officierenkader',
 departments:['depannage'],departmentRoles:{depannage:'officierenkader'},
 reportServiceRoles:{depannageAwv:true}};
function mockDb(){
 const docs=new Map();let serial=0;
 const snap=key=>({exists:docs.has(key),data:()=>docs.get(key),
  get:field=>docs.get(key)?.[field]});
 const doc=key=>({path:key,get:async()=>snap(key),
  collection:name=>collection(key+'/'+name)});
 const collection=path=>({
  doc:(id)=>doc(path+'/'+(id||'a'+(++serial))),
  where:(field,op,value)=>({
   limit:max=>({get:async()=>({
    docs:[...docs.entries()].filter(([key,d])=>
     key.startsWith(path+'/')&&key.slice(path.length+1).indexOf('/')<0&&
     op==='=='&&d[field]===value).slice(0,max).map(([key,d])=>({id:key.split('/').at(-1),data:()=>d})),
    size:[...docs.entries()].filter(([key,d])=>
     key.startsWith(path+'/')&&key.slice(path.length+1).indexOf('/')<0&&
     op==='=='&&d[field]===value).slice(0,max).length})
   })})
  }),
  orderBy:(_field,_direction)=>({limit:max=>({get:async()=>({
   docs:[...docs.entries()].filter(([key])=>key.startsWith(path+'/')&&
    key.slice(path.length+1).indexOf('/')<0)
    .slice(0,max).reverse().map(([key,d])=>({data:()=>d}))
  })})})
 });
 return {docs,collection,
  runTransaction:async cb=>cb({
   get:async ref=>snap(ref.path),
   create:(ref,v)=>{if(docs.has(ref.path))throw Error('exists');docs.set(ref.path,v)},
   update:(ref,v)=>{if(!docs.has(ref.path))throw Error('not found');
    docs.set(ref.path,{...docs.get(ref.path),...v})},
   set:(ref,v)=>docs.set(ref.path,v)
  })
 };
}
async function withServer(options,run){
 const app=express();app.use('/api/service-applications',express.json({limit:'8kb',strict:true}));
 installServiceApplicationRoutes(app,options);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port+'/api/service-applications/';
 const api=async(path,method='GET',body,token='candidate')=>{
  const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,
   ...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json().catch(()=>({}))};
 };
 try{await run(api)}finally{await new Promise(ok=>server.close(ok))}
}
const actor=()=>leader;
const defaultMember=id=>({data:()=>({guildId:guild,roleIds:[],verifiedAt:now.valueOf()-60000})});
const auth=token=>({uid:'discord:'+(token==='second'?other:id),
 bpdDiscord:true,bpdGuildId:guild,firebase:{sign_in_provider:'custom'}});
function options({active=true,db=mockDb(),getActor=actor}={}){
 return {
  requireReviewer:(req,_res,next)=>{req.bpd=getActor();next()},
  getSnapshot:async()=>({stale:false,data:roster}),
  verifyToken:async token=>auth(token),
  getMember:async candidate=>defaultMember(candidate),
  getAccount:async()=>({data:()=>null}),
  dbFactory:()=>db,
  env:active?env:{...env,BPD_ENABLE_SERVICE_APPLICATIONS:'false'},
  now:()=>now
 };
}
test('MAIN-default OFF: no submissions, decisions or telemetry writes at any endpoint',async()=>{
 const db=mockDb();
 await withServer(options({active:false,db}),async api=>{
  let r=await api('status');
  assert.equal(r.status,200);assert.equal(r.data.enabled,false);
  assert.equal(r.data.ingestConfigured,false);
  r=await api('me');assert.equal(r.status,200);assert.deepEqual(r.data.cases,[]);
  r=await api('review?dept=depannage');assert.equal(r.status,200);
  assert.equal(r.data.reviewer,false);assert.deepEqual(r.data.cases,[]);
  r=await api('submit','POST',{department:'depannage',motivation:'a'.repeat(60)});
  assert.equal(r.status,503);
  r=await api('depannage/'+id+'/decision','POST',{
   action:'accept',reason:'Beoordeling op basis van dossier',expectedRevision:1});
  assert.equal(r.status,503);
  r=await api('telemetry','POST',{discordId:id,totalPlaySeconds:36000,
   firstServerJoinAt:'2026-11-01T00:00:00.000Z'},secret);
  assert.equal(r.status,503);
 });
 assert.equal(db.docs.size,0);
});
test('intake uses only signed FiveM proofs, one document per service, separate audit',async()=>{
 const db=mockDb();
 await withServer(options({db}),async api=>{
  const motivation='Ik wil de depannagedienst versterken en alle nodige opleidingen volgen.';
  let r=await api('submit','POST',{department:'depannage',motivation});
  assert.equal(r.status,422);assert.equal(db.docs.size,0);
  const telemetry={discordId:id,totalPlaySeconds:36000,
   firstServerJoinAt:'2026-11-01T00:00:00.000Z'};
  r=await api('telemetry','POST',telemetry,'wrong-token');
  assert.equal(r.status,401);assert.equal(db.docs.size,0);
  r=await api('telemetry','POST',telemetry,secret);
  assert.equal(r.status,202);
  assert.equal(db.docs.has('bpd_fivem_verified_playtime/'+id),true);
  r=await api('submit','POST',{department:'depannage',motivation});
  assert.equal(r.status,201);assert.equal(r.data.automaticPersonnelEntry,false);
  assert.equal(db.docs.has('bpd_service_applications/depannage_'+id),true);
  const stored=db.docs.get('bpd_service_applications/depannage_'+id);
  assert.equal(stored.status,'submitted');
  assert.equal(stored.revision,1);
  assert.equal(stored.motivation,motivation);
  r=await api('submit','POST',{department:'depannage',motivation});
  assert.equal(r.status,409);
  r=await api('me');
  assert.equal(r.status,200);assert.equal(r.data.cases.length,1);
  assert.equal(r.data.cases[0].department,'depannage');
  assert.ok([...db.docs.keys()].some(x=>x.startsWith('bpd_service_applications/depannage_'+id+'/audit/')));
  assert.equal([...db.docs.keys()].some(x=>x.startsWith('bpd_portal_users/')),false);
  assert.equal([...db.docs.keys()].some(x=>x.startsWith('bpd_personnel/')),false);
 });
});
test('service reviews enforce independent duty leadership, no self-approval, revisions and transitions',async()=>{
 const db=mockDb();let reviewer=leader;
 const opt=options({db,getActor:()=>reviewer});
 await withServer(opt,async api=>{
  const motivation='Ik wil de depannagedienst versterken en de nodige opleidingen volgen.';
  await api('telemetry','POST',{discordId:id,totalPlaySeconds:38000,
   firstServerJoinAt:'2026-11-01T00:00:00.000Z'},secret);
  assert.equal((await api('submit','POST',{department:'depannage',motivation})).status,201);
  let result=await api('review?dept=depannage');
  assert.equal(result.status,200);assert.equal(result.data.cases.length,1);
  assert.equal(result.data.canDecide,true);
  result=await api('review?dept=ambulance');assert.equal(result.status,403);
  reviewer={...leader,reportServiceRoles:{depannageAwv:false},role:'middenkader',
   departmentRoles:{depannage:'middenkader'}};
  result=await api('review?dept=depannage');assert.equal(result.status,403);
  reviewer={uid:'discord:'+id,discordId:id,role:'beheerder',departments:[],
   portalTechnicalMode:true,profileTechnicalAvailable:true};
  result=await api('depannage/'+id+'/decision','POST',{action:'start_review',
   reason:'Kandidaat wordt verder onderzocht',expectedRevision:1});
  assert.equal(result.status,403);
  reviewer=leader;
  result=await api('depannage/'+id+'/decision','POST',{action:'accept',
   reason:'Kandidaat is voldoende voorbereid',expectedRevision:1});
  assert.equal(result.status,409);
  result=await api('depannage/'+id+'/decision','POST',{action:'start_review',
   reason:'Aanvraag wordt verder gecontroleerd',expectedRevision:1});
  assert.equal(result.status,200);assert.equal(result.data.status,'reviewing');
  result=await api('depannage/'+id+'/decision','POST',{action:'accept',
   reason:'Kandidaat voldoet aan de instroomcriteria',expectedRevision:1});
  assert.equal(result.status,409);
  result=await api('depannage/'+id+'/decision','POST',{action:'accept',
   reason:'Kandidaat voldoet aan de instroomcriteria',expectedRevision:2});
  assert.equal(result.status,200);assert.equal(result.data.status,'accepted');
  assert.equal(result.data.personnelCreated,false);
  assert.equal(result.data.discordRolesChanged,false);
  result=await api('depannage/'+id+'/history');
  assert.equal(result.status,200);
  assert.equal(result.data.history.length,3);
  assert.equal(db.docs.get('bpd_service_applications/depannage_'+id).revision,3);
 });
});
test('personal withdrawal is permitted before decision and creates no appointment',async()=>{
 const db=mockDb();
 await withServer(options({db}),async api=>{
  await api('telemetry','POST',{discordId:other,totalPlaySeconds:42000,
   firstServerJoinAt:'2026-11-01T00:00:00.000Z'},secret);
  const motivation='Ik wil als medewerker bijdragen aan de depannagedienst en bijleren.';
  assert.equal((await api('submit','POST',{department:'depannage',motivation},'second')).status,201);
  let r=await api('withdraw','POST',{department:'depannage'},'second');
  assert.equal(r.status,200);
  assert.equal(r.data.automaticPersonnelEntry,false);
  r=await api('withdraw','POST',{department:'depannage'},'second');
  assert.equal(r.status,409);
  const state=db.docs.get('bpd_service_applications/depannage_'+other);
  assert.equal(state.status,'withdrawn');
 });
});
