import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Meldingen has exactly one global refresh button, no old per-panel refresh controls',()=>{
 const source=page('public/meldingen.html');
 assert.equal((source.match(/id="refreshAll"/g)||[]).length,1);
 assert.match(source,/\$\('refreshAll'\)\.onclick=load/);
 for(const id of ['staffFollowupReload','trainingReload','identityReviewReload','id="reload"']){
  assert.ok(!source.includes(id),'Obsolete refresh button: '+id);
 }
 assert.match(source,/async function loadLeave\(\)/);
 assert.match(source,/async function load\(\)/);
 assert.match(source,/Promise\.allSettled\(loaders\.map\(fn=>fn\(\)\)\)/);
 for(const fn of ['loadStaffActivityFollowup','loadActivityPings',
  'loadTraining','loadSeriesLeave','loadLeave'])
  assert.match(source,new RegExp('\\b'+fn+'\\b'));
 // The collapsed sections remain native and their open state is not reset.
 assert.match(source,/class="notification-fold"/);
 assert.doesNotMatch(source,/\.open\s*=\s*(true|false)/);
});
test('Global refresh remains protected against double taps and restores UI after completion',()=>{
 const source=page('public/meldingen.html');
 assert.match(source,/if\(refreshInFlight\)/);
 assert.match(source,/refreshRequestedAgain=true/);
 assert.match(source,/while\(refreshRequestedAgain\)/);
 assert.match(source,/button\.disabled=true/);
 assert.match(source,/button\.disabled=false/);
 assert.match(source,/refreshInFlight=refresh\(\)\.finally/);
 const script=source.slice(source.indexOf('<script type="module">')+22,
  source.indexOf('</script>',source.indexOf('<script type="module">')));
 const parsed=script.replace(/^import\s+\{[\s\S]*?\}\s+from\s+['"][^'"]+['"];?\s*/m,'');
 assert.doesNotThrow(()=>new Function(parsed));
});
test('Personnel movements group options visually and preserve all existing stored values',()=>{
 const source=page('public/personeelsbeheer.html');
 const start=source.indexOf('<select id="staffMovement">');
 const end=source.indexOf('</select>',start);
 assert.ok(start>=0&&end>start);
 const select=source.slice(start,end);
 for(const title of ['Rangwijzigingen','Maatregelen','Uitdiensttreding'])
  assert.ok(select.includes('<optgroup label="'+title+'">'));
 const values=[...select.matchAll(/<option value="([^"]*)"/g)].map(m=>m[1]);
 assert.deepEqual(values,['','Promotie','Degradatie','Schorsing',
  'Ontslag','Ontslag inactief','Vrijwillig']);
 assert.match(source,/const gradeMove=movement==='Promotie'\|\|movement==='Degradatie'/);
});
