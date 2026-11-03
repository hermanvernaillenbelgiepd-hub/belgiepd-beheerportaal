import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEPANNAGE_FUNCTIONS,depannageFunction,displaySelectors} from '../public/uniform-profile-policy.js';
import {validateComposition} from '../src/uniform-composition-routes.js';
import {validateUniformAssignment,resolveUniformAssignment} from '../src/uniform-assignment-routes.js';

const layers=()=>Object.fromEntries(['name','rank','ribbons','medals','helmet','profession','logo']
 .map(kind=>[kind,{left:20,top:40,width:20,height:12,visible:true}]));
const compose=selector=>({department:'depannage',scope:'function',selector,
 assets:{uniform:'takeljas',rank:'',helmet:'',profession:'',logo:''},
 layers:layers(),reason:'Uniform per depannagefunctie instellen'});

test('AWV, LSRA and FAST use distinct stable uniform functions',()=>{
 assert.deepEqual(DEPANNAGE_FUNCTIONS.map(([code])=>code),['awv','lsra','fast']);
 for(const [call,expected] of [
  ['AWV-01','awv'],['ANWV-02','awv'],['LSRA-01','lsra'],
  ['LRSA-02','lsra'],['FAST-07','fast'],['F.A.S.T.-02','fast'],
  ['DEPK-09','lsra']
 ])assert.equal(depannageFunction({dept:'depannage',call,rank:'—'}),expected,call);
 assert.equal(depannageFunction({dept:'politie',call:'AWV-01'}),'');
});
test('Verified service function overrides stale calls; crane never selects a coat',()=>{
 assert.equal(depannageFunction({dept:'depannage',call:'LSRA-15',verifiedFunction:'leiding'}),'awv');
 assert.equal(depannageFunction({dept:'depannage',call:'LSRA-15',verifiedFunction:'fast'}),'fast');
 assert.equal(depannageFunction({dept:'depannage',rank:'CRANE',specialties:['CRANE']}),'lsra');
 assert.deepEqual(displaySelectors({dept:'depannage',call:'LSRA-15',rank:'CRANE'})[0],
  ['function','lsra']);
});
test('All towing function templates save securely; CRANE is not a function',()=>{
 for(const selector of ['awv','lsra','fast']){
  assert.equal(validateComposition(compose(selector)).key,'depannage__function__'+selector);
  assert.equal(validateUniformAssignment({department:'depannage',scope:'function',selector,
   uniformCode:'takeljas',badgeStyle:'',reason:'Uniform per functie instellen'}).selector,selector);
 }
 assert.throws(()=>validateComposition(compose('crane')),/Kies een geldige/);
 assert.throws(()=>validateUniformAssignment({department:'depannage',scope:'function',
  selector:'crane',uniformCode:'takeljas',badgeStyle:'',reason:'Uniform per functie instellen'}),/Ongeldige/);
 assert.equal(validateComposition({...compose('lsra'),scope:'rank'}).key,'depannage__rank__lsra');
});
test('Towing uniform selection honors verified function without altering personnel roles',()=>{
 const rules=['awv','lsra','fast'].map(selector=>({
  department:'depannage',scope:'function',selector,uniformCode:selector+'_jas',badgeStyle:''
 }));
 assert.equal(resolveUniformAssignment({dept:'depannage',call:'LSRA-08'},rules).uniformCode,'lsra_jas');
 assert.equal(resolveUniformAssignment({dept:'depannage',call:'LSRA-08',verifiedFunction:'fast'},rules).uniformCode,'fast_jas');
 assert.equal(resolveUniformAssignment({dept:'depannage',call:'LSRA-08',verifiedFunction:'leiding'},rules).uniformCode,'awv_jas');
 assert.equal(resolveUniformAssignment({dept:'depannage',specialties:['CRANE']},rules).uniformCode,'lsra_jas');
});
test('The active atelier and portrait renderer use the same function scope with legacy fallback',()=>{
 const ui=readFileSync(new URL('../public/uniform-composer-ui.js',import.meta.url),'utf8');
 const display=readFileSync(new URL('../public/uniform-assignment-display.js',import.meta.url),'utf8');
 assert.match(ui,/DEPANNAGE_FUNCTIONS\.map/);
 assert.match(ui,/depannageFunction\(p\)===grade\.value/);
 assert.match(display,/depannageFunction\(p\)/);
 assert.match(display,/previousTowingRanks/);
 assert.match(display,/compScope&&x\.selector===compSelector/);
});
