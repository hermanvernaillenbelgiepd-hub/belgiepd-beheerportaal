import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSonoranName} from '../src/to-radio.js';
import {serviceForCategory} from '../public/to-categories.js';
import {teamVisual} from '../public/to-team-visuals.js';
import {groupRadioCrews} from '../public/to-radio-availability.js';

const js=readFileSync(new URL('../public/to-dienstbord.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/to-dienstbord.css',import.meta.url),'utf8');

test('ZW-1 is a Ziekenwagen and belongs to Ambulance, including NB and pairing labels',()=>{
  for(const value of ['ZW-1','zw1','ZW 1','ZW - 1','ZW-1* (NB)']){
    const item=parseSonoranName(value+' | Ambulancier');
    assert.deepEqual(item,{category:'ZW',number:'1',displayName:'Ambulancier',importable:true},value);
    assert.equal(serviceForCategory(item.category).id,'ambulance');
    assert.equal(teamVisual(item.category).code,'ZW');
  }
  const unknown=parseSonoranName('Onbekende gebruiker');
  assert.equal(unknown.importable,false);
  assert.equal(unknown.category,null);
});

test('Overlapping STAG/STAGE and CANINE keep separate emergency services',()=>{
  const services={STAG:'brandweer',STAGE:'ambulance',CANINE:'politie'};
  for(const [label,service] of Object.entries(services)){
    assert.equal(parseSonoranName(label+'-620').category,label);
    assert.equal(serviceForCategory(label).id,service);
  }
});

test('Starred identical callsigns are one crew and never reclassified',()=>{
  const crew=groupRadioCrews([
    {id:'a',category:'SANTO',number:'600',paired:true,name:'SANTO-600*'},
    {id:'b',category:'SANTO',number:'00600',paired:true,name:'SANTO-00600*'},
    {id:'c',category:'BWM',number:'600',paired:false,name:'BWM-600'}
  ]);
  assert.equal(crew.length,2);
  assert.equal(crew[0].members.length,2);
  assert.equal(crew[1].category,'BWM');
});

test('Radio workflow clearly excludes unrecognized users and exposes reversible board actions',()=>{
  for(const expected of [
    'function visibleRadioUser(user)',"user.name!=='Onbekende gebruiker'",
    'const visibleCrews=allCrews.filter(crew=>crew.members.some(visibleRadioUser))',
    'const hiddenCount=','function pendingRadioCrews()',
    'radio.newIds.add(id)', 'async function quickAddRadioCrew(id)',
    "command('add-team'","case 'radio-quick-add'",
    "case 'remove-team'", "document.addEventListener('dragstart'",
    "document.addEventListener('drop'",'data-radio-dropzone'
  ])assert.ok(js.includes(expected),expected);
  assert.ok(js.includes("activeTeams(state.env?.board)"));
  assert.ok(!js.includes("command('remove-team',{id:")));
});

test('Quick incident templates and three availability colors have accessible controls',()=>{
  for(const label of ['ANPR','AGRESSIE','VKO','BRAND','TAKELING'])
    assert.ok(js.includes("'"+label+"'"),label);
  for(const token of ["case 'incident-template'","incidentForm('',target.dataset.template)","const presets="])
    assert.ok(js.includes(token),token);
  for(const status of ['ready','on-incident','on-pause'])
    assert.ok(css.includes('.team-card[data-availability="'+status+'"]'),status);
  assert.ok(css.includes('.radio-arrival-badge'));
  assert.ok(css.includes('.pending-radio-section'));
  assert.ok(css.includes('.incident-presets'));
});
