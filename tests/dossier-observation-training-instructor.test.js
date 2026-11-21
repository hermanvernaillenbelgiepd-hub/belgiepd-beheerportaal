import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createObservationScoreBadge,createObservationHeader,createObservationDisclosure}
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
 assert.match(police,/createObservationDisclosure\(\{/);
 assert.match(police,/title:\(row\.eventDate\|\|'Datum onbekend'\)/);
 assert.match(fire,/createObservationDisclosure\(\{/);
 assert.match(citizen,/createObservationDisclosure\(\{/);
 for(const html of [police,fire,citizen])checkModule(html);
});
test('opleider is een apart invoerveld in beide opleidingsformulieren, geen vervanging van de invoerder',()=>{
 const police=source('../public/personeelsbeheer.html');
 const training=source('../public/rollen-opleidingen.html');
 const server=source('../src/role-routes.js');
 for(const html of [police,training])checkModule(html);
 assert.match(police,/id="staffTrainingInstructor"[^>]*minlength="2"/);
 assert.match(police,/id="staffTrainingInstructorManualWrap" hidden/);
 assert.match(police,/if\(body\.instructorName\.length<2\|\|body\.instructorName\.length>120\)/);
 assert.match(police,/instructorName:selectedInstructor\(/);
 assert.match(police,/renderStaffTrainingInstructorChoices\(record\.instructorName/);
 assert.match(police,/row\.instructorName\|\|row\.instructor/);
 assert.match(training,/id="instructorChoice"[^>]*required/);
 assert.match(training,/setInstructorName\(r\.instructorName/);
 assert.match(training,/instructorName,qualificationStage:\$\('qualificationStage'\)\.value/);
 assert.match(server,/const instructorName=asText\(x\?\.instructorName,120\)/);
 assert.match(server,/return \{department,subjectDiscordId:discordId,courseName,details,eventDate,result,instructorName,/);
 assert.match(server,/registeredByDiscordId:actor\.discordId/);
 assert.match(server,/\['courseName','details','eventDate','result','rosterStatus','instructorName','qualificationStage','lessonSessionId','instructorDiscordId'\]/);
 assert.match(server,/lessonSessionId:data\.lessonSessionId/);
 assert.match(server,/instructorDiscordId:data\.instructorDiscordId\|\|null/);
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

test('observaties: alleen datum en score standaard zichtbaar, lange tekst volledig na uitklappen',()=>{
 const doc=globalThis.document;
 globalThis.document={createElement:tag=>({
   tagName:tag.toUpperCase(),className:'',textContent:'',title:'',
   attrs:{},children:[],append(...children){this.children.push(...children)},
   setAttribute(k,v){this.attrs[k]=v}
 })};
 try{
   const longText=('De originele observatie blijft volledig leesbaar. '+
     'Ook na veel informatie en meerdere gebeurtenissen.\n').repeat(150);
   const result=createObservationDisclosure({
     title:'18 november 2026 · Observatie',score:7,details:longText,
     attribution:'Oorspronkelijk door Anvar · overgenomen door Unemi'
   });
   assert.equal(result.element.tagName,'DETAILS');
   assert.equal(result.element.children[0].tagName,'SUMMARY');
   assert.equal(result.element.children[1],result.content);
   assert.equal(result.element.children[0].children[0].children[1].textContent,'7/10');
   assert.equal(result.content.children[0].textContent,longText);
   assert.equal(result.content.children[1].textContent,
     'Oorspronkelijk door Anvar · overgenomen door Unemi');
   assert.ok(!result.element.open,'standaard dicht');
 }finally{globalThis.document=doc}
 const css=source('../public/bpd-dossier-shared.css');
 assert.match(css,/\.bpd-observation-disclosure>/);
 assert.match(css,/max-height:none!important/);
 assert.match(css,/white-space:pre-wrap!important/);
 assert.match(css,/html:not\(\[data-bpd-theme="dark"\]\) \.bpd-observation-disclosure/);
 const police=source('../public/personeelsbeheer.html');
 const fire=source('../public/brandweerdossier.html');
 const citizen=source('../public/burger-personeelsdossiers.html');
 assert.match(police,/details:row\.details\?\?row\.description\?\?'Geen omschrijving'/);
 assert.match(police,/details:row\.details\?\?row\.description\?\?row\.reason\?\?''/);
 assert.match(fire,/details:text\(item\)\|\|'—'/);
 assert.match(citizen,/details:e\.details\|\|'—'/);
 assert.match(police,/attachRetireButton\(disclosure\.content,row,'cases'\)/);
 assert.match(fire,/addFireRetireControl\(disclosure\.content,item,root\.id\)/);
 assert.match(citizen,/\(disclosure\?disclosure\.content:record\)\.append\(remove\)/);
});
