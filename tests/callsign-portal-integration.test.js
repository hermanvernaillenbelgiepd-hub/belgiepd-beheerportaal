import test from 'node:test';
import assert from 'node:assert/strict';
import {installCallsignRoutes} from '../src/callsign-routes.js';
import {claimId} from '../src/callsign-portal-policy.js';
import {asCreatedPersonnel} from '../src/personnel-create.js';

// Entire simulation runs IN MEMORY. No Render, Sheets, Firebase, or Discord writes.
const candidate='123456789012345678';
const cadreId='987654321098765432';
const guild='222222222222222222';
const when=()=>Date.now();
class FakeDb {
  constructor(){this.docs=new Map();this.sequence=0;}
  ref(path){const db=this;return {
    path, id:path.split('/').at(-1),
    collection(name){return db.collection(path+'/'+name)},
    async get(){return db.snapshot(path)},
    async create(data){if(db.docs.has(path)){const e=Error('Already exists');e.code=6;throw e;}db.docs.set(path,data);}
  }}
  collection(name){const db=this;return {
    doc(id){return db.ref(name+'/'+(id??('audit-'+(++db.sequence))))},
    orderBy(){return this},
    where(field,op,value){return Object.assign({},this,{whereField:field,whereValue:value})},
    limit(n){return Object.assign({},this,{max:n})},
    async get(){
      const matches=[...db.docs].filter(([k,v])=>k.startsWith(name+'/')&&k.slice(name.length+1).indexOf('/')<0&&
        (!this.whereField||v[this.whereField]===this.whereValue)).slice(0,this.max??10000);
      return {docs:matches.map(([k])=>db.snapshot(k)),size:matches.length};
    }
  }}
  snapshot(path){const data=this.docs.get(path);return {
    id:path.split('/').at(-1),exists:data!==undefined,
    data:()=>data,
    get:key=>data?.[key]
  }}
  async runTransaction(fn){
    const pending=[];
    const tx={
      get:r=>this.ref(r.path).get(),
      create:(r,doc)=>pending.push(['create',r.path,doc]),
      update:(r,doc)=>pending.push(['update',r.path,doc])
    };
    const result=await fn(tx);
    // Validate the WHOLE batch before modifying any in-memory documents.
    for(const [action,key] of pending){
      if(action==='create'&&this.docs.has(key)){const e=Error('Already exists');e.code=6;throw e;}
      if(action==='update'&&!this.docs.has(key))throw Error('Missing document');
    }
    for(const [action,key,doc] of pending)
      this.docs.set(key,action==='update'?{...this.docs.get(key),...doc}:doc);
    return result;
  }
}

const routes=new Map();
const app={
  get:(key,...fns)=>routes.set('GET '+key,fns),
  post:(key,...fns)=>routes.set('POST '+key,fns)
};
const officer=role=>({uid:'discord:'+cadreId,discordId:cadreId,
  role,departments:['politie'],departmentRoles:{politie:role}});
const roster=[{dept:'politie',personId:cadreId,name:'Fictieve officier',call:'930',rank:'Commissaris'},
  {dept:'politie',personId:'444444444444444444',name:'Reeds toegewezen',call:'200',rank:'Agent'}];
function send(method,key,{bpd,body={},params={},query={},authId=candidate}={}){
  const fns=routes.get(method+' '+key);
  assert.ok(fns,'Registered route '+method+' '+key);
  const request={bpd,body,params,query,get:header=>header==='Authorization'?'Bearer mock-discord:'+authId:''};
  const response={
    code:200,payload:null,
    status(n){this.code=n;return this},
    json(data){this.payload=data;return this}
  };
  return (async()=>{
    let continuation;
    await fns[0](request,response,()=>{continuation=Promise.resolve(fns[1]?.(request,response))});
    if(continuation)await continuation;
    return response;
  })();
}
const envKeys=['FIREBASE_PROJECT_ID','BPD_TEST_FIXTURES','BPD_ENABLE_PERSONNEL_CREATION',
  'BPD_ENABLE_PERSONNEL_WRITES','BPD_ENABLE_CALLSIGN_REQUESTS',
  'BPD_ENABLE_PORTAL_CALLSIGN_APPROVALS','BPD_ENABLE_STAFF_DOSSIERS',
  'BPD_ENABLE_DISCORD_PORTAL_LOGIN','DISCORD_GUILD_ID'];
const envBackup=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
const mockDb=new FakeDb();let snapshotReads=0;
mockDb.docs.set('bpd_discord_auth/'+candidate,{
  guildId:guild,roleIds:[],username:'Fictieve agent',
  verifiedAt:when(),joinedAt:'2026-10-01T00:00:00.000Z'
});
const config={
  FIREBASE_PROJECT_ID:'belgiepd-test',BPD_TEST_FIXTURES:'true',
  BPD_ENABLE_PERSONNEL_CREATION:'true',BPD_ENABLE_PERSONNEL_WRITES:'true',
  BPD_ENABLE_CALLSIGN_REQUESTS:'true',BPD_ENABLE_PORTAL_CALLSIGN_APPROVALS:'true',
  BPD_ENABLE_STAFF_DOSSIERS:'true',BPD_ENABLE_DISCORD_PORTAL_LOGIN:'true',
  DISCORD_GUILD_ID:guild
};

