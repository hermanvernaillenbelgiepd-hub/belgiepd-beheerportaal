import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canChooseSanction,canChooseDepartmentSanction,validateEntry,
 permittedSanctionTypes} from '../src/registrations.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sample={dept:'politie',type:'sanctie',eventDate:'2026-11-19',eventTime:'09:30',
 details:'Tijdelijke maatregel na geregistreerd incident',severity:6,
 reasons:['Veiligheid'],sanctionType:'Tijdelijke degradatie',
 temporaryRank:'Agent',endDate:'2026-11-25'};
test('Middenkader kan vijf formele maatregelen voor eigen dienst registreren',()=>{
 const kinds=permittedSanctionTypes('middenkader',6);
 for(const name of ['Mondelinge waarschuwing','Officiële waarschuwing',
   'Tijdelijke beperking','Schorsing','Tijdelijke degradatie'])
   assert.ok(kinds.includes(name),name);
 for(const name of ['Degradatie','Ontslag','Ontslag met blacklisting'])
   assert.ok(!kinds.includes(name),name);
 assert.equal(canChooseSanction('middenkader','Degradatie',10),false);
 assert.equal(canChooseSanction('officierenkader','Degradatie',10),true);
 assert.equal(canChooseSanction('officierenkader','Ontslag',10),false);
 assert.equal(canChooseSanction('korpsleiding','Ontslag',10),true);
 assert.equal(canChooseDepartmentSanction('depannage','middenkader','Tijdelijke degradatie',6),false);
});
test('Tijdelijke degradatie vereist einddatum en lagere graad, zonder automatisch personeelsbeheer',()=>{
 const validated=validateEntry(sample);
 assert.equal(validated.sanctionType,'Tijdelijke degradatie');
 assert.equal(validated.temporaryRank,'Agent');
 assert.equal(validated.endDate,'2026-11-25');
 for(const invalid of [
  {...sample,temporaryRank:''}, {...sample,endDate:''},
  {...sample,endDate:'2026-11-18'}, {...sample,restrictedSpecialties:['K9']}
 ])assert.throws(()=>validateEntry(invalid));
 assert.throws(()=>validateEntry({...sample,sanctionType:'Schorsing'}));
 const src=read('public/personeelsbeheer.html');
 assert.match(src,/id="formalTemporaryRank"/);
 assert.match(src,/id="formalTemporaryEndDate"/);
 assert.match(src,/Tijdelijke schorsing van specialisatie/);
 assert.match(src,/Rang en Discord-rechten veranderen daardoor niet automatisch/);
 assert.match(src,/<optgroup label="Maatregelen">/);
});
test('Opvolging en historiek blijven gescheiden van daadwerkelijke rangwijziging',()=>{
 const src=read('src/registration-routes.js');
 assert.match(src,/canChooseDepartmentSanction\(/);
 assert.match(src,/registeredBy:represented\|\|actor/);
 assert.match(src,/caseId:docId\(dept,id\)/);
 const ui=read('public/personeelsbeheer.html');
 assert.match(ui,/data\.temporaryRank=\$\('formalTemporaryRank'\)\.value\.trim\(\)/);
 assert.match(ui,/data\.endDate=\$\('formalTemporaryEndDate'\)\.value/);
 assert.match(ui,/formalSanctionFields/);
 assert.match(ui,/formalTemporaryDemotionFields/);
});
