import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(new URL('../public/'+x,import.meta.url),'utf8');
const org=read('organogram-hierarchie.html'),css=read('organogram-hybrid.css');
test('light organogram cards have clear contrast and responsive grid',()=>{
 assert.match(css,/background:#f3f7fc!important/);
 assert.match(css,/color:#526b89!important/);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(260px,1fr\)\)/);
});
test('profile layout stays proportional and preserves patches',()=>{
 assert.match(css,/grid-template-columns:minmax\(0,2fr\) minmax\(0,3fr\)!important/);
 assert.match(css,/aspect-ratio:198\/226/);
 assert.match(css,/height:auto!important/);
 assert.match(css,/person-profile-specialty-has-badge/);
 assert.doesNotMatch(css,/object-fit:cover/);
 assert.match(org,/person-profile-inline-call/);
});
test('existing officer actions are grouped, server authorization unchanged',()=>{
 assert.match(org,/managementBody\.append\(awardManager\)/);
 assert.match(org,/managementBody\.append\(uploadBox\)/);
 assert.match(org,/managementBody\.append\(editor\)/);
 assert.match(org,/BPDDecorations\?\.manager/);
 assert.match(org,/\/api\/organogram\/ae-display\//);
});
