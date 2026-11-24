import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {
 SERVICE_APPLICATION_DEPARTMENTS,applicationKey,serviceApplicationsReady,
 serviceEvidenceIngestReady,normalizeServiceEvidenceBody,signServiceEvidence,
 evaluateSignedServiceEvidence,cleanServiceApplication,cleanServiceDecision,
 nextServiceApplicationStatus,canViewServiceApplications,canReviewServiceApplications
} from '../src/service-applications-policy.js';
const id='298799630458552323',other='298799630458552324';
const now=new Date('2026-11-24T14:15:00Z');
const secret='s'.repeat(44);
const ready={BPD_ENABLE_SERVICE_APPLICATIONS:'true',BPD_FIVEM_EVIDENCE_SECRET:secret,
 BPD_ENABLE_FIVEM_EVIDENCE_INGEST:'true'};
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('the feature is CLOSED unless explicitly enabled with a separate long secret',()=>{
 assert.equal(serviceApplicationsReady({}),false);
 assert.equal(serviceApplicationsReady({...ready,BPD_ENABLE_SERVICE_APPLICATIONS:'false'}),false);
 assert.equal(serviceApplicationsReady({...ready,BPD_FIVEM_EVIDENCE_SECRET:'short'}),false);
 assert.equal(serviceApplicationsReady(ready),true);
 assert.equal(serviceEvidenceIngestReady({...ready,BPD_ENABLE_FIVEM_EVIDENCE_INGEST:'false'}),false);
 assert.equal(serviceEvidenceIngestReady(ready),true);
 assert.deepEqual(SERVICE_APPLICATION_DEPARTMENTS,['brandweer','ambulance','depannage']);
 assert.equal(applicationKey('politie',id),null);
 assert.equal(applicationKey('brandweer','invalid'),null);
});
test('trusted FiveM source validates structure, 10h+5d and 24h freshness',()=>{
 const sample=normalizeServiceEvidenceBody({discordId:id,totalPlaySeconds:36000,
  firstServerJoinAt:'2026-11-16T14:15:00.000Z'},now);
 const doc={...sample,verifiedAt:'2026-11-24T13:30:00.000Z'};
 doc.signature=signServiceEvidence(doc,secret);
 const result=evaluateSignedServiceEvidence(doc,id,secret,now);
 assert.equal(result.verified,true);assert.equal(result.eligible,true);
 assert.equal(result.metHours,true);assert.equal(result.metDays,true);
 assert.equal(evaluateSignedServiceEvidence(doc,other,secret,now).verified,false);
 assert.equal(evaluateSignedServiceEvidence({...doc,totalPlaySeconds:100000},id,secret,now).verified,false);
 assert.equal(evaluateSignedServiceEvidence({...doc,signature:'0'.repeat(64)},id,secret,now).verified,false);
 assert.equal(evaluateSignedServiceEvidence({...doc,verifiedAt:'2026-11-23T13:00:00.000Z'},id,secret,now).verified,false);
 const fewer={...doc,totalPlaySeconds:35999};
 fewer.signature=signServiceEvidence(fewer,secret);
 assert.equal(evaluateSignedServiceEvidence(fewer,id,secret,now).verified,true);
 assert.equal(evaluateSignedServiceEvidence(fewer,id,secret,now).eligible,false);
 const tooRecent={...doc,firstServerJoinAt:'2026-11-22T14:15:00.000Z'};
 tooRecent.signature=signServiceEvidence(tooRecent,secret);
 assert.equal(evaluateSignedServiceEvidence(tooRecent,id,secret,now).metDays,false);
 for(const extra of [
  {...sample,added:true},
  {...sample,discordId:'wrong'},
  {...sample,totalPlaySeconds:-1},
  {...sample,firstServerJoinAt:'2030-01-01T00:00:00.000Z'}])
  assert.throws(()=>normalizeServiceEvidenceBody(extra,now));
});
test('candidate and manager input validation rejects foreign service, extra fields and bad reasons',()=>{
 assert.deepEqual(cleanServiceApplication({department:'ambulance',
  motivation:'Ik wil graag bijdragen aan de medische hulpverlening en volgen van opleidingen.'}),
 {department:'ambulance',
  motivation:'Ik wil graag bijdragen aan de medische hulpverlening en volgen van opleidingen.'});
 for(const body of [{department:'politie',motivation:'a'.repeat(60)},
  {department:'brandweer',motivation:'kort'},
  {department:'brandweer',motivation:'a'.repeat(3001)},
  {department:'brandweer',motivation:'a'.repeat(60),role:'korpsleiding'}])
  assert.throws(()=>cleanServiceApplication(body));
 assert.deepEqual(cleanServiceDecision({action:'accept',reason:'Kandidaat voldoet aan vereisten',
  expectedRevision:2}),{action:'accept',reason:'Kandidaat voldoet aan vereisten',
  expectedRevision:2});
 assert.throws(()=>cleanServiceDecision({action:'accept',reason:'kort',expectedRevision:2}));
 assert.throws(()=>cleanServiceDecision({action:'accept',reason:'Kandidaat voldoet aan vereisten',
  expectedRevision:0}));
 assert.throws(()=>cleanServiceDecision({action:'accept',reason:'Kandidaat voldoet aan vereisten',
  expectedRevision:2,grant:'admin'}));
});
test('submissions have a strict audited transition and NEVER provision personnel',()=>{
 assert.equal(nextServiceApplicationStatus('submitted','start_review'),'reviewing');
 assert.equal(nextServiceApplicationStatus('submitted','reject'),'rejected');
 assert.equal(nextServiceApplicationStatus('reviewing','accept'),'accepted');
 assert.equal(nextServiceApplicationStatus('reviewing','reject'),'rejected');
 for(const [state,action] of [
  ['submitted','accept'],['accepted','accept'],
  ['rejected','start_review'],['withdrawn','accept']])
  assert.throws(()=>nextServiceApplicationStatus(state,action));
});
test('cross-service cadre and Corps reader do not become AZLS/AWV/ZONE approver',()=>{
 const base={uid:'discord:'+id,discordId:id,role:'korpsleiding',
  departments:['politie','ambulance'],departmentRoles:{politie:'korpsleiding',ambulance:'basiskader'},
  discordPoliceRank:'korpsleiding',dossierSourceFresh:true};
 const roster=[{dept:'ambulance',personId:id,call:'VPK10',rank:'Verpleegkundige'}];
 assert.equal(canViewServiceApplications(base,'ambulance',roster),true);
 assert.equal(canReviewServiceApplications(base,'ambulance',roster),false);
 const azls={...base,reportServiceRoles:{ambulanceAzls:true}};
 assert.equal(canReviewServiceApplications(azls,'ambulance',roster),true);
 const awv={uid:'discord:'+id,discordId:id,role:'officierenkader',
  departments:['depannage'],departmentRoles:{depannage:'officierenkader'},
  reportServiceRoles:{depannageAwv:true}};
 const depRoster=[{dept:'depannage',personId:id,call:'LSRA12',rank:'Depanneur'}];
 assert.equal(canViewServiceApplications(awv,'depannage',depRoster),true);
 assert.equal(canReviewServiceApplications(awv,'depannage',depRoster),true);
 assert.equal(canReviewServiceApplications(awv,'ambulance',depRoster),false);
 const zone={uid:'discord:'+id,discordId:id,role:'middenkader',
  departments:['brandweer'],departmentRoles:{brandweer:'middenkader'},fireZoneChief:true};
 const fire=[{dept:'brandweer',personId:id,call:'ZONE',rank:'Zonechef'}];
 assert.equal(canReviewServiceApplications(zone,'brandweer',fire),true);
 assert.equal(canReviewServiceApplications({...zone,fireZoneChief:false,fireAccessLevel:'middle'},'brandweer',fire),false);
 const tech={uid:'discord:'+id,discordId:id,role:'beheerder',departments:[],
  portalTechnicalMode:true,profileTechnicalAvailable:true};
 assert.equal(canViewServiceApplications(tech,'brandweer',[]),true);
 assert.equal(canReviewServiceApplications(tech,'depannage',[]),true);
 assert.equal(canReviewServiceApplications({...tech,portalDeveloperReadOnly:true},'depannage',[]),false);
});
test('applicant and reviewer pages are separate, closed by default and both parse as modules',()=>{
 const page=read('public/sollicitatiecentrum.html');
 const review=read('public/sollicitatiebeheer.html');
 const server=read('src/server.js');
 const routes=read('src/service-applications-routes.js');
 assert.match(page,/applicationFormPanel/);assert.match(page,/applicationMotivation/);
 assert.match(page,/applicationSubmit/);assert.match(page,/sollicitatiebeheer\.html/);
 assert.match(review,/countSubmitted/);assert.match(review,/moreCases/);
 assert.match(review,/expectedRevision:item\.revision/);
 assert.match(server,/installServiceApplicationRoutes\(app,\{requireReviewer:requireDossierUser,getSnapshot\}\)/);
 assert.match(server,/app\.use\('\/api\/service-applications',express\.json/);
 assert.match(server,/app\.get\(\['\/burgerdossier\.html','\/solliciteren\.html'\]/);
 assert.doesNotMatch(routes,/assignRole|createPersonnel|DiscordBot|sendMessage|app\.post\('\/api\/personnel/);
 for(const html of [page,review]){
  const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const check=spawnSync(process.execPath,['--check','--input-type=module'],
   {input:script,encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
 }
});
