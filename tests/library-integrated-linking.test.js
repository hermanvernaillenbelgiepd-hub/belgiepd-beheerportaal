import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ui=read('public/beeldbibliotheek.html');
const roles=read('src/role-artwork-routes.js');
const rules=read('src/uniform-library-routes.js');

test('bibliotheek offers an integrated visual-only assign step',()=>{
 for(const id of ['linkAsset','linkRankEnabled','linkRoleEnabled','linkRoleId',
  'linkVariant','linkReason','linkSave','linkOverview','linkPreview']){
  assert.ok(ui.includes('id="'+id+'"'),id);
 }
 assert.match(ui,/api\('\/api\/uniform-library\/rules','PUT'/);
 assert.match(ui,/api\('\/api\/role-artwork\/link','PUT'/);
 assert.match(ui,/drawLinkAssets\(uploadedKey\)/);
 assert.match(ui,/Geen personeels- of Discord-rechten gewijzigd/);
 assert.match(ui,/confirm\('Er bestaat al een andere koppeling/);
 assert.match(ui,/RANK_LINK_KINDS/);
 assert.match(ui,/RANK_LINK_KINDS=new Set\(\[[^\n]*'specialty'\]\)/);
 assert.match(ui,/id="linkRankChoice"/);
 assert.match(ui,/id="linkRank"/);
 assert.match(ui,/ROLE_LINK_KINDS/);
});
test('a role asset resolves to the current original, without a second upload',()=>{
 assert.match(roles,/app\.put\('\/api\/role-artwork\/link'/);
 assert.match(roles,/sourceArtworkKey/);
 assert.match(roles,/sourceMeta=linked;sourceKey=linkedKey/);
 assert.match(roles,/sourceMeta\.get\('storagePath'\)/);
 assert.match(roles,/asset\.get\('key'\)!==sourceKey/);
 assert.match(roles,/linked\.get\('department'\)!==meta\.get\('department'\)/);
 assert.match(roles,/linked\.get\('active'\)!==true/);
 assert.match(roles,/permissionsChanged:false/);
 assert.match(roles,/link_existing_artwork/);
});
test('rank assignment still requires a real asset from the same department',()=>{
 assert.match(rules,/app\.put\('\/api\/uniform-library\/rules'/);
 assert.match(rules,/asset\.get\('department'\)!==input\.department/);
 assert.match(rules,/UNIFORM_LIBRARY_RULE_AUDIT/);
});
test('module script parses without external dependencies',()=>{
 const source=ui.match(/<script type="module">([\s\S]*?)<\/script>/);
 assert.ok(source);
 assert.doesNotThrow(()=>new Function(source[1].replace(/^import .*;$/gm,'')));
});

test('one uploaded specialty image can be linked with or without a Discord role',()=>{
 assert.match(ui,/Koppelen aan specialisatie \(Discord-rol optioneel\)/);
 assert.match(ui,/\(roleId&&!specialtyConfig\.roles\?\.some/);
 assert.match(ui,/\(roleId&&!\/\^\\d\{15,22\}\$\/\.test\(roleId\)\)/);
 assert.match(ui,/if\(roleId&&!sharedFire\)\{/);
 assert.match(ui,/\(!roleId\|\|sharedFire\)&&x\.label!==specialtyLabel/);
 assert.match(ui,/\$\('linkRoleEnabled'\)\.checked=true/);
 assert.match(ui,/\$\('linkAsset'\)\.value===uploadedKey/);
 assert.match(ui,/x\.assetKey===item\.key/);
});
