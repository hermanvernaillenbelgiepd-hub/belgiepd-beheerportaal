import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../public/gebruikersbeheer.html',import.meta.url),'utf8');
const composer=readFileSync(new URL('../public/uniform-composer-ui.js',import.meta.url),'utf8');
const artwork=readFileSync(new URL('../public/role-artwork-ui.js',import.meta.url),'utf8');
const roster=readFileSync(new URL('../public/uniform-assignment-display.js',import.meta.url),'utf8');

test('only modern uniform atelier is visible; old panels cannot be opened',()=>{
 const studio=page.indexOf('id="uniformComposer"');
 const hidden=page.indexOf('<div id="retiredUniformManagement" hidden inert aria-hidden="true">');
 const retiredEnd=page.indexOf('\n</div>\n</section>\n</main>',hidden);
 assert.ok(studio>0&&studio<hidden&&retiredEnd>hidden);
 assert.match(page,/#retiredUniformManagement\[hidden\]/);
 for(const id of ['uniformQuickSection','uniformPreviewFrame','uniformAssignDept',
  'libraryAssignmentPanel','visualLayerControls']){
  const i=page.indexOf('id="'+id+'"');
  assert.ok(i>hidden&&i<retiredEnd,id+' must be hidden inside retired admin');
 }
 assert.match(page,/id="composeSave"/);
 assert.match(page,/id="composeUploadLink"/);
 assert.match(composer,/api\/uniform-compositions/);
 assert.match(composer,/api\/role-artwork\/manage/);
});

test('retired editor API fetches are not executed at page load',()=>{
 assert.doesNotMatch(page,/await uniformQuick\.load\(\)/);
 assert.doesNotMatch(page,/await uniformManagement\.load\(\)/);
 assert.doesNotMatch(page,/await visualLayerManagement\.load\(\)/);
 assert.doesNotMatch(page,/await uniformAssignments\.load\(\)/);
 assert.match(page,/await uniformComposer\.load\(\)/);
 assert.match(composer,/\$\('uniformSection'\)\.dataset\.authorized=visibleDepts\.length\?'yes':'no'/);
});

test('roles and specialization icons remain editable but old grade galleries are hidden',()=>{
 const kindStart=page.indexOf('<select id="roleArtworkKind">');
 const kindEnd=page.indexOf('</select>',kindStart);
 const choices=page.slice(kindStart,kindEnd);
 assert.ok(kindStart>0&&kindEnd>kindStart);
 for(const code of ['role','specialty','logo','pictogram','patch'])
  assert.match(choices,new RegExp('value="'+code+'"'));
 for(const code of ['uniform','rank','medal','helmet','profession','award'])
  assert.doesNotMatch(choices,new RegExp('value="'+code+'"'));
 assert.match(artwork,/visibleKinds=new Set\(\['role','specialty','logo','pictogram','patch'\]\)/);
 assert.match(artwork,/row\.kind===kindSelect\.value/);
});

test('existing individual mappings and rank artwork remain in the underlying display resolver',()=>{
 assert.match(roster,/elementRules/);
 assert.match(roster,/coatChoices/);
 assert.match(roster,/assetUrls/);
 assert.match(roster,/compositions/);
});
