import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isFireZoneDashboard,canSeeDashboardManagement,canSeeAdvancedDashboard} from '../src/dashboard-admin-policy.js';
import {isUserManager,canSeeUser} from '../src/user-access.js';
import {dossierGrantScope} from '../src/dossier-grants.js';
import {canViewPersonnel,canEditGeneralPersonnelInfo} from '../src/personnel-editor-policy.js';
import {mayReadFortnightReport} from '../src/fortnight-report-policy.js';
import {mayReviewTrainingRequest} from '../src/training-request-policy.js';
import {canReadBoard} from '../src/to-board-policy.js';

const id='301448301868220417';
const zone={uid:'discord:'+id,discordId:id,role:'korpsleiding',
  departments:['brandweer'],departmentRoles:{brandweer:'korpsleiding'},
  fireZoneChief:true,fireAccessLevel:'zone',boardPersonnelAdmin:false,
  portalTechnicalMode:false,dossierAllowedDepartments:['brandweer'],
  dossierNativeDepartments:['brandweer']};

test('Verified ZONE receives service workspaces without generic administration',()=>{
 assert.equal(isFireZoneDashboard(zone),true);
 assert.equal(canSeeAdvancedDashboard(zone),true);
 assert.equal(canSeeDashboardManagement(zone),false);
 assert.equal(isUserManager(zone),false);
 assert.equal(canSeeUser(zone,{status:'approved',departments:['brandweer']}),false);
 assert.equal(dossierGrantScope(zone,false,null,'brandweer'),false);
 assert.equal(canReadBoard(zone),false);
 for(const dept of ['politie','ambulance','depannage']){
   assert.equal(mayReadFortnightReport(zone,dept,[]),false);
   assert.equal(canViewPersonnel(zone,dept),false);
 }
});

test('ZONE retains full own service personnel, report and training request authority',()=>{
 const fireMember={dept:'brandweer',personId:'222222222222222222',call:'BWM-06',rank:'Brandweerman'};
 assert.equal(canViewPersonnel(zone,'brandweer'),true);
 assert.equal(canEditGeneralPersonnelInfo(zone,fireMember),true);
 assert.equal(mayReadFortnightReport(zone,'brandweer',[fireMember]),true);
 assert.equal(mayReviewTrainingRequest(zone,{
  department:'brandweer',applicantDiscordId:fireMember.personId,applicantTier:'basiskader'
 }),true);
 assert.equal(mayReviewTrainingRequest(zone,{
  department:'politie',applicantDiscordId:fireMember.personId,applicantTier:'basiskader'
 }),false);
});

test('Board and approved technical admins retain independent management profile',()=>{
 assert.equal(isFireZoneDashboard({...zone,boardPersonnelAdmin:true}),false);
 assert.equal(isFireZoneDashboard({...zone,portalTechnicalMode:true}),false);
 assert.equal(isFireZoneDashboard({...zone,role:'beheerder'}),false);
 assert.equal(isFireZoneDashboard({...zone,fireZoneChief:false}),false);
 assert.equal(isFireZoneDashboard({...zone,departments:['politie','brandweer'],
  departmentRoles:{politie:'officierenkader',brandweer:'korpsleiding'}}),false);
 const admin={...zone,role:'beheerder',departments:['brandweer'],
    departmentRoles:{brandweer:'korpsleiding'}};
 assert.equal(isUserManager(admin),true);
 assert.equal(dossierGrantScope(admin,false,null,'brandweer'),true);
});

test('Only the server can designate the Brandweer zone dashboard',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(server,/admin-visibility',requireDossierUser/);
 assert.match(server,/dashboardProfile:isFireZoneDashboard\(req\.bpd\)\?'brandweer-zone':null/);
 assert.match(server,/req\.bpd\.fireZoneChief=verifiedFireZoneChief\(/);
 assert.match(html,/id="zoneDashboard" hidden/);
 assert.match(html,/id="zoneNav"[^>]*hidden/);
 assert.match(html,/zoneHome\.hidden=mode!=='zone'/);
 assert.equal((html.match(/ctx\.dashboardProfile==='brandweer-zone'/g)||[]).length,2);
 const section=html.split('<section id="zoneDashboard"')[1]?.split('<section id="guestDashboard"')[0]||'';
 for(const link of ['/personeelslijst.html','/personeelsbeheer.html',
   '/dossiercentrum.html','/opleidingscentrum.html','/weekrapporten.html',
   '/verlofbeheer.html','/meldingen.html'])
   assert.ok(section.includes('href="'+link+'"'),'Missing '+link);
 for(const restricted of ['/registraties.html','/to-dienstbord.html',
   '/vast-roepnummer-aanvragen.html','/gebruikersbeheer.html','/roepnummers.html'])
   assert.ok(!section.includes('href="'+restricted+'"'),'Forbidden '+restricted);
});
