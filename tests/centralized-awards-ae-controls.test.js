import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const card=page('organogram-hierarchie.html');
const library=page('beeldbibliotheek.html');
const management=page('beheercentrum.html');
const tools=page('assets/organogram-decorations.js');
const server=readFileSync(new URL('../src/organogram-placement-routes.js',import.meta.url),'utf8');

test('read-only personnel cards display decorations without catalog or AE correction controls',()=>{
 assert.match(card,/BPDDecorations\?\.renderAwards\?\./);
 assert.doesNotMatch(card,/BPDDecorations\?\.uploadTools\?\./);
 assert.doesNotMatch(card,/BPDDecorations\?\.manager\?\./);
 assert.doesNotMatch(card,/AE-functieniveau corrigeren · Officierenkader/);
});
test('award catalogue can be managed in the image library with independent authorization',()=>{
 assert.match(library,/id="onderscheidingen" hidden/);
 assert.match(library,/\/api\/personnel-awards\/catalog-access/);
 assert.match(library,/BPDDecorations\?\.uploadTools\?\./);
 assert.match(tools,/if\(!access\.canRename\)return/);
 assert.match(tools,/\/api\/personnel-awards\/catalog-upload/);
 assert.match(tools,/\/api\/personnel-awards\/catalog-label\//);
});
test('award grants and AE corrections move into central management and retain server-side checks',()=>{
 assert.match(management,/id="awardManage"[^>]*hidden/);
 assert.match(management,/id="ae-beheer"[^>]*hidden/);
 assert.match(management,/data\.canManageAE!==true/);
 assert.match(management,/BPDDecorations\?\.manager\?\./);
 assert.match(management,/\/api\/organogram\/ae-display\//);
 assert.match(server,/app\.put\('\/api\/organogram\/ae-display\/:call',requireUser/);
 assert.match(server,/if\(!canEditK9Display\(req\.bpd\)\)/);
});
