import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 PLANNING_TRACKS,PLANNING_STATUSES,planningTrack,planningManager,
 planningConfigurator,planningOwnMembership,eligiblePlanningMembers,
 planningCourseAllowed,planningAEVariants,AE_ROLE_VARIANTS,planningAudienceMatch,validatePlanningAudience,
 validatePlanningAssignment,planningAssignmentKey
} from '../src/training-planning-policy.js';

const actorId='1398985105254650007';
const user={uid:'discord:'+actorId,discordId:actorId,
 departments:['politie'],role:'basiskader',departmentRoles:{politie:'basiskader'}};
const person={personId:actorId,dept:'politie',name:'Test',rank:'Inspecteur',
 call:'400',seriesRaw:'Reeks 1',specialties:[{label:'K9'}]};
const other={...person,personId:'1309532438053130326',name:'Andere medewerker',
 call:'410',seriesRaw:'Reeks 2',specialties:[]};
test('K-9 en Dispatchopleider heeft enkel geverifieerde eigen discipline',()=>{
 assert.equal(planningManager(user,planningTrack('politie:k9'),['1345302115689431061']),true);
 assert.equal(planningManager(user,planningTrack('politie:dispatch'),['1393050971604516904']),true);
 assert.equal(planningManager(user,planningTrack('politie:k9'),['1393050971604516904']),false);
 assert.equal(planningManager(user,planningTrack('politie:ae'),['1393050971604516904']),false);
 assert.equal(planningManager({...user,departments:['ambulance']},planningTrack('politie:k9'),
  ['1345302115689431061']),false);
});
test('AE-teamleader krijgt AE-deelnemersplanning zonder algemene dossierbevoegdheid',()=>{
 const leader=['1337775768083632158'];
 assert.equal(planningManager(user,planningTrack('politie:ae'),leader),true);
 assert.equal(planningManager(user,planningTrack('politie:k9'),leader),false);
 assert.equal(planningConfigurator(user,planningTrack('politie:ae')),false);
});
test('Officierenkader kan extra opleidingen koppelen binnen eigen hulpdienst',()=>{
 const officer={...user,role:'officierenkader',
  departmentRoles:{politie:'officierenkader'}};
 assert.equal(planningConfigurator(officer,planningTrack('politie:ae')),true);
 assert.equal(planningConfigurator(officer,planningTrack('ambulance:algemeen')),false);
});
test('Brandweerplanning erkent uitsluitend geverifieerd eigen dienstkader',()=>{
 const id='123456789012345678';
 const track=planningTrack('brandweer:algemeen');
 const member={uid:'discord:'+id,discordId:id,departments:['brandweer'],
   role:'basiskader',departmentRoles:{brandweer:'basiskader'}};
 assert.ok(track,'Brandweer moet als eigen planningstraject bestaan');
 assert.equal(planningManager({...member,fireAccessLevel:'middle'},track,[]),true);
 assert.equal(planningConfigurator({...member,fireAccessLevel:'middle'},track),false);
 assert.equal(planningManager({...member,fireAccessLevel:'leadership'},track,[]),true);
 assert.equal(planningConfigurator({...member,fireAccessLevel:'leadership'},track),true);
 assert.equal(planningManager({...member,fireZoneChief:true},track,[]),true);
 assert.equal(planningManager({...member,fireAccessLevel:'none'},track,[]),false);
 assert.equal(planningManager({...member,departments:['politie'],fireAccessLevel:'leadership'},track,[]),false);
 assert.equal(planningManager({...member,uid:'discord:999999999999999999',fireAccessLevel:'leadership'},track,[]),false);
 assert.equal(planningOwnMembership({...member,fireAccessLevel:'middle'},
   [{personId:id,dept:'brandweer',lifecycleState:'active'}],'brandweer'),true);
 assert.equal(planningOwnMembership(member,
   [{personId:id,dept:'brandweer',lifecycleState:'archived'}],'brandweer'),false);
});
test('Eigen actieve personeelsfiche is vereist voor het beheren van opleidingstrajecten',()=>{
 assert.equal(planningOwnMembership(user,[person,other],'politie'),true);
 assert.equal(planningOwnMembership(user,[person,person],'politie'),false);
 assert.equal(planningOwnMembership(user,[{...person,lifecycleState:'archived'}],'politie'),false);
});
test('Kandidaten zonder specialisatie mogen wel worden geselecteerd',()=>{
 const track=planningTrack('politie:k9');
 assert.equal(planningAudienceMatch(other,track,{kind:'kandidaten',value:''}),true);
 assert.equal(planningAudienceMatch(person,track,{kind:'kandidaten',value:''}),false);
 assert.equal(planningAudienceMatch(person,track,{kind:'specialisatie',value:'K9'}),true);
 assert.equal(planningAudienceMatch(other,track,{kind:'specialisatie',value:'K9'}),false);
 assert.equal(planningAudienceMatch(person,track,{kind:'reeks',value:'Reeks 1'}),true);
 assert.equal(planningAudienceMatch(other,track,{kind:'reeks',value:'Reeks 1'}),false);
 assert.equal(planningAudienceMatch(other,track,{kind:'rang',value:'Inspecteur'}),true);
});
test('De doelgroep krijgt alleen unieke actieve medewerkers van de eigen dienst',()=>{
 const rows=[person,other,{...other,personId:'1309532438053130327',lifecycleState:'archived'},
  {...other,personId:'1309532438053130328',dept:'ambulance'}];
 assert.equal(eligiblePlanningMembers(rows,'politie').length,2);
 assert.equal(eligiblePlanningMembers([person,person,other],'politie').length,1);
});
test('Rolverificatie kan alleen vooraf bepaalde opleidingen plannen',()=>{
 const k9=planningTrack('politie:k9');
 assert.equal(planningCourseAllowed('K-9',k9),true);
 assert.equal(planningCourseAllowed('DISPATCH',k9),false);
 assert.equal(planningCourseAllowed('DISPATCH',k9,{extraCourses:['DISPATCH']}),true);
 assert.equal(planningCourseAllowed('ERT AE-I',planningTrack('politie:ae')),true);
 assert.equal(planningCourseAllowed('K-9',planningTrack('politie:ae')),false);
});
test('Doelgroepconfiguratie controleert discipline, naam, filtering en invoer',()=>{
 const v=validatePlanningAudience({trackId:'politie:k9',label:'Reeks 1 kandidaten',
   kind:'reeks',value:'Reeks 1'});
 assert.equal(v.trackId,'politie:k9');
 assert.throws(()=>validatePlanningAudience({trackId:'onbekend',label:'Goede doelgroep',kind:'alle',value:''}));
 assert.throws(()=>validatePlanningAudience({trackId:'politie:ae',label:'x',kind:'specialisatie',value:''}));
});
test('Aanmelden van deelnemers vereist expliciete selectie en veilige planningsgegevens',()=>{
 const good={trackId:'politie:k9',courseName:'K-9',audienceId:'kandidaten',
  subjectIds:[other.personId],status:'uitgenodigd',plannedDay:'2026-11-25',note:'Vrijdag in het lokaal'};
 assert.equal(validatePlanningAssignment(good).subjectIds.length,1);
 assert.throws(()=>validatePlanningAssignment({...good,subjectIds:[]}));
 assert.throws(()=>validatePlanningAssignment({...good,subjectIds:[other.personId,other.personId]}));
 assert.throws(()=>validatePlanningAssignment({...good,plannedDay:'2026-99-99'}));
 assert.throws(()=>validatePlanningAssignment({...good,status:'geslaagd'}));
 assert.throws(()=>validatePlanningAssignment({...good,subjectIds:Array(41).fill(other.personId)}));
});
test('Trainingtoewijzingen zijn per persoon en cursus uniek; nooit kwalificaties',()=>{
 const sha=x=>x.padEnd(64,'0');
 const a=planningAssignmentKey('politie:k9','K-9',other.personId,sha);
 const b=planningAssignmentKey('politie:k9','K-9',person.personId,sha);
 assert.equal(a.length,36);
 assert.equal(b.length,36);
 assert.ok(PLANNING_STATUSES.includes('geannuleerd'));
 assert.ok(!PLANNING_STATUSES.includes('geslaagd'));
});
test('Server bewaakt rollen, doelgroep en audit bij planning, annuleren en configureren',()=>{
 const s=readFileSync(new URL('../src/training-planning-routes.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/opleidingsplanning.html',import.meta.url),'utf8');
 const center=readFileSync(new URL('../public/opleidingscentrum.html',import.meta.url),'utf8');
 assert.match(s,/planningOwnMembership\(req\.bpd,roster,t\.department\)/);
 assert.match(s,/subjectSelection\(req,getSnapshot/);
 assert.match(s,/subjectIds\.some\(id=>!personMap\.has\(id\)\)/);
 assert.match(s,/planningConfigurator\(req\.bpd,track\)/);
 assert.match(s,/audit'\)\.doc\(\)/);
 assert.match(s,/runTransaction\(async tx/);
 assert.match(html,/opleiding niet officieel verplicht/i);
 assert.match(html,/Opleidingsplanning/);
 assert.match(center,/opleidingsplanning\.html/);
});

test('AE-I en AE-T komen uit exacte rollen, AE-F alleen uit expliciete personeelskwalificatie',()=>{
 const ae=planningTrack('politie:ae');
 const iRole=['1309542190409580594'],tRole=['1310674604821581894'];
 assert.equal(AE_ROLE_VARIANTS[iRole[0]],'AE-I');
 assert.deepEqual(planningAEVariants(other,iRole).sort(),['AE','AE-I'].sort());
 assert.ok(planningAudienceMatch(other,ae,{kind:'ae_variant',value:'AE-I'},iRole));
 assert.ok(planningAudienceMatch(other,ae,{kind:'ae_variant',value:'AE-T'},tRole));
 assert.ok(planningAudienceMatch(other,ae,{kind:'ae_variant',value:'alle'},iRole));
 assert.equal(planningAudienceMatch(other,ae,{kind:'ae_variant',value:'AE-F'},iRole),false);
 assert.equal(planningAudienceMatch(other,ae,{kind:'ae_variant',value:'AE-F'},tRole),false);
 const special={...other,specialties:[{label:'AE',value:'Stage',level:'AE-F',source:'manual'}]};
 assert.ok(planningAudienceMatch(special,ae,{kind:'ae_variant',value:'AE-F'}));
 assert.equal(planningAudienceMatch(other,ae,{kind:'ae_variant',value:'AE-F'}),false);
});
test('AE-instructeur en AE-leiding komen in eigen variant, zonder andere rechten',()=>{
 const ae=planningTrack('politie:ae');
 assert.ok(planningAudienceMatch(other,ae,{kind:'ae_variant',value:'instructeur'},
  ['1337156006597103746']));
 assert.ok(planningAudienceMatch(other,ae,{kind:'ae_variant',value:'leiding'},
  ['1337775768083632158']));
 assert.ok(!planningAudienceMatch(other,planningTrack('politie:k9'),
  {kind:'ae_variant',value:'alle'},['1309542190409580594']));
 const unverified={...other,specialties:[{label:'AE',value:'Niet ingevuld'}]};
 assert.equal(planningAudienceMatch(unverified,ae,{kind:'ae_variant',value:'alle'}),false);
});
test('Een voorstel tot individueel verplichte opleiding vereist motivering en blijft voorstel',()=>{
 const base={trackId:'politie:ae',courseName:'ERT AE-I',audienceId:'ae_alle',
  subjectIds:[other.personId],status:'ingepland',plannedDay:'',note:'',
  proposeMandatory:true,mandatoryReason:'Noodzakelijke bijscholing voor deze medewerker'};
 assert.equal(validatePlanningAssignment(base).proposeMandatory,true);
 assert.throws(()=>validatePlanningAssignment({...base,mandatoryReason:''}));
 assert.throws(()=>validatePlanningAssignment({...base,mandatoryReason:'te kort'}));
 assert.equal(validatePlanningAssignment({...base,proposeMandatory:false,
  mandatoryReason:''}).proposeMandatory,false);
});
test('De verplichte status wordt niet direct toegepast; voorstel vereist OK en KL',()=>{
 const src=readFileSync(new URL('../src/training-planning-routes.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/opleidingsplanning.html',import.meta.url),'utf8');
 assert.match(src,/getBelgiumPdDisplayRoles\(\)/);
 assert.match(src,/planningAEVariants\(p,roleMap\.get\(p\.personId\)/);
 assert.match(src,/personal\(\)\.doc\(courseRef\.id\+'\_'\+id\)/);
 assert.match(src,/stage:'ok'/);
 assert.match(src,/person_requirement_proposed_from_planning/);
 assert.doesNotMatch(src,/mandatory:true,targetKind:'alle',targetValue:''/);
 assert.match(page,/id="mandatoryProposal"/);
 assert.match(page,/Officierenkader én Korpsleiding/);
});
test('Lichte en donkere modus hebben afzonderlijke contrastregels',()=>{
 const page=readFileSync(new URL('../public/opleidingsplanning.html',import.meta.url),'utf8');
 assert.match(page,/html:not\(\[data-bpd-theme="dark"\]\) body main/);
 assert.match(page,/color:#172a48!important/);
 assert.match(page,/html\[data-bpd-theme="dark"\] body main/);
 assert.match(page,/id="missingLinks"/);
});
