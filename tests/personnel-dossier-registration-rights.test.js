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

test('Registration selector stays focused on dossier entries while protected maintenance remains available',()=>{
  const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/personnel-onepage-test.css',import.meta.url),'utf8');
  const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(()=>new Script(script));
  const start=script.indexOf('function availablePersonnelRegistrationKinds()');
  const end=script.indexOf('function displaySelectedRegistration()',start);
  assert.ok(start>=0&&end>start);
  const kinds=script.slice(start,end);
  assert.match(kinds,/if\(type==='activiteit'\)continue/);
  assert.doesNotMatch(kinds,/kinds\.push\(\['(?:specialty|function)'/);
  assert.doesNotMatch(html,/<option value="activiteit">Dienstactiviteit<\/option>/);
  const centralForms=script.slice(script.indexOf('const registrationForms=['),
    script.indexOf('function registrationFormFor('));
  assert.doesNotMatch(centralForms,/specialtyEdit','functionChangeForm/);
  assert.match(script,/\$\('specialtyAdmin'\)\.append\(\$\('specialtyEdit'\)\)/);
  assert.match(script,/\$\('functionAdmin'\)\.append\(\$\('functionChangeForm'\)\)/);
  assert.match(script,/\$\('registrationAccessHint'\)\.textContent='';/);
  assert.match(html,/id="dossierMaintenance" hidden/);
  assert.match(html,/id="registrationKind"/);
  assert.match(css,/\.dossier-main-row/);
  assert.match(css,/background:transparent!important/);
});


test('Eén officiële opleidingsregistratie met alle geselecteerde types en vrije keuze ANDERE',()=>{
  const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  const inline=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
  assert.doesNotThrow(()=>new Script(inline));
  const select=html.match(/<select id="staffTrainingCourse" required>([\s\S]*?)<\/select>/)?.[1];
  assert.ok(select,'Keuzelijst opleidingen aanwezig');
  const options=[...select.matchAll(/<option value="([^"]*)">/g)].map(match=>match[1]);
  assert.deepEqual(options,[
    '', 'RADIO OPLEIDING (VERPLICHT)', 'RADIO OPLEIDING (VRIJWILLIG)',
    'BASISCURSIS', 'GEWELDBEHEERSING', 'WAPENGEBRUIK',
    'VERKEERSBEGELEIDING', 'VERKEERSCONTROLE', 'PRIORITAIR RIJDEN',
    'EHBO VOOR INTERVENIERENDEN', 'BEVEILIGEN OPENBARE WEG',
    'K-9', 'RAGO', 'MOTARD', 'MOTARD-OFF ROAD',
    'DISPATCH', 'BEVOEGDHEDEN TO', 'ERT AE-I', 'ERT AE-T', 'ERT-AE-F', 'ANDERE'
  ]);
  const choices=inline.slice(inline.indexOf('function availablePersonnelRegistrationKinds()'),
    inline.indexOf('function displaySelectedRegistration()'));
  assert.match(choices,/if\(type==='activiteit'\)continue/);
  assert.match(choices,/if\(type==='opleiding'\)continue/);
  assert.doesNotMatch(choices,/Opleidingsnotitie \(geen afgeronde opleiding\)/);
  assert.match(choices,/\['training','Opleiding registreren'\]/);
  const start=inline.indexOf('function syncStaffTrainingOther(){');
  const end=inline.indexOf('function resetStaffTrainingEdit(){',start);
  assert.ok(start>=0&&end>start,'Opleidingskeuze helpers aanwezig');
  const elems={
    staffTrainingCourse:{value:'',options:options.map(value=>({value}))},
    staffTrainingOther:{value:'',required:false},
    staffTrainingOtherWrap:{hidden:true}
  };
  const helpers=new Script(inline.slice(start,end)+
    '\n({syncStaffTrainingOther,selectedStaffTrainingName,setStaffTrainingCourse})')
    .runInNewContext({$:id=>elems[id]});
  helpers.setStaffTrainingCourse('K-9');
  assert.equal(elems.staffTrainingCourse.value,'K-9');
  assert.equal(helpers.selectedStaffTrainingName(),'K-9');
  assert.equal(elems.staffTrainingOtherWrap.hidden,true);
  assert.equal(elems.staffTrainingOther.required,false);
  helpers.setStaffTrainingCourse('Oude opleiding uit historiek');
  assert.equal(elems.staffTrainingCourse.value,'ANDERE');
  assert.equal(elems.staffTrainingOther.value,'Oude opleiding uit historiek');
  assert.equal(elems.staffTrainingOtherWrap.hidden,false);
  assert.equal(elems.staffTrainingOther.required,true);
  assert.equal(helpers.selectedStaffTrainingName(),'Oude opleiding uit historiek');
  elems.staffTrainingCourse.value='MOTARD-OFF ROAD';
  helpers.syncStaffTrainingOther();
  assert.equal(elems.staffTrainingOther.value,'');
  assert.equal(helpers.selectedStaffTrainingName(),'MOTARD-OFF ROAD');
  assert.match(inline,/courseName,eventDate:\$\('staffTrainingDate'\)\.value/);
});
