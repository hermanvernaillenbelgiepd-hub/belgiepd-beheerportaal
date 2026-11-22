import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('Politie en diensthoofding houden de DC-ID en Discord-ping knoppen bij elkaar',()=>{
 const cases=[
  ['public/personeelsbeheer.html','sheetDiscordId','sheetCopyDcId','sheetCopyDiscordPing','sheetCopyFeedback','copyHeaderValue'],
  ['public/brandweerdossier.html','discord','fireCopyDcId','fireCopyDiscordPing','fireCopyFeedback','copyFireHeader'],
 ];
 for(const [path,id,copy,ping,feedback,handler] of cases){
  const html=read(path);
  assert.match(html,/class="dossier-dcid-cell"/,path);
  assert.match(html,new RegExp('id="'+id+'"'),path);
  for(const selector of [copy,ping,feedback]) assert.match(html,new RegExp('id="'+selector+'"'),path);
  assert.match(html,new RegExp("\\$\\('"+copy+"'\\)\\.onclick"),path);
  assert.match(html,new RegExp("\\$\\('"+ping+"'\\)\\.onclick"),path);
  assert.match(html,new RegExp("const "+handler+"=async mode=>"),path);
  assert.match(html,/mode==='ping'\?'<@'\+id\+'>':id/,path);
  assert.match(html,/\^\[0-9\]\{15,22\}\$/,path);
 }
});

test('DC-ID acties blijven zichtbaar in beide thema\u0027s en zijn niet hetzelfde als een echte Discord-verzending',()=>{
 const css=read('public/dossier-identity-polish.css');
 assert.match(css,/\.dossier-id-buttons\{/);
 assert.match(css,/display:flex;flex-wrap:wrap/);
 assert.match(css,/html\[data-bpd-theme="light"\]/);
 assert.match(read('public/personeelsbeheer.html'),/Discord-vermelding gekopieerd/);
 assert.match(read('public/brandweerdossier.html'),/Discord-vermelding gekopieerd/);
});
