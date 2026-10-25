import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 POLICE_SERIES_HEADS,POLICE_SERIES_RELIEF,rosterSeriesNumber,
 policeRosterSeriesBadges,renderPoliceRosterSeries
} from '../public/police-roster-series.js';

const police=(extra={})=>({dept:'politie',call:'700',rank:'Hoofdinspecteur',...extra});
const labels=(person,text)=>policeRosterSeriesBadges(person,text).map(row=>row.label);
const types=(person,text)=>policeRosterSeriesBadges(person,text).map(row=>row.type);

test('Reeks 1 red, 2 purple, 3 blue, 4 yellow reserve - same spelling in roster and dossier',()=>{
 for(const [number,color] of [[1,'series-1'],[2,'series-2'],[3,'series-3'],[4,'series-4']]){
  const person=police({series:'Reeks '+number});
  assert.equal(rosterSeriesNumber('Reeks '+number+' · Middenkader'),number);
  assert.ok(types(person,'Reeks '+number+' · Middenkader').includes(color));
  assert.ok(!labels(person,'Reeks '+number+' · Middenkader').includes('Middenkader'));
  assert.equal(labels(person,'Reeks '+number+' · Middenkader')[0],number===4?'Reeks 4 · Reserve':'Reeks '+number);
 }
 assert.equal(labels(police({series:'Reeks 4'}),'Reeks 4 · Middenkader')[0],
  'Reeks 4 · Reserve');
 assert.equal(rosterSeriesNumber('Officierenkader / Korpsleiding'),null);
});
test('Specific series heads are identified by their known Discord IDs, not their names',()=>{
 const staff=POLICE_SERIES_HEADS['1'][0];
 const p=police({discordId:staff.id,name:'Bijgewerkte gebruikersnaam',series:'Reeks 1'});
 assert.deepEqual(types(p,'Reeks 1 · Middenkader'),['series-1']);
 assert.ok(policeRosterSeriesBadges(p,'Reeks 1 · Middenkader')[0].title.includes('Reekshoofd'));
 assert.ok(!labels(p,'Reeks 1 · Middenkader').includes('Reekshoofd'));
 assert.ok(!labels(police({name:staff.name,discordId:'999999999999999999',
  series:'Reeks 1'}),'Reeks 1 · Middenkader').includes('Reekshoofd'));
 assert.equal(POLICE_SERIES_RELIEF.name,'RX');
 assert.ok(labels(police({discordId:POLICE_SERIES_RELIEF.id,series:'Vlinder'}),
  'Vlinder · Middenkader').includes('🦋 Vlinder'));
});
test('Officer rainbow, Corps crown and ambiguous 9xx combined class are visual only',()=>{
 assert.ok(labels(police({call:'900',series:'Kader',rank:'Eerste hoofdcommissaris'}),
  'Officierenkader / Korpsleiding').includes('👑'));
 assert.ok(labels(police({call:'920',series:'Kader',rank:'Aspirant Commissaris'}),
  'Officierenkader / Korpsleiding').includes('🌈'));
 assert.ok(labels(police({call:'925',series:'Kader',rank:'Commissaris',discordCadre:'Korpsleiding'}),
  'Officierenkader / Korpsleiding').includes('👑'));
 const uncertain=police({call:'—',rank:'Onbekend',series:'Kader'});
 assert.deepEqual(labels(uncertain,'Officierenkader / Korpsleiding'),
  ['🌈 👑']);
 assert.deepEqual(policeRosterSeriesBadges({dept:'brandweer',series:'Reeks 1'},'Reeks 1'),[]);
});
test('Police roster uses DOM text nodes and keeps non-Police columns unchanged',()=>{
 const old=globalThis.document;
 const element=tag=>({tag,children:[],className:'',textContent:'',title:'',
  append(...children){this.children.push(...children)},
  replaceChildren(...children){this.children=[...children]}});
 globalThis.document={createElement:element};
 try{
  const root=element('td');
  renderPoliceRosterSeries(root,police({series:'Reeks 2'}),'Reeks 2 · Middenkader');
  assert.equal(root.children.length,1);
  assert.equal(root.children[0].children[0].textContent,'Reeks 2');
  assert.match(root.children[0].children[0].className,/series-2/);
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old}
});
test('Markup shares series-head references with dossier header and CSS targets only roster cells',()=>{
 const html=readFileSync(new URL('../public/personeelsbeheer.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/bpd-dossier-shared.css',import.meta.url),'utf8');
 assert.match(html,/from '\/police-roster-series\.js'/);
 assert.match(html,/renderPoliceRosterSeries\(seriesCell,person/);
 assert.match(html,/const seriesHeads=POLICE_SERIES_HEADS/);
 assert.match(html,/const seriesRelief=POLICE_SERIES_RELIEF/);
 assert.match(html,/if\(person\.dept==='politie'\)/);
 for(const cls of ['series-1','series-2','series-3','series-4',
  'butterfly','officer','corps','combined']){
  assert.ok(css.includes('.police-roster-badge.'+cls),cls);
 }
});
