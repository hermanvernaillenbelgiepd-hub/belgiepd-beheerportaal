import test from 'node:test';
import assert from 'node:assert/strict';
import {installServiceApplicationRoutes} from '../src/service-applications-routes.js';
test('Disabled applications fail closed across intake, cadre review and telemetry',async()=>{
 const previous=process.env.BPD_ENABLE_SERVICE_APPLICATIONS;
 const ingest=process.env.BPD_ENABLE_FIVEM_EVIDENCE_INGEST;
 process.env.BPD_ENABLE_SERVICE_APPLICATIONS='false';
 process.env.BPD_ENABLE_FIVEM_EVIDENCE_INGEST='false';
 try{
   const handlers=new Map(),app={
     get(path,...fns){handlers.set('GET '+path,fns)},
     post(path,...fns){handlers.set('POST '+path,fns)}
   };
   const requireUser=(_req,_res,next)=>next();
   installServiceApplicationRoutes(app,{requireUser});
   for(const path of ['/api/service-applications/me',
      '/api/service-applications/review']){
     const res={status(n){this.code=n;return this},json(x){this.data=x;return this}};
     await handlers.get('GET '+path).at(-1)({query:{dept:'ambulance'}},res);
     assert.equal(res.code,503,path);
   }
   for(const path of ['/api/service-applications/submit',
      '/api/service-applications/telemetry',
      '/api/service-applications/:dept/:discordId/decision']){
     const res={status(n){this.code=n;return this},json(x){this.data=x;return this}};
     await handlers.get('POST '+path).at(-1)({params:{dept:'ambulance'},body:{}},res);
     assert.equal(res.code,503,path);
   }
   const res={json(x){this.data=x;return this}};
   await handlers.get('GET /api/service-applications/status').at(-1)({},res);
   assert.equal(res.data.enabled,false);
   assert.equal(res.data.requiredPlayHours,10);
   assert.equal(res.data.requiredServerDays,5);
   assert.equal(Object.hasOwn(res.data,'BPD_FIVEM_EVIDENCE_SECRET'),false);
 }finally{
   if(previous===undefined)delete process.env.BPD_ENABLE_SERVICE_APPLICATIONS;
   else process.env.BPD_ENABLE_SERVICE_APPLICATIONS=previous;
   if(ingest===undefined)delete process.env.BPD_ENABLE_FIVEM_EVIDENCE_INGEST;
   else process.env.BPD_ENABLE_FIVEM_EVIDENCE_INGEST=ingest;
 }
});
