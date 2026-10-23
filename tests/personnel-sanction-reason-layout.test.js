import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {SANCTION_REASONS,validateEntry} from '../src/registrations.js';
const ui=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/personnel-onepage-test.css',import.meta.url),'utf8');
test('Alle sanctieredenen blijven identiek aan de opgeslagen officiële waarden',()=>{
 const start=ui.indexOf('const sanctionReasonGroups=[');
 const stop=ui.indexOf('function renderSanctionReasonChoices(',start);
 assert.ok(start>=0&&stop>start);
 const literal=ui.slice(start,stop);
 for(const reason of SANCTION_REASONS)
   assert.ok(literal.includes("'"+reason+"'"),'Onbekende of ontbrekende sanctiereden: '+reason);
 assert.match(ui,/input\.type='checkbox';input\.value=value/);
 assert.match(ui,/function formalSelectedReasons\(/);
 assert.match(ui,/formalSelectedReasons\(\)/);
 const valid={
  type:'sanctie',details:'Test reden',eventDate:'2026-10-23',eventTime:'12:30',
  otherPlayers:'',evidenceUrl:'',severity:5,sanctionType:'Mondelinge waarschuwing',
  reasons:['Radioprotocol','Onrechtmatig gebruik dienstspecifiek voertuig'],
  explanation:'',reasonOther:'',cfxName:''
 };
 assert.deepEqual(validateEntry(valid).reasons,valid.reasons);
});
test('Groepsnamen en toegankelijke, uniforme checkboxen zonder tekstbreuk',()=>{
 for(const label of ['Procedure & veiligheid','Onrechtmatig gebruik','Gedrag','Buiten bevoegdheid','Integriteit','Overig'])
  assert.ok(ui.includes("title:'"+label+"'"),label);
 assert.match(ui,/id="formalReasons" class="formal-reasons" role="group"/);
 assert.match(ui,/id="sanctionReasonCount" aria-live="polite"/);
 assert.match(ui,/id="selectedSanctionReasons"/);
 assert.match(css,/#formalReasons\.formal-reasons\{/);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/max-width:17px!important/);
 assert.match(css,/flex:0 0 17px!important/);
 assert.match(ui,/\$\('formalOtherReasonField'\)\.hidden=!isSanction\|\|!other/);
 assert.match(css,/#formalOtherReasonField\[hidden\]/);
 const inline=ui.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(inline);
 assert.doesNotThrow(()=>new Script(inline.replace(/^import [^\n]*\n/gm,'')));
});
