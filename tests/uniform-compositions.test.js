import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateComposition} from '../src/uniform-composition-routes.js';
const assets={uniform:'basisjas',rank:'inp',helmet:'',profession:'',logo:''};
const coordinates=()=>Object.fromEntries(
 ['name','rank','ribbons','medals','helmet','profession','logo']
 .map(k=>[k,{left:20,top:40,width:20,height:12,visible:true}]));
const compose=(other={})=>({department:'politie',scope:'call',selector:'400',
 assets,layers:coordinates(),reason:'Visuele uniformopmaak voor Inspecteur',...other});
test('one rank composition contains coat, grade and independent position settings',()=>{
 const data=validateComposition(compose());
 assert.equal(data.key,'politie__call__400');
 assert.equal(data.assets.uniform,'basisjas');
 assert.equal(data.assets.rank,'inp');
 assert.deepEqual(data.layers.name,coordinates().name);
 assert.equal(Object.hasOwn(data,'discordRoles'),false);
 assert.equal(Object.hasOwn(data,'awards'),false);
});
test('different call series may reuse the same uniform',()=>{
 const first=validateComposition(compose({selector:'300'}));
 const second=validateComposition(compose({selector:'600',assets:{...assets,rank:'ahinp'}}));
 assert.equal(first.assets.uniform,second.assets.uniform);
 assert.notEqual(first.key,second.key);
});
test('fire rank and ambulance profession are separate secure display identities',()=>{
 const fire=validateComposition(compose({department:'brandweer',scope:'rank',
  selector:'sergeant',assets:{...assets,rank:'sergeant'}}));
 const ambulance=validateComposition(compose({department:'ambulance',scope:'function',
  selector:'dirmed',assets:{...assets,rank:'',profession:'dirmed'}}));
 assert.equal(fire.key,'brandweer__rank__sergeant');
 assert.equal(ambulance.key,'ambulance__function__dirmed');
});
test('no permission, invalid rank or off-stage positioning can be saved',()=>{
 assert.throws(()=>validateComposition(compose({scope:'person'})),/graad/);
 assert.throws(()=>validateComposition(compose({selector:'650'})),/graad/);
 assert.throws(()=>validateComposition(compose({assets:{...assets,uniform:''}})),/basisuniform/);
 assert.throws(()=>validateComposition(compose({assets:{...assets,uniform:'../secret'}})),/code/);
 assert.throws(()=>validateComposition(compose({layers:{
  ...coordinates(),medals:{left:95,top:45,width:20,height:20,visible:true}}})),/binnen/);
 assert.throws(()=>validateComposition(compose({reason:'kort'})),/motivering/);
 assert.throws(()=>validateComposition({...compose(),isAdmin:true}),/Ongeldige/);
});
test('one-screen UI saves complete template without awarding medals',()=>{
 const ui=readFileSync(new URL('../public/uniform-composer-ui.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
 const police=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 const display=readFileSync(new URL('../public/uniform-assignment-display.js',import.meta.url),'utf8');
 const layers=readFileSync(new URL('../public/visual-layers-render.js',import.meta.url),'utf8');
 assert.match(ui,/api\/uniform-compositions/);
 assert.match(ui,/composeUploadSave/);
 assert.match(html,/id="uniformComposer"/);
 assert.match(html,/id="composePreview"/);
 assert.match(police,/applyCompositePlace\(rack\.medals/);
 assert.match(police,/applyCompositePlace\(plate,person,'name'/);
 assert.match(display,/visualLayout:composition/);
 assert.match(layers,/visualLayout\?\.\[layer\.kind\]/);
});
