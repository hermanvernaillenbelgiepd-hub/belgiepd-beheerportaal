import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('public/beeldbibliotheek.html');
const style=read('public/organogram-hybrid.css');
const routes=read('src/organogram-placement-routes.js');
const roleRoutes=read('src/specialty-role-link-routes.js');

test('library role selection maps exactly one known Discord role to the chosen specialty',()=>{
 assert.match(ui,/id="linkSpecialty"/);
 assert.match(ui,/id="linkKnownRoles"/);
 assert.match(ui,/specialtyConfig\.roles\?\.some\(x=>x\.id===roleId\)/);
 assert.match(ui,/specialtyConfig\.labels\?\.includes\(specialtyLabel\)/);
 assert.match(ui,/specialtyConfig\?\.canEdit/);
 assert.match(ui,/expectedRevision:specialtyConfig\.revision/);
 const registry=ui.indexOf("await api('/api/specialty-links/'+encodeURIComponent(item.department),'PUT'");
 const imagePointer=ui.indexOf("await api('/api/role-artwork/link','PUT'");
 assert.ok(registry>0&&imagePointer>registry,'approved role-to-specialty map must save before image alias');
 assert.match(ui,/confirm\('Er bestaat al een andere koppeling/);
 assert.match(ui,/Bestaande rechten blijven ongewijzigd/);
 const m=ui.match(/<script type="module">([\s\S]*?)<\/script>/);
 assert.ok(m);
 assert.doesNotThrow(()=>new Function(m[1].replace(/^import .*;$/gm,'')));
});

test('verified Discord evidence, never user-supplied roles, connects badges to staff',()=>{
 assert.match(routes,/const verified=new Set\(liveAE\.has\(p\.personId\)/);
 assert.match(routes,/verified\.has\(x\.roleId\)/);
 assert.match(routes,/assetUrls\.get\(x\.assetKey\)/);
 assert.match(routes,/for\(const link of specialtyPatches\)/);
 assert.match(roleRoutes,/!allowedRoles\.has\(roleId\)/);
 assert.match(roleRoutes,/SPECIALTY_ROLE_LINK_AUDIT/);
 assert.match(roleRoutes,/discordRolesChanged:false/);
});

test('fire specialty badges stay crisp, compact, centered and uncropped',()=>{
 assert.match(style,/min-height:100px!important/);
 assert.match(style,/grid-template-columns:minmax\(0,150px\) minmax\(0,200px\)!important/);
 assert.match(style,/justify-content:center!important/);
 assert.match(style,/width:min\(185px,100%\)!important/);
 assert.match(style,/max-height:88px!important/);
 assert.match(style,/aspect-ratio:auto!important/);
 assert.match(style,/object-fit:contain!important/);
});
