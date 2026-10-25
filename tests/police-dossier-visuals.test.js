import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  validObservationScore,scoreClass,scoreLabel,scoreColors,
  observationSummary,seriesNumber,seriesClass,policeDesignation
} from '../public/police-dossier-visuals.js';
import {validateEntry} from '../src/registrations.js';

test('Eleven observation score states include gray 0 DEGRADATIE through green 10',()=>{
 assert.equal(scoreColors.length,11);
 for(let n=0;n<=10;n++){
   assert.equal(validObservationScore(n),n);
   assert.equal(scoreClass(n),'police-score-'+n);
 }
 for(const invalid of [null,undefined,'',false,true,-1,11,1.5,'NVT','NaN']){
   assert.equal(validObservationScore(invalid),null,String(invalid));
 }
 assert.equal(scoreLabel(0),'0 · DEGRADATIE');
 assert.equal(scoreLabel(10),'10/10');
 assert.notEqual(scoreColors[0],scoreColors[1]);
 assert.notEqual(scoreColors[1],scoreColors[10]);
});
test('Average counts valid non-withdrawn real observations including zero',()=>{
 const rows=[
  {type:'observatie',score:0},{type:'observatie',score:10},
  {type:'observatie',score:8},{type:'observatie',score:null},
  {type:'observatie',score:''},{type:'observatie',score:12},
  {type:'observatie',score:10,testRecord:true},
  {type:'observatie',score:10,status:'ingetrokken'},
  {type:'sanctie',score:10}
 ];
 assert.deepEqual(observationSummary(rows),{count:3,average:6,limited:false});
 assert.deepEqual(observationSummary(rows,{limited:true}),{count:3,average:6,limited:true});
 assert.equal(observationSummary([{type:'observatie',score:undefined}]).average,null);
});
test('Score zero is accepted when explicitly supplied, without becoming a sanction',()=>{
 const record=validateEntry({
  type:'observatie',dept:'politie',eventDate:'2026-10-24',
  eventTime:'12:00',details:'Reguliere inhoud van de observatie en toelichting',
  score:0,otherPlayers:'',evidenceUrl:''
 });
 assert.equal(record.score,0);
 assert.equal(record.type,'observatie');
 assert.equal(validateEntry({
  type:'observatie',dept:'politie',eventDate:'2026-10-24',
  eventTime:'12:00',details:'Reguliere inhoud van de observatie en toelichting',
  score:'',otherPlayers:'',evidenceUrl:''
 }).score,null,'A missing legacy score must not be interpreted as zero');
});
test('Reeks 1-4 get stable colors, other services get no Police leader badges',()=>{
 assert.deepEqual(['Reeks 1','Reeks 2','Reeks 3','Reeks 4 (reserve)']
   .map(series=>seriesClass(series)),[
     'police-series-1','police-series-2','police-series-3','police-series-4']);
 assert.equal(seriesNumber('Reeks 04'),4);
 assert.equal(seriesNumber('Vlinder'),null);
 assert.equal(policeDesignation({dept:'politie',call:'910',rank:'Commissaris'}).icon,'👑');
 assert.equal(policeDesignation({dept:'politie',call:'920',rank:'Commissaris'}).icon,'🌈');
 assert.equal(policeDesignation({dept:'politie',rank:'Inspecteur',series:'Vlinder'}).icon,'🦋');
 assert.equal(policeDesignation({dept:'brandweer',call:'900',rank:'Hoofdcommissaris'}),null);
});
test('Police dossier has visible coded scores and header while other departments remain unchanged',()=>{
 const file=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/bpd-dossier-shared.css',import.meta.url),'utf8');
 assert.match(file,/id="sheetScoreSummary"/);
 assert.match(file,/sheetAverageScore\(list,limited\)/);
 assert.match(file,/makeScoreBadge\(row\.score\)/);
 assert.match(file,/police-series-head/);
 assert.match(file,/seriesNumber\(p\.series\)/);
 assert.match(file,/scoreHeader\.hidden=p\.dept!=='politie'/);
 assert.match(file,/min="0" max="10"/);
 for(let n=0;n<=10;n++)assert.ok(css.includes('.police-score-badge.police-score-'+n));
 for(let n=1;n<=4;n++)assert.ok(css.includes('.police-series-'+n));
 assert.ok(css.includes('.police-designation.officer'));
 assert.ok(css.includes('.police-designation.corps'));
 assert.ok(css.includes('.police-designation.butterfly'));
});
