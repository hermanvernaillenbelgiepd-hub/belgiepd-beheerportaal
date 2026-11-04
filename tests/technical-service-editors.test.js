import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canManageSpecialtyRoleLinks,validateSpecialtyRoleLinks}
 from '../src/specialty-role-link-routes.js';
import {ROSTER_WIDTH_DEFAULTS,validateRosterConfig,rosterConfig}
 from '../src/roster-column-config.js';
import {ROLE_CATALOG} from '../src/role-catalog.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const id='930930930930930930';
const base={uid:'discord:'+id,discordId:id,role:'beheerder',
 portalTechnicalMode:true,profileTechnicalAvailable:true,
 dossierNativeDepartments:[],dossierAllowedDepartments:[],departments:[]};
test('Geverifieerd Technisch Beheer mag display-only specialisatierollen van alle diensten beheren',()=>{
 for(const dept of ['politie','brandweer','ambulance','depannage'])
  assert.equal(canManageSpecialtyRoleLinks(base,dept),true);
 assert.equal(canManageSpecialtyRoleLinks({...base,portalTechnicalMode:false},'politie'),false);
 assert.equal(canManageSpecialtyRoleLinks({...base,profileTechnicalAvailable:false},'politie'),false);
 assert.equal(canManageSpecialtyRoleLinks({...base,uid:'discord:111111111111111111'},'brandweer'),false);
 assert.equal(canManageSpecialtyRoleLinks({...base,role:'korpsleiding'},'brandweer'),false);
 assert.equal(canManageSpecialtyRoleLinks(base,'burger'),false);
});
test('Politie-afdeling zonder eigen personeels- en dossierbevoegdheid krijgt geen vrij beheer',()=>{
 const nonTechnical={...base,role:'officierenkader',portalTechnicalMode:false,
  profileTechnicalAvailable:false,departments:['politie'],
  departmentRoles:{politie:'officierenkader'},
  dossierNativeDepartments:['politie'],dossierAllowedDepartments:['politie']};
 assert.equal(canManageSpecialtyRoleLinks(nonTechnical,'brandweer'),false);
 // Existing operational rights must remain functional for its own service.
 assert.equal(canManageSpecialtyRoleLinks(nonTechnical,'politie'),true);
});
test('Alleen bekende specialisatierollen kunnen gekoppeld worden, geen verhoogde kaderrollen',()=>{
 const roles=ROLE_CATALOG.filter(r=>r.dept==='politie'&&r.kind==='specialisatie')
  .map(r=>({id:r.id,name:r.name}));
 const good={expectedRevision:0,reason:'Nieuwe visuele specialisatie',
  links:[{label:'K9',roleId:'1309532437977497699',level:'Volwaardig',
   value:'Ja',assetKey:''}]};
 assert.equal(validateSpecialtyRoleLinks(good,'politie',['K9'],roles).links.length,1);
 for(const invalid of ['1562710901080068229','1473474238664020151',
  '1351212180120408166','999999999999999999']){
  assert.throws(()=>validateSpecialtyRoleLinks({...good,links:[
   {...good.links[0],roleId:invalid}
  ]},'politie',['K9'],roles),/Kies een bestaande specialisatie/);
 }
 const result=validateSpecialtyRoleLinks({...good,links:[
  {...good.links[0],roleId:''}
 ]},'politie',['K9'],roles);
 assert.equal(result.links[0].roleId,'','Zonder Discordrol kan een specialisatie handmatig toegewezen blijven');
});
test('Nieuwe configuratie bewaart bestaande kolommen, extra specialisaties en motivering in het auditpad',()=>{
 const previous=rosterConfig(null);
 const payload={expectedRevision:0,
   widths:{...ROSTER_WIDTH_DEFAULTS},specialtyWidths:{},
   fontFamily:'segoe',fontSize:13,
   customSpecialties:[{label:'Extra training',code:'extra_training',
    icon:'🎓',public:false}],reason:'Aanpassen door Technisch Beheer'};
 const valid=validateRosterConfig(payload,'brandweer');
 assert.equal(valid.reason,payload.reason);
 assert.equal(valid.customSpecialties[0].code,'extra_training');
 assert.equal(valid.fontSize,13);
 assert.deepEqual(valid.widths,previous.widths);
 const oldClient=validateRosterConfig({...payload,reason:undefined},'brandweer');
 assert.equal(Object.hasOwn(oldClient,'reason'),false,
  'Eerdere beheerpagina blijft werken zonder verplichte motivering');
 assert.throws(()=>validateRosterConfig({...payload,reason:'kort'},'brandweer'),
  /motivering/);
});
test('Beheercentrum bewerkt de echte bestaande registraties en heeft geen eigen schaduwlijst',()=>{
 const ui=read('public/beheercentrum.html');
 const controller=read('public/technical-service-editors.js');
 const api=read('src/specialty-role-link-routes.js');
 const roster=read('src/roster-column-config.js');
 const auth=read('src/server.js');
 assert.match(ui,/id="serviceCenter"/);
 assert.match(ui,/id="serviceDept"/);
 assert.match(ui,/id="specialtyEditor"/);
 assert.match(ui,/id="layoutEditor"/);
 assert.match(ui,/technical-service-editors\.js/);
 assert.match(controller,/api\('\/api\/specialty-links\/'\+dept,'PUT'/);
 assert.match(controller,/api\('\/api\/roster-columns\/'\+dept,'PUT'/);
 assert.match(controller,/expectedRevision:mappings\.revision/);
 assert.match(controller,/expectedRevision:config\.revision/);
 assert.match(api,/SPECIALTY_ROLE_LINK_AUDIT/);
 assert.match(roster,/bpd_roster_column_audit/);
 assert.match(auth,/installSpecialtyRoleLinkRoutes\(app,\{requireUser:requireDossierUser,getSnapshot\}\)/);
 assert.match(auth,/installRosterColumnRoutes\(app,\{requireUser\}\)/);
 assert.doesNotMatch(controller,/discord\.com\/api\/|assignRole|addRole\(/);
});
