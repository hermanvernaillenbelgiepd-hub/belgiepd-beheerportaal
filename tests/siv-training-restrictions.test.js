import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveTemporarySanctionStatus}
 from '../public/temporary-sanction-state.js';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {isSivTrainingSanction,isPriorityCourse,passedPriorityDriving,
 sivRestrictionStatus} from '../src/siv-training-restriction-policy.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sample={
 type:'sanctie',sanctionType:'Tijdelijke beperking',
 dept:'politie',subjectDiscordId:'123456789012345678',
 restrictedSpecialties:['SIV/WPR'],eventDate:'2026-09-14',
 endDate:'2026-12-31',status:'historisch',
 details:'Schorsing gebruik SIV tot volgen opleiding.'
};
test('bestaande historisch overgenomen SIV-beperking blijft geldig tot de einddatum',()=>{
 assert.equal(isSivTrainingSanction(sample),true);
 assert.equal(sivRestrictionStatus(sample,[],'2026-11-19').state,'actief');
 assert.equal(sivRestrictionStatus(sample,[],'2026-12-31').state,'actief');
 assert.equal(sivRestrictionStatus(sample,[],'2027-01-01').state,'verlopen');
});
test('niet-opleidingsgebonden SIV-sanctie en andere specialisaties krijgen geen valse verplichting',()=>{
 assert.equal(isSivTrainingSanction({...sample,details:'Onveilig rijgedrag',
  explanation:''}),false);
 assert.equal(isSivTrainingSanction({...sample,restrictedSpecialties:['MOTARD']}),false);
 assert.equal(isSivTrainingSanction({...sample,status:'ingetrokken'}),false);
 assert.equal(isSivTrainingSanction({...sample,testRecord:true}),false);
 assert.equal(isSivTrainingSanction({...sample,retired:true}),false);
});
test('uitsluitend officieel geslaagd + beoordeeld voor prioritair rijden heft voortijdig op',()=>{
 const record={courseName:'PRIORITAIR RIJDEN',result:'geslaagd',
  eventDate:'2026-11-03',rosterStatus:'klaar_voor_manuele_invoer'};
 assert.equal(isPriorityCourse('Prioritair rijden'),true);
 assert.equal(passedPriorityDriving(record,sample.eventDate,'2026-11-19'),true);
 assert.equal(sivRestrictionStatus(sample,[record],'2026-11-19').state,'voltooid');
 for(const variant of [
  {...record,result:'aanwezig'},
  {...record,result:'niet_geslaagd'},
  {...record,rosterStatus:'nog_niet_beoordeeld'},
  {...record,rosterStatus:'ter_controle'},
  {...record,courseName:'MOTARD'},
  {...record,eventDate:'2026-09-01'},
  {...record,eventDate:'2026-11-20'},
  {...record,testRecord:true},
  {...record,status:'verwijderd'}
 ]){
  assert.equal(sivRestrictionStatus(sample,[variant],'2026-11-19').state,
    'actief',JSON.stringify(variant));
 }
});
test('scanner leest bestaande sancties, schrijft afronding slechts één keer en behoudt oorspronkelijke sanctie',()=>{
 const route=read('src/siv-training-restriction-routes.js');
 assert.match(route,/collection\('bpd_notices'\)/);
 assert.match(route,/get\('type'\)==='sanctie'/);
 assert.match(route,/collection\('bpd_training'\)/);
 assert.match(route,/collection\('records'\)/);
 assert.match(route,/where\('status','==','actief'\)/);
 assert.match(route,/runTransaction\(async tx=>/);
 assert.match(route,/latest\.get\('status'\)!=='actief'/);
 assert.match(route,/source:'siv-training-restriction-auto-release'/);
 assert.match(route,/Oorspronkelijke sanctie blijft ongewijzigd/);
 assert.match(route,/process\.env\.BPD_ENABLE_SIV_RESTRICTION_AUTOMATION!=='true'/);
 assert.match(route,/timer\.unref/);
 assert.doesNotMatch(route,/tx\.delete\(recordRef/);
 const server=read('src/server.js');
 assert.match(server,/scheduleSivTrainingRestrictions\(\)/);
 assert.match(server,/installSivTrainingRestrictionRoutes\(app/);
});
test('persoonlijk en kaderoverzicht zijn beveiligd met Discord-identiteit en dossierrechten',()=>{
 const route=read('src/siv-training-restriction-routes.js');
 assert.match(route,/actor\?\.uid!=='discord:'\+viewer/);
 assert.match(route,/canViewPersonnel\(actor,'politie'\)/);
 assert.match(route,/canReadPersonnelSubject\(actor,person\[0\]\)/);
 assert.match(route,/if\(row\.subjectDiscordId===viewer\)/);
 assert.match(route,/if\(cadre&&canReadPersonnelSubject/);
 const member=read('src/member-dashboard-routes.js');
 assert.match(member,/never expose Discord IDs in the directory JSON/);
});
test('Meldingen bevat persoonlijk opleidingsbericht, pop-up en aanvraaglink',()=>{
 const html=read('public/meldingen.html');
 assert.match(html,/id="sivTrainingRestrictionPanel"/);
 assert.match(html,/id="sivTrainingRestrictionDialog"/);
 assert.match(html,/loadSivTrainingRestrictions/);
 assert.match(html,/\/opleidingscentrum\.html\?department=politie/);
 assert.match(html,/showModal\(\)/);
 assert.match(html,/sessionStorage\.setItem/);
 const app=read('public/opleidingscentrum.html');
 assert.match(app,/params\.has\('course'\)/);
 assert.match(app,/PRIORITAIR|TRAINING_REQUEST_COURSE_CATALOG/);
});
test('personeelslijst toont een SIV-waarschuwing zonder naam/Discord-ID uit het dossier te publiceren',()=>{
 const html=read('public/personeelslijst.html');
 const roster=read('public/member-police-roster.js');
 assert.match(html,/sivRestrictedCalls=new Set/);
 assert.match(html,/\/api\/siv-training-restrictions/);
 assert.match(roster,/sivDrivingRestricted/);
 assert.match(roster,/SIV\/WPR-rijbeperking/);
 assert.match(roster,/td\.append\(warning\)/);
 const dossier=read('public/personeelsbeheer.html');
 assert.match(dossier,/id="sivDossierNotice"/);
 assert.match(dossier,/loadSivDossierNotice/);
});
test('alle aangepaste frontend modules blijven syntactisch geldig',()=>{
 for(const file of ['public/meldingen.html','public/personeelslijst.html',
  'public/personeelsbeheer.html']){
  const html=read(file);
  const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match,'Geen module-script in '+file);
  const result=spawnSync(process.execPath,['--check','--input-type=module'],
    {input:match[1],encoding:'utf8'});
  assert.equal(result.status,0,file+': '+result.stderr);
 }
});

test('algemene tijdelijke sancties verlopen automatisch per Belgische dag, zonder de sanctie te wissen',()=>{
 const dated={...sample};
 assert.equal(effectiveTemporarySanctionStatus(dated,'2026-11-19'),
  'actief · historisch overgenomen');
 assert.equal(effectiveTemporarySanctionStatus(dated,'2026-12-31'),
  'actief · historisch overgenomen');
 assert.equal(effectiveTemporarySanctionStatus(dated,'2027-01-01'),'verlopen');
 assert.equal(effectiveTemporarySanctionStatus({
  ...dated,sanctionType:'Tijdelijke degradatie',
  status:'actief'},'2027-01-01'),'verlopen');
 assert.equal(effectiveTemporarySanctionStatus({
  ...dated,status:'ingetrokken'},'2026-11-19'),'ingetrokken');
 assert.equal(dated.status,'historisch','de bron blijft onaangeroerd');
 const overview=read('src/sanction-overview-policy.js');
 assert.match(overview,/effectiveTemporarySanctionStatus\(entry\)/);
 const dossier=read('public/personeelsbeheer.html');
 assert.match(dossier,/effectiveTemporarySanctionStatus\(row\)/);
 assert.match(dossier,/termijn verstreken/);
});
