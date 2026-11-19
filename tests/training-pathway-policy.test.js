import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {authorizedOwnDepartments,canManagePathway,canApprovePathway,
 validPathwayCourse,validRequirement,pathwayProgress,requirementApplies,
 canManageIndividualPathway,validIndividualRequirement,uniquePathwaySubject,
 personalRequirementApplies,groupRequirementApplies,effectivePathwayCourse,
 basePathwayCourses,pathwaySpecialtyLabels,requestableCustomCourses}
 from '../src/training-pathway-policy.js';
const id='1398985105254650007',officer={
 uid:'discord:'+id,discordId:id,role:'officierenkader',departments:['politie'],
 departmentRoles:{politie:'officierenkader'},discordRosterEditorVerified:true
};
const person={dept:'politie',personId:id,rank:'Inspecteur',name:'Test'};
test('Alleen de geverifieerde eigen personeelsfiche ontsluit trajectinformatie',()=>{
 assert.deepEqual(authorizedOwnDepartments(officer,[person]),['politie']);
 assert.deepEqual(authorizedOwnDepartments(officer,[person,person]),[]);
 assert.deepEqual(authorizedOwnDepartments({...officer,uid:'discord:123'},[person]),[]);
});
test('Instructeurs mogen optioneel aanbod beheren maar niet finaal goedkeuren',()=>{
 const base={...officer,role:'basiskader',departmentRoles:{politie:'basiskader'},
  discordRosterEditorVerified:false};
 assert.equal(canManagePathway(base,'politie',true),true);
 assert.equal(canManagePathway(base,'ambulance',true),false);
 assert.equal(canApprovePathway(base,'ok'),false);
 assert.equal(canApprovePathway(base,'kl'),false);
});
test('Officierenkader beoordeelt stap OK, Korpsleiding pas stap KL',()=>{
 const chief={...officer,role:'korpsleiding',departmentRoles:{politie:'korpsleiding'}};
 assert.equal(canApprovePathway(officer,'ok'),true);
 assert.equal(canApprovePathway(officer,'kl'),false);
 assert.equal(canApprovePathway(chief,'ok'),false);
 assert.equal(canApprovePathway(chief,'kl'),true);
 assert.equal(canApprovePathway({...officer,discordRosterEditorVerified:false},'ok'),false);
});
test('Opleidingen zonder motivering of met ongeldige dienst worden geweigerd',()=>{
 assert.throws(()=>validPathwayCourse({department:'random',name:'Nieuwe opleiding'}));
 assert.throws(()=>validRequirement({mandatory:true,targetKind:'alle',reason:'te kort'}));
 const good=validRequirement({mandatory:true,targetKind:'alle',reason:'Verplichte basis voor onze dienst'});
 assert.equal(good.mandatory,true);
});
test('Nieuwe optionele opleidingen worden niet automatisch verplicht',()=>{
 const c={department:'brandweer',name:'Ladderwagen plus',mandatory:false};
 assert.equal(requirementApplies({...person,dept:'brandweer'},c),false);
});
test('Onbekende hulpverleningszone veroorzaakt geen automatische verplichting',()=>{
 const c={name:'Gevaarlijke stoffen',mandatory:true,zone:'Zone Noord',targetKind:'alle',
   effectiveDate:'2026-01-01'};
 assert.equal(requirementApplies({...person,dept:'brandweer'},c),false);
 assert.equal(requirementApplies({...person,dept:'brandweer',zone:'Zone Noord'},c),true);
});
test('Geslaagd geldt als behaald, aanwezig niet; vervallen certificaat wordt gemarkeerd',()=>{
 const course={name:'Radioopleiding',mandatory:true,targetKind:'alle',validMonths:0,
  effectiveDate:'2026-01-01'};
 assert.equal(pathwayProgress(person,course,[{courseName:'Radioopleiding',result:'aanwezig',
  eventDate:'2026-02-10'}],[],'2026-11-19').status,'aanwezig');
 assert.equal(pathwayProgress(person,course,[{courseName:'Radioopleiding',result:'geslaagd',
  eventDate:'2026-02-10'}],[],'2026-11-19').status,'behaald');
 assert.equal(pathwayProgress(person,{...course,validMonths:2},
  [{courseName:'Radioopleiding',result:'geslaagd',eventDate:'2026-02-10'}],[],
  '2026-11-19').status,'verlopen');
});
test('Eigen optionele opleiding verschijnt in het bestaande aanvraagformulier, beperkt per zone',()=>{
 const all=[{department:'brandweer',name:'Gevaarlijke stoffen extra',zone:'Zone A',active:true},
  {department:'brandweer',name:'Ladderwagen',zone:'',active:true}];
 assert.deepEqual(requestableCustomCourses(all,'brandweer',{zone:'Zone A'}),
  ['Gevaarlijke stoffen extra','Ladderwagen']);
 assert.deepEqual(requestableCustomCourses(all,'brandweer',{zone:'Zone B'}),['Ladderwagen']);
});
test('Route bewaakt twee aparte goedkeuringsfasen en een transactielog',()=>{
 const src=readFileSync(new URL('../src/training-pathway-routes.js',import.meta.url),'utf8');
 assert.match(src,/canApprovePathway\(req\.bpd,pending\.stage\)/);
 assert.match(src,/pending\.proposedBy,pending\.okBy/);
 assert.match(src,/mandatory_'\+req\.body\.decision/);
 assert.match(src,/tx\.update\(ref,\{mandatory:pending\.mandatory/);
 const page=readFileSync(new URL('../public/opleidingscentrum.html',import.meta.url),'utf8');
 assert.match(page,/opleidingstraject\.html/);
 const request=readFileSync(new URL('../src/training-request-routes.js',import.meta.url),'utf8');
 assert.match(request,/requestableCustomCourses/);
});

test('Individuele verplichting kan voor één medewerker gelden, zonder globale verplichting',()=>{
 const course={id:'courseA',department:'politie',name:'Rijopleiding',zone:'',
   mandatory:false,targetKind:'alle',effectiveDate:null};
 const assignment={courseId:'courseA',department:'politie',
   subjectDiscordId:id,active:true,effectiveDate:'2026-01-01'};
 const other={...person,personId:'1309532438053130326'};
 assert.equal(personalRequirementApplies(person,course,assignment,'2026-11-19'),true);
 assert.equal(personalRequirementApplies(other,course,assignment,'2026-11-19'),false);
 assert.equal(personalRequirementApplies(person,course,{...assignment,active:false},'2026-11-19'),false);
 assert.equal(requirementApplies(other,course,'2026-11-19'),false);
 assert.equal(requirementApplies(person,course,'2026-11-19'),false);
});
test('Individuele verplichting respecteert ingangsdatum en zonekoppeling',()=>{
 const course={id:'courseA',department:'brandweer',zone:'Zone Noord'};
 const assignment={courseId:'courseA',department:'brandweer',
   subjectDiscordId:id,active:true,effectiveDate:'2027-01-01'};
 const target={...person,dept:'brandweer',zone:'Zone Noord'};
 assert.equal(personalRequirementApplies(target,course,assignment,'2026-11-19'),false);
 assert.equal(personalRequirementApplies(target,course,assignment,'2027-01-02'),true);
 assert.equal(personalRequirementApplies({...target,zone:'Zone Zuid'},course,assignment,'2027-01-02'),false);
});
test('Kader mag personen selecteren, instructeur alleen niet',()=>{
 assert.equal(canManageIndividualPathway(officer,'politie'),true);
 assert.equal(canManageIndividualPathway({...officer,role:'basiskader',
   departmentRoles:{politie:'basiskader'}},'politie'),false);
 assert.equal(canManageIndividualPathway(officer,'brandweer'),false);
});
test('Afgeschermde personeelsselectie vereist uniek werkelijk personeelslid',()=>{
 const course={department:'politie',zone:''};
 assert.equal(uniquePathwaySubject([person], 'politie', id,course)?.personId,id);
 assert.equal(uniquePathwaySubject([person,person], 'politie',id,course),null);
 assert.equal(uniquePathwaySubject([person], 'brandweer',id,course),null);
 assert.equal(uniquePathwaySubject([person], 'politie','123',course),null);
});
test('Persoonsvoorstel heeft een geselecteerde identiteit en een gemotiveerde termijn',()=>{
 const good=validIndividualRequirement({subjectDiscordId:id,mandatory:true,
  effectiveDate:'2026-12-01',validMonths:12,
  reason:'Aanvullende persoonlijke opleiding nodig wegens functie'});
 assert.equal(good.subjectDiscordId,id);
 assert.equal(good.mandatory,true);
 assert.equal(good.validMonths,12);
 assert.throws(()=>validIndividualRequirement({subjectDiscordId:'onbekend',
  mandatory:true,reason:'Aanvullende opleiding nodig wegens functie'}));
 assert.throws(()=>validIndividualRequirement({subjectDiscordId:id,
  mandatory:true,reason:'te kort'}));
});
test('Persoonlijke verplichtingen gebruiken dezelfde twee goedkeuringen en eigen audit',()=>{
 const routes=readFileSync(new URL('../src/training-pathway-routes.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/opleidingstraject.html',import.meta.url),'utf8');
 assert.match(routes,/app\.get\('\/api\/training-pathway\/people'/);
 assert.match(routes,/canManageIndividualPathway\(req\.bpd,course\.department\)/);
 assert.match(routes,/app\.post\('\/api\/training-pathway\/courses\/:id\/person-requirement'/);
 assert.match(routes,/app\.post\('\/api\/training-pathway\/person-requirements\/:id\/review'/);
 assert.match(routes,/canApprovePathway\(req\.bpd,pending\.stage\)/);
 assert.match(routes,/personalRequirementApplies\(person,course,individual\)/);
 assert.match(routes,/person_requirement_'\+req\.body\.decision/);
 assert.match(page,/value="persoon">Specifieke persoon/);
 assert.match(page,/id="personTarget"/);
 assert.match(page,/individualManageable/);
});

test('Bestaande opleidingen kunnen worden geactiveerd zonder een tweede registratie',()=>{
 const catalog=basePathwayCourses('politie');
 assert.ok(catalog.length>0);
 assert.ok(catalog.some(course=>course.name==='K-9'));
 assert.ok(catalog.every(course=>course.mandatory===false));
});
test('Een bestaande opleiding ondersteunt meerdere onafhankelijke goedgekeurde doelgroepen',()=>{
 const course={id:'courseA',department:'politie',name:'K-9',zone:'',
   mandatory:false,targetKind:'alle',validMonths:0};
 const p1={...person,rank:'Inspecteur',seriesRaw:'Reeks 1',
   specialties:[{label:'K9'}]};
 const p2={...person,personId:'1309532438053130326',rank:'Inspecteur',
   seriesRaw:'Reeks 2',specialties:[]};
 const byRank={courseId:'courseA',department:'politie',active:true,
   targetKind:'rang',targetValue:'Inspecteur',validMonths:12};
 const bySpec={courseId:'courseA',department:'politie',active:true,
   targetKind:'specialisatie',targetValue:'K9',validMonths:6};
 assert.equal(groupRequirementApplies(p1,course,byRank,'2026-11-19'),true);
 assert.equal(groupRequirementApplies(p1,course,bySpec,'2026-11-19'),true);
 assert.equal(groupRequirementApplies(p2,course,bySpec,'2026-11-19'),false);
 const effective=effectivePathwayCourse(p1,course,[byRank,bySpec]);
 assert.equal(effective.mandatory,true);
 assert.equal(effective.validMonths,6);
 assert.equal(effectivePathwayCourse(p2,course,[bySpec]).mandatory,false);
 assert.equal(effectivePathwayCourse(p1,course,[{...bySpec,active:false}]).mandatory,false);
});
test('Reeksen kunnen apart verplicht gesteld worden en starten niet automatisch voor andere reeksen',()=>{
 const course={id:'courseA',department:'politie',zone:''};
 const rule={courseId:'courseA',department:'politie',
  targetKind:'reeks',targetValue:'Reeks 1',active:true};
 const p1={...person,seriesRaw:'Reeks 1'};
 const p2={...person,seriesRaw:'Reeks 2'};
 assert.equal(groupRequirementApplies(p1,course,rule),true);
 assert.equal(groupRequirementApplies(p2,course,rule),false);
 assert.equal(validRequirement({mandatory:true,targetKind:'reeks',
  targetValue:'Reeks 1',reason:'De opleiding is verplicht voor deze reeks'}).targetKind,'reeks');
});
test('Individuele verplichting en groepsverplichting staan naast elkaar',()=>{
 const course={id:'courseA',department:'politie',name:'Radioopleiding',zone:'',
   mandatory:false};
 const personAssignment={active:true,courseId:'courseA',
   department:'politie',subjectDiscordId:id,
   effectiveDate:'2026-01-01',validMonths:24};
 const group={active:true,courseId:'courseA',department:'politie',
   targetKind:'rang',targetValue:'Commissaris',validMonths:12};
 const current=effectivePathwayCourse(person,course,[group],personAssignment,'2026-11-19');
 assert.equal(current.mandatory,true);
 assert.equal(current.validMonths,24);
 assert.equal(effectivePathwayCourse({...person,personId:'1309532438053130326'},
   course,[group],personAssignment,'2026-11-19').mandatory,false);
});
test('Specialisatiekeuze volgt geregistreerde personeelslabels',()=>{
 assert.deepEqual(pathwaySpecialtyLabels({specialties:[{label:'K9'},'RAGO'],
   specializations:['Motard']}),['K9','RAGO','Motard']);
 assert.ok(pathwaySpecialtyLabels({special:'K9, RAGO'}).includes('K9'));
});
test('Groepsverplichtingen staan in transacties en moeten tweemaal beoordeeld worden',()=>{
 const routes=readFileSync(new URL('../src/training-pathway-routes.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/opleidingstraject.html',import.meta.url),'utf8');
 const notices=readFileSync(new URL('../public/meldingen.html',import.meta.url),'utf8');
 assert.match(routes,/\/api\/training-pathway\/catalog-activate/);
 assert.match(routes,/basePathwayCourses\(dept\)\.find/);
 assert.match(routes,/\/api\/training-pathway\/courses\/:id\/group-requirement/);
 assert.match(routes,/\/api\/training-pathway\/group-requirements\/:id\/review/);
 assert.match(routes,/canApprovePathway\(req\.bpd,pending\.stage\)/);
 assert.match(routes,/group_requirement_'\+req\.body\.decision/);
 assert.match(page,/Bestaande opleiding selecteren/);
 assert.match(page,/value="reeks">Reeks/);
 assert.match(page,/id="targetSuggestions"/);
 assert.match(page,/group-requirements\/'\+encodeURIComponent/);
 assert.match(notices,/data\.groupRequirements/);
});
