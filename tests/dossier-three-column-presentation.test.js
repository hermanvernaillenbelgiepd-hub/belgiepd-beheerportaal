import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('referenced three-column stylesheet exists and is loaded after older dossier CSS',()=>{
 const html=file('public/personeelsbeheer.html'),css=file('public/dossier-three-column.css');
 const ref='/dossier-three-column.css?v=20261123-restored';
 assert.ok(html.includes(ref));
 assert.ok(html.indexOf('/bpd-dossier-shared.css')<html.indexOf(ref));
 assert.ok(html.indexOf('/dossier-identity-polish.css')<html.indexOf(ref));
 assert.ok(file('public/brandweerdossier.html').includes(ref),'Fire also loads the restored stylesheet');
 assert.ok(css.length>2000);
});
test('exact dossier composition uses three readable columns without losing categories',()=>{
 const html=file('public/personeelsbeheer.html'),css=file('public/dossier-three-column.css');
 assert.match(html,/className='dossier-three-column'/);
 for(const [column,categories] of Object.entries({
  left:['leave','basisNotes'],middle:['notes','observations'],
  right:['movements','activityPings','sanctions','training']
 })){
  const exact="makeColumn('"+column+"',["+categories.map(x=>"'"+x+"'").join(',')+"])";
  assert.ok(html.includes(exact),column+' still has all dossier sections');
 }
 assert.match(css,/\.dossier-three-column\{/);
 const fire=file('public/brandweerdossier.html');
 assert.match(fire,/column\('right',\['movements','sanctions','promotions','training'\]\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1\.12fr\) minmax\(0,1\.12fr\)!important/);
 assert.match(css,/\.dossier-column>.landscape-cell/);
 assert.match(css,/align-items:start/);
 assert.doesNotMatch(html,/summaryGrid\.replaceChildren\(overview,extra\)/);
});
test('specialties occupy their own full-width row instead of a one-sixth-width sidebar',()=>{
 const css=file('public/dossier-three-column.css');
 assert.match(css,/\.dossier-header-specialties\{\s*grid-column:1\/-1/);
 assert.match(css,/\.dossier-header-specialties>\.landscape-cell\{/);
 assert.match(css,/\.sheet-specialties\{/);
 assert.match(css,/flex-wrap:wrap!important/);
});
test('mobile, light and dark, readability and keyboard navigation are preserved',()=>{
 const css=file('public/dossier-three-column.css');
 assert.match(css,/@media\(max-width:1320px\)/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/@media\(max-width:510px\)/);
 assert.match(css,/html:not\(\[data-bpd-theme="dark"\]\)/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/font-size:14px!important/);
 assert.match(css,/\.bpd-observation-disclosure/);
});
test('no new mutating API, no direct dossier record changes',()=>{
 const css=file('public/dossier-three-column.css');
 assert.doesNotMatch(css,/fetch\(|\/api\/|Firestore|onClick=/i);
 const html=file('public/personeelsbeheer.html');
 assert.match(html,/summaryGrid\.replaceChildren\(overview\)/);
 assert.match(html,/registerActivityPingQuick/);
 assert.match(html,/registerImportantNoteQuick/);
 assert.match(html,/id="registrationSubmit"/);
});
