import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {canReviewPoliceActivity,activityReviewForNewPing,
 publicActivityReview,activityReviewForAutomaticPing,ACTIVITY_PING_REVIEWS} from '../src/activity-ping-review-routes.js';
import {publicPingNotice} from '../src/inactivity-ping-notifications.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const officer={uid:'discord:111111111111111111',discordId:'111111111111111111',
 role:'officierenkader',departments:['politie'],
 departmentRoles:{politie:'officierenkader'},
 dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie']};
const middle={...officer,role:'middenkader',departmentRoles:{politie:'middenkader'}};
const subject={dept:'politie',personId:'222222222222222222',
 call:'316',name:'Voorbeeld',rank:'Inspecteur van Politie',status:'Inactief'};
const entryId='A1B2C3D4E5F6G7H8';
const ping={activityStatus:'ACTIEF',discordPingSent:false};
test('politie Officierenkader en Korpsleiding ontvangen meldingen, Middenkader niet',()=>{
 assert.equal(canReviewPoliceActivity(officer),true);
 assert.equal(canReviewPoliceActivity({...officer,role:'korpsleiding',departmentRoles:{politie:'korpsleiding'}}),true);
 assert.equal(canReviewPoliceActivity(middle),false);
 assert.equal(canReviewPoliceActivity({...officer,departments:['brandweer']}),false);
 assert.equal(canReviewPoliceActivity({...officer,uid:'google:1'}),false);
 assert.equal(ACTIVITY_PING_REVIEWS,'bpd_activity_ping_reviews');
});
test('een ACTIEF-ping vanuit INACTIEF maakt een voorstel, niet direct een statuswijziging',()=>{
 const record=activityReviewForNewPing({dept:'politie',discordId:subject.personId,
  entryId,actor:{discordId:officer.discordId,name:'Loggend kader',call:'620'},
  subject,data:ping});
 assert.equal(record.state,'pending');
 assert.equal(record.proposedStatus,'ACTIEF');
 assert.equal(record.previousStatus,'INACTIEF');
 assert.equal(record.targetDiscordId,subject.personId);
 assert.equal(record.discordPingSent,false);
 assert.equal(record.reporterCall,'620');
 const projected=publicActivityReview(entryId,record,subject,officer);
 assert.equal(projected.canApprove,true);
 assert.equal(projected.reporterName,'Loggend kader');
 assert.equal(publicActivityReview(entryId,record,subject,middle),null);
 const change={...subject,status:'ACTIEF'};
 assert.equal(publicActivityReview(entryId,record,change,officer).canApprove,false);
});
test('50/50, INACTIEF en CHECKING kunnen elk een ACTIEF-voorstel opleveren',()=>{
 for(const status of ['50/50','INACTIEF','CHECKING']){
  const target={...subject,status};
  const item=activityReviewForNewPing({dept:'politie',discordId:subject.personId,
   entryId,actor:{discordId:officer.discordId},subject:target,data:ping});
  assert.equal(item.state,'pending');
  assert.equal(item.previousStatus,status);
  assert.equal(publicActivityReview(entryId,item,target,officer)?.canApprove,true);
 }
 const returnTarget={...subject,status:'CHECKING',leaveReturnChecking:true,
  leaveReturnEndDate:'2026-11-21',statusBeforeChecking:'50/50'};
 const review=activityReviewForNewPing({dept:'politie',discordId:subject.personId,
  entryId,actor:{discordId:officer.discordId},subject:returnTarget,data:ping});
 assert.equal(review.checkingReturnId,'politie_'+subject.personId+'_2026-11-21');
 assert.equal(review.statusBeforeChecking,'50/50');
 const source=read('src/activity-ping-review-routes.js');
 assert.match(source,/tx\.update\(checkingRef,\{status:'ACTIEF'/);
 assert.match(source,/checking\.get\('status'\)!=='CHECKING'/);
 assert.match(source,/persisted!==expected/);
 assert.match(source,/subject\.leaveReturnChecking!==true&&record\.checkingReturnId/);
});
test('Automatische uren- en afwezigheidspings zijn louter informatief voor leiding',()=>{
 const alert=activityReviewForAutomaticPing({
  dept:'politie',personId:subject.personId,call:subject.call,
  name:subject.name,status:'50/50'
 },{kind:'INACTIEF'},entryId);
 assert.equal(alert.state,'information');
 assert.equal(alert.proposedStatus,null);
 assert.equal(alert.discordPingSent,false);
 assert.equal(alert.reporterName,'BelgiumPD activiteitscontrole');
 assert.equal(publicActivityReview(entryId,alert,subject,officer)?.canApprove,false);
});
test('gewone opvolgingsping geeft alleen rapportage, geen ACTIEF-voorstel',()=>{
 for(const status of ['50/50','INACTIEF','TUSSENTIJDSE_CONTROLE_PING',
  'GEEN_VERBETERING_NA_PING','VERWIJDERING_TE_BEOORDELEN']){
  const item=activityReviewForNewPing({dept:'politie',discordId:subject.personId,
   entryId,actor:{discordId:officer.discordId,name:'Logger'},subject,
   data:{...ping,activityStatus:status}});
  assert.equal(item.state,'information');assert.equal(item.proposedStatus,null);
 }
 const alreadyActive=activityReviewForNewPing({dept:'politie',
  discordId:subject.personId,entryId,
  actor:{discordId:officer.discordId},subject:{...subject,status:'ACTIEF'},data:ping});
 assert.equal(alreadyActive.state,'information');
 assert.throws(()=>activityReviewForNewPing({dept:'burger',discordId:subject.personId,
  entryId,actor:{discordId:officer.discordId},subject,data:ping}));
});
test('persoonlijke pingprojectie toont uitsluitend beslissing, niet private auditvelden',()=>{
 const record={type:'inactiviteitsping',dept:'politie',
  createdAt:{toDate:()=>new Date('2026-11-24T08:00:00Z')},
  decision:'approved',decisionBy:{name:'Officierenkader'},
  decisionReason:'Activiteit terug bevestigd',
  decidedAt:{toDate:()=>new Date('2026-11-24T08:10:00Z')},
  secret:'mag-niet-tonen'};
 const result=publicPingNotice(entryId,record);
 assert.equal(result.decision,'approved');
 assert.equal(result.decisionBy,'Officierenkader');
 assert.equal(result.secret,undefined);
});
test('iedere registratie blijft in één canoniek dossier en weekrapport',()=>{
 const routes=read('src/management-routes.js');
 const reviews=read('src/activity-ping-review-routes.js');
 assert.match(routes,/batch\.create\(db\(\)\.collection\(ACTIVITY_PING_REVIEWS\)\.doc\(newDoc\.id\)/);
 assert.match(routes,/type==='inactiviteitsping'&&dept==='politie'&&!represented/);
 assert.match(routes,/batch\.create\(newDoc,/);
 assert.match(routes,/batch\.create\(notice,/);
 assert.match(reviews,/app\.post\('\/api\/management\/activity-ping-reviews\/:id\/decision'/);
 assert.match(reviews,/canEditGeneralPersonnelInfo\(req\.bpd,subject\)/);
 assert.match(reviews,/env\.BPD_PERSONNEL_OVERRIDES_ACTIVE!=='true'/);
 assert.match(reviews,/tx\.create\(overlay\.collection\('audit'\)\.doc\(\)/);
 assert.match(reviews,/reportCategory:'activiteit'/);
 assert.match(reviews,/tx\.update\(ref,\{state:decision/);
 assert.doesNotMatch(reviews,/discord\.com\/api|sendMessage|discord.*DM\(/);
});
test('Activiteitencentrum gebruikt kleine knoppen en een expliciete handmatige registratie',()=>{
 const html=read('public/activiteitscentrum.html');
 const dashboard=read('public/activity-dashboard.js');
 const css=read('public/activity-dashboard.css');
 assert.match(dashboard,/activity-lookup-button/);
 assert.match(dashboard,/activity-mini-button/);
 assert.match(dashboard,/activityQuickPingTop/);
 assert.match(html,/id="activityQuickPingDialog"/);
 assert.match(html,/id="quickPingStatus"/);
 assert.match(html,/portalNotice:true/);
 assert.match(html,/api\/management\/cases/);
 assert.match(html,/Geen automatisch Discord-bericht verstuurd|geen automatisch Discord-bericht verstuurd/i);
 assert.match(css,/activity-selected-person \.activity-lookup-button/);
 const inline=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(inline);
 const syntax=spawnSync(process.execPath,['--check','--input-type=module'],
  {input:inline,encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
});
test('Meldingen heeft afgeschermde ACTIEF-beoordeling en logger/ontvangergegevens',()=>{
 const html=read('public/meldingen.html');
 assert.match(html,/id="activityReviewPanel"/);
 assert.match(html,/loadActivityReviews/);
 assert.match(html,/api\/management\/activity-ping-reviews/);
 assert.match(html,/reporterName/);
 assert.match(html,/targetDiscordId/);
 assert.match(html,/canApprove/);
 assert.match(html,/Beslissing niet opgeslagen/);
});
