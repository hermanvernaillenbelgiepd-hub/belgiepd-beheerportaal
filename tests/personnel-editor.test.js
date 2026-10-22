import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validPersonnelKey,canViewPersonnel,canEditPersonnel,validatePersonnelChange,
 mergePersonnelEdits,EDITABLE_STATUSES,personnelCallClaimId} from '../src/personnel-editor-policy.js';
const officer={role:'officierenkader',departments:['politie','brandweer'],departmentRoles:{politie:'officierenkader',brandweer:'middenkader'},discordId:'505659510359064606'};
const chief={role:'korpsleiding',departments:['politie'],departmentRoles:{politie:'korpsleiding'},discordId:'111111111111111111'};
const id='298799630458552323';
const staff={id:'politie:'+id,personId:id,dept:'politie',name:'UNEMI',call:'930',rank:'Hoofdinspecteur (HINP)',
 status:'Actief',series:'Reeks 1',specialties:[{label:'Motor',value:'Ja'}]};
const payload={name:'UNEMI Aangepast',call:'932',status:'Actief',reason:'Na verificatie door bevoegde officier',expectedRevision:0};

test('Personnel keys require known services and genuine Discord IDs',()=>{
 assert.equal(validPersonnelKey('politie',id),true);
 assert.equal(validPersonnelKey('burger',id),false);
 assert.equal(validPersonnelKey('politie','fake'),false);
});
test('Officer may read their own services but cannot edit outside officer scope',()=>{
 assert.equal(canViewPersonnel(officer,'politie'),true);
 assert.equal(canViewPersonnel(officer,'brandweer'),true);
 assert.equal(canViewPersonnel(officer,'ambulance'),false);
 assert.equal(canEditPersonnel(officer,staff),true);
 assert.equal(canEditPersonnel(officer,{...staff,dept:'brandweer'}),false);
 assert.equal(canEditPersonnel(officer,{...staff,personId:officer.discordId}),false);
});
test('Rank boundaries restrict edits; an officer cannot edit officer or chief',()=>{
 assert.equal(canEditPersonnel(officer,{...staff,rank:'Aspirant Commissaris (ACP)'}),false);
 assert.equal(canEditPersonnel(chief,{...staff,rank:'Aspirant Commissaris (ACP)'}),true);
 assert.equal(canEditPersonnel(chief,{...staff,rank:'Commissaris (CP)'}),false);
 assert.equal(canEditPersonnel(chief,{...staff,rank:'Onbekend'}),false);
 const forged={...officer,role:'middenkader'};
 assert.equal(canEditPersonnel(forged,staff),false);
});
test('Updates reject rank, discordId, dept and other unexpected privileged properties',()=>{
 assert.deepEqual(validatePersonnelChange(payload),payload);
 assert.throws(()=>validatePersonnelChange({...payload,rank:'Commissaris'}));
 assert.throws(()=>validatePersonnelChange({...payload,discordId:'111111111111111111'}));
 assert.throws(()=>validatePersonnelChange({...payload,departments:['politie']}));
 assert.throws(()=>validatePersonnelChange({...payload,status:'Gepromoveerd'}));
 assert.throws(()=>validatePersonnelChange({...payload,reason:'kort'}));
 assert.throws(()=>validatePersonnelChange({...payload,expectedRevision:-1}));
 assert.throws(()=>validatePersonnelChange({...payload,name:'<script>'}));
 assert.equal(EDITABLE_STATUSES.includes('Actief'),true);
});
test('Firestore overlays change only three profile fields and leave protected fields unchanged',()=>{
 const edits=[{dept:'politie',discordId:id,revision:1,name:'Nieuwe naam',call:'931',status:'50/50',rank:'Korpsleiding',personId:'111111111111111111'}];
 const result=mergePersonnelEdits([staff],edits);
 assert.equal(result[0].name,'Nieuwe naam');
 assert.equal(result[0].call,'931');
 assert.equal(result[0].status,'50/50');
 assert.equal(result[0].rank,staff.rank);
 assert.equal(result[0].personId,id);
 assert.equal(result[0].dept,'politie');
 assert.deepEqual(result[0].specialties,staff.specialties);
 assert.equal(staff.name,'UNEMI');
});
test('Invalid and mismatched overrides are silently ignored',()=>{
 const bad=[{dept:'politie',discordId:'333333333333333333',revision:1,name:'x',call:'y',status:'Actief'},
 {dept:'politie',discordId:id,revision:0,name:'x',call:'y',status:'Actief'},
 {dept:'politie',discordId:id,revision:1,name:'x',call:'y',status:'Onmogelijk'}];
 assert.deepEqual(mergePersonnelEdits([staff],bad),[staff]);
});

