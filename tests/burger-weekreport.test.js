import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {validateBurgerWeekReport,summarizeBurgerWeekEntries} from '../src/burger-weekreport-routes.js';

const request={title:'Weekrapport Burgerraad',periodStart:'2026-10-12',periodEnd:'2026-10-18'};
test('Burger-weekrapport accepteert alleen afgebakende datums en geen andere dienst',()=>{
  assert.deepEqual(validateBurgerWeekReport(request),{...request,status:'concept',dept:'burger'});
  for(const payload of [
    {...request,dept:'politie'},
    {...request,periodStart:'2026-10-19'},
    {...request,periodEnd:'2026-11-20'},
    {...request,periodStart:'2026-02-30'},
    {...request,title:'x'},
    {...request,createdByUid:'forged'}
  ])assert.throws(()=>validateBurgerWeekReport(payload));
});
test('Rapportselectie beperkt zich tot periode en Burger-registratietypes',()=>{
 const result=summarizeBurgerWeekEntries([
   {type:'observatie',eventDate:'2026-10-13',title:'Positief',details:'Goede inzet',subjectNameAtCreation:'Burger A',authorName:'Raadslid',submittedBy:{uid:'secret'}},
   {type:'opleiding',eventDate:'2026-10-14',title:'Opleiding',details:'Geslaagd',subjectNameAtCreation:'Burger B'},
   {type:'politie',eventDate:'2026-10-13',title:'Verboden',details:'Politiegeheim'},
   {type:'notitie',eventDate:'2026-10-20',title:'Buiten periode'},
   {type:'sanctie',eventDate:'2026-10-14',details:'Ander type'}
 ],request.periodStart,request.periodEnd);
 assert.equal(result.length,2);
 assert.deepEqual(result.map(x=>x.type),['observatie','opleiding']);
 assert.equal(JSON.stringify(result).includes('secret'),false);
 assert.equal(JSON.stringify(result).includes('Politiegeheim'),false);
});
test('Burger-weekrapport en centraal verlof zijn alleen via beveiligde scopes bereikbaar',()=>{
 const routes=readFileSync(new URL('../src/burger-weekreport-routes.js',import.meta.url),'utf8');
 const citizen=readFileSync(new URL('../src/burger-dossier-routes.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/burger-fiche.html',import.meta.url),'utf8');
 assert.match(routes,/req\.bpd\?\.burgerDossierAccess\?\.read/);
 assert.match(routes,/req\.bpd\?\.burgerDossierAccess\?\.write/);
 assert.match(routes,/where\('dept','==','burger'\)/);
 assert.match(routes,/if\(!doc\.exists\|\|doc\.get\('dept'\)!=='burger'\)/);
 assert.match(routes,/d\.dept==='burger'&&d\.subjectDiscordId===person\.personId/);
 assert.match(citizen,/bpd_leave_requests/);
 assert.match(citizen,/source:'central_leave'/);
 assert.match(server,/installBurgerWeekReportRoutes\(app,\{requireUser:requireDossierUser,getSnapshot\}\)/);
 assert.match(ui,/data-tab="verlof"/);
 assert.match(ui,/data-tab="weekrapport"/);
 assert.doesNotMatch(ui,/\.innerHTML\s*=/);
 const module=ui.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(module);
 assert.doesNotThrow(()=>new Script(module));
});
