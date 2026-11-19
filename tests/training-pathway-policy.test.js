import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {authorizedOwnDepartments,canManagePathway,canApprovePathway,
 validPathwayCourse,validRequirement,pathwayProgress,requirementApplies,
 requestableCustomCourses} from '../src/training-pathway-policy.js';
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
