import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 INACTIVITY_PING_NOTICES,inactivityPingNotice,publicPingNotice,validPingId
} from '../src/inactivity-ping-notifications.js';
import {reportSections} from '../src/management-utils.js';
const id='1309532438019706966',entry='A1B2C3D4E5F6G7H8I9J0';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('one inactivity ping links a private member notice to canonical dossier entry',()=>{
 assert.equal(INACTIVITY_PING_NOTICES,'bpd_personal_inactivity_pings');
 const notice=inactivityPingNotice({
  dept:'politie',discordId:id,entryId:entry,
  details:'Niet online sinds 14 dagen, controle gevraagd.',
  actor:{name:'Controleur',call:'700'}
 });
 assert.equal(validPingId(entry),true);
 assert.equal(notice.targetDiscordId,id);
 assert.equal(notice.caseId,'politie_'+id);
 assert.equal(notice.entryId,entry);
 assert.equal(notice.status,'sent');
 assert.equal(notice.sentBy.call,'700');
 assert.deepEqual(reportSections([{type:'inactiviteitsping',
  reportCategory:'inactiviteitsping',eventDate:'2026-11-03',
  details:notice.details}],'2026-11-01','2026-11-14')
  .find(s=>s.type==='inactiviteitsping').entries.map(x=>x.details),[notice.details]);
});
test('invalid target, event and document data are not accepted',()=>{
 const base={dept:'politie',discordId:id,entryId:entry,
  details:'Activiteitsopvolging',actor:{}};
 for(const update of [
  {dept:'algemeen'},{discordId:'unknown'},{entryId:'../hack'},
  {details:''},{source:'discord-dm'}
 ])assert.throws(()=>inactivityPingNotice({...base,...update}));
});
test('member receives only an allowlisted notice projection with no raw audit identity',()=>{
 const record={...inactivityPingNotice({dept:'politie',discordId:id,entryId:entry,
  details:'Activiteitsopvolging',actor:{name:'Leiding'}}),
  createdAt:{toDate:()=>new Date('2026-11-03T09:30:00Z')},
  readAt:null,submittedBy:{email:'private@example.com'},secret:'must-not-leak'};
 const response=publicPingNotice(entry,record);
 assert.equal(response.status,'sent');
 assert.equal(response.sentAt,'2026-11-03T09:30:00.000Z');
 assert.equal(response.details,'Activiteitsopvolging');
 assert.equal(response.sentBy,'Leiding');
 assert.equal(Object.hasOwn(response,'submittedBy'),false);
 assert.equal(Object.hasOwn(response,'secret'),false);
 assert.equal(publicPingNotice('../invalid',record),null);
});
test('member-only read endpoint cannot choose a different subject from request',()=>{
 const route=read('src/management-routes.js');
 const page=read('public/meldingen.html');
 assert.match(route,/app\.get\('\/api\/management\/pings\/mine',requireUser/);
 assert.match(route,/app\.post\('\/api\/management\/pings\/mine\/:entryId\/read',requireUser/);
 assert.match(route,/const id=req\.bpd\?\.discordId,entryId=req\.params\.entryId/);
 assert.match(route,/current\.get\('targetDiscordId'\)!==id/);
 assert.match(route,/batch\.create\(newDoc,/);
 assert.match(route,/if\(type==='inactiviteitsping'\)/);
 assert.match(route,/batch\.create\(ping,/);
 assert.match(route,/pingReadAt:at/);
 assert.match(route,/action:'inactiviteitsping_read'/);
 assert.match(page,/id="activityPingsPanel"/);
 assert.match(page,/await api\('\/api\/management\/pings\/mine'/);
 assert.match(page,/action\.textContent='GELEZEN'/);
});
