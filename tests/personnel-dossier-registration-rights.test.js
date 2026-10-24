import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {validateEntry,canChooseSanction,permittedSanctionTypes} from '../src/registrations.js';
import {mayWriteManagement} from '../src/management-utils.js';
import {canLogTraining,canReviewTraining,basePermissions} from '../src/permissions-utils.js';
import {TRAINING_ROLE_IDS,roleSummary,recognizeRoles} from '../src/role-catalog.js';
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


test('Opleiding blijft zichtbaar met kaderregisterrechten wanneer formele training uit staat',()=>{
  const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  const inline=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
  assert.doesNotThrow(()=>new Script(inline));
  const choices=inline.slice(inline.indexOf('function canRegisterOfficialTraining()'),
    inline.indexOf('function displaySelectedRegistration()'));
  assert.match(choices,/if\(canRegisterOfficialTraining\(\)\)/);
  assert.match(choices,/if\(type==='opleiding'\)continue;/);
  assert.match(choices,/type==='opleiding'\?'Opleiding registreren'/);
  assert.match(choices,/kinds\.push\(\['training','Opleiding registreren'\]\)/);
  assert.match(inline,/pick\.value=kinds\.some\(\(\[key\]\)=>key===old\)\?old:/);
  assert.match(inline,/old==='training'&&kinds\.some\(\(\[key\]\)=>key==='case:opleiding'\)/);
  assert.match(html,/id="staffCourseName"/);
  assert.match(html,/id="staffCourseOtherWrap"/);
  assert.match(html,/id="staffCourseRegisterNote"/);
  assert.match(inline,/staffCaseType'\)\.replaceChildren\(\.\.\.types/);
  assert.match(inline,/const courseName=type==='opleiding'\?selectedStaffCaseCourse\(\):'';/);
  assert.doesNotMatch(html,/Opleidingsnotitie \(geen afgeronde opleiding\)/);
});

test('Kaderopleidingen hergebruiken dezelfde keuzelijst en vrije ANDERE-invoer',()=>{
  const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  const inline=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';
  const start=inline.indexOf('function syncStaffCaseOther(){');
  const end=inline.indexOf("$('staffCaseType').onchange=updateStaffCaseFields;",start);
  assert.ok(start>=0&&end>start);
  const els={
    staffCaseType:{value:'opleiding'},
    staffCourseName:{value:'RADIO OPLEIDING (VERPLICHT)',options:[
      {value:''},{value:'RADIO OPLEIDING (VERPLICHT)'},{value:'ANDERE'}]},
    staffCourseOther:{value:'',required:false},
    staffCourseOtherWrap:{hidden:true},
    staffTrainingCourse:{options:[]}
  };
  const $=id=>els[id];
  const option=(value,label)=>({value,textContent:label});
  els.staffCourseName.replaceChildren=(...items)=>{els.staffCourseName.options=items};
  const {syncStaffCaseOther,selectedStaffCaseCourse}=new Script(inline.slice(start,end)+
    '\n({syncStaffCaseOther,selectedStaffCaseCourse})')
    .runInNewContext({$,option});
  assert.equal(selectedStaffCaseCourse(),'RADIO OPLEIDING (VERPLICHT)');
  els.staffCourseName.value='ANDERE';
  syncStaffCaseOther();
  assert.equal(els.staffCourseOtherWrap.hidden,false);
  assert.equal(els.staffCourseOther.required,true);
  els.staffCourseOther.value='Specifieke herhalingsopleiding';
  assert.equal(selectedStaffCaseCourse(),'Specifieke herhalingsopleiding');
  els.staffCourseName.value='RADIO OPLEIDING (VERPLICHT)';
  syncStaffCaseOther();
  assert.equal(els.staffCourseOtherWrap.hidden,true);
  assert.equal(els.staffCourseOther.required,false);
  assert.equal(els.staffCourseOther.value,'');
});


test('Opleidingregistratie verklaart opslagbestemming en toont apart register',()=>{
  const personnel=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
  const register=readFileSync(new URL('../public/rollen-opleidingen.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/personnel-onepage-test.css',import.meta.url),'utf8');
  const script=personnel.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);assert.doesNotThrow(()=>new Script(script));
  assert.match(personnel,/href="\/rollen-opleidingen.html"[^>]*>Opleidingsregister/);
  assert.match(personnel,/id="trainingDestination"[^>]*hidden/);
  assert.match(script,/trainingDestination\.hidden=!\['training','case:opleiding'\]\.includes\(kind\)/);
  assert.match(script,/Opslag: opleidingsregister/);
  assert.match(script,/Opslag: dossiernotitie en weekrapport/);
  assert.match(script,/niet automatisch in het weekrapport/);
  assert.match(register,/<h1>Opleidingsregister<\/h1>/);
  assert.match(register,/id="training" hidden/);
  assert.match(css,/\.training-register-link/);
  assert.match(css,/\.training-destination/);
});


