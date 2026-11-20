import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('delegate sees only appearance; grants never become general management access',()=>{
 const html=read('public/beheercentrum.html');
 const ui=read('public/visual-design-grants-editor.js');
 assert.match(html,/if\(next.canEdit\)/);
 assert.match(html,/await visualDesignEditor.load\(\)/);
 assert.match(html,/de andere beheerschermen blijven afgesloten/);
 assert.match(ui,/action:'revoke'/);
 assert.match(ui,/action:'grant'/);
 assert.match(ui,/expectedRevision/);
 assert.match(ui,/visualGrantReason/);
});
