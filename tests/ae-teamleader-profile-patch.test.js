import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const html=readFileSync(new URL('../public/organogram-hierarchie.html',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');
const image=readFileSync(new URL('../public/uniform-assignment-display.js',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||'';

test('authorized officer can fix AE Teamleader directly from a selected profile without changing unrelated specialties',()=>{
 assert.match(api,/app\.put\('\/api\/organogram\/ae-display\/:call',requireUser/);
 const section=api.split("app.put('/api/organogram/ae-display/:call'")[1]?.split('// K9 role editing')[0]||'';
 assert.match(section,/if\(!canEditK9Display\(req\.bpd\)\)/);
 assert.match(section,/candidates\.length!==1/);
 assert.match(section,/collection\(AE_MANUAL_DISPLAY_COLLECTION\)/);
 assert.match(section,/tx\.create\(ref\.collection\('audit'\)/);
 assert.match(section,/accessRightsChanged:false/);
 assert.doesNotMatch(section,/roleIds\s*:/);
 assert.match(html,/state\.canManageAE=payload\.canManageAE===true/);
 assert.match(html,/if\(p\.dept==='politie'&&!state\.demo&&state\.canManageAE\)/);
 assert.match(html,/TEAMLEADER \/ LEIDING/);
 assert.match(html,/api\/organogram\/ae-display\//);
 assert.match(html,/profileSpecialtyChecks\.delete\(profileKey\)/);
});

test('verified or manually saved AE level selects its own patch, never unrelated AE member badge',()=>{
 assert.match(api,/const displayAE=merged\.aeRole\|\|''/);
 assert.match(api,/merged\.aeManual===displayAE\|\|verified\.has\(x\.roleId\)/);
 assert.match(api,/!\(displayAE&&normalizedLabel\(x\.label\)==='AE'\)/);
 assert.match(html,/const aeSpecific=name==='AE'&&Object\.hasOwn\(aeRoleIds,functionVariant\)/);
 assert.match(html,/specialtyVariantImage\?\.\(p,name,functionVariant\)/);
 assert.match(html,/ae-level-text-patch/);
 assert.match(image,/function specialtyImage\(p,name,variant='',strictVariant=false\)/);
 assert.match(image,/strictVariant\?\(suffix\?/);
 assert.match(image,/specialtyVariantImage:/);
 assert.doesNotThrow(()=>new Script(script.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*/gm,'')));
});
