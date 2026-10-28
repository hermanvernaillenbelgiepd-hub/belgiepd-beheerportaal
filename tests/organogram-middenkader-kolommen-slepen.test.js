import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {getTier,policeMiddleSeries,orderedPoliceMiddle,policeMiddleColumns}
 from '../public/assets/organogram-hierarchie-model.js';
import {callMiddleSeries,validMidOrder}
 from '../src/organogram-mid-order-policy.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const subject=(n,id=n)=>({dept:'politie',name:'Middenkader '+n,
 call:String(n),rank:n>=800?'Eerste hoofdinspecteur':n>=700?'Hoofdinspecteur':'Aspirant hoofdinspecteur',
 personId:String(id).padStart(18,'1')});
test('police middle cadre is split into numerical 700/600 columns, 800 separately',()=>{
 const values=[subject(710),subject(600),subject(800),subject(730),
  subject(620),subject(700),subject(610),subject(820),subject(720)];
 const cols=policeMiddleColumns(values);
 assert.deepEqual(cols['700'].map(x=>x.call),['700','710','720','730']);
 assert.deepEqual(cols['600'].map(x=>x.call),['600','610','620']);
 assert.deepEqual(cols['800'].map(x=>x.call),['800','820']);
 assert.equal(cols.other.length,0);
 assert.equal(policeMiddleSeries(subject(700)),'700');
 assert.equal(policeMiddleSeries(subject(630)),'600');
 assert.equal(policeMiddleSeries(subject(820)),'800');
 assert.equal(policeMiddleSeries({dept:'brandweer',call:'700'}),null);
});
test('manual drag order overrides default, reverting to zero restores numerical order',()=>{
 const people=[subject(710),subject(700),subject(720)];
 people[1].displayOrder=2;
 people[2].displayOrder=1;
 assert.deepEqual(orderedPoliceMiddle(people).map(x=>x.call),['720','700','710']);
 people[1].displayOrder=0;people[2].displayOrder=0;
 assert.deepEqual(orderedPoliceMiddle(people).map(x=>x.call),['700','710','720']);
});
test('the 800 group remains ranked above the two side-by-side columns',()=>{
 assert.equal(getTier(subject(800)),'Middenkader');
 assert.equal(getTier(subject(700)),'Middenkader');
 assert.equal(getTier(subject(600)),'Middenkader');
 const source=read('../public/organogram-hierarchie.html');
 assert.match(source,/middle-cadre-columns\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(source,/middleLane\('700','700-reeks/);
 assert.match(source,/middleLane\('600','600-reeks/);
 assert.match(source,/if\(columns\['800'\]\.length\)/);
 assert.match(source,/@media\(max-width:580px\)\{\.middle-cadre-columns\{grid-template-columns:1fr\}\}/);
 assert.match(source,/solo&&settings\.id==='politie'&&level\.label==='Middenkader'/);
});
test('draggable person cards are restricted to verified technical management and exact series',()=>{
 const source=read('../public/organogram-hierarchie.html');
 assert.match(source,/managerReady&&!state\.demo&&!state\.query&&!dragSaving/);
 assert.match(source,/policeMiddleSeries\(p\)===series/);
 assert.match(source,/card\.draggable=true/);
 assert.match(source,/addEventListener\('drop',async event=>/);
 assert.match(source,/api\/organogram\/middenkader\/order/);
 assert.match(source,/api\/organogram\/middenkader\/last-order/);
 assert.match(source,/Vorige kolomvolgorde herstellen/);
 assert.match(source,/Motivering/);
 const js=source.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new Script(js.replace(/^import[^\n]+\n/m,'')));
});
test('order endpoint validates exact identities, no cross-column movement, and records atomic undo',()=>{
 const ids=['111111111111111111','222222222222222222','333333333333333333'];
 assert.deepEqual(validMidOrder({series:'700',personIds:ids,
  reason:'Rangschikking handmatig aangepast'}).personIds,ids);
 assert.throws(()=>validMidOrder({series:'500',personIds:ids,
  reason:'Niet dezelfde reeks'}));
 assert.throws(()=>validMidOrder({series:'700',personIds:[ids[0],ids[0]],
  reason:'Dubbele identiteit'}));
 assert.throws(()=>validMidOrder({series:'700',personIds:ids,
  reason:'kort'}));
 assert.equal(callMiddleSeries('SANTO-720'),'700');
 assert.equal(callMiddleSeries('610'),'600');
 assert.equal(callMiddleSeries('831'),'800');
 assert.equal(callMiddleSeries('550'),null);
 const route=read('../src/organogram-placement-routes.js');
 assert.match(route,/validMidOrder\(req\.body\)/);
 assert.match(route,/callMiddleSeries\(p\.call\)===payload\.series/);
 assert.match(route,/expected\.size!==payload\.personIds\.length/);
 assert.match(route,/lastReorderBatchId:batchRef\.id/);
 assert.match(route,/await db\.runTransaction\(async tx=>/);
 assert.match(route,/middle_cadre_drag_order/);
 assert.match(route,/middle_cadre_drag_undo/);
 assert.match(route,/tx\.delete\(personRef\)/);
 assert.match(route,/lastReorderBatchId'\)!==batchId/);
 assert.match(route,/app\.post\('\/api\/organogram\/middenkader\/order',requireUser,manager/);
 assert.match(route,/app\.post\('\/api\/organogram\/middenkader\/order\/:batchId\/undo',requireUser,manager/);
});
test('middle-cadre drag does not change callsigns or service roles or ordinary staff access',()=>{
 const route=read('../src/organogram-placement-routes.js');
 const part=route.slice(route.indexOf(' // Dragging is confined'),route.lastIndexOf('\n}'));
 assert.doesNotMatch(part,/tx\.set\(.*USER_COLLECTION/);
 assert.doesNotMatch(part,/tx\.update\(.*departmentRoles/);
 assert.match(part,/accessRightsChanged:false/);
 assert.match(part,/requireUser,manager/);
});
