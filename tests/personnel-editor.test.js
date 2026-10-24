import test from 'node:test';
import assert from 'node:assert/strict';
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
test('Verified Board may edit general personnel fields but not operational rank actions',async()=>{
 const board={uid:'discord:111111111111111111',role:'basiskader',
  discordId:'111111111111111111',departments:['politie'],
  departmentRoles:{politie:'basiskader'},dossierNativeDepartments:['politie'],
  boardPersonnelAdmin:true};
 for(const dept of ['politie','brandweer','ambulance','depannage']){
  assert.equal(canViewPersonnel(board,dept),true);
  assert.equal(canEditPersonnel(board,{...staff,dept}),false);
 }
 assert.equal(canEditPersonnel(board,{...staff,personId:board.discordId}),false);
 const {canEditGeneralPersonnelInfo}=await import('../src/personnel-editor-policy.js');
 const validBoard={...board,dossierAllowedDepartments:['politie','brandweer','ambulance','depannage']};
 assert.equal(canEditGeneralPersonnelInfo(validBoard,staff),true);
 assert.equal(canEditGeneralPersonnelInfo(validBoard,{...staff,personId:board.discordId}),false);
 assert.equal(canViewPersonnel({...board,boardPersonnelAdmin:false},'brandweer'),false);
 const fs=await import('node:fs');
 const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const route=fs.readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
 const ui=fs.readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 assert.ok(server.includes("req.bpd.uid==='discord:'+id"));
 assert.ok(server.includes('verifyBoardDiscordRole('));
 assert.ok(server.includes('activeBoardAppointment('));
 assert.ok(route.includes('if(!canEditGeneralPersonnelInfo(req.bpd,subject))'));
 assert.ok(ui.includes("'pName').disabled=!canChangeIdentity"));
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


test('900 en 910 blijven zichtbaar in roster zonder toegang tot afgeschermde leidingdossiers',async()=>{
  const {canReadPersonnelSubject}=await import('../src/personnel-editor-policy.js');
  const {policeKader}=await import('../src/normalize.js');
  const {dossierScopes,dossierOverviewRows}=await import('../src/dossier-center-policy.js');
  const actor={...officer,role:'middenkader',
    departmentRoles:{politie:'middenkader'},dossierAllowedDepartments:['politie']};
  const highChief={...staff,personId:'111111111111111111',name:'Thijs',
    call:'900',rank:'Eerste Hoofdcommissaris van Politie (1HCP)'};
  const firstCommissioner={...staff,personId:'222222222222222222',name:'Extra',
    call:'910',rank:'Eerste Commissaris van Politie (1CP)'};
  const officerStaff={...staff,call:'930',rank:'Aspirant Commissaris van Politie (ACP)'};
  assert.equal(policeKader(highChief.rank),'Korpsleiding');
  assert.equal(policeKader(firstCommissioner.rank),'Korpsleiding');
  assert.equal(canReadPersonnelSubject(actor,highChief),false);
  assert.equal(canReadPersonnelSubject(actor,firstCommissioner),false);
  assert.equal(canReadPersonnelSubject(actor,officerStaff),true);
  assert.deepEqual(dossierOverviewRows([highChief,firstCommissioner,officerStaff],[],
    dossierScopes(actor)).map(x=>x.name),[officerStaff.name]);
  const board={...actor,boardPersonnelAdmin:true};
  assert.equal(canReadPersonnelSubject(board,highChief),true);
  assert.equal(canReadPersonnelSubject(board,firstCommissioner),true);
  const leadership={...chief,uid:'discord:'+chief.discordId,discordPoliceRank:'korpsleiding',dossierAllowedDepartments:['politie']};
  assert.equal(canReadPersonnelSubject(leadership,highChief),true);
  assert.equal(canReadPersonnelSubject(leadership,firstCommissioner),true);

  const fs=await import('node:fs');
  const route=fs.readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
  const ui=fs.readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  assert.match(route,/const base=snapshot\.data\.filter\(p=>allowed\.includes\(p\.dept\)\)/);
  assert.match(route,/const canOpenDossier=canReadPersonnelSubject\(req\.bpd,p\)/);
  assert.match(route,/canOpenDossier,canPromote/);
  assert.doesNotMatch(route,/\.filter\(p=>p\.discordCadre!=='Korpsleiding'/);
  assert.match(ui,/if\(person\.canOpenDossier===true\)/);
  assert.match(ui,/restricted\.textContent='🔒 Afgeschermd'/);
  assert.match(ui,/if\(p\?\.canOpenDossier!==true\)/);
  assert.match(ui,/people\.filter\(p=>p\.canOpenDossier===true\)/);
  assert.match(route,/if\(!canReadPersonnelSubject\(req\.bpd,target\)\)return error\(res,403/);
});

test('De volledige gedeelde 900-reeks is alleen via geverifieerde Discord-rollen in te zien',async()=>{
  const {canReadPersonnelSubject}=await import('../src/personnel-editor-policy.js');
  const actor={...officer,uid:'discord:'+officer.discordId,
    dossierAllowedDepartments:['politie'],discordPoliceRank:'officierenkader',
    verifiedPoliceSubjectRoles:Object.create(null)};
  const officer900={...staff,call:'920',rank:'Eerste Commissaris van Politie',personId:'111111111111111111'};
  const corps900={...staff,call:'930',rank:'Aspirant Commissaris van Politie',personId:'222222222222222222'};
  const noEvidence={...staff,call:'999',rank:'Inspecteur van Politie',personId:'333333333333333333'};
  // Official rank or 900 CALL cannot disclose dossiers without Discord proof.
  for(const p of [officer900,corps900,noEvidence])
    assert.equal(canReadPersonnelSubject(actor,p),false,p.call);
  actor.verifiedPoliceSubjectRoles[officer900.personId]='Officierenkader';
  actor.verifiedPoliceSubjectRoles[corps900.personId]='Korpsleiding';
  assert.equal(canReadPersonnelSubject(actor,officer900),true,
    'Een geverifieerde officier in 900 mag niet als korps afgeschermd blijven');
  assert.equal(canReadPersonnelSubject(actor,corps900),false,
    'Een geverifieerde Korpsleiding met rangtekst officier blijft beschermd');
  const chiefActor={...chief,uid:'discord:'+chief.discordId,
    discordPoliceRank:'korpsleiding',dossierAllowedDepartments:['politie'],
    verifiedPoliceSubjectRoles:{...actor.verifiedPoliceSubjectRoles}};
  assert.equal(canReadPersonnelSubject(chiefActor,corps900),true);
  assert.equal(canReadPersonnelSubject({...chiefActor,discordPoliceRank:null},corps900),false);
  assert.equal(canReadPersonnelSubject({...chiefActor,uid:'google:login'},corps900),false);
  assert.equal(canReadPersonnelSubject({...chiefActor,role:'officierenkader'},corps900),false);
  const board={...actor,boardPersonnelAdmin:true};
  assert.equal(canReadPersonnelSubject(board,corps900),true);
  assert.equal(canReadPersonnelSubject(board,noEvidence),true);
  assert.equal(canReadPersonnelSubject(actor,{...corps900,dept:'brandweer'}),false);
});
test('API beschermt tevens directe dossierlinks en opleidingen tegen een 900-bypass',async()=>{
  const {readFileSync}=await import('node:fs');
  const s=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  const roles=readFileSync(new URL('../src/role-routes.js',import.meta.url),'utf8');
  const overview=readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
  const center=readFileSync(new URL('../src/dossier-center-routes.js',import.meta.url),'utf8');
  assert.match(s,/req\.bpd\.verifiedPoliceSubjectRoles=Object\.create\(null\)/);
  assert.match(s,/verifiedOfficerCadre\(found\[j\]\.data\(\),process\.env\.DISCORD_GUILD_ID/);
  assert.match(s,/if\(!canReadPersonnelSubject\(req\.bpd,target\[0\]\)\)/);
  assert.match(s,/const subjectRole=member\.exists\?verifiedOfficerCadre/);
  assert.match(roles,/if\(!mayAccessSubject\(req\.roleActor\.bpd,subject,verified\)\)/);
  assert.match(roles,/await verifiedSubjects\(\[subject\]\)/);
  assert.match(overview,/canOpenDossier=canReadPersonnelSubject\(req\.bpd,p\)/);
  assert.match(overview,/req\.bpd\.verifiedPoliceSubjectRoles\?\.\[p\.discordId\]/);
  assert.match(center,/if\(!canReadPersonnelSubject\(req\.bpd,p\)\)/);
});
