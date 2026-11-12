import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultGroupSettings,readGroupSettings,validateGroupSettings,
 applyGroupSettings,GROUP_DEPARTMENTS} from '../public/personnel-group-settings-policy.js';
import {canEditPersonnelGroupSettings} from '../src/personnel-group-settings-routes.js';
import {groupServiceSpecialties,groupPoliceSeries} from '../public/personnel-grouping-policy.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const reason='Opmaak van de personeelsindeling aanpassen';
test('alle vijf hulpdiensten hebben losse instellingen; alleen Politie heeft reeksen',()=>{
 assert.deepEqual(GROUP_DEPARTMENTS,['politie','brandweer','ambulance','depannage','burger']);
 const police=defaultGroupSettings('politie');
 assert.deepEqual(police.series.map(x=>x.key),['1','2','3','4','vlinder','kader','overig']);
 assert.equal(police.specialties.some(x=>x.key==='AE'),true);
 for(const d of GROUP_DEPARTMENTS.filter(x=>x!=='politie')){
  assert.equal(defaultGroupSettings(d).series.length,0);
  assert.equal(defaultGroupSettings(d).revision,0);
 }
});
test('benaming, rangschikking en verborgen weergave wijzigen nooit de groepsleden',()=>{
 const people=[{dept:'politie',call:'200',name:'A',rank:'Agent',series:'1',
  specialties:['AE'],instructorSpecialties:[],specialtyPatches:[]}];
 const groups=groupPoliceSeries(people);
 const base=defaultGroupSettings('politie');
 const current={...base,series:[{...base.series[1],label:'Tweede reeks'},
  {...base.series[0],label:'De eerste reeks',hidden:true},...base.series.slice(2)]};
 const applied=applyGroupSettings(groups,current,'reeksen');
 assert.equal(applied[0].title,'Tweede reeks');
 assert.equal(applied.some(g=>g.key==='1'),false);
 assert.equal(groups.find(g=>g.key==='1').members.length,1);
 const spec=[{key:'AE',label:'AE',icon:'',total:1,groups:{members:[people[0]]}}];
 assert.equal(applyGroupSettings(spec,{specialties:[
  {key:'AE',label:'Arrestatie-eenheid',icon:'🛡️',hidden:false}
 ]},'specialisaties')[0].groups.members.length,1);
});
test('opslaan vereist geldige revisie, motivatie en alle vaste reeksen',()=>{
 const current=defaultGroupSettings('politie'),form={expectedRevision:0,
  series:current.series,specialties:current.specialties,tiers:current.tiers,reason};
 assert.equal(validateGroupSettings(form,'politie').series.length,7);
 assert.throws(()=>validateGroupSettings({...form,series:current.series.slice(0,6)},'politie'));
 assert.throws(()=>validateGroupSettings({...form,reason:'kort'},'politie'));
 assert.throws(()=>validateGroupSettings({...form,expectedRevision:-1},'politie'));
 assert.throws(()=>validateGroupSettings({...form,evil:true},'politie'));
 assert.throws(()=>validateGroupSettings({...form,specialties:[{
  key:'NIET_TOEGEKEND',label:'Zelfgemaakte operationele functie',icon:'',hidden:false
 }]},'politie'));
 const existing=readGroupSettings({revision:4,series:[...current.series].reverse(),
  specialties:[...current.specialties].reverse(),tiers:current.tiers},'politie');
 assert.equal(existing.revision,4);
 assert.equal(existing.series[0].key,'overig');
 assert.equal(existing.specialties[0].key,current.specialties.at(-1).key);
});
test('andere diensten gebruiken bestaande geverifieerde specialisaties',()=>{
 const records=[{dept:'brandweer',name:'A',call:'STAG-01',rank:'Stagiair',
  specialties:['DUIKER'],instructorSpecialties:[],specialtyPatches:[]},
 {dept:'brandweer',name:'B',call:'500',rank:'Instructeur',
  specialties:['DUIKER'],instructorSpecialties:['DUIKER'],specialtyPatches:[]}];
 const groups=groupServiceSpecialties(records,'brandweer');
 assert.equal(groups.length,1);
 assert.equal(groups[0].total,2);
 assert.equal(groups[0].groups.instructors[0].name,'B');
 assert.equal(groups[0].groups.members[0].name,'A');
 assert.equal(groupServiceSpecialties(records,'burger').length,0);
});
test('dienstspecifieke schrijfrechten: geen cliëntvelden, Burgerraad noch ongeverifieerde kaderclaims',()=>{
 const tech={uid:'discord:123456789012345678',discordId:'123456789012345678',
  role:'beheerder',portalTechnicalMode:true,profileTechnicalAvailable:true};
 for(const dept of GROUP_DEPARTMENTS)
  assert.equal(canEditPersonnelGroupSettings(tech,dept),true);
 const police={uid:tech.uid,discordId:tech.discordId,role:'officierenkader',
  departmentRoles:{politie:'officierenkader'},departments:['politie'],
  discordRosterEditorVerified:true};
 assert.equal(canEditPersonnelGroupSettings(police,'politie'),true);
 assert.equal(canEditPersonnelGroupSettings(police,'brandweer'),false);
 assert.equal(canEditPersonnelGroupSettings({...police,discordRosterEditorVerified:false},'politie'),false);
 const citizen={uid:tech.uid,discordId:tech.discordId,role:'basiskader',
  departmentRoles:{burger:'basiskader'},departments:['burger'],
  manualCitizenCouncilApproved:true};
 assert.equal(canEditPersonnelGroupSettings(citizen,'burger'),false);
});
test('API heeft revisiecontrole en audit; UI bevat alle configuratievelden zonder roltoekenning',async()=>{
 const server=read('src/server.js'),routes=read('src/personnel-group-settings-routes.js'),
  html=read('public/personeelsbeheer.html'),client=read('public/personnel-group-settings-editor.js'),
  viewer=read('public/personnel-grouped-ui.js');
 assert.match(server,/installPersonnelGroupSettingsRoutes\(app,\{requireUser,getSnapshot\}\)/);
 assert.match(routes,/tx\.create\(db\.collection\(PERSONNEL_GROUP_SETTINGS_AUDIT\)\.doc\(\)/);
 assert.match(routes,/validated\.expectedRevision!==before\.revision/);
 assert.match(routes,/rightsChanged:false,qualificationsChanged:false/);
 assert.match(html,/id="personnelGroupSettingsView"/);
 assert.match(html,/id="personnelGroupSettingsTab"/);
 assert.match(html,/id="personnelGroupDepartment"/);
 assert.match(client,/Instellingen bewaren/);
 assert.match(client,/Standaardindeling herstellen/);
 assert.match(viewer,/applyGroupSettings\(base,settings\[scoped\],mode\)/);
 const imported=await import('../public/personnel-group-settings-editor.js');
 assert.equal(typeof imported.mountPersonnelGroupSettingsEditor,'function');
});
