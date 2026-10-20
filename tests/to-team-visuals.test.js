import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {teamVisual} from '../public/to-team-visuals.js';

test('Recognizable brigade categories use stable category codes and different accents',()=>{
  const santo=teamVisual('SANTO'),blaine=teamVisual('BLAINE'),wycan=teamVisual('WYCAN');
  assert.equal(santo.code,'SA');
  assert.equal(blaine.code,'BL');
  assert.equal(wycan.code,'WY');
  assert.equal(santo.serviceId,'politie');
  assert.equal(new Set([santo.hue,blaine.hue,wycan.hue]).size,3);
  assert.deepEqual(teamVisual(' RAGO '),{
    label:'RAGO',code:'RA',hue:284,serviceId:'politie',serviceLabel:'Politie'
  });
  assert.equal(teamVisual('CANINE').code,'K9');
  assert.equal(teamVisual('BWM').serviceId,'brandweer');
  assert.equal(teamVisual('MUG').serviceId,'ambulance');
  for(const [label,code] of Object.entries({
    DIRMED:'DM',HARTS:'HA',HVPK:'HV',HAMB:'HB',ARTS:'AR',VPK:'VP',AMB:'AM'
  })){
    const visual=teamVisual(label);
    assert.equal(visual.serviceId,'ambulance',label);
    assert.equal(visual.code,code,label);
  }
  assert.equal(teamVisual('LSRA-F.A.S.T.').serviceId,'depannage');
});
test('Unrecognized radio categories cannot masquerade as known brigade labels',()=>{
  const unknown=teamVisual('unknown<something>');
  assert.equal(unknown.serviceId,'overige');
  assert.equal(unknown.hue,214);
  assert.equal(unknown.code,'UN');
  assert.equal(teamVisual('').code,'??');
});
test('TO roster, live radio and assigned incidents share readable unit markers',()=>{
  const js=readFileSync(new URL('../public/to-dienstbord.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/to-dienstbord.css',import.meta.url),'utf8');
  assert.ok(js.includes("import {teamVisual} from '/to-team-visuals.js'"));
  assert.ok(js.includes('const unitBadge=(category,variant='));
  assert.ok(js.includes('unitBadge(team.dienst,\'unit-token-hero\')'));
  assert.ok(js.includes('unitBadge(category,\'unit-token-small\')'));
  assert.ok(js.includes('unitBadge(user.category,\'unit-token-small\')'));
  assert.ok(js.includes('unitBadge(team.dienst,\'unit-token-micro\')'));
  assert.ok(js.includes('data-availability='));
  assert.ok(js.includes('team.available===false?'));
  assert.ok(js.includes("pill('Beschikbaar','green')"));
  assert.ok(js.includes("pill('Niet beschikbaar','red')"));
  assert.ok(js.includes("pill('Op '+incidentNumber("));
  assert.ok(js.includes('radio-user-channel'));
  assert.ok(css.includes('.unit-token-hero'));
  assert.ok(css.includes('.radio-service[data-service="brandweer"]'));
  assert.ok(css.includes('.team-card[data-availability="on-pause"]'));
  assert.ok(css.includes('.team-card[data-availability="on-incident"]'));
  assert.ok(css.includes('.team-chip'));
  assert.ok(css.includes('@media(max-width:700px)'));
  assert.equal(js.includes('hues[team.dienst]'),false);
});