test('Concurrent callsign claims use the same deterministic document in one service only',()=>{
 assert.equal(personnelCallClaimId('politie','930'),personnelCallClaimId('politie',' 930 '));
 assert.notEqual(personnelCallClaimId('politie','930'),personnelCallClaimId('brandweer','930'));
 assert.notEqual(personnelCallClaimId('politie','931'),personnelCallClaimId('politie','930'));
 assert.match(personnelCallClaimId('politie','930'),/^[a-f0-9]{64}$/);
});

test('Middenkader status updates are restricted to lower police ranks',async()=>{
 const {canChangePersonnelStatus}=await import('../src/personnel-editor-policy.js');
 const mid={role:'middenkader',discordId:'111111111111111111',
   departments:['politie'],departmentRoles:{politie:'middenkader'},
   dossierNativeDepartments:['politie']};
 const junior={...staff,rank:'Inspecteur (INP)',call:'402'};
 assert.equal(canViewPersonnel(mid,'politie'),true);
 assert.equal(canEditPersonnel(mid,junior),false);
 assert.equal(canChangePersonnelStatus(mid,junior),true);
 for(const rank of ['Hoofdinspecteur (HINP)','Commissaris (CP)','Onbekend'])
  assert.equal(canChangePersonnelStatus(mid,{...junior,rank}),false);
 assert.equal(canChangePersonnelStatus(mid,{...junior,dept:'brandweer'}),false);
 assert.equal(canChangePersonnelStatus(mid,{...junior,personId:mid.discordId}),false);
 assert.equal(canChangePersonnelStatus({...mid,dossierNativeDepartments:[]},junior),false);
 assert.equal(canChangePersonnelStatus({...mid,role:'basiskader'},junior),false);
});
test('Verified Board manages service-wide personnel records but never its own',async()=>{
 const board={uid:'discord:111111111111111111',role:'basiskader',
  discordId:'111111111111111111',departments:['politie'],
  departmentRoles:{politie:'basiskader'},dossierNativeDepartments:['politie'],
  boardPersonnelAdmin:true};
 for(const dept of ['politie','brandweer','ambulance','depannage']){
  assert.equal(canViewPersonnel(board,dept),true);
  assert.equal(canEditPersonnel(board,{...staff,dept}),true);
 }
 assert.equal(canEditPersonnel(board,{...staff,personId:board.discordId}),false);
 assert.equal(canViewPersonnel({...board,boardPersonnelAdmin:false},'brandweer'),false);
 const fs=await import('node:fs');
 const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const route=fs.readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
 const ui=fs.readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 assert.ok(server.includes("req.bpd.uid==='discord:'+id"));
 assert.ok(server.includes('verifyBoardDiscordRole('));
 assert.ok(server.includes('activeBoardAppointment('));
 assert.ok(route.includes('if(!identityAllowed&&proposed.call!==subject.call)'));
 assert.ok(ui.includes("'pName').disabled=!(p.canEditName===true&&writesEnabled)"));
});