test('SIMULATION: temporary 166 → fixed 201 → personnel + complete linked dossier transaction',async()=>{
  try{
    Object.assign(process.env,config);
    routes.clear();
    installCallsignRoutes(app,{
      requireUser:(_req,_res,next)=>next(),
      getSnapshot:async()=>{snapshotReads++;return {stale:false,data:roster}},
      onPersonnelChanged:()=>{},
      firestore:()=>mockDb,
      authentication:()=>({
        verifyIdToken:async()=>({uid:'discord:'+candidate,bpdDiscord:true,bpdGuildId:guild,
          firebase:{sign_in_provider:'custom'}})
      })
    });

    const self=await send('POST','/api/callsigns/self',{
      body:{name:'Fictieve agent',temporaryCall:166,preferredCall:null}
    });
    assert.equal(self.code,201,JSON.stringify(self.payload));
    assert.equal(mockDb.snapshot('bpd_callsign_requests/'+candidate).get('status'),'submitted');

    const own=await send('GET','/api/callsigns/self');
    assert.equal(own.code,200);
    assert.equal(own.payload.request.name,'Fictieve agent');
    assert.equal(own.payload.request.temporaryCall,'166');

    const checked=await send('POST','/api/callsigns/requests/:discordId/verify',{
      bpd:officer('middenkader'),params:{discordId:candidate},
      body:{joinedOn:'2026-10-01',playHours:12.5}});
    assert.equal(checked.code,200,JSON.stringify(checked.payload));
    assert.equal(checked.payload.verified,true);
    assert.equal(mockDb.snapshot('bpd_callsign_requests/'+candidate).get('status'),'verified');

    const insufficient=await send('POST','/api/callsigns/requests/:discordId/approve',{
      bpd:officer('middenkader'),params:{discordId:candidate},body:{preferredCall:201}});
    assert.equal(insufficient.code,403,'Middenkader cannot issue numbers');

    const preview=await send('GET','/api/callsigns/requests/:discordId/preview',{
      bpd:officer('officierenkader'),params:{discordId:candidate}});
    assert.equal(preview.code,200,JSON.stringify(preview.payload));
    assert.equal(preview.payload.preview.call,201,'200 is already occupied by legacy roster');
    assert.equal(preview.payload.portalApprovalEnabled,true);

    const assigned=await send('POST','/api/callsigns/requests/:discordId/approve',{
      bpd:officer('officierenkader'),params:{discordId:candidate},body:{preferredCall:201}});
    assert.equal(assigned.code,200,JSON.stringify(assigned.payload));
    assert.deepEqual(
      {number:assigned.payload.call,sheetsChanged:assigned.payload.sheetsChanged,
        personnel:assigned.payload.createdPersonnel,dossier:assigned.payload.createdPoliceDossier},
      {number:201,sheetsChanged:false,personnel:true,dossier:true});

    const person=mockDb.snapshot('bpd_personnel_created/politie_'+candidate);
    const dossier=mockDb.snapshot('bpd_staff_dossiers/politie_'+candidate);
    const caseRecord=mockDb.snapshot('bpd_cases/politie_'+candidate);
    const claim=mockDb.snapshot('bpd_personnel_call_claims/'+claimId(201));
    assert.equal(person.exists,true);
    assert.equal(person.get('name'),'Fictieve agent');
    assert.equal(person.get('call'),'201');
    assert.equal(person.get('rank'),'Agent');
    assert.equal(person.get('state'),'linked');
    assert.equal(asCreatedPersonnel(person.data()).createdInFirestore,true);
    assert.equal(dossier.exists,true);
    assert.equal(dossier.get('discordId'),candidate);
    assert.equal(caseRecord.get('call'),'201');
    assert.equal(claim.get('discordId'),candidate);
    assert.equal(mockDb.snapshot('bpd_callsign_reservations/201').exists,true);
    assert.equal(mockDb.snapshot('bpd_callsign_requests/'+candidate).get('status'),'approved');
    assert.equal(mockDb.snapshot('bpd_callsign_requests/'+candidate).get('assignedCall'),201);
    assert.ok([...mockDb.docs].some(([key,val])=>key.startsWith('bpd_staff_dossiers/politie_'+candidate+'/audit/')&&val.action==='callsign_assigned'));
    assert.ok([...mockDb.docs].some(([key,val])=>key.startsWith('bpd_personnel_created/politie_'+candidate+'/audit/')&&val.action==='entry_rank'));
    const countAfter=mockDb.docs.size;

    const second=await send('POST','/api/callsigns/requests/:discordId/approve',{
      bpd:officer('officierenkader'),params:{discordId:candidate},body:{preferredCall:201}});
    assert.equal(second.code,409,'Double approval must not create a second personnel record');
    assert.equal(mockDb.docs.size,countAfter);

    const another='333333333333333333';
    const refused=await send('POST','/api/callsigns/requests',{
      bpd:officer('middenkader'),
      body:{discordId:another,name:'Andere fictieve agent',temporaryCall:167,preferredCall:201}});
    assert.equal(refused.code,409,'Used 201 must be unavailable for another applicant');
    assert.equal(mockDb.snapshot('bpd_callsign_requests/'+another).exists,false);
    assert.ok(snapshotReads>=4,'Both intake and approval must check latest legacy roster');
  }finally{
    for(const [key,value] of Object.entries(envBackup))
      if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
