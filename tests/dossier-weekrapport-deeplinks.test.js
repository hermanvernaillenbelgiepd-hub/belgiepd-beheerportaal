import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('dossiercentrum offers only the authorized dossier route',()=>{
 const page=read('public/dossiercentrum.html');
 assert.match(page,/if\(r\.canOpen===true\)\{/);
 const i=page.indexOf('if(r.canOpen===true)'),j=page.indexOf('}else{\n      const locked=',i);
 assert.ok(j>i);
 const section=page.slice(i,j);
 assert.match(section,/cell\.append\(button\)/);
 assert.doesNotMatch(section,/Rapportregistraties|weekrapporten\.html/);
 assert.match(page,/const permittedDeepLink=applyInitialDossierLink&&/);
 assert.match(page,/some\(o=>o\.value===requestedDossierDept\)/);
 assert.match(page,/\$\('query'\)\.value=requestedDossierSearch/);
 assert.match(page,/requestedDossierSearch=\(dossierDeepLink\.get\('zoek'\)\|\|''\)\.slice\(0,110\)/);
});
test('weekreports deep links choose only authorized report departments and entries',()=>{
 const page=read('public/weekrapporten.html');
 assert.match(page,/data\.reportDepartments\|\|\[\]\)\.includes\(/);
 assert.match(page,/new URLSearchParams\(location\.search\)\.get\('dept'\)/);
 assert.match(page,/id="returnToServiceDossiers"/);
 assert.match(page,/viewData\?\.departments\?\.includes\(dept\)/);
 assert.match(page,/subjects\.some\(p=>p\.dept===dept&&p\.discordId===person\)/);
 assert.match(page,/if\(!details\.open\)\{details\.open=true;return\}/);
 assert.match(page,/requestAnimationFrame\(\(\)=>\$\('reportRegistrations'\)\.scrollIntoView/);
 assert.match(page,/location\.hash==='#registraties'/);
 assert.match(page,/\$\('reportRegistrations'\)\.addEventListener\('toggle'/);
 assert.match(page,/await api\('\/api\/management\/reports\?dept='/);
});
