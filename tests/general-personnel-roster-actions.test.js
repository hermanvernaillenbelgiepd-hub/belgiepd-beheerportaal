import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicPoliceRoster,restrictedRosterMentionEntries} from '../src/member-dashboard-routes.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const make=(dept,id,name,call)=>({dept,personId:id,name,call,rank:'Inspecteur',status:'Actief',series:'Reeks 1',specialties:[]});
test('general member roster remains private; officer-only identity projection is restricted to copy data',()=>{
 const rows=[
  make('politie','111111111111111111','Eerste','930'),
  make('ambulance','111111111111111111','Eerste','HAMB-02'),
  make('brandweer','222222222222222222','Tweede','OOF12'),
  make('politie','333333333333333333','Zelfde','400'),
  make('politie','444444444444444444','Zelfde','400'),
  make('politie','555555555555555555','Vijfde','500')
 ];
 const publicRows=publicPoliceRoster(rows);
 assert.ok(publicRows.every(x=>!Object.hasOwn(x,'discordId')));
 const secured=restrictedRosterMentionEntries(rows,{all:true,departments:[]});
 assert.deepEqual(secured.map(x=>[x.call,x.name,x.discordId]),[
  ['930','Eerste','111111111111111111'],
  ['—','Tweede','222222222222222222'],
  ['500','Vijfde','555555555555555555']
 ]);
 assert.ok(secured.every(x=>Object.keys(x).sort().join(',')==='call,discordId,name'));
});
test('copy-only identity route is independently role-gated by verified Discord officer rank',()=>{
 const src=read('src/member-dashboard-routes.js');
 assert.match(src,/app\.get\('\/api\/member\/personnel-copy-ids',memberIdentity/);
 assert.match(src,/if\(req\.memberPortal\.canEditRosterLayout!==true\)/);
 assert.match(src,/return res\.status\(403\)\.json/);
 assert.match(src,/restrictedRosterMentionEntries\(snapshot\.data\)/);
 assert.match(src,/if\(snapshot\.stale\)/);
 const roster=read('public/member-police-roster.js');
 assert.match(roster,/person\.rosterCopyAvailable===true&&typeof onCopyMention==='function'/);
 assert.match(roster,/renderMobilePoliceRoster/);
 assert.match(roster,/originalActions\.querySelectorAll\('button'\)/);
});
test('embedded roster uses one page-height scroll area with separate horizontal matrix scrolling',()=>{
 const child=read('public/personeelslijst.html'),parent=read('public/personeelsbeheer.html');
 const css=read('public/personnel-compact.css');
 assert.match(child,/ResizeObserver/);
 assert.match(child,/bpd-directory-natural-height/);
 assert.match(child,/max-height:none!important;overflow-x:auto!important;overflow-y:visible!important/);
 assert.match(parent,/event\.source===\$\('personnelDirectoryFrame'\)\.contentWindow/);
 assert.match(parent,/event\.data\?\.type==='bpd-directory-natural-height'/);
 assert.match(parent,/style\.height=Math\.max\(620,Math\.ceil\(height\)\)\+'px'/);
 assert.match(css,/#personnelOriginalDirectory\{\s*border:0!important/);
});
