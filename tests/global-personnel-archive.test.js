import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeApp,getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {overlayPersonnelLifecycle} from '../src/personnel-lifecycle-policy.js';
import {identityArchiveSubjects,prepareIdentityArchive,writeIdentityArchive}
 from '../src/global-personnel-archive.js';

const id='123456789012345678';
const depts=['politie','ambulance','brandweer','depannage','burger'];
const roster=depts.map(dept=>({dept,personId:id,name:'Collega X',
 call:dept==='politie'?'900':'100',rank:'Medewerker',series:'1',
 status:'Actief',specialties:[]}));
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const day='2026-11-19';

test('de centrale identiteit kan niet tweemaal in dezelfde dienst voorkomen',()=>{
 assert.equal(identityArchiveSubjects(roster,id).length,5);
 assert.throws(()=>identityArchiveSubjects([...roster,roster[0]],id),/Dubbele dienstfiche/);
 assert.throws(()=>identityArchiveSubjects(roster,'geen-discord-id'),/Ongeldige personeelsidentiteit/);
});

test('alle dienstfiches verdwijnen samen uit actieve overzichten, historiek blijft in archief',()=>{
 const archived=roster.map(p=>({dept:p.dept,discordId:id,
  state:'archived',revision:1,snapshot:p}));
 assert.equal(overlayPersonnelLifecycle(roster,archived).length,0);
 const inArchive=overlayPersonnelLifecycle(roster,archived,{includeArchived:true});
 assert.equal(inArchive.length,5);
 assert.ok(inArchive.every(p=>p.lifecycleState==='archived'));
});

test('de twee ontslagroutes verplichten een totaalplan en controle op alle dienstrechten',()=>{
 const routes=read('src/personnel-lifecycle-routes.js');
 assert.match(routes,/identityArchiveSubjects\(archiveRoster\.data,discordId\)/);
 assert.match(routes,/identityArchiveSubjects\(fullRoster\.data,discordId\)/);
 assert.equal((routes.match(/prepareIdentityArchive\(tx,db\(\),/g)||[]).length,2);
 assert.equal((routes.match(/writeIdentityArchive\(tx,db\(\),/g)||[]).length,2);
 assert.match(routes,/archiveSubjects\.some\(p=>!allowed\(req\.bpd,p\)\)/);
 assert.match(routes,/readableServices\.some\(p=>!allowed\(req\.bpd,p\)\)/);
 const ui=read('public/personeelsbeheer.html');
 assert.match(ui,/ALLE gekoppelde dienstverbanden worden gearchiveerd/);
 assert.doesNotMatch(ui,/Andere dienstverbanden en dossiers blijven intact/);
});

test('archiveringsplan leest alle dienststaten en centrale verlofperiodes vóór mutaties',async()=>{
 const db=getFirestore();
 const leaveDocs=[{id:'active',data:()=>({personDiscordId:id,status:'approved',
  endDate:'2099-01-01'})},{id:'history',data:()=>({personDiscordId:id,
  status:'approved',endDate:'2020-01-01'})},{id:'request',
  data:()=>({personDiscordId:id,status:'pending',endDate:'2099-01-01'})}];
 const reads=[],tx={get:async ref=>{
  reads.push(ref);
  if(ref.path?.startsWith('bpd_personnel_lifecycle/'))
   return {get:key=>key==='state'?'active':key==='revision'?1:null};
  return {size:leaveDocs.length,docs:leaveDocs};
 }};
 const plan=await prepareIdentityArchive(tx,db,{
  subjects:roster,primaryDept:'politie',discordId:id});
 assert.equal(plan.lifecycle.length,4);
 assert.deepEqual(plan.openLeaves.map(d=>d.id),['active','request']);
 assert.equal(reads.length,5);
});

test('één transactie maakt alle andere dienstfiches gearchiveerd en sluit openstaand verlof auditbaar af',()=>{
 const db=getFirestore();
 const updates=[],sets=[],created=[];
 const tx={
  update:(ref,data)=>updates.push({path:ref.path,data}),
  set:(ref,data)=>sets.push({path:ref.path,data}),
  create:(ref,data)=>created.push({path:ref.path,data})
 };
 const leaveRef=db.collection('bpd_leave_requests').doc('leave-id');
 const plan={
  subjects:roster,primaryDept:'politie',discordId:id,today:day,
  lifecycle:roster.slice(1).map(person=>({
   person,
   ref:db.collection('bpd_personnel_lifecycle').doc(person.dept+'_'+id),
   snapshot:{get:key=>key==='state'?'active':key==='revision'?2:null}
  })),
  openLeaves:[{id:'leave-id',ref:leaveRef,data:()=>({
   personDiscordId:id,subjectName:'Collega X',subjectCall:'900',
   startDate:'2026-11-19',endDate:'2027-01-01',days:44,
   note:'Verlofreden in historiek',status:'approved',subjectDepartments:['politie']
  })}]
 };
 const result=writeIdentityArchive(tx,db,plan,{actor:{
  name:'Bevoegd beheerder',call:'008',discordId:'999999999999999999'
 },actorUid:'discord:999999999999999999',
  cause:'management_dismissal',reason:'Uit dienst na officiële beslissing',
  source:'personnel-lifecycle-archive'});
 assert.equal(result.archivedDepartments.length,5);
 assert.equal(result.closedLeaveRequests,1);
 assert.equal(sets.length,4);
 assert.ok(sets.every(x=>x.data.state==='archived'));
 assert.ok(sets.every(x=>x.data.globalArchiveId===result.globalArchiveId));
 assert.equal(updates.length,1);
 assert.equal(updates[0].data.status,'withdrawn');
 assert.ok(created.some(x=>x.path.startsWith('bpd_global_personnel_archive_events/')));
 for(const dept of depts){
  assert.ok(created.some(x=>x.path.startsWith('bpd_cases/'+dept+'_'+id+'/entries/')
    &&x.data.type==='verlof'&&x.data.leaveAction==='personnel_archived'),
    'Verlofafsluiting ontbreekt bij '+dept);
 }
 for(const dept of depts.slice(1)){
  assert.ok(created.some(x=>x.path.startsWith('bpd_cases/'+dept+'_'+id+'/entries/')
    &&x.data.source==='global-personnel-archive'));
  assert.ok(created.some(x=>x.path.startsWith('bpd_personnel_lifecycle/'+dept+'_'+id+'/audit/')
    &&x.data.action==='personnel_archived_globally'));
 }
 assert.equal(created.some(x=>x.data.type==='verlof'&&x.data.statusTo==='approved'),false);
});

test('de originele verlofhistoriek blijft behouden; einde verlof wordt als gebeurtenis gelogd',()=>{
 const event=read('src/leave-event-log.js');
 assert.match(event,/personnel_archived:'Verlof administratief afgesloten/);
 assert.match(event,/source:'central-leave-audit'/);
 const helper=read('src/global-personnel-archive.js');
 assert.match(helper,/data\.status==='pending'/);
 assert.match(helper,/data\.endDate>=today/);
 assert.match(helper,/where\('personDiscordId','==',discordId\)/);
 assert.doesNotMatch(helper,/tx\.delete\(/);
});
if(!getApps().length)initializeApp({projectId:'belgiepd-lifecycle-test'});
