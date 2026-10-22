import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {maySubmit,canChooseSanction,validateEntry} from '../src/registrations.js';
import {reportSections} from '../src/management-utils.js';

const file=readFileSync(new URL('../public/weekrapporten.html',import.meta.url),'utf8');

test('Observaties en sancties staan onder dezelfde dossiercategorie en dezelfde opslaanactie',()=>{
  assert.ok(file.includes("observatie:'Observatie'"));
  assert.ok(file.includes("sanctie:'Sanctie'"));
  assert.ok(file.includes("'/api/registrations/entries','POST'"));
  assert.ok(file.includes("'/api/management/cases','POST'"));
  assert.ok(file.includes('data-edit-sanction'));
  assert.ok(!file.includes('<a class="tab" href="/registraties.html">Observaties & sancties</a>'));
  for(const id of ['caseForm','registrationTime','registrationSanctionType','registrationSeverity',
    'registrationReasons','registrationRepresent','sanctionAmendReason','caseList']){
    assert.ok(file.includes('id="'+id+'"'),'ontbrekend invoerveld: '+id);
  }
});
test('Sanctiebevoegdheden blijven onveranderd en zwaar sanctieregime blijft beperkt',()=>{
  const middle={role:'middenkader',departments:['politie']};
  assert.equal(maySubmit(middle,'observatie','politie'),true);
  assert.equal(maySubmit(middle,'sanctie','politie'),true);
  assert.equal(maySubmit(middle,'sanctie','brandweer'),false);
  assert.equal(canChooseSanction('middenkader','Schorsing'),false);
  assert.equal(canChooseSanction('middenkader','Officiële waarschuwing'),true);
  assert.equal(canChooseSanction('officierenkader','Schorsing'),true);
  assert.equal(canChooseSanction('korpsleiding','Ontslag'),true);
});
test('Hetzelfde Firestore-weekrapport bevat observaties en sancties, maar geen testregistraties',()=>{
  const date='2026-10-23';
  const valid={type:'observatie',eventDate:date,eventTime:'14:30',details:'Feitelijke observatie',
    otherPlayers:'',evidenceUrl:''};
  const observed=validateEntry(valid);
  const sanctioned=validateEntry({...valid,type:'sanctie',sanctionType:'Officiële waarschuwing',
    reasons:['Radioprotocol'],severity:5,explanation:'Toelichting',reasonOther:'',cfxName:''});
  const sections=reportSections([
    {...observed,testRecord:false},{...sanctioned,testRecord:false},
    {...observed,testRecord:true},
  ],date,date);
  assert.equal(sections.find(x=>x.type==='observatie').entries.length,1);
  assert.equal(sections.find(x=>x.type==='sanctie').entries.length,1);
});
