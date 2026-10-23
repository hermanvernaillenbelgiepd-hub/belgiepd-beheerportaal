import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {validateEntry,canChooseSanction,permittedSanctionTypes} from '../src/registrations.js';
import {mayWriteManagement} from '../src/management-utils.js';
import {canLogTraining} from '../src/permissions-utils.js';
import {specialFields} from '../src/report-export.js';

const actor=role=>({role,departments:['politie'],departmentRoles:{politie:role},
  dossierNativeDepartments:['politie'],discordId:'234567890123456789'});
const observation={type:'observatie',details:'Observatie test met samenvatting',
  eventDate:'2026-10-23',eventTime:'13:30',evidenceUrl:'https://example.org/clip',
  otherPlayers:'P203, P401',score:7};

test('Observatiescore 1–10 in personeel en weekrapport',()=>{
  assert.equal(validateEntry(observation).score,7);
  for(const score of [0,11,-2,1.5,'geen']){
    assert.throws(()=>validateEntry({...observation,score}),/Observatiescore/);
  }
  assert.equal(validateEntry({...observation,score:undefined}).score,null);
  assert.ok(specialFields(validateEntry(observation)).includes('Observatiescore: 7/10'));
});
test('Sanctiemaatregelen blijven op server beperkt per politiegradering',()=>{
  const mid=permittedSanctionTypes('middenkader',10);
  for(const v of ['Mondelinge waarschuwing','Officiële waarschuwing','Tijdelijke beperking','Voorstel tot degradatie'])
    assert.ok(mid.includes(v),v);
  for(const v of ['Schorsing','Ontslag','Ontslag met blacklisting'])
    assert.ok(!mid.includes(v),v);
  assert.equal(canChooseSanction('middenkader','Voorstel tot degradatie',8),false);
  assert.equal(canChooseSanction('middenkader','Voorstel tot degradatie',9),true);
  assert.equal(canChooseSanction('officierenkader','Schorsing',5),true);
  assert.equal(canChooseSanction('officierenkader','Ontslag',10),false);
  assert.equal(canChooseSanction('korpsleiding','Ontslag met blacklisting',5),true);
});
test('Alle personeelsbewegingen en promotievoorstellen uitsluitend hoger kader',()=>{
  for(const category of ['personeelsbeweging','naamswijziging','promotievoorstel']){
    assert.equal(mayWriteManagement(actor('middenkader'),'politie',category),false,category);
    assert.equal(mayWriteManagement(actor('officierenkader'),'politie',category),true,category);
    assert.equal(mayWriteManagement(actor('korpsleiding'),'politie',category),true,category);
  }
  assert.equal(mayWriteManagement(actor('middenkader'),'politie','notitie'),true);
  assert.equal(mayWriteManagement(actor('officierenkader'),'ambulance','personeelsbeweging'),false);
});
test('Opleiding vanuit centrale registratie: politie middenkader/hoger en instructeur',()=>{
  for(const role of ['middenkader','officierenkader','korpsleiding']){
    assert.equal(canLogTraining({...actor(role),trustedStaff:true},'politie',{}),true,role);
  }
  assert.equal(canLogTraining({...actor('basiskader'),trustedStaff:true},'politie',{}),false);
  assert.equal(canLogTraining({...actor('basiskader'),trustedStaff:true},'politie',
    {politie:{'training.log':true}}),true);
  assert.equal(canLogTraining({...actor('middenkader'),trustedStaff:true},'brandweer',{}),false);
});
test('Registratieblok vermeldt score, omkadering, clip, beperkingen en compacte audit',()=>{
  const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/personnel-onepage-test.css',import.meta.url),'utf8');
  const code=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(code);assert.doesNotThrow(()=>new Script(code.replace(/^import [^\n]*\n/gm,'')));
  assert.match(html,/id="formalScore"/);
  assert.match(html,/\$\('formalScore'\)\.required=!isSanction/);
  assert.match(html,/data\.score=score/);
  assert.match(html,/Link naar clip \/ bewijs/);
  assert.match(html,/Omkadering, toelichting en opvolging/);
  assert.match(html,/importantRestrictionEntries=list\.filter/);
  assert.match(html,/x\.sanctionType==='Tijdelijke beperking'/);
  assert.match(html,/class="dossier-audit-compact" id="auditDetails"/);
  assert.match(html,/\$\('auditDetails'\)\.append\(audit\)/);
  assert.match(css,/\.dossier-audit-compact/);
});
