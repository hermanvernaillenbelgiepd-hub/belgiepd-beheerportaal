import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateUniformGradeChoice} from '../src/uniform-grade-routes.js';

const police=(extra={})=>({department:'politie',uniformCode:'basis_tm_ahinp',
 kind:'rank',scope:'call',selector:'400',assetCode:'inp',
 reason:'Gradenplaat voor basiskader instellen',...extra});
test('one uniform may have separate explicit visual grade art for each police call series',()=>{
 const a=validateUniformGradeChoice(police());
 const b=validateUniformGradeChoice(police({selector:'500',assetCode:'1inp'}));
 assert.notEqual(a.key,b.key);
 assert.equal(a.uniformCode,b.uniformCode);
 assert.equal(a.assetCode,'inp');
 assert.ok(!('personId' in a));
 assert.ok(!('permissions' in a));
});
test('same rank can use different images for two different uniforms',()=>{
 const a=validateUniformGradeChoice(police({uniformCode:'basis'}));
 const b=validateUniformGradeChoice(police({uniformCode:'ceremonieel'}));
 assert.notEqual(a.key,b.key);
 assert.equal(a.selector,b.selector);
});
test('fire helmet/rank and ambulance qualifications can be matched by uniform',()=>{
 const fire=validateUniformGradeChoice(police({department:'brandweer',
  uniformCode:'brandweer_bruin',kind:'helmet',scope:'rank',selector:'sergeant',
  assetCode:'helm_sergeant'}));
 assert.equal(fire.kind,'helmet');
 const ambulance=validateUniformGradeChoice(police({department:'ambulance',
  uniformCode:'jas_azls',kind:'profession',scope:'function',
  selector:'dirmed',assetCode:'dirmed_opschrift'}));
 assert.equal(ambulance.selector,'dirmed');
});
test('cross-service and unsupported grade scopes are rejected',()=>{
 assert.throws(()=>validateUniformGradeChoice(police({scope:'rank',selector:'inspecteur'})),/geldige/);
 assert.throws(()=>validateUniformGradeChoice(police({department:'ambulance'})),/geldige/);
 assert.throws(()=>validateUniformGradeChoice(police({uniformCode:'../fake'})),/geldige/);
 assert.throws(()=>validateUniformGradeChoice(police({selector:'650'})),/geldige/);
 assert.throws(()=>validateUniformGradeChoice(police({assetCode:'other/department'})),/geldige/);
 assert.throws(()=>validateUniformGradeChoice(police({reason:'kort'})),/Motivering/);
});
test('visual-only grade mapping is used in profiles and accessible illustrated galleries',()=>{
 const html=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/uniform-quick-ui.js',import.meta.url),'utf8');
 const resolver=readFileSync(new URL('../public/uniform-assignment-display.js',import.meta.url),'utf8');
 const portal=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
 assert.match(html,/uniform-grade-gallery/);
 assert.match(ui,/illustratedPicker/);
 assert.match(ui,/uniform-grade-coat/);
 assert.match(ui,/uniform-grade-choices/);
 assert.match(resolver,/coatChoices\.find/);
 assert.match(portal,/api\/uniform-grade-choices/);
 assert.match(ui,/!\\['silver','gold'\\]\.includes\(x.code\)/);
});
