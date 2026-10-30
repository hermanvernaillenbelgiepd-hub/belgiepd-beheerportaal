import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');

test('both legacy and uploaded police coats zoom the shared uniform scene',()=>{
 assert.match(src,/function applyUniformCoatPlacement\(node,variant,stage=null\)/);
 assert.match(src,/if\(stage\)\{\s*stage\.style\.transform=/);
 assert.match(src,/stage\.style\.transform='translate\(-50%,-50%\) translate\('/);
 assert.match(src,/node\.style\.transform='';/);
 assert.match(src,/applyUniformCoatPlacement\(img,'gold',stage\)/);
 assert.match(src,/applyUniformCoatPlacement\(image,'silver',stage\)/);
 assert.doesNotMatch(src,/if\(assigned&&stage\)/);
 assert.doesNotMatch(src,/applyUniformCoatPlacement\((?:img|image),'(?:gold|silver)',stage,Boolean\(individual/);
});

test('name, grade, ribbons, medals and coat stay children of same shared stage',()=>{
 for(const [name,kind] of [
  ['plate','name'],['chest','rank'],['nameplate','name'],['patch','rank']]){
  assert.match(src,new RegExp('applyCompositePlace\\('+name+",person,'"+kind+"'\\)"));
  assert.match(src,new RegExp('stage\\.append\\('+name+'\\)'));
 }
 assert.match(src,/stage\.append\(img\)/);
 assert.match(src,/stage\.append\(image\)/);
 assert.match(src,/stage\.append\(rack\.medals\)/);
 assert.match(src,/stage\.append\(rack\.ribbons\)/);
 assert.match(css,/\.bpd-gold-stage>.bpd-chest-insignia/);
 assert.match(css,/\.bpd-gold-stage>.bpd-personal-nameplate/);
});
