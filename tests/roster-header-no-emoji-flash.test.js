import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('directory uses only official patch or text label, never old temporary emoji fallback',()=>{
 const roster=read('public/member-police-roster.js');
 assert.match(roster,/classList\?\.contains\('roster-personnel-page'\)/);
 assert.match(roster,/if\(!directory\)\{\s*const pic=element\('span'/);
 assert.match(roster,/th\.append\(element\('small',rosterHeaderLabel\(label\)\)\)/);
 assert.match(roster,/img\.loading=directory\?'eager':'lazy'/);
 assert.match(roster,/img\.onerror=\(\)=>fallback\(\)/);
});
test('unchanged table headers are reused on searching/filtering instead of recreated',()=>{
 const roster=read('public/member-police-roster.js');
 assert.match(roster,/const signature=JSON\.stringify\(\[directory,headers\]\)/);
 assert.match(roster,/if\(thead\.dataset\.artworkSignature===signature&&thead\.rows\.length===1\)return/);
 assert.match(roster,/thead\.dataset\.artworkSignature=signature/);
 assert.match(roster,/thead\.replaceChildren\(tr\)/);
});
test('independent optional restrictions and patch manifest load in parallel and degrade safely',()=>{
 const page=read('public/personeelslijst.html');
 assert.match(page,/const \[restrictions,artwork\]=await Promise\.all\(\[/);
 assert.match(page,/\/api\/siv-training-restrictions/);
 assert.match(page,/\/api\/role-artwork\/manifest/);
 assert.match(page,/\.catch\(\(\)=>null\)/);
 assert.match(page,/setArtworkManifest\?\.\(artwork\?\.artworks\|\|\[\]\)/);
 assert.ok(page.indexOf('setArtworkManifest?.(artwork?.artworks||[])')<page.indexOf('  searchDirectory();'));
});
