import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('politiepersoneelslijst toont de specialisatienaam onder een afbeelding',()=>{
 const html=file('public/personeelsbeheer.html');
 const member=file('public/member-police-roster.js');
 const styles=file('public/member-police-roster.css');
 assert.match(html,/specialty-col-head--patch/);
 assert.match(html,/th\.append\(name\)|th\.append\(image,name\)/);
 assert.match(styles,/mr-specialty-head--patch>small/);
 assert.match(member,/element\('small',label\)/);
});

test('een patch kan per bestaande specialisatie geaudit worden bewaard',()=>{
 const html=file('public/personeelsbeheer.html');
 for(const id of ['rosterPatchSpecialty','rosterPatchImage','rosterPatchReason','rosterPatchSave']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/function rosterPatchSave\(\)/);
 assert.match(html,/kind:'patch',department:dept,code:BPDPersonnelVisuals\.specialtyArtworkCode\(label\)/);
 assert.match(html,/\/api\/role-artwork\/personnel/);
 assert.match(html,/rosterPatchShowCurrent\(\)/);
 assert.match(html,/BPDPersonnelVisuals\.setArtworkManifest\(manifest\.artworks\)/);
 assert.match(html,/file\.size>140\*1024/);
});

test('de bibliotheekpatch kan de gewone badge vervangen zonder rollenwijziging',()=>{
 const visuals=file('public/personnel-list-visuals.js');
 assert.match(visuals,/artwork\('patch',dept,/);
 assert.match(visuals,/specialtyBannerImage/);
 assert.match(visuals,/setArtworkManifest/);
 assert.doesNotMatch(file('public/personeelsbeheer.html'),/rosterPatchSave[\s\S]{0,2600}\/api\/discord\/roles\/grant/);
});

test('de bestaande inline personeelsbeheer-scripts blijven syntactisch geldig',()=>{
 const html=file('public/personeelsbeheer.html');
 const scripts=[...html.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)];
 assert.ok(scripts.length>0);
 for(const [,source] of scripts){
  assert.doesNotThrow(()=>new Script(source.replace(/^import [^\n]*\n/gm,'')));
 }
});
