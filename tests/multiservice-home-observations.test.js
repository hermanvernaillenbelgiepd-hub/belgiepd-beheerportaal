import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('ZONE en AZLS tonen de Politie-observatiekaart alleen na eigen servercontrole',()=>{
 const page=read('public/index.html');
 const nav=read('public/bpd-navigation.js');
 const server=read('src/server.js');
 assert.match(server,/basicObservationPoliceRecord:req\.bpd\.basicObservationPoliceRecord===true/);
 assert.match(server,/basicObservationAccessChecks\(req\.bpd,roster\)/);
 assert.match(nav,/if\(policeObservations\)pages\.push\('observations'\)/);
 for(const id of ['zonePoliceObservationCard','ambulancePoliceObservationCard'])
   assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(page,/Je politiefiche bestaat, maar je Politierol moet worden bevestigd/);
 assert.match(page,/Andere functies, zoals Politie-Basiskader, verschijnen/);
 assert.doesNotMatch(page,/observaties vanuit politiebasiskader, roepnummeraanvragen en algemeen gebruikersbeheer behoren niet tot deze ZONE-werkruimte/);
});

test('Navigatie blijft dicht zonder bevoegdheid, maar toont zelfcontrole bij gekoppelde politiefiche',()=>{
 const page=read('public/index.html');
 const start=page.indexOf('function showObservationNavigation(ctx){');
 const end=page.indexOf('const simpleIds=',start);
 assert.ok(start>0&&end>start);
 const nodes=new Map();
 const ids=['staffNavObservations','zoneNavObservations',
   'ambulanceNavObservations','memberNavObservations',
   'zonePoliceObservationCard','ambulancePoliceObservationCard',
   'zonePoliceObservationTitle','ambulancePoliceObservationTitle',
   'zonePoliceObservationDescription','ambulancePoliceObservationDescription'];
 for(const id of ids)nodes.set(id,{hidden:true,textContent:''});
 const $=id=>{assert.ok(nodes.has(id),id);return nodes.get(id)};
 const run=new Function('$','observationNavIds',
   page.slice(start,end)+'\nreturn showObservationNavigation;')($,ids.slice(0,4));
 run(null);
 assert.equal(nodes.get('zonePoliceObservationCard').hidden,true);
 assert.equal(nodes.get('zoneNavObservations').hidden,true);
 run({basicObservationPoliceRecord:true});
 assert.equal(nodes.get('zonePoliceObservationCard').hidden,false);
 assert.equal(nodes.get('ambulancePoliceObservationCard').hidden,false);
 assert.equal(nodes.get('zoneNavObservations').hidden,true,
   'A matching Police roster alone NEVER unlocks an authorized menu');
 assert.match(nodes.get('zonePoliceObservationTitle').textContent,/Toegang controleren/);
 run({basicObservationCanSubmit:true,basicObservationPoliceRecord:true});
 assert.equal(nodes.get('zoneNavObservations').hidden,false);
 assert.equal(nodes.get('zonePoliceObservationCard').hidden,false);
 assert.match(nodes.get('zonePoliceObservationDescription').textContent,/Dien observaties in/);
 run({basicObservationCanReview:true});
 assert.equal(nodes.get('ambulanceNavObservations').hidden,false);
 assert.match(nodes.get('ambulancePoliceObservationDescription').textContent,/Bekijk ontvangen/);
});
