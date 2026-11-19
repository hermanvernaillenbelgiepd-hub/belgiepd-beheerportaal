import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {threeMonthCutoff,threeMonthObservationScore,
 observationTrendLabel,observationTrendSymbol}
 from '../public/observation-score-trend.js';
import {observationAverage} from '../src/citizen-dossier-policy.js';

const today='2026-11-19';
const record=(date,score,extra={})=>({type:'observatie',eventDate:date,
 score,...extra});
const citizen=(date,score,extra={})=>({kind:'observatie',eventDate:date,
 score,...extra});
const sourceFile=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('drie kalendermaanden rekenen met Belgische datum en juiste daggrenzen',()=>{
 assert.equal(threeMonthCutoff(today),'2026-08-19');
 assert.equal(threeMonthCutoff('2026-05-31'),'2026-02-28');
 assert.equal(threeMonthCutoff('2024-05-31'),'2024-02-29');
 const summary=threeMonthObservationScore([
  record('2026-08-18',0),record('2026-08-19',2),
  record('2026-11-19',8),record('2026-11-20',10),
  record('2026-11-18',null),record('2026-11-10',''),
  record('2026-11-03',11),record('2026-09-01',0,{testRecord:true}),
  record('2026-09-02',0,{status:'ingetrokken'}),
  {...record('2026-09-03',0),retired:true},
  {type:'sanctie',eventDate:'2026-10-02',score:0}
 ],{today});
 assert.equal(summary.count,2);
 assert.equal(summary.average,5);
 assert.equal(summary.trend,'up');
 assert.equal(summary.delta,6);
 assert.equal(summary.from,'2026-08-19');
});
test('dalend, stabiel en geen trend zonder voldoende brondata',()=>{
 let x=threeMonthObservationScore([record('2026-09-01',9),
   record('2026-11-01',3)],{today});
 assert.equal(x.trend,'down');assert.equal(observationTrendSymbol(x.trend),'↘');
 x=threeMonthObservationScore([record('2026-09-01',7),
   record('2026-11-01',7)],{today});
 assert.equal(x.trend,'stable');assert.equal(observationTrendSymbol(x.trend),'→');
 x=threeMonthObservationScore([record('2026-11-01',7)],{today});
 assert.equal(x.trend,'insufficient');
 x=threeMonthObservationScore([record('2026-11-01',7),
   record('2026-11-01',9)],{today});
 assert.equal(x.trend,'insufficient','bulk invoer op dezelfde dag is geen RP-trend');
 x=threeMonthObservationScore([record('2026-09-01',6),
   record('2026-11-01',8)],{today,limited:true});
 assert.equal(x.count,2);assert.equal(x.trend,'insufficient');
 assert.equal(x.limited,true);
 assert.equal(observationTrendLabel('insufficient'),'Onvoldoende gegevens');
});
test('burgerdossier gebruikt dezelfde 3-maandenberekening voor observaties, niet voor sancties',()=>{
 const x=observationAverage([citizen('2026-09-01',4),
  citizen('2026-11-10',8),citizen('2026-07-01',10),
  {...citizen('2026-10-01',0),kind:'sanctie_mondeling'}],{today});
 assert.equal(x.count,2);assert.equal(x.average,6);
 assert.equal(x.trend,'up');assert.equal(x.from,'2026-08-19');
 assert.equal(observationAverage([],{today}).average,null);
});
test('scoreweergaven zijn gekoppeld aan bestaande geautoriseerde dossierbronnen',()=>{
 const police=sourceFile('public/personeelsbeheer.html');
 const citizenPage=sourceFile('public/burger-personeelsdossiers.html');
 const fire=sourceFile('public/brandweerdossier.html');
 for(const p of [police,citizenPage,fire]){
  assert.match(p,/\/observation-score-trend\.js/);
  assert.match(p,/observationTrendSymbol/);
  assert.match(p,/observationTrendLabel/);
  const script=p.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const valid=spawnSync(process.execPath,['--check','--input-type=module'],
    {input:script,encoding:'utf8'});
  assert.equal(valid.status,0,valid.stderr);
 }
 assert.match(police,/sheetAverageScore\(list,limited\)/);
 assert.match(police,/Gem\. score · 3 maanden/);
 assert.match(citizenPage,/id="personTrend"/);
 assert.match(fire,/id="fireScoreSummary"/);
 assert.match(sourceFile('src/citizen-dossier-routes.js'),
  /observation:observationAverage\(entries,\{limited:/);
});
test('verwijderingskeuzes activeren een aparte procedure, niet de ping-POST',()=>{
 const police=sourceFile('public/personeelsbeheer.html');
 assert.match(police,/option value="ARCHIVE_INACTIVE_60"/);
 assert.match(police,/option value="ARCHIVE_DISCORD_DEPARTURE"/);
 assert.match(police,/const cause=ACTIVITY_ARCHIVE_CAUSES\[option\]/);
 assert.match(police,/await archiveServiceMembership\(selected,\{fromActivityPing:true,presetCause:cause\}\)/);
 assert.match(police,/if\(!current\.canManage\|\|current\.state!=='active'\)/);
 assert.match(police,/body:\{cause,reason,expectedRevision:current\.revision\}/);
 assert.match(police,/if\(activity&&Object\.hasOwn\(ACTIVITY_ARCHIVE_CAUSES,activityStatus\)\)/);
 const backend=sourceFile('src/personnel-lifecycle-routes.js');
 assert.match(backend,/source:'personnel-lifecycle-archive'/);
 assert.match(backend,/type:'personeelsbeweging',reportCategory:'personeelsbeweging'/);
 assert.match(backend,/activityStatus:'VERWIJDERD',discordPingSent:false/);
});
