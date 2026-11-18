import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createObservationScoreBadge,createObservationHeader}
 from '../public/dossier-observation-ui.js';
import {requiresReReview} from '../src/training-maintenance.js';

const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const checkModule=html=>{
 const js=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js,'module script bestaat');
 const result=spawnSync(process.execPath,['--check','--input-type=module'],
   {input:js,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
};
test('scorebadge 0–10 is alleen weergave, zonder automatische personeelsactie',()=>{
 const doc=globalThis.document;
 globalThis.document={createElement:(tag)=>({
   tagName:tag.toUpperCase(),className:'',textContent:'',title:'',
   attrs:{},children:[],append(...children){this.children.push(...children)},
   setAttribute(k,v){this.attrs[k]=v}
 })};
 try{
  assert.equal(createObservationScoreBadge(null),null);
  assert.equal(createObservationScoreBadge(''),null);
  assert.equal(createObservationScoreBadge(12),null);
  assert.equal(createObservationScoreBadge(-1),null);
  assert.equal(createObservationScoreBadge('5.5'),null);
  for(let score=0;score<=10;score++){
   const badge=createObservationScoreBadge(score);
   assert.match(badge.className,/bpd-score-chip/);
   assert.match(badge.className,new RegExp('police-score-'+score));
   assert.equal(badge.textContent,score===0?'0 · DEGRADATIE':score+'/10');
   assert.match(badge.attrs['aria-label'],/Observatiescore/);
  }
  const h=createObservationHeader('16 november · Observatie',8);
  assert.equal(h.children.length,2);
  assert.equal(h.children[1].textContent,'8/10');
 }finally{globalThis.document=doc}
});
test('gedeelde observatieopmaak wisselt achtergrond, tekst en kleurrand per thema',()=>{
 const css=source('../public/bpd-dossier-shared.css');
 assert.match(css,/\.bpd-observation-entry\s*\{/);
 assert.match(css,/\.bpd-observation-head\s*\{/);
 assert.match(css,/\.bpd-observation-meta\s*\{/);
 assert.match(css,/\.bpd-score-chip,/);
 assert.match(css,/background:#080f1d!important/);
 assert.match(css,/color:#fff!important/);
 assert.match(css,/border:2px solid var\(--bpd-score-accent/);
 assert.match(css,/html:not\(\[data-bpd-theme="dark"\]\) \.bpd-score-chip/);
 assert.match(css,/background:#f7faff!important/);
 assert.match(css,/color:#16243b!important/);
 const police=source('../public/personeelsbeheer.html');
 const fire=source('../public/brandweerdossier.html');
 const citizen=source('../public/burger-personeelsdossiers.html');
 assert.match(police,/createObservationHeader\(\(row\.eventDate/);
 assert.match(police,/createObservationHeader\(title\.textContent,row\.score\)/);
 assert.match(fire,/createObservationHeader\(heading\(item\),item\.score\)/);
 assert.match(citizen,/createObservationHeader\(title,e\.score\)/);
 for(const html of [police,fire,citizen])checkModule(html);
});
test('opleider is een apart invoerveld in beide opleidingsformulieren, geen vervanging van de invoerder',()=>{
 const police=source('../public/personeelsbeheer.html');
 const training=source('../public/rollen-opleidingen.html');
 const server=source('../src/role-routes.js');
 for(const html of [police,training])checkModule(html);
 assert.match(police,/id="staffTrainingInstructor"[^>]*required/);
 assert.match(police,/instructorName:\$\('staffTrainingInstructor'\)\.value\.trim\(\)/);
 assert.match(police,/\$\('staffTrainingInstructor'\)\.value=record\.instructorName/);
 assert.match(police,/row\.instructorName\|\|row\.instructor/);
 assert.match(training,/id="instructorName"[^>]*required/);
 assert.match(training,/\$\('instructorName'\)\.value=r\.instructorName/);
 assert.match(training,/instructorName};/);
 assert.match(server,/const instructorName=asText\(x\?\.instructorName,120\)/);
 assert.match(server,/return \{department,subjectDiscordId:discordId,courseName,details,eventDate,result,instructorName\}/);
 assert.match(server,/registeredByDiscordId:actor\.discordId/);
 assert.match(server,/\['courseName','details','eventDate','result','rosterStatus','instructorName'\]/);
 assert.match(server,/instructorName:data\.instructorName/);
});
test('gewijzigde opleider triggert nieuwe controle maar historische opleidingen zonder opleider blijven leesbaar',()=>{
 const prior={courseName:'K-9',eventDate:'2026-11-10',result:'geslaagd',details:'prima',
   instructorName:'Anvar',rosterStatus:'klaar_voor_manuele_invoer'};
 assert.equal(requiresReReview(prior,{...prior}),false);
 assert.equal(requiresReReview(prior,{...prior,instructorName:'Unemi'}),true);
 assert.equal(requiresReReview({...prior,instructorName:undefined},
   {...prior,instructorName:'Nieuwe opleider'}),true);
 const police=source('../public/personeelsbeheer.html');
 assert.match(police,/row\.instructorName\|\|row\.instructor\|\|'niet vermeld'/);
});
