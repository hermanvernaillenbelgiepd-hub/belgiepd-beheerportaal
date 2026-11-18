import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canReviewSanctions,canSeeSanctionSubject,validSanctionReference,
 validateSanctionFollowup,sanctionOverviewItem,SANCTION_OVERVIEW_PAGE_SIZE}
 from '../src/sanction-overview-policy.js';
const id='1398985105254650007',second='1309532438019706966';
const officer={uid:'discord:'+id,discordId:id,role:'officierenkader',
 departments:['politie'],departmentRoles:{politie:'officierenkader'},
 dossierAllowedDepartments:['politie'],dossierNativeDepartments:['politie']};
const chief={...officer,role:'korpsleiding',
 departmentRoles:{politie:'korpsleiding'}};
const record={dept:'politie',personId:second,name:'Medewerker',rank:'Inspecteur',
 call:'455'};
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Only verified and department-authorized officers/chiefs see sanctions',()=>{
 assert.equal(canReviewSanctions(officer,'politie'),true);
 assert.equal(canReviewSanctions(chief,'politie'),true);
 assert.equal(canReviewSanctions({...officer,role:'middenkader',
  departmentRoles:{politie:'middenkader'}},'politie'),false);
 assert.equal(canReviewSanctions(officer,'brandweer'),false);
 assert.equal(canReviewSanctions({...officer,uid:'discord:'+second},'politie'),false);
 assert.equal(canReviewSanctions({...officer,dossierNativeDepartments:[]},'politie'),false);
 assert.equal(canSeeSanctionSubject(officer,record),true);
 assert.equal(canSeeSanctionSubject(officer,{...record,call:'930',rank:'Commissaris'}),false);
 assert.equal(canSeeSanctionSubject(chief,{...record,call:'930',rank:'Commissaris'}),false);
});
test('References, page bounds and note body are validated independently',()=>{
 assert.equal(validSanctionReference('politie',second,'dD5h37c2TYSsJNTp7aPD'),true);
 assert.equal(validSanctionReference('brandweer',second,'dD5h37c2TYSsJNTp7aPD'),true);
 assert.equal(validSanctionReference('burger',second,'dD5h37c2TYSsJNTp7aPD'),false);
 assert.equal(validSanctionReference('politie','930','dD5h37c2TYSsJNTp7aPD'),false);
 assert.equal(SANCTION_OVERVIEW_PAGE_SIZE,240);
 assert.equal(validateSanctionFollowup({text:' Beoordeling door kader na overleg '}),'Beoordeling door kader na overleg');
 for(const invalid of [null,{}, {text:'te kort'}, {text:'voldoende lengte',status:'actief'},
   {text:'n'.repeat(2001)}])
   assert.throws(()=>validateSanctionFollowup(invalid));
});
test('Historical rank is never invented for old sanction records',()=>{
 const x=sanctionOverviewItem({eventDate:'2026-11-19',sanctionType:'Schorsing',severity:7,
  reasons:['Veiligheid'],registeredBy:{name:'Kader',rank:'Commissaris'},
  subjectCallAtCreation:'455',status:'actief'},record,'dD5h37c2TYSsJNTp7aPD');
 assert.equal(x.currentRank,'Inspecteur');
 assert.equal(x.rankAtSanction,'');
 assert.equal(x.issuer.rank,'Commissaris');
 assert.equal(x.callAtSanction,'455');
 assert.equal(x.reasons[0],'Veiligheid');
 assert.equal(x.status,'actief');
});
test('Data handling is append-only and access checked separately on every API',()=>{
 const route=file('src/sanction-overview-routes.js');
 const server=file('src/server.js');
 const registrations=file('src/registration-routes.js');
 const page=file('public/sanctieoverzicht.html');
 assert.match(route,/canReviewSanctions\(req\.bpd,dept\)/);
 assert.match(route,/canSeeSanctionSubject\(req\.bpd,subject\)/);
 assert.match(route,/canReadPersonnelSubject\(req\.bpd,p\[0\]\)/);
 assert.match(route,/getSnapshot\(\{includeArchived:true\}\)/);
 assert.match(route,/tx\.create\(note,/);
 assert.match(route,/tx\.create\(audit,/);
 assert.match(route,/tx\.create\(activity,/);
 assert.match(route,/tx\.create\(notification,/);
 assert.doesNotMatch(route,/tx\.update\(ref,/);
 assert.match(route,/reportCategory:'activiteit'/);
 assert.match(route,/req\.bpd\.discordId===discordId/);
 assert.match(server,/installSanctionOverviewRoutes\(app,/);
 assert.match(registrations,/subjectRankAtCreation:target\.rank/);
 assert.match(page,/id="noteForm"/);
 assert.match(page,/id="dept"/);
 assert.match(page,/bpd-navigation\.js/);
});
