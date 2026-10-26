import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {ambulanceMemberWorkspaceStatus,newcomerPortalMode} from '../src/member-dashboard-routes.js';
import {ambulanceDashboardTier,canSeeDashboardManagement} from '../src/dashboard-admin-policy.js';
import {mayReadFortnightReport} from '../src/fortnight-report-policy.js';
import {canReadServiceDossier} from '../src/service-dossier-access.js';

const id='222222222222222222';
const approved={status:'approved',discordId:id,role:'basiskader',
  departments:['ambulance'],departmentRoles:{ambulance:'basiskader'}};
const person={dept:'ambulance',personId:id,call:'AMB-12',rank:'Ambulancier'};
const actor={uid:'discord:'+id,discordId:id,role:'basiskader',
  departments:['ambulance'],departmentRoles:{ambulance:'basiskader'},
  ambulancePersonnelVerified:true,reportServiceRoles:{ambulanceAzls:false},
  dossierAllowedDepartments:[]};

test('Approved ordinary AZLS personnel receive ONLY an Ambulance workspace presentation',()=>{
 assert.equal(newcomerPortalMode(id,approved,[person]),'member',
   'Do not convert ordinary Ambulance members into generic administrators');
 assert.deepEqual(ambulanceMemberWorkspaceStatus(id,approved,[person]),{
   available:true,needsReview:false});
 assert.equal(ambulanceDashboardTier(actor),'personeel');
 assert.equal(canSeeDashboardManagement(actor),false);
 assert.equal(canReadServiceDossier(actor,'ambulance'),false);
 assert.equal(mayReadFortnightReport(actor,'ambulance',[person]),false);
});

test('A personal Discord roster link and explicit Ambulance approval are both required',()=>{
 const valid=ambulanceMemberWorkspaceStatus;
 assert.deepEqual(valid(id,null,[person]),{available:false,needsReview:false});
 assert.deepEqual(valid(id,{...approved,departments:['politie']},[person]),
   {available:false,needsReview:false});
 assert.deepEqual(valid(id,approved,[]),{available:false,needsReview:true});
 assert.deepEqual(valid(id,approved,[person,person]),{available:false,needsReview:true});
 assert.deepEqual(valid(id,approved,[person],true),{available:false,needsReview:true});
 assert.deepEqual(valid(id,approved,[{...person,personId:'333333333333333333'}]),
   {available:false,needsReview:true});
 assert.deepEqual(valid('not-discord',approved,[person]),
   {available:false,needsReview:false});
 assert.equal(ambulanceDashboardTier({...actor,ambulancePersonnelVerified:false}),null);
 assert.equal(ambulanceDashboardTier({...actor,uid:'discord:333333333333333333'}),null);
 assert.equal(ambulanceDashboardTier({...actor,departments:['politie']}),null);
 assert.equal(ambulanceDashboardTier({...actor,departmentRoles:{ambulance:'middenkader'}}),null);
});

test('AZLS member workspace does not show protected modules without independent grants',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const route=readFileSync(new URL('../src/member-dashboard-routes.js',import.meta.url),'utf8');
 assert.match(html,/details\.ambulanceWorkspaceAvailable===true/);
 assert.match(html,/details\.ambulanceApprovalNeedsReview===true/);
 assert.match(html,/ctx\.dashboardProfile==='ambulance-azls'/);
 assert.match(html,/ctx\.ambulanceTier==='personeel'/);
 assert.match(html,/AZLS – Ambulancepersoneel/);
 assert.match(html,/\['ambulanceCardStaff',canManage\]/);
 assert.match(html,/\['ambulanceCardDossiers',canOpen\]/);
 assert.match(html,/\['ambulanceCardReports',canReport\]/);
 assert.match(server,/req\.bpd\.ambulancePersonnelVerified=Boolean\(valid/);
 assert.match(server,/roster\.filter\(p=>p\.dept==='ambulance'&&p\.personId===id\)\.length===1/);
 assert.match(route,/ambulanceMemberWorkspaceStatus\(/);
 assert.match(route,/ambulanceDiscordRoleSeen/);
 assert.match(route,/!grant\?\.departments\?\.includes\('ambulance'\)/);
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 assert.doesNotThrow(()=>new Script('(async()=>{'+
   script.replace(/^import\s+[^\n]+;\s*$/gm,'')+'})()'));
});
