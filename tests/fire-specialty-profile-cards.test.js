import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8');
const organogram=read('organogram-hierarchie.html');
const management=read('beheercentrum.html');
const style=read('organogram-hybrid.css');

test('fire profile uses equal-width cards for specialties with and without patches',()=>{
 assert.match(organogram,/dialog\.classList\.toggle\('fire-person-profile',p\.dept==='brandweer'\)/);
 assert.match(organogram,/if\(p\.dept==='brandweer'\)\{/);
 assert.match(organogram,/item\.classList\.add\('person-profile-specialty-fire-badged'\)/);
 assert.match(style,/\.person-profile-dialog\.fire-person-profile\.operational-profile/);
 assert.match(style,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(style,/grid-column:auto!important/);
 assert.doesNotMatch(style.slice(style.indexOf('/* Brandweer personnel profile:')),/grid-column:1 \/ -1/);
});

test('unlinked or broken fire patch is represented without changing a specialty',()=>{
 assert.match(organogram,/person-profile-specialty-missing-patch','Patch niet gekoppeld'/);
 assert.match(organogram,/fireBadge\.addEventListener\('error'/);
 assert.match(organogram,/fireBadge\.replaceWith\(missingPatch\(\)\)/);
 assert.match(style,/\.person-profile-specialty-missing-patch\{/);
 assert.match(style,/border:1px dashed/);
});

test('real Brandweer badges maintain natural proportions and fit two-column cards',()=>{
 assert.match(style,/aspect-ratio:auto!important/);
 assert.match(style,/aspect-ratio:288 \/ 134!important/);
 assert.match(style,/object-fit:contain!important/);
 assert.match(style,/height:auto!important/);
 assert.match(style,/width:min\(150px,100%\)!important/);
 assert.match(style,/@media\(max-width:700px\)/);
 assert.match(organogram,/fireSpecialtyPatchUrl\(name\)/);
});

test('other services, access, awards and role labels remain intact',()=>{
 assert.match(organogram,/dialog\.classList\.toggle\('police-person-profile',p\.dept==='politie'\)/);
 assert.match(organogram,/normalizeSpecialtyBadges\(item\)/);
 assert.match(organogram,/p\.dept==='politie'&&name==='K9'/);
 assert.match(organogram,/person-profile-specialty-fire-diver/);
 assert.match(organogram,/BPDDecorations\?\.renderAwards/);
 assert.match(management,/BPDDecorations\?\.manager/);
});
