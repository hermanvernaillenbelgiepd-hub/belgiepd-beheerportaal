import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {policeCallSeries,policeUniformGroup,ambulanceFunction,normalizeVisual}
 from '../public/uniform-profile-policy.js';

test('police 300–600 can share one coat but have distinct insignia',()=>{
 const expected=[['S302','300'],['SANTO-400','400'],['501','500'],['SANTO 600','600']];
 for(const [call,series] of expected){
  assert.equal(policeCallSeries(call),series);
  assert.equal(policeUniformGroup({dept:'politie',call}),'basis_tm_ahinp');
 }
 assert.equal(policeUniformGroup({dept:'politie',call:'200'}),'agentenkader');
 assert.equal(policeUniformGroup({dept:'politie',call:'700'}),'hinp_1hinp');
});
test('fire insignia can use rank names independently of callsigns',()=>{
 assert.equal(normalizeVisual('Aspirant Hoofdinspecteur'),'aspirant_hoofdinspecteur');
 assert.equal(normalizeVisual('Zonecommandant'),'zonecommandant');
});
test('ambulance maps professional insignia to the role, not the coat',()=>{
 const examples=[['AMB-01','ambulancier'],['VPK-03','vpk'],
  ['ARTS-03','arts'],['DIRMED-01','dirmed']];
 for(const [call,role] of examples)
  assert.equal(ambulanceFunction({dept:'ambulance',call}),role);
});
test('one simple editor replaces repeated manual art-to-coat linking',()=>{
 const html=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
 const quick=readFileSync(new URL('../public/uniform-quick-ui.js',import.meta.url),'utf8');
 const display=readFileSync(new URL('../public/uniform-assignment-display.js',import.meta.url),'utf8');
 const layers=readFileSync(new URL('../public/visual-layers-render.js',import.meta.url),'utf8');
 assert.match(html,/id="uniformQuickSection"/);
 assert.match(html,/setupUniformQuickUI/);
 assert.match(html,/Geavanceerd: handmatige graad/);
 assert.match(quick,/getUniformTargets\(/);
 assert.match(quick,/getMarkTargets\(/);
 assert.match(quick,/openUploader\(/);
 assert.match(display,/matching group or medical function/);
 assert.match(layers,/One sensible initial placement/);
});