test('Audit actors show current roster identity, callsign and rank, not outdated values',async()=>{
 const {currentPersonnelAuditActor}=await import('../src/personnel-editor-policy.js');
 const current={...staff,name:'Nieuwe naam',call:'SANTO-700',rank:'Hoofdinspecteur (HINP)'};
 assert.deepEqual(currentPersonnelAuditActor(id,'politie',[current],['politie']),{
  name:'Nieuwe naam',call:'SANTO-700',rank:'Hoofdinspecteur (HINP)',department:'politie'
 });
 assert.equal(currentPersonnelAuditActor(id,'politie',[{...current,call:'SANTO-600'}],['politie']).call,'SANTO-600');
});
test('Auditor names never leak across unauthorized help-service dossiers',async()=>{
 const {currentPersonnelAuditActor}=await import('../src/personnel-editor-policy.js');
 const police={...staff,call:'SANTO-700'};
 const fire={...police,dept:'brandweer',name:'Brandweernaam',call:'BW-9',rank:'ZONE'};
 assert.equal(currentPersonnelAuditActor(id,'politie',[police,fire],['politie']).call,'SANTO-700');
 assert.equal(currentPersonnelAuditActor(id,'politie',[police,fire],['politie','brandweer']).call,'SANTO-700');
 assert.equal(currentPersonnelAuditActor(id,'brandweer',[police,fire],['brandweer']).call,'BW-9');
 assert.equal(currentPersonnelAuditActor(id,'brandweer',[police],['brandweer']),null);
 assert.equal(currentPersonnelAuditActor(id,'brandweer',[police],['politie']),null);
 assert.equal(currentPersonnelAuditActor(id,'politie',[police,police],['politie']),null);
 assert.equal(currentPersonnelAuditActor('bad','politie',[police],['politie']),null);
 assert.equal(currentPersonnelAuditActor(id,'politie',[{...police,name:''}],['politie']),null);
});
test('Official history enriches author server-side and preserves original event rank/dates',async()=>{
 const fs=await import('node:fs');
 const route=fs.readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
 const ui=fs.readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 assert.ok(route.includes('currentPersonnelAuditActor(actorId,req.params.dept,'));
 assert.ok(route.includes('snap.data,allowedActorDepartments)'));
 assert.ok(route.includes('actorDiscordId:actorId'));
 assert.ok(route.includes('actorRosterStale:snap.stale===true'));
 assert.ok(ui.includes("current.name+' (Discord-ID: '+actorId"));
 assert.ok(ui.includes("const currentLabel=r.actorRosterStale"));
 assert.ok(ui.includes("const ranks=change.newRank?"));
});

test('Middenkader changes lower police names but not callsigns; changes feed current weekly reports',async()=>{
 const {canChangePersonnelName}=await import('../src/personnel-editor-policy.js');
 const mid={role:'middenkader',discordId:'111111111111111111',
  departments:['politie'],departmentRoles:{politie:'middenkader'},
  dossierNativeDepartments:['politie']};
 const p={...staff,rank:'Inspecteur (INP)',call:'P-410'};
 assert.equal(canChangePersonnelName(mid,p),true);
 assert.equal(canChangePersonnelName(mid,{...p,rank:'Commissaris (CP)'}),false);
 assert.equal(canChangePersonnelName(mid,{...p,personId:mid.discordId}),false);
 assert.equal(canChangePersonnelName(mid,{...p,dept:'ambulance'}),false);
 const route=readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 assert.ok(route.includes("if(!identityAllowed&&proposed.call!==subject.call)"));
 assert.ok(route.includes("if(previous.name!==proposed.name){"));
 assert.ok(route.includes("type:'naamswijziging'"));
 assert.ok(route.includes("type:'personnel_name_changed'"));
 assert.ok(route.includes("collection('bpd_cases').doc(subject.dept+'_'+subject.personId)"));
 assert.ok(ui.includes("'pName').disabled=!(p.canEditName===true&&writesEnabled)"));
 assert.ok(ui.includes("'pCall').disabled=!(p.canEditCall===true&&writesEnabled)"));
});
