import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ambulanceDashboardTier,canSeeDashboardManagement} from '../src/dashboard-admin-policy.js';
import {isUserManager,canSeeUser} from '../src/user-access.js';
import {dossierGrantScope} from '../src/dossier-grants.js';
import {canReadBoard} from '../src/to-board-policy.js';
import {mayReadFortnightReport} from '../src/fortnight-report-policy.js';
import {mayReviewTrainingRequest} from '../src/training-request-policy.js';

const id='111111111111111111',colleague='222222222222222222';
const actor=(role,extra={})=>({uid:'discord:'+id,discordId:id,role,
 departments:['ambulance'],departmentRoles:{ambulance:role},boardPersonnelAdmin:false,
 portalTechnicalMode:false,reportServiceRoles:{ambulanceAzls:false},...extra});
const roster=[{dept:'ambulance',personId:id,call:'DIRMED',rank:'Directeur'},
 {dept:'ambulance',personId:colleague,call:'AMB-02',rank:'Ambulancier'}];

test('DIR-MED receives AZLS workspace, not police, global user administration or grant delegation',()=>{
 const director=actor('korpsleiding');
 assert.equal(ambulanceDashboardTier(director),'korpsleiding');
 assert.equal(canSeeDashboardManagement(director),false);
 assert.equal(isUserManager(director),false);
 assert.equal(canSeeUser(director,{status:'approved',departments:['ambulance']}),false);
 assert.equal(dossierGrantScope(director,false,null,'ambulance'),false);
 assert.equal(canReadBoard(director),false);
 assert.equal(mayReadFortnightReport(director,'ambulance',roster),true);
 for(const dept of ['brandweer','politie','depannage'])
   assert.equal(mayReadFortnightReport(director,dept,roster),false);
 assert.equal(mayReviewTrainingRequest(director,
   {department:'ambulance',applicantDiscordId:colleague,applicantTier:'basiskader'}),true);
 assert.equal(mayReviewTrainingRequest(director,
   {department:'politie',applicantDiscordId:colleague,applicantTier:'basiskader'}),false);
});

test('AZLS leading and instructor levels remain separately approved',()=>{
 const leader=actor('officierenkader',{reportServiceRoles:{ambulanceAzls:true}});
 const instructor=actor('middenkader');
 assert.equal(ambulanceDashboardTier(leader),'officierenkader');
 assert.equal(ambulanceDashboardTier(instructor),'middenkader');
 assert.equal(isUserManager(leader),false);
 assert.equal(isUserManager(instructor),false);
 assert.equal(mayReviewTrainingRequest(instructor,
   {department:'ambulance',applicantDiscordId:colleague,applicantTier:'basiskader'}),true);
 assert.equal(mayReadFortnightReport(instructor,'ambulance',
   [{...roster[0],call:'AMB-01'},roster[1]]),false);
 assert.equal(mayReadFortnightReport(leader,'ambulance',
   [{...roster[0],call:'HARTS-01'},roster[1]]),true);
 assert.equal(mayReadFortnightReport(actor('officierenkader'),'ambulance',
   [{...roster[0],call:'AMB-01'},roster[1]]),false);
 assert.equal(ambulanceDashboardTier(actor('basiskader')),null);
});

test('Police higher command, separately verified Board and technical manager retain independent workspaces',()=>{
 const officer=actor('officierenkader',{departments:['politie','ambulance'],
   departmentRoles:{politie:'officierenkader',ambulance:'officierenkader'}});
 assert.equal(ambulanceDashboardTier(officer),null);
 assert.equal(isUserManager(officer),true);
 assert.equal(ambulanceDashboardTier(actor('korpsleiding',{boardPersonnelAdmin:true})),null);
 assert.equal(ambulanceDashboardTier(actor('korpsleiding',{portalTechnicalMode:true})),null);
 assert.equal(ambulanceDashboardTier(actor('beheerder')),null);
 assert.equal(dossierGrantScope(actor('beheerder'),false,null,'ambulance'),true);
 assert.equal(dossierGrantScope(actor('korpsleiding'),true,null,'ambulance'),true);
});

test('Only the verified server context reveals medical leadership controls on dashboard',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(server,/req\.bpd\.ambulanceReportVerified=mayReadFortnightReport\(req\.bpd,'ambulance',roster\)/);
 assert.match(server,/ambulanceTier:ambulanceDashboardTier\(req\.bpd\)/);
 assert.match(server,/ambulanceCanManagePersonnel:req\.bpd\.ambulanceReportVerified===true/);
 assert.match(page,/id="ambulanceDashboard" hidden/);
 assert.match(page,/id="ambulanceNav"[^>]*hidden/);
 assert.match(page,/function showAmbulanceDashboard\(ctx\)/);
 assert.equal((page.match(/else if\(ctx\.dashboardProfile==='ambulance-azls'\)/g)||[]).length,2);
 assert.match(page,/\['ambulanceCardStaff',canManage\]/);
 assert.match(page,/\['ambulanceCardDossiers',canOpen\]/);
 assert.match(page,/\['ambulanceCardReports',canReport\]/);
 const section=page.split('<section id="ambulanceDashboard"')[1]?.split('<section id="guestDashboard"')[0]||'';
 for(const link of ['/personeelslijst.html','/personeelsbeheer.html','/dossiercentrum.html',
   '/opleidingscentrum.html','/weekrapporten.html','/verlofbeheer.html','/meldingen.html'])
   assert.ok(section.includes('href="'+link+'"'),'Missing '+link);
 for(const restricted of ['/registraties.html','/to-dienstbord.html',
   '/vast-roepnummer-aanvragen.html','/gebruikersbeheer.html','/roepnummers.html'])
   assert.ok(!section.includes('href="'+restricted+'"'),'Forbidden '+restricted);
});
