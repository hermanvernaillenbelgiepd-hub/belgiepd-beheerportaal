import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
const center=readFileSync(new URL('../public/dossiercentrum.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/personnel-onepage-test.css',import.meta.url),'utf8');

test('TEST: dossierblad gebruikt volledige breedte ook vanuit Dossiercentrum',()=>{
 assert.match(center,/body\.dossier-wide main\{max-width:none/);
 assert.match(center,/document\.body\.classList\.add\('dossier-wide'\)/);
 assert.match(center,/document\.body\.classList\.remove\('dossier-wide'\)/);
 assert.match(css,/body\.dossier-onepage main\{max-width:none!important;width:100%/);
 for(const source of [html,center]){
   let code=source.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
   assert.ok(code);
   code=code.replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];\s*/,'');
   assert.doesNotThrow(()=>new Script(code));
 }
});
test('TEST: bestaande geautoriseerde formulieren staan direct in eigen rubriek, zonder dubbele opslag',()=>{
 for(const [tile,form] of [
   ['gegevens','staffProfileForm'],['gegevens','editForm'],
   ['specialisaties','specialtyEdit'],['leave','staffManualLeaveForm'],
   ['training','staffTrainingForm'],['notes','staffCaseForm'],
   ['movements','promotionPanel']
 ]){
   assert.match(html,new RegExp("\\['"+tile+"','"+form+"'\\]"));
   assert.equal([...html.matchAll(new RegExp('id="'+form+'"','g'))].length,1);
 }
 assert.match(html,/\$\('formalInlineArea'\)\.append\(\$\('formalWriteStatus'\),\$\('staffFormalForm'\)\)/);
 assert.match(html,/if\(canObs\|\|canSan\)\{\s*clearFormalEdit\(\);\s*\$\('staffFormalForm'\)\.hidden=false/);
 assert.match(html,/staffDossierCanMaintain=result\.canMaintain===true/);
 assert.match(html,/trainingWritesEnabled===true/);
 assert.match(html,/casePermissions=overview/);
 assert.match(html,/manualLeave!==true/);
 assert.match(html,/formalPermissions\?\.writesEnabled/);
 assert.match(html,/staffCaseForm'\)\.onsubmit=async/);
 assert.match(html,/staffFormalForm'\)\.onsubmit=async/);
 assert.match(css,/#staffFormalForm/);
 assert.match(css,/\.landscape-cell form\[hidden\]/);
});
