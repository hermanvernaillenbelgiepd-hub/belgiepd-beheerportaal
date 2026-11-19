import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leaveEventDetails} from '../src/leave-event-log.js';
import {brusselsEventDate} from '../src/personnel-event-date.js';
import {reportSections} from '../src/management-utils.js';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Verlofreden en beslismotivering in dossier- en weekrapporttekst',()=>{
 const req={startDate:'2026-11-02',endDate:'2026-11-05',days:4,note:'Familiale omstandigheden'};
 const txt=leaveEventDetails('approved',req,'pending','approved','Goedgekeurd door reekshoofd');
 assert.match(txt,/Familiale omstandigheden/);
 assert.match(txt,/Goedgekeurd door reekshoofd/);
 assert.match(file('src/leave-event-log.js'),/details:leaveEventDetails\(action,request,from,to,note\)/);
});
test('Historisch verlof houdt begindatum, gewone beslissing vandaag',()=>{
 assert.match(file('src/leave-routes.js'),/eventDate:originalAuthor\?details\.startDate:yyyyMmDd\(\)/);
});
test('Belgische kalenderdag geldig direct na middernacht',()=>{
 assert.equal(brusselsEventDate('2026-11-18T23:40:00Z'),'2026-11-19');
 assert.match(file('src/role-routes.js'),/eventDate>brusselsEventDate\(\)/);
 assert.match(file('src/registration-routes.js'),/values\.eventDate>brusselsEventDate\(\)/);
});
test('Gewijzigde sanctie blijft geaudit en wordt als aparte activiteit gerapporteerd',()=>{
 const src=file('src/registration-routes.js');
 assert.match(src,/if\(!existing\.exists\)throw Object\.assign/);
 assert.match(src,/source:'sanction-amendment'/);
 assert.match(src,/tx\.create\(report,/);
 assert.match(src,/tx\.create\(reportNotice,/);
 const section=reportSections([{type:'activiteit',eventDate:'2026-11-18',
  details:'CORRECTIE SANCTIE'}],'2026-11-16','2026-11-29');
 assert.equal(section.find(x=>x.type==='activiteit').entries.length,1);
});
test('Eervol ontslag wordt éénmaal in dossier/rapport opgenomen',()=>{
 const src=file('src/personnel-lifecycle-routes.js');
 assert.match(src,/source:'honorable-resignation'/);
 assert.match(src,/movement:'Eervol ontslag'/);
 assert.match(src,/dossierCaseLogged:true,eventDate/);
 assert.match(file('src/management-routes.js'),/change\.dossierCaseLogged===true/);
});
test('Opleiding stage en opleider worden correct in rapport beschreven',()=>{
 const src=file('src/management-routes.js');
 assert.match(src,/TRAINING_RESULT_LABELS\[r\.result\]/);
 assert.match(file('src/training-result-policy.js'),/stage:'Stage \(historisch\)',restricted:'RESTRICTED \(historisch\)'/);
 assert.match(src,/r\.instructorName\?'Opleider: '/);
});
