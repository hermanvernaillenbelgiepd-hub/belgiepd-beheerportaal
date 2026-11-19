import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sortTrainingPeople,instructorOptionText,selectedInstructor,MANUAL_INSTRUCTOR_VALUE}
 from '../public/training-instructor-choices.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Opleiderkeuze gebruikt personeelsvergelijking in de juiste dienstvolgorde',()=>{
 const names=['700','910','600','008','930','900','710','100'];
 const people=names.map(call=>({call,department:'politie',discordId:'123456789012345678',name:'Naam '+call}));
 const orders=[];
 const compare=(a,b,mode)=>{
  orders.push(mode);
  const num=x=>Number(x.call);
  const group=x=>x.call==='008'?-1:Math.floor(num(x)/100);
  return group(b)-group(a)||num(a)-num(b);
 };
 const sorted=sortTrainingPeople(people,'politie',compare);
 assert.deepEqual(sorted.map(x=>x.call),['900','910','930','700','710','600','100','008']);
 assert.ok(orders.every(mode=>mode==='series-desc'));
 assert.equal(instructorOptionText(sorted[0]),'900 · Naam 900');
 assert.equal(selectedInstructor({value:MANUAL_INSTRUCTOR_VALUE},{value:'  Externe opleider  '}),'Externe opleider');
 assert.equal(selectedInstructor({value:'910 · Opleider 910'},{value:'Anders'}),'910 · Opleider 910');
});
test('Dezelfde selectie wordt toegepast in het register, dossier en historische observaties',()=>{
 const register=read('public/rollen-opleidingen.html');
 const dossier=read('public/personeelsbeheer.html');
 assert.match(register,/sortTrainingPeople\(data\.people\|\|\[\],dept,BPDPersonnelVisuals\.comparePersonnel\)/);
 assert.match(dossier,/populateInstructorOptions\(\$\('staffTrainingInstructorChoice'\)/);
 assert.match(dossier,/BPDPersonnelVisuals\.comparePersonnel\(a,b,'series-desc'\)/);
 assert.match(register,/ANDERE · zelf invullen/);
 assert.match(dossier,/ANDERE · zelf invullen/);
});
