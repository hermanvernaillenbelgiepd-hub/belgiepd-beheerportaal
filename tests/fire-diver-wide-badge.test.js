import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../public/'+p,import.meta.url));
const source=read('organogram-hierarchie.html').toString();
const styles=read('organogram-hybrid.css').toString();
const ui=read('role-artwork-ui.js').toString();

test('original Duiker badge remains original image and is never stretched',()=>{
 const image=read('assets/brandweer-duiker-origineel-20261102.webp');
 assert.equal(image.subarray(0,4).toString(),'RIFF');
 assert.equal(image.subarray(8,12).toString(),'WEBP');
 assert.match(source,/fireSpecialtyPatchUrl\(name\)/);
 assert.match(source,/person-profile-specialty-fire-diver/);
 assert.match(source,/badge\.width=isFireDiver\?288:170/);
 assert.match(source,/badge\.height=isFireDiver\?134:53/);
 assert.match(styles,/aspect-ratio:288 \/ 134!important/);
 assert.match(styles,/object-fit:contain!important/);
 assert.match(styles,/width:min\(150px,100%\)!important/);
 assert.match(styles,/max-height:78px!important/);
});

test('future Duiker uploads retain wide crop rather than square canvas',()=>{
 assert.match(ui,/roleArtworkCode.*duiker.*\[320,149\]/s);
 assert.match(ui,/configureCanvas\(\);/);
});
