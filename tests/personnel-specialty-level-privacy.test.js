import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('organogram hides manual source badges and keeps recorded manual changes intact',()=>{
 const s=source('public/organogram-hierarchie.html');
 assert.doesNotMatch(s,/flags\.append\(el\('span','flag','Handmatig'\)\)/);
 assert.match(s,/state\.canManageAE/);
});
test('personnel profile management is hidden unless server verified officer or corps permission',()=>{
 const s=source('public/beheercentrum.html');
 assert.match(s,/id="ae-beheer"[^>]*hidden/);
 assert.match(s,/data\.canManageAE!==true/);
 assert.match(s,/\['awardTile','awardLibraryTile','aeTile'\]/);
 const server=source('src/organogram-placement-routes.js');
 assert.match(server,/canManageAE:canEditK9Display\(_req\.bpd\)/);
});
test('individual specialty function level is edited and audited with existing guarded API',()=>{
 const ui=source('public/specialty-links-ui.js');
 const page=source('public/rollenbeheer.html');
 const api=source('src/specialization-routes.js');
 assert.match(ui,/function renderPersonList\(items,options=\{\}\)/);
 assert.match(ui,/options\.editable&&spec\.readOnly!==true/);
 assert.match(ui,/await options\.save\(spec\.label,choice\.value,reason\.value\.trim\(\)\)/);
 assert.match(page,/Alle specialisaties en functieniveaus per personeelslid beheren/);
 assert.match(page,/expectedRevision:specialtyData\.revision/);
 assert.match(api,/canChangeSpecialty\(req\.bpd,staff\)/);
 assert.match(api,/action:'specialization_changed'/);
});
