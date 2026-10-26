import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canSeeDashboardManagement,ambulanceDashboardTier} from '../src/dashboard-admin-policy.js';

test('Basiskader en Middenkader zien geen Rollen en beheer op het dashboard',()=>{
  const roles=['basiskader','middenkader'];
  for(const role of roles){
    assert.equal(canSeeDashboardManagement({
      role,departments:['politie'],departmentRoles:{politie:role}
    }),false,role);
    assert.equal(canSeeDashboardManagement({
      role,departments:['brandweer'],departmentRoles:{brandweer:role}
    }),false,'Brandweer '+role);
    assert.equal(canSeeDashboardManagement({
      role,departments:['ambulance'],departmentRoles:{ambulance:role}
    }),false,'Ambulance '+role);
    assert.equal(canSeeDashboardManagement({
      role,departments:['depannage'],departmentRoles:{depannage:role}
    }),false,'Depannage '+role);
  }
  assert.equal(canSeeDashboardManagement(null),false);
  assert.equal(canSeeDashboardManagement({role:'middenkader',portalTechnicalMode:true}),false,
    'An unverified technical flag is insufficient');
});

test('Geautoriseerde leiding, bestuur en technisch beheer behouden de beheerlinks',()=>{
  for(const role of ['officierenkader','korpsleiding','beheerder'])
    assert.equal(canSeeDashboardManagement({role,departments:['politie']}),true,role);
  assert.equal(canSeeDashboardManagement({
    role:'middenkader',departments:['brandweer'],
    departmentRoles:{brandweer:'korpsleiding'}
  }),true,'Verified higher department appointment');
  assert.equal(canSeeDashboardManagement({
    role:'middenkader',boardPersonnelAdmin:true
  }),true,'Independent Board appointment');
  assert.equal(canSeeDashboardManagement({
    role:'middenkader',portalTechnicalMode:true,profileTechnicalAvailable:true
  }),true,'Verified technical mode');
});

test('Dashboard management link is hidden until a successful server decision',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(html,/<a id="adminNavLink"[^>]*hidden[^>]*>[^<]*Beheer &amp; rollen/);
  assert.match(html,/const adminSection=\$\('adminRights'\),adminNavLink=\$\('adminNavLink'\)/);
  assert.match(html,/adminSection\.hidden=true;adminNavLink\.hidden=true/);
  assert.ok((html.match(/adminNavLink\.hidden=ctx\.visible!==true/g)||[]).length===2,
    'Discord and Google sign-ins use the same confirmed server decision');
  assert.match(server,/admin-visibility',requireDossierUser/);
  assert.match(server,/visible:canSeeDashboardManagement\(req\.bpd\)/);
  // Opleidingscentrum remains separate; Middenkader trainers retain their
  // established training permissions.
  assert.match(html,/href="\/rollen-opleidingen\.html"/);
});

test('AZLS Basiskader sees ambulance home without acquiring dossier/report/management rights',()=>{
 const normal={role:'basiskader',uid:'discord:111111111111111111',
   discordId:'111111111111111111',departments:['ambulance'],
   departmentRoles:{ambulance:'basiskader'}};
 assert.equal(ambulanceDashboardTier(normal),'basiskader');
 assert.equal(canSeeDashboardManagement(normal),false);
 assert.equal(ambulanceDashboardTier({...normal,departments:['politie'],
   departmentRoles:{politie:'basiskader'}}),null);
 assert.equal(ambulanceDashboardTier({...normal,boardPersonnelAdmin:true}),null);
 assert.equal(ambulanceDashboardTier({...normal,portalTechnicalMode:true}),null);
 assert.equal(ambulanceDashboardTier({...normal,role:'middenkader',
   departmentRoles:{ambulance:'middenkader'}}),'middenkader');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(html,/id="ambulanceDashboard" hidden/);
 assert.match(html,/id="ambulanceLinkNotice"[^>]*hidden/);
 assert.match(html,/ctx\.ambulancePersonnelLinked===true/);
 assert.match(html,/ctx\.ambulanceCanOpenDossier===true/);
 assert.match(html,/ctx\.ambulanceReportVerified===true/);
 assert.match(html,/ctx\.ambulanceCanManagePersonnel===true/);
 assert.match(server,/ambulancePersonnelLinked:req\.bpd\.ambulancePersonnelLinked===true/);
 assert.match(server,/req\.bpd\.ambulancePersonnelLinked=Boolean/);
 assert.match(server,/dossierAllowedDepartments\?\.includes\('ambulance'\)===true/);
});
