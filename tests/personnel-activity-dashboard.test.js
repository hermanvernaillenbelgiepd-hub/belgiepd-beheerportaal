import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {staffActivityEvent,callsignActivityEvent,createdPromotionEvent,
  recentPersonnelActivity,PERSONNEL_ACTIVITY_COLLECTION,validateRetrospectiveCallChange} from '../src/personnel-activity.js';

const id='169464525505036288',other='123456789012345678';
const ts=value=>({toDate:()=>new Date(value)});
const doc=(id,data)=>({id,data:()=>data});
const promotion=doc('pr1',{type:'promotion',dept:'politie',discordId:id,
  name:'Inspecteur Test',before:'Agent',after:'Inspecteur',
  at:ts('2026-10-20T14:00:00Z')});
const fixed=doc(id,{status:'approved',dept:'politie',name:'Inspecteur Test',
  temporaryCall:'P-000',assignedCall:'P-101',
  syncedAt:ts('2026-10-20T15:00:00Z')});
const edited=doc('edit1',{type:'callsign_changed',dept:'politie',discordId:other,
  name:'Andere inspecteur',before:'P-201',after:'P-299',
  at:ts('2026-10-20T15:30:00Z')});
const old=doc('politie_'+id,{dept:'politie',discordId:id,state:'linked',
  name:'Inspecteur Test',rank:'Inspecteur',
  rankUpdatedAt:ts('2026-10-20T14:00:00Z')});

