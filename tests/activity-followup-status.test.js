import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activityFollowupStatus,activityPingRegistration}
 from '../src/activity-followup-status-policy.js';
import {validateManagementEntry,reportSections} from '../src/management-utils.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Activiteitssuggesties: 20 en 10 uur, 15/30/60 dagen en sterkste regel',()=>{
 const assess=value=>activityFollowupStatus(value).status;
 assert.equal(assess({hours:20,daysAbsent:0}),'ACTIEF');
 assert.equal(assess({hours:19.999,daysAbsent:0}),'50/50');
 assert.equal(assess({hours:10,daysAbsent:0}),'50/50');
 assert.equal(assess({hours:9.999,daysAbsent:0}),'INACTIEF');
 assert.equal(assess({hours:20,daysAbsent:14}),'ACTIEF');
 assert.equal(assess({hours:20,daysAbsent:15}),'50/50');
 assert.equal(assess({hours:20,daysAbsent:29}),'50/50');
 assert.equal(assess({hours:20,daysAbsent:30}),'INACTIEF');
 assert.equal(assess({hours:30,daysAbsent:60}),'VERWIJDERING_TE_BEOORDELEN');
 assert.equal(assess({hours:0,daysAbsent:60}),'VERWIJDERING_TE_BEOORDELEN');
 assert.equal(assess({}),null,'geen bronbewijs is niet hetzelfde als Actief');
 assert.equal(assess({hours:3,onApprovedLeave:true}),null);
 assert.equal(assess({daysAbsent:100,onApprovedLeave:true}),null);
});
test('Een manuele Discord-ping is een attesteringsveld, geen automatisch verstuurd bericht',()=>{
 const record=activityPingRegistration({activityStatus:'50/50',discordPingSent:true,
  discordPingDate:'2026-11-19'});
 assert.deepEqual(record,{activityStatus:'50/50',discordPingSent:true,
  discordPingDate:'2026-11-19'});
 assert.deepEqual(activityPingRegistration({activityStatus:'INACTIEF',discordPingSent:false}),
  {activityStatus:'INACTIEF',discordPingSent:false});
 for(const x of [
  {activityStatus:'VERWIJDERD',discordPingSent:true,discordPingDate:'2026-11-19'},
  {activityStatus:'ACTIEF',discordPingSent:'true',discordPingDate:'2026-11-19'},
  {activityStatus:'50/50',discordPingSent:true},
  {activityStatus:'50/50',discordPingSent:false,discordPingDate:'2026-11-19'},
  {activityStatus:'INACTIEF',discordPingSent:true,discordPingDate:'31/02/2026'}
 ])assert.throws(()=>activityPingRegistration(x));
});
test('Dossier en weekrapport bewaren status, datum Discord en audit zonder live-statuswijziging',()=>{
 const entry=validateManagementEntry({type:'inactiviteitsping',eventDate:'2026-11-19',
  details:'Opvolgstatus: 50/50. Discord gepingd op 19/11/2026. Medewerker gesproken.',
  activityStatus:'50/50',discordPingSent:true,discordPingDate:'2026-11-19'});
 assert.equal(entry.reportCategory,'inactiviteitsping');
 assert.equal(entry.activityStatus,'50/50');
 const report=reportSections([{...entry,registeredBy:{name:'Kader',call:'700'}}],
  '2026-11-16','2026-11-29');
 assert.equal(report.find(x=>x.type==='inactiviteitsping').entries.length,1);
 const route=source('src/management-routes.js'),page=source('public/personeelsbeheer.html');
 assert.ok(route.includes('ACTIVITY_FOLLOWUP_STATUS.includes(data.activityStatus)'));
 assert.ok(route.includes("typeof data.discordPingSent!=='boolean'"));
 assert.ok(route.includes('const newDoc=db().collection'));
 assert.ok(page.includes('id="staffActivityStatus"'));
 assert.ok(page.includes('id="staffActivityDiscordContact"'));
 assert.ok(page.includes('id="staffActivityDiscordDate"'));
 assert.ok(page.includes('activity-followup-orange'));
 assert.ok(page.includes('Discord-ping handmatig verstuurd'));
 assert.ok(page.includes('De status van de officiële personeelslijst verandert niet automatisch'));
 const runner=source('src/activity-ping-runner.js');
 assert.ok(runner.includes('No personnel status, Discord roles'));
});

test('Geen activiteitsverbetering na eerdere ping is een apart gelogd opvolgresultaat, geen nieuwe Discord-ping',()=>{
 const entry=validateManagementEntry({type:'inactiviteitsping',
  eventDate:'2026-11-19',details:'Na de eerdere ping geen verbetering; geen extra speeluren vastgesteld.',
  activityStatus:'GEEN_VERBETERING_NA_PING',discordPingSent:false});
 assert.equal(entry.activityStatus,'GEEN_VERBETERING_NA_PING');
 assert.equal(entry.discordPingSent,false);
 assert.equal(entry.reportCategory,'inactiviteitsping');
 const sections=reportSections([{...entry,registeredBy:{name:'Middenkader',call:'700'}}],
  '2026-11-16','2026-11-29');
 assert.equal(sections.find(x=>x.type==='inactiviteitsping').entries.length,1);
 const ui=source('public/personeelsbeheer.html');
 assert.match(ui,/option value="GEEN_VERBETERING_NA_PING"/);
 assert.match(ui,/Geen activiteitsverbetering na eerdere ping/);
});
