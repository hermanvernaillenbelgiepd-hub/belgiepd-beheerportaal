import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {portalNavigationCapabilities} from '../src/portal-navigation-policy.js';
import {canSeeDashboardManagement,canSeeAdvancedDashboard} from '../src/dashboard-admin-policy.js';

const id='111111111111111111';
const make=(roles,options={})=>({
  uid:'discord:'+id,discordId:id,
  role:Object.values(roles).includes('korpsleiding')?'korpsleiding':
    Object.values(roles).includes('officierenkader')?'officierenkader':
    Object.values(roles).includes('middenkader')?'middenkader':'basiskader',
  departments:Object.keys(roles),departmentRoles:roles,
  dossierAllowedDepartments:[],...options
});
const record=(dept,call,rank='Medewerker')=>({dept,personId:id,call,rank,name:'Voorbeeld'});
const nav=actor=>portalNavigationCapabilities(actor,[]);
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('Police Basiskader with Motard-instructor is not made general operational cadre',()=>{
 const a=make({politie:'basiskader'});
 assert.deepEqual(nav(a),{activity:false,dossiers:false,reports:false,to:false});
 assert.equal(canSeeDashboardManagement(a),false);
 assert.equal(canSeeAdvancedDashboard(a),false);
 // Even a police basic cadre allowed to read TO by a separate API policy
 // does not receive the TO sidebar link without an explicit TO appointment.
 const appointed={...a,toAccessLevel:'read'};
 assert.equal(nav(appointed).to,true);
});
test('Police Middenkader + instructor retains cadre-level operations and reports',()=>{
 const a=make({politie:'middenkader'},{
  dossierAllowedDepartments:['politie']
 });
 assert.deepEqual(nav(a),{activity:true,dossiers:true,reports:true,to:true});
 assert.equal(canSeeDashboardManagement(a),false);
 assert.equal(canSeeAdvancedDashboard(a),true);
});
test('Brandweer Middenkader + Police Basiskader only sees its actual Fire scope',()=>{
 const a=make({politie:'basiskader',brandweer:'middenkader'},{
  dossierAllowedDepartments:['brandweer'],fireAccessLevel:'middle'
 });
 assert.deepEqual(nav(a),{activity:true,dossiers:true,reports:false,to:false});
 assert.equal(canSeeDashboardManagement(a),false);
});
test('verified ZONE only gets Fire reports and dossiers, not Police command',()=>{
 const a=make({politie:'basiskader',brandweer:'middenkader'},{
  fireZoneChief:true,dossierAllowedDepartments:['brandweer']
 });
 const result=portalNavigationCapabilities(a,[record('brandweer','ZONE01')]);
 assert.equal(result.activity,true);
 assert.equal(result.dossiers,true);
 assert.equal(result.reports,true);
 assert.equal(result.to,false);
 assert.equal(canSeeDashboardManagement(a),false);
});
test('AZLS leader and medical instructor preserve own verified reports and nothing Police-admin',()=>{
 const a=make({politie:'basiskader',ambulance:'officierenkader'},{
  dossierAllowedDepartments:['ambulance'],
  reportServiceRoles:{ambulanceAzls:true}
 });
 const result=portalNavigationCapabilities(a,[record('ambulance','DIRMED01','DIR-MED')]);
 assert.deepEqual(result,{activity:true,dossiers:true,reports:true,to:false});
 assert.equal(canSeeDashboardManagement(a),false);
 assert.equal(canSeeAdvancedDashboard(a),true);
});
test('Depannage AWV with FAST and low Police rank does not gain Police operations',()=>{
 const a=make({politie:'basiskader',depannage:'middenkader'},{
  dossierAllowedDepartments:['depannage'],
  reportServiceRoles:{depannageAwv:true}
 });
 const result=portalNavigationCapabilities(a,[record('depannage','AWV01','AWV')]);
 assert.deepEqual(result,{activity:true,dossiers:true,reports:true,to:false});
 assert.equal(canSeeDashboardManagement(a),false);
});
test('Burgerraad and Burger IO get no unrelated operational personnel modules',()=>{
 const a=make({burger:'basiskader',politie:'basiskader'});
 assert.deepEqual(nav(a),{activity:false,dossiers:false,reports:false,to:false});
 assert.equal(canSeeDashboardManagement(a),false);
});
test('verified Police leadership, Bestuur and technical admin retain relevant privileges',()=>{
 const police=make({politie:'officierenkader'},{dossierAllowedDepartments:['politie']});
 assert.equal(canSeeDashboardManagement(police),true);
 assert.deepEqual(nav(police),{activity:true,dossiers:true,reports:true,to:true});
 const board=make({politie:'basiskader'},{boardPersonnelAdmin:true,dossierAllowedDepartments:['politie']});
 assert.equal(canSeeDashboardManagement(board),true);
 assert.equal(nav(board).reports,true);
 const tech={...make({politie:'basiskader'}),role:'beheerder',
  profileTechnicalAvailable:true,portalTechnicalMode:true,
  dossierAllowedDepartments:['politie']};
 assert.equal(canSeeDashboardManagement(tech),true);
 assert.equal(nav(tech).reports,true);
 assert.equal(canSeeDashboardManagement({...tech,profileTechnicalAvailable:false}),false);
});
test('navigation only uses server-calculated flags and preserves separate instructor training',()=>{
 const ui=read('public/bpd-navigation.js'),server=read('src/server.js');
 assert.match(server,/navigationCapabilities:req\.bpd\.portalNavigation\|\|\{\}/);
 assert.match(server,/portalNavigationCapabilities\(req\.bpd,roster\)/);
 assert.match(ui,/const capabilities=context\?\.navigationCapabilities\|\|\{\}/);
 assert.match(ui,/for\(const key of \['activity','dossiers','reports','to'\]\)/);
 assert.match(ui,/if\(context\?\.visible===true\)pages\.push\('admin'\)/);
 assert.doesNotMatch(ui,/const pages=STAFF\.filter/);
 assert.doesNotMatch(ui,/const pages=\['home','personnel','activity','organogram','dossiers'/);
 assert.match(ui,/showVerified\(\[\.\.\.new Set\(pages\)\]\)/);
 assert.match(ui,/navigationCapabilities:\{\s*activity:/);
});