test('Dates and identity from only recorded approvals, not submitted applications',()=>{
  assert.equal(PERSONNEL_ACTIVITY_COLLECTION,'bpd_personnel_activity_events');
  assert.equal(staffActivityEvent(promotion.id,promotion.data()).after,'Inspecteur');
  assert.equal(callsignActivityEvent(fixed.id,fixed.data()).after,'P-101');
  assert.equal(callsignActivityEvent(id,{...fixed.data(),status:'verified'}),null);
  assert.equal(callsignActivityEvent(id,{...fixed.data(),status:'sync_needs_review'}),null);
  assert.equal(callsignActivityEvent('invalid',fixed.data()),null);
  assert.equal(callsignActivityEvent(id,{...fixed.data(),syncedAt:null}),null);
});
test('New changes have safe fields and reject incomplete or unsupported audits',()=>{
  assert.equal(staffActivityEvent('x',{...promotion.data(),type:'sanction'}),null);
  assert.equal(staffActivityEvent('x',{...promotion.data(),at:null}),null);
  assert.equal(staffActivityEvent('x',{...promotion.data(),before:'Inspecteur'}),null);
  assert.equal(staffActivityEvent('x',{...promotion.data(),discordId:'invalid'}),null);
  const got=staffActivityEvent(promotion.id,{...promotion.data(),reason:'private',secret:'secret'});
  assert.deepEqual(Object.keys(got).sort(),['after','at','before','dept','discordId','id','name','retrospective','type']);
});
test('Historical Firestore promotions display current rank and date without invented previous grade',()=>{
  const event=createdPromotionEvent(old.id,old.data());
  assert.equal(event.before,'');
  assert.equal(event.after,'Inspecteur');
  assert.equal(event.at,'2026-10-20T14:00:00.000Z');
  assert.equal(createdPromotionEvent(old.id,{...old.data(),rankUpdatedAt:null}),null);
  assert.equal(createdPromotionEvent(old.id,{...old.data(),state:'pending'}),null);
});
test('Feed merges stored approved calls, legacy promotions and new audits, sorts newest first',()=>{
  const rows=recentPersonnelActivity([promotion,edited],[fixed],['politie'],8,[old]);
  assert.deepEqual(rows.map(e=>e.type),['callsign_changed','callsign_assigned','promotion']);
  assert.equal(rows.filter(e=>e.type==='promotion').length,1);
  assert.equal(rows[0].at,'2026-10-20T15:30:00.000Z');
  const legacy=recentPersonnelActivity([],[fixed],['politie'],8,[old]);
  assert.deepEqual(legacy.map(e=>e.type),['callsign_assigned','promotion']);
  assert.deepEqual(recentPersonnelActivity([promotion,edited],[fixed],['ambulance'],8,[old]),[]);
  assert.equal(recentPersonnelActivity([promotion,edited],[fixed],['politie'],1,[old]).length,1);
});
test('Manual historic callsign is recorded at registration time, without claiming occurrence date',()=>{
  const existing=doc('historical_call_123',{type:'callsign_changed',source:'retrospective_manual',
    dept:'politie',discordId:id,name:'Sander',before:'S302',after:'S485',
    at:ts('2026-10-20T18:00:00Z'),actualChangeDate:null,
    actorUid:'actor-private',reason:'old private reason'});
  const event=staffActivityEvent(existing.id,existing.data());
  assert.equal(event.retrospective,true);
  assert.equal(event.before,'S302');
  assert.equal(event.after,'S485');
  assert.equal(event.at,'2026-10-20T18:00:00.000Z');
  assert.equal(Object.hasOwn(event,'actualChangeDate'),false);
  const dto=recentPersonnelActivity([existing],[fixed],['politie'],8);
  assert.equal(dto[0].name,'Sander');
  assert.equal(dto[0].retrospective,true);
});
test('Historical callsign audit validates identity, old/current callsigns and detailed reason',()=>{
  const data={discordId:id,previousCall:'S302',expectedCurrentCall:'S485',
    reason:'Manueel bevestigd aan de hand van de officiële personeelslijst'};
  assert.deepEqual(validateRetrospectiveCallChange(data),data);
  for(const bad of [
    {...data,discordId:'invalid'},
    {...data,previousCall:'S485'},
    {...data,previousCall:'S><'},
    {...data,expectedCurrentCall:'S485 ' ,reason:'te kort'},
    {...data,reason:'goed\\nkeuring'},
    {...data,actorRole:'beheerder'}
  ])assert.throws(()=>validateRetrospectiveCallChange(bad));
});
test('Dashboard uses live event API instead of pretending last-connected staff are promotions',()=>{
  const dashboard=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const routes=readFileSync(new URL('../src/personnel-activity-routes.js',import.meta.url),'utf8');
  const editor=readFileSync(new URL('../src/personnel-editor-routes.js',import.meta.url),'utf8');
  const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.ok(dashboard.includes('Recente personeelsactiviteit'));
  assert.ok(dashboard.includes('/api/personnel/activity/recent'));
  assert.ok(dashboard.includes('function personnelActivityRows()'));
  assert.ok(dashboard.includes('Vast roepnummer toegekend'));
  assert.equal(dashboard.includes("employeeTable(employees.slice().sort((a,b)=>(a.last??Infinity)-(b.last??Infinity)),6)"),false);
  assert.ok(routes.includes('canViewPersonnel(req.bpd,dept)'));
  assert.ok(routes.includes("app.post('/api/personnel/activity/retrospective-callsign',requireUser"));
  assert.ok(routes.includes('canEditPersonnel(req.bpd,person)'));
  assert.ok(routes.includes('getSnapshot({forceRefresh:true})'));
  assert.ok(routes.includes("process.env.BPD_ENABLE_HISTORICAL_CALL_AUDIT_WRITES==='true'"));
  assert.ok(routes.includes("source:'retrospective_manual'"));
  assert.ok(routes.includes('actualChangeDate:null'));
  assert.ok(dashboard.includes('id="historicalCallForm"'));
  assert.ok(dashboard.includes('historicalCallRegistration()'));
  assert.ok(dashboard.includes('Geregistreerd: '));
  assert.ok(routes.includes(".orderBy('syncedAt','desc')"));
  assert.ok(routes.includes(".orderBy('rankUpdatedAt','desc')"));
  assert.ok(server.includes('installPersonnelActivityRoutes(app,{requireUser,getSnapshot});'));
  assert.ok(editor.includes("type:'promotion',dept,discordId"));
  assert.ok(editor.includes("type:'callsign_changed',dept:subject.dept"));
  assert.ok(editor.includes('tx.create(store.collection(PERSONNEL_ACTIVITY_COLLECTION).doc()'));
  assert.ok(editor.includes('if(oldCall!==proposed.call)'));
  const match=dashboard.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match);
  assert.doesNotThrow(()=>new Script(match[1]));
});
