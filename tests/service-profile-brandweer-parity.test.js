import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/organogram-hybrid.css',import.meta.url),'utf8');
const main=page.slice(page.indexOf('function openPersonProfile(p){'),page.indexOf('function openPersonProfile(p){')+1700);

test('Brandweer reference layout is assigned to AZLS, Depannage and Burger only',()=>{
 assert.match(main,/dialog\.classList\.toggle\('fire-person-profile',p\.dept==='brandweer'\)/);
 assert.match(main,/dialog\.classList\.toggle\('bpd-service-reference-profile',[\s\S]*?\['ambulance','depannage','burger'\]\.includes\(p\.dept\)/);
 assert.ok(!main.includes("['politie','ambulance','depannage','burger'].includes(p.dept)"));
});

test('service cards use Brandweer profile order, size and two-column specializations',()=>{
 assert.match(css,/\.bpd-service-reference-profile \.person-profile-main\{[\s\S]*?flex-direction:column!important/);
 assert.match(css,/\.bpd-service-reference-profile \.person-profile-intro\{[\s\S]*?order:0!important/);
 assert.match(css,/\.bpd-service-reference-profile \.person-profile-grid\{[\s\S]*?order:1!important/);
 assert.match(css,/\.bpd-service-reference-profile \.person-profile-overview[\s\S]*?\{[\s\S]*?flex-direction:column!important/);
 assert.match(css,/\.bpd-service-reference-profile \.person-profile-specialties\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/width:min\(100%,258px,30dvh\)!important/);
 assert.match(css,/max-width:970px/);
 assert.match(css,/max-width:700px/);
 assert.match(css,/max-width:390px/);
});

test('Brandweer original styles remain separate, and profile data remains untouched',()=>{
 assert.match(css,/person-profile-dialog\.fire-person-profile\.operational-profile/);
 assert.match(css,/person-profile-dialog\.depannage-person-profile\.operational-profile/);
 assert.match(page,/const portrait=|const portraitPerson=/);
 assert.match(page,/primary\.append\(intro\)/);
 assert.match(page,/primary\.append\(grid\)/);
 assert.match(page,/fact\('Personeelsstatus',p\.status\|\|'Niet vermeld'\)/);
 assert.match(page,/secondary\.append\(awardsBox\)/);
 assert.match(page,/secondary\.append\(specBox\)/);
});
