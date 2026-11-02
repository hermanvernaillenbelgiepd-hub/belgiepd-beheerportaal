import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8');
const organogram=read('organogram-hierarchie.html');
const style=read('organogram-hybrid.css');

test('fire specialties are visibly wide only when they actually have an image',()=>{
 assert.match(organogram,/if\(p\.dept==='brandweer'&&item\.querySelector\('img\.person-profile-specialty-badge'\)\)/);
 assert.match(organogram,/item\.classList\.add\('person-profile-specialty-fire-badged'\)/);
 assert.match(style,/\.person-profile-specialties \.person-profile-specialty\.person-profile-specialty-fire-badged\{/);
 assert.match(style,/grid-column:1 \/ -1/);
 assert.match(style,/grid-template-columns:minmax\(0,1fr\) minmax\(0,238px\)!important/);
});
test('fire patches preserve native size and readable layout across themes',()=>{
 assert.match(style,/aspect-ratio:auto!important/);
 assert.match(style,/object-fit:contain!important/);
 assert.match(style,/height:auto!important/);
 assert.match(style,/@media\(max-width:570px\)/);
 assert.match(style,/width:min\(230px,100%\)!important/);
 assert.match(organogram,/fireSpecialtyPatchUrl\(name\)/);
});
test('all other service specialty, access and award behavior is preserved',()=>{
 assert.match(organogram,/dialog\.classList\.toggle\('police-person-profile',p\.dept==='politie'\)/);
 assert.match(organogram,/normalizeSpecialtyBadges\(item\)/);
 assert.match(organogram,/p\.dept==='politie'&&name==='K9'/);
 assert.match(organogram,/person-profile-specialty-fire-diver/);
 assert.match(organogram,/BPDDecorations\?\.manager/);
});
