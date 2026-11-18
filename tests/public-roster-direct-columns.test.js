import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {rosterConfig,validateRosterConfig} from '../src/roster-column-config.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('zichtbare originele personeelslijst ondersteunt iedere kolom rechtstreeks slepen',()=>{
 const html=source('public/personeelslijst.html');
 const js=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new Script(js.replace(/^import [^\n]*\n/gm,'')));
 for(const marker of ['id="publicRosterColumnToolbar"',
  'id="publicRosterColumnSave"','id="publicRosterColumnCancel"',
  'renderRosterColumnHandles()','rosterColumnLoad(token)',
  'rosterColumnDescriptors()','setPointerCapture(pointer)',
  'data.canEdit===true',"'/api/roster-columns/politie'"])
  assert.ok(html.includes(marker),marker);
 assert.match(html,/white-space:nowrap!important;word-break:keep-all!important/);
 assert.match(html,/rosterColumnSettings.specialtyWidths\[item.specialty\]/);
 assert.match(html,/expectedRevision:rosterColumnOriginal.revision/);
 assert.match(html,/auth\?\.currentUser\?\.uid\?\.startsWith\('discord:'\)/);
});

test('alle kolombreedtes inclusief publieke interventie en LRD worden veilig gevalideerd',()=>{
 const saved=rosterConfig(null);
 const request={expectedRevision:0,widths:saved.widths,
  fontFamily:saved.fontFamily,fontSize:saved.fontSize,
  customSpecialties:[],
  specialtyWidths:{'INTERVENTIEDIENST':106,'LRD (Recherche)':92}};
 const result=validateRosterConfig(request,'politie');
 assert.equal(result.specialtyWidths.INTERVENTIEDIENST,106);
 assert.equal(result.specialtyWidths['LRD (Recherche)'],92);
 assert.throws(()=>validateRosterConfig({...request,
  specialtyWidths:{'UNKNOWN_FIELD':80}},'politie'));
});