test('Centrale opleidingen respecteren goedgekeurde dienstkaders en nevendiensten',()=>{
  const police={trustedStaff:true,role:'officierenkader',departments:['politie','brandweer'],
    departmentRoles:{politie:'officierenkader',brandweer:'basiskader'}};
  assert.equal(canLogTraining(police,'politie',{}),true);
  assert.equal(canReviewTraining(police,'politie',{}),true);
  assert.equal(canLogTraining(police,'brandweer',{}),false);
  assert.equal(canReviewTraining(police,'brandweer',{}),false);
  const fire={trustedStaff:true,role:'middenkader',departments:['brandweer'],
    departmentRoles:{brandweer:'middenkader'}};
  assert.equal(canLogTraining(fire,'brandweer',{}),true);
  assert.equal(canReviewTraining(fire,'brandweer',{}),true);
  assert.equal(canLogTraining(fire,'politie',{}),false);
});

test('Geverifieerde Discord-instructeurs mogen alleen eigen hulpdienst opleiden',()=>{
  const guildId='123456789012345678',now=Date.now();
  const profile=roles=>({guildId,verifiedAt:now,roleIds:roles});
  const instructor=basePermissions(profile([
    '1309532438053130326','1359656762289946755'
  ]),guildId,now);
  assert.equal(instructor.permissions.politie['training.log'],true);
  assert.equal(instructor.permissions.brandweer['training.log'],false);
  assert.equal(canLogTraining({departments:[],trustedStaff:false},'politie',
    instructor.permissions),true);
  const fireLeader=basePermissions(profile(['1395115819020714105']),guildId,now);
  assert.equal(fireLeader.permissions.brandweer['training.log'],true);
  assert.equal(fireLeader.permissions.brandweer['training.review'],true);
  assert.equal(fireLeader.permissions.politie['training.log'],false);
  const docentId='111111111111111111';
  const fireDocent=basePermissions(profile([
    '1309532438053130324',docentId
  ]),guildId,now,[docentId]);
  assert.equal(fireDocent.permissions.brandweer['training.log'],true);
  assert.equal(fireDocent.permissions.brandweer['training.review'],false);
  assert.equal(basePermissions(profile(['1309532438053130324',docentId]),
    guildId,now,[]).permissions.brandweer['training.log'],false);
  assert.equal(basePermissions(profile(['1309532438053130324',docentId]),
    guildId,now-16*60*1000,[docentId]).permissions.brandweer['training.log'],false);
});

