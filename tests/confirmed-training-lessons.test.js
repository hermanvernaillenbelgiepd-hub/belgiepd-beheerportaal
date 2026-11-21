import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {confirmedLessonsByInstructor,lessonSessionForTraining,
 validateHeldLessonInput,TRAINING_SESSION_DEPARTMENTS}
 from '../src/training-session-policy.js';
import {cadreActivityCounts,cadreActivityPeriod}
 from '../src/cadre-activity-policy.js';

const teacher='234567890123456789',registrator='123456789012345678',
 t1='345678901234567890',t2='456789012345678901';
const period={start:'2026-11-01',end:'2026-11-20'};
const lesson=(id='LESSONABCDEFG123',extra={})=>({
 id,department:'politie',courseName:'MOTARD',eventDate:'2026-11-19',
 instructorDiscordId:teacher,verifiedInstructor:true,status:'gegeven',
 ...extra
});
const result=(person,session='LESSONABCDEFG123',extra={})=>({
 department:'politie',subjectDiscordId:person,
 eventDate:'2026-11-19',courseName:'MOTARD',result:'geslaagd',
 instructorDiscordId:teacher,registeredByDiscordId:registrator,
 lessonSessionId:session,status:'geregistreerd',...extra
});
test('1 werkelijk lesmoment met twee deelnemers is precies één les en twee deelnames',()=>{
 const sessions=[lesson()];
 const records=[result(t1),result(t2)];
 const m=confirmedLessonsByInstructor(records,sessions,'politie',period);
 assert.deepEqual(m.get(teacher),{lesmomenten:1,lesdeelnames:2});
 assert.equal(m.size,1);
});
test('Twee afzonderlijke gegeven lessen op dezelfde datum worden niet samengevoegd',()=>{
 const sessions=[lesson(),lesson('LESSONHIJKLMN456')];
 const records=[result(t1),result(t2,'LESSONHIJKLMN456')];
 assert.deepEqual(confirmedLessonsByInstructor(records,sessions,'politie',period)
   .get(teacher),{lesmomenten:2,lesdeelnames:2});
});
test('Dezelfde deelnemer met een dubbele registratie telt één keer per les',()=>{
 const records=[result(t1),result(t1),result(t2)];
 const m=confirmedLessonsByInstructor(records,[lesson()],'politie',period);
 assert.deepEqual(m.get(teacher),{lesmomenten:1,lesdeelnames:2});
});
test('Een les zonder geldige actieve deelnemer telt niet als gegeven les',()=>{
 const without=[result(t1,'LESSONABCDEFG123',{status:'verwijderd'}),
   result(t2,'LESSONABCDEFG123',{archivedAt:'2026-11-20'}),
   result(t1,'LESSONABCDEFG123',{testRecord:true})];
 assert.equal(confirmedLessonsByInstructor(without,[lesson()],'politie',period).size,0);
 assert.equal(confirmedLessonsByInstructor([], [lesson()],'politie',period).size,0);
});
test('Lesmoment koppeling verifieert dienst, datum, opleiding en opleider en beschermt andere diensten',()=>{
 const valid=result(t1);
 assert.equal(lessonSessionForTraining(lesson(),valid),true);
 for(const session of [
   lesson('OTHERSESSIONABC123'),
   lesson(undefined,{department:'ambulance'}),
   lesson(undefined,{eventDate:'2026-11-18'}),
   lesson(undefined,{courseName:'RAGO'}),
   lesson(undefined,{instructorDiscordId:registrator}),
   lesson(undefined,{verifiedInstructor:false}),
   lesson(undefined,{status:'geannuleerd'})
 ])assert.equal(lessonSessionForTraining(session,valid),false);
 for(const bad of [
   {...valid,department:'brandweer'},
   {...valid,eventDate:'2026-11-18'},
   {...valid,courseName:'RAGO'},
   {...valid,instructorDiscordId:registrator},
   {...valid,subjectDiscordId:'abc'},
   {...valid,lessonSessionId:'random'}
 ])assert.equal(lessonSessionForTraining(lesson(),bad),false);
});
test('Historische registraties zonder unieke lescode krijgen geen fictieve lesmomenten',()=>{
 const legacy=[{...result(t1),lessonSessionId:null},
   {...result(t2),lessonSessionId:undefined,instructorDiscordId:null}];
 assert.equal(confirmedLessonsByInstructor(legacy,[lesson()],'politie',period).size,0);
});
test('Een docent kan een lesdag bevestigen, maar niet voor een andere dienst of toekomstige datum',()=>{
 assert.deepEqual(validateHeldLessonInput({
   department:'politie',courseName:'MOTARD',eventDate:'2026-11-19'
 },'2026-11-20'),{department:'politie',courseName:'MOTARD',eventDate:'2026-11-19'});
 for(const input of [
   {department:'dispatch',courseName:'MOTARD',eventDate:'2026-11-19'},
   {department:'politie',courseName:'MOTARD',eventDate:'2026-11-21'},
   {department:'politie',courseName:'MOTARD',eventDate:'2026-02-30'},
   {department:'politie',courseName:'MOTARD',eventDate:'2026-11-19',instructorDiscordId:teacher},
   {department:'politie',courseName:'<script>',eventDate:'2026-11-19'}
 ])assert.throws(()=>validateHeldLessonInput(input,'2026-11-20'));
 assert.equal(TRAINING_SESSION_DEPARTMENTS.includes('burger'),true);
});
test('De geregistreerde opleider krijgt het lesmoment, niet de administratieve registrator',()=>{
 const teacherPerson={dept:'politie',personId:teacher,name:'Leraar',
   rank:'Hoofdinspecteur',call:'700'};
 const secretary={dept:'politie',personId:registrator,name:'Registrator',
   rank:'Hoofdinspecteur',call:'710'};
 const [one,two]=cadreActivityCounts([teacherPerson,secretary],[],
   [result(t1),result(t2)],cadreActivityPeriod(30,'2026-11-20'),
   [],[lesson()],'politie').sort((a,b)=>a.discordId===teacher?-1:1);
 assert.equal(one.lesmomenten,1);
 assert.equal(one.lesdeelnames,2);
 assert.equal(one.opleidingsregistraties,0);
 assert.equal(two.opleidingsregistraties,2);
 assert.equal(two.lesmomenten,0);
});
test('UI en server koppelen de sessie expliciet, zonder achteraf samenvoegen op datum',()=>{
 const routes=readFileSync(new URL('../src/role-routes.js',import.meta.url),'utf8');
 const stats=readFileSync(new URL('../src/cadre-activity-routes.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/rollen-opleidingen.html',import.meta.url),'utf8');
 const dash=readFileSync(new URL('../public/activiteitscentrum.html',import.meta.url),'utf8');
 assert.match(routes,/app\.post\('\/api\/training\/lessons',resolveActor/);
 assert.match(routes,/app\.get\('\/api\/training\/lessons',resolveActor/);
 assert.match(routes,/actor\.uid!=='discord:'\+actor\.discordId/);
 assert.match(routes,/lesson\.courseName!==data\.courseName/);
 assert.match(routes,/lesson\.eventDate!==data\.eventDate/);
 assert.match(routes,/instructorDiscordId:lesson\.instructorDiscordId/);
 assert.match(routes,/data=await resolveLessonForRecord\(data\)/);
 assert.match(stats,/lessonSessionsForPeriod\(db,dept,period\)/);
 assert.match(dash,/Gegeven lesmomenten/);
 assert.match(dash,/lesdeelnames/);
 assert.match(page,/id="lessonSession"/);
 assert.match(page,/id="newLesson"/);
 assert.match(page,/lessonSessionId:\$\('lessonSession'\)\.value\|\|null/);
});