test('Centraal register gebruikt personeelslijst per dienst en beschermt individuele routes',()=>{
  const route=readFileSync(new URL('../src/role-routes.js',import.meta.url),'utf8');
  const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  const report=readFileSync(new URL('../src/management-routes.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../public/rollen-opleidingen.html',import.meta.url),'utf8');
  assert.match(route,/app.get\('\/api\/training\/people',resolveActor/);
  assert.match(route,/people,limited:false/);
  assert.match(route,/guardTrainingSubject/);
  assert.match(route,/await findSubject\(data.department,data.subjectDiscordId\)/);
  assert.match(route,/mayAccessSubject/);
  assert.match(server,/installRoleRoutes\(app,\{getSnapshot\}\)/);
  assert.match(ui,/id="subjectChoice"/);
  assert.match(ui,/\/api\/training\/people\?department=/);
  assert.match(ui,/id="courseOther"/);
  assert.match(report,/collection\('bpd_training'\)/);
  assert.match(report,/source:'bpd_training'/);
  assert.match(report,/isArchivedTraining/);
});


test('Opleidingsrechten: exacte Discord-rol-ID’s per politie, ambulance, brandweer, depannage en burger',()=>{
  const guildId='123456789012345678',now=Date.now();
  const verified=roles=>({guildId,verifiedAt:now,roleIds:roles});
  const checks={
    politie:{
      leaders:['1562710901080068229','1473474238664020151','1335578488664490057'],
      trainers:['1393050971604516904','1345302115689431061',
        '1393050551188721865','1359656762289946755','1337156006597103746']
    },
    ambulance:{
      leaders:['1309532438053130325'],
      trainers:['1309532437952466988']
    },
    brandweer:{
      leaders:['1395115819020714105'],
      trainers:['1309532437952466989']
    },
    depannage:{
      leaders:['1309532438019706969'],trainers:[]
    },
    burger:{
      leaders:['1492485336197234728'],trainers:[]
    }
  };
  for(const [dept,groups] of Object.entries(checks)){
    assert.deepEqual([...TRAINING_ROLE_IDS[dept].leadership],groups.leaders,dept+' leadership');
    assert.deepEqual([...TRAINING_ROLE_IDS[dept].instructors],groups.trainers,dept+' instructors');
    for(const [kind,ids] of Object.entries(groups)){
      for(const id of ids){
        const p=basePermissions(verified([id]),guildId,now);
        assert.equal(p.permissions[dept]['training.log'],true,dept+' '+id);
        assert.equal(p.permissions[dept]['training.review'],kind==='leaders',dept+' '+id);
        for(const other of ['politie','brandweer','ambulance','depannage','burger']){
          if(other!==dept)
            assert.equal(p.permissions[other]['training.log'],false,
              'Cross-department write: '+dept+' role '+id+' to '+other);
        }
        const stale=basePermissions({guildId,verifiedAt:now-16*60*1000,roleIds:[id]},guildId,now);
        assert.equal(stale.permissions[dept]['training.log'],false,'Stale role '+id);
        assert.equal(basePermissions(verified(['999999999999999999']),guildId,now)
          .permissions[dept]['training.log'],false,'Unknown role is not trusted');
      }
    }
  }
  const policeRank=roleSummary(['1562710901080068229']);
  assert.equal(policeRank.policeRank,'korpsleiding');
  assert.equal(roleSummary(['1353670078142615592']).policeRank,null,
    'Oude niet-bevestigde korpsrol heeft geen blijvende kadertoekenning');
  assert.ok(recognizeRoles(['1309532437952466989']).some(r=>
    r.dept==='brandweer'&&r.name==='Brandweer instructeur'));
});

test('Dispatch-instructeur blijft een Dispatch-rol maar kan politieopleiding registreren',()=>{
  const guildId='123456789012345678',now=Date.now();
  const ids=['1393050971604516904'];
  const r=roleSummary(ids);
  assert.ok(r.departments.includes('dispatch'));
  const p=basePermissions({guildId,verifiedAt:now,roleIds:ids},guildId,now);
  assert.equal(p.permissions.politie['training.log'],true);
  assert.equal(p.permissions.politie['training.review'],false);
  assert.equal(p.permissions.dispatch['training.log'],true);
  for(const dept of ['brandweer','ambulance','depannage','burger'])
    assert.equal(p.permissions[dept]['training.log'],false);
});
